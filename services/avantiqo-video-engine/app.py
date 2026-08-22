import os
import threading
import time
import uuid
from pathlib import Path
from typing import Any

import torch
from diffusers import DiffusionPipeline
from diffusers.utils import export_to_video, load_image
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1"
DEFAULT_MODEL = os.getenv("AVANTIQO_VIDEO_FOUNDATION_MODEL", "Wan-AI/Wan2.2-TI2V-5B-Diffusers")
OUTPUT_DIR = Path(os.getenv("AVANTIQO_VIDEO_OUTPUT_DIR", "/data/outputs"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
TOKEN = os.getenv("AVANTIQO_VIDEO_ENGINE_TOKEN", "").strip()
PUBLIC_URL = os.getenv("AVANTIQO_VIDEO_PUBLIC_URL", "").strip().rstrip("/")
DEVICE = os.getenv("AVANTIQO_VIDEO_DEVICE", "cuda")
DTYPE = torch.bfloat16 if os.getenv("AVANTIQO_VIDEO_DTYPE", "bfloat16") == "bfloat16" else torch.float16

app = FastAPI(title="Avantiqo Synthetic Video Engine", version="1.0.0")
_jobs: dict[str, dict[str, Any]] = {}
_jobs_lock = threading.Lock()
_pipelines: dict[str, Any] = {}
_pipeline_lock = threading.Lock()


class GenerationRequest(BaseModel):
    contract: str
    model: str = "avantiqo-cinema-v1"
    instruction: str = Field(min_length=1, max_length=12000)
    duration_seconds: int = Field(default=5, ge=2, le=10)
    aspect_ratio: str = "16:9"
    resolution: str = "720p"
    fps: int = Field(default=24, ge=8, le=30)
    seed: int | None = Field(default=None, ge=0, le=4294967295)
    reference_images: list[str] = Field(default_factory=list, max_length=4)
    identity_lock: dict[str, Any] = Field(default_factory=dict)
    shot_specification: dict[str, Any] = Field(default_factory=dict)
    quality_profile: str = "cinema"
    organization_id: str
    usage_id: str


def _authorize(authorization: str | None) -> None:
    if not TOKEN:
        raise HTTPException(status_code=503, detail="engine token not configured")
    if authorization != f"Bearer {TOKEN}":
        raise HTTPException(status_code=401, detail="unauthorized")


def _dimensions(aspect_ratio: str) -> tuple[int, int]:
    if aspect_ratio == "9:16":
        return 704, 1280
    if aspect_ratio == "1:1":
        return 704, 704
    return 1280, 704


def _frame_count(duration_seconds: int, fps: int) -> int:
    desired = max(17, duration_seconds * fps)
    return max(17, ((desired - 1) // 4) * 4 + 1)


def _foundation_model(request: GenerationRequest) -> str:
    if request.reference_images:
        return os.getenv("AVANTIQO_VIDEO_I2V_MODEL", DEFAULT_MODEL)
    return os.getenv("AVANTIQO_VIDEO_T2V_MODEL", DEFAULT_MODEL)


def _pipeline(model_id: str):
    with _pipeline_lock:
        if model_id in _pipelines:
            return _pipelines[model_id]
        pipe = DiffusionPipeline.from_pretrained(
            model_id,
            torch_dtype=DTYPE,
            device_map="balanced" if DEVICE.startswith("cuda") else None,
        )
        if not DEVICE.startswith("cuda"):
            pipe.to(DEVICE)
        if hasattr(pipe, "enable_attention_slicing"):
            pipe.enable_attention_slicing()
        if hasattr(pipe, "enable_vae_slicing"):
            pipe.enable_vae_slicing()
        _pipelines[model_id] = pipe
        return pipe


def _set_job(job_id: str, **values: Any) -> None:
    with _jobs_lock:
        _jobs[job_id] = {**_jobs.get(job_id, {}), **values, "updated_at": time.time()}


def _output_url(job_id: str) -> str | None:
    if not PUBLIC_URL:
        return None
    return f"{PUBLIC_URL}/v1/video/outputs/{job_id}.mp4"


def _run(job_id: str, request: GenerationRequest) -> None:
    try:
        _set_job(job_id, status="processing", progress=0.05)
        model_id = _foundation_model(request)
        pipe = _pipeline(model_id)
        width, height = _dimensions(request.aspect_ratio)
        frames = _frame_count(request.duration_seconds, request.fps)
        seed = request.seed if request.seed is not None else int.from_bytes(os.urandom(4), "big")
        generator_device = "cuda" if DEVICE.startswith("cuda") else DEVICE
        generator = torch.Generator(device=generator_device).manual_seed(seed)
        kwargs: dict[str, Any] = {
            "prompt": request.instruction,
            "width": width,
            "height": height,
            "num_frames": frames,
            "num_inference_steps": int(os.getenv("AVANTIQO_VIDEO_INFERENCE_STEPS", "36")),
            "guidance_scale": float(os.getenv("AVANTIQO_VIDEO_GUIDANCE_SCALE", "5.0")),
            "generator": generator,
        }
        if request.reference_images:
            kwargs["image"] = load_image(request.reference_images[0])

        result = pipe(**kwargs)
        video_frames = result.frames[0]
        output_path = OUTPUT_DIR / f"{job_id}.mp4"
        export_to_video(video_frames, str(output_path), fps=request.fps)
        _set_job(
            job_id,
            status="completed",
            progress=1.0,
            output_path=str(output_path),
            output_url=_output_url(job_id),
            seed=seed,
            foundation_model=model_id,
            frame_count=len(video_frames),
            width=width,
            height=height,
        )
    except Exception as exc:
        _set_job(job_id, status="failed", progress=1.0, error=str(exc))


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "contract": ENGINE_CONTRACT,
        "product_model": "avantiqo-cinema-v1",
        "foundation_model": DEFAULT_MODEL,
        "device": DEVICE,
        "cuda_available": torch.cuda.is_available(),
        "cuda_device_count": torch.cuda.device_count(),
        "public_url_configured": bool(PUBLIC_URL),
    }


@app.post("/v1/video/generations", status_code=202)
def create_generation(request: GenerationRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _authorize(authorization)
    if request.contract != ENGINE_CONTRACT:
        raise HTTPException(status_code=400, detail="unsupported engine contract")
    if request.resolution.lower() != "720p":
        raise HTTPException(status_code=400, detail="Avantiqo Cinema V1 currently supports 720p native generation")
    if not PUBLIC_URL:
        raise HTTPException(status_code=503, detail="public output URL not configured")

    job_id = str(uuid.uuid4())
    _set_job(
        job_id,
        id=job_id,
        job_id=job_id,
        status="queued",
        progress=0.0,
        model=request.model,
        organization_id=request.organization_id,
        usage_id=request.usage_id,
        created_at=time.time(),
    )
    threading.Thread(target=_run, args=(job_id, request), daemon=True).start()
    return {"job_id": job_id, "status": "queued", "model": request.model, "contract": ENGINE_CONTRACT}


@app.get("/v1/video/generations/{job_id}")
def get_generation(job_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _authorize(authorization)
    with _jobs_lock:
        job = dict(_jobs.get(job_id) or {})
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return job


@app.get("/v1/video/outputs/{filename}")
def get_output(filename: str, authorization: str | None = Header(default=None)):
    _authorize(authorization)
    if not filename.endswith(".mp4") or "/" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="invalid filename")
    path = OUTPUT_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="output not found")
    return FileResponse(path, media_type="video/mp4", filename=filename)
