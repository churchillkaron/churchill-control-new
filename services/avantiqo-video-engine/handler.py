import ipaddress
import os
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
import runpod
import torch
from diffusers import DiffusionPipeline
from diffusers.utils import export_to_video, load_image

ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1"
PRODUCT_MODEL = "avantiqo-cinema-v1"
CERTIFIED_CAPABILITIES = {"ai.video.generate", "ai.video.image_to_video"}
DEFAULT_MODEL = os.getenv(
    "AVANTIQO_VIDEO_FOUNDATION_MODEL",
    "Wan-AI/Wan2.2-TI2V-5B-Diffusers",
)
OUTPUT_DIR = Path(os.getenv("AVANTIQO_VIDEO_OUTPUT_DIR", "/tmp/avantiqo-video"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
DEVICE = os.getenv("AVANTIQO_VIDEO_DEVICE", "cuda")
DTYPE = (
    torch.bfloat16
    if os.getenv("AVANTIQO_VIDEO_DTYPE", "bfloat16").lower() == "bfloat16"
    else torch.float16
)
HF_CACHE_ROOT = Path(
    os.getenv(
        "AVANTIQO_VIDEO_HF_CACHE_ROOT",
        "/runpod-volume/huggingface-cache/hub",
    )
)
REQUIRE_CACHED_MODEL = os.getenv(
    "AVANTIQO_VIDEO_REQUIRE_CACHED_MODEL",
    "1",
).strip().lower() not in {"0", "false", "no", "off"}

_PIPELINES: dict[str, Any] = {}


def _text(value: Any) -> str:
    return str(value or "").strip()


def _public_https_url(value: Any, *, upload: bool = False) -> str:
    source = _text(value)
    parsed = urlparse(source)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("AVANTIQO_VIDEO_HTTPS_URL_REQUIRED")

    host = parsed.hostname.lower()
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
        raise ValueError("AVANTIQO_VIDEO_PRIVATE_URL_FORBIDDEN")

    try:
        literal = ipaddress.ip_address(host)
        if literal.is_private or literal.is_loopback or literal.is_link_local:
            raise ValueError("AVANTIQO_VIDEO_PRIVATE_URL_FORBIDDEN")
    except ValueError as exc:
        if str(exc) == "AVANTIQO_VIDEO_PRIVATE_URL_FORBIDDEN":
            raise

    if upload and not (
        host.endswith(".supabase.co")
        or host.endswith(".storage.supabase.co")
    ):
        raise ValueError("AVANTIQO_VIDEO_UPLOAD_HOST_FORBIDDEN")

    return source


def _dimensions(aspect_ratio: str) -> tuple[int, int]:
    if aspect_ratio == "9:16":
        return 704, 1280
    if aspect_ratio == "1:1":
        return 704, 704
    return 1280, 704


def _frame_count(duration_seconds: int, fps: int) -> int:
    desired = max(17, duration_seconds * fps)
    return max(17, ((desired - 1) // 4) * 4 + 1)


def _foundation_model(data: dict[str, Any]) -> str:
    capability = _text(data.get("capability"))
    if capability == "ai.video.image_to_video":
        return os.getenv("AVANTIQO_VIDEO_I2V_MODEL", DEFAULT_MODEL)
    return os.getenv("AVANTIQO_VIDEO_T2V_MODEL", DEFAULT_MODEL)


def _cached_model_path(model_id: str) -> str | None:
    if "/" not in model_id:
        return None

    model_root = HF_CACHE_ROOT / f"models--{model_id.replace('/', '--')}"
    snapshots_root = model_root / "snapshots"
    ref_main = model_root / "refs" / "main"

    if ref_main.is_file():
        revision = ref_main.read_text(encoding="utf-8").strip()
        candidate = snapshots_root / revision
        if candidate.is_dir():
            return str(candidate)

    if snapshots_root.is_dir():
        candidates = [path for path in snapshots_root.iterdir() if path.is_dir()]
        if candidates:
            candidates.sort(key=lambda path: path.stat().st_mtime, reverse=True)
            return str(candidates[0])

    return None


def _pipeline(model_id: str):
    if model_id in _PIPELINES:
        return _PIPELINES[model_id]

    cached_path = _cached_model_path(model_id)
    if REQUIRE_CACHED_MODEL and not cached_path:
        raise RuntimeError(f"AVANTIQO_VIDEO_CACHED_MODEL_REQUIRED:{model_id}")

    model_source = cached_path or model_id
    pipe = DiffusionPipeline.from_pretrained(
        model_source,
        torch_dtype=DTYPE,
        device_map="balanced" if DEVICE.startswith("cuda") else None,
        local_files_only=bool(cached_path),
    )
    if not DEVICE.startswith("cuda"):
        pipe.to(DEVICE)
    if hasattr(pipe, "enable_attention_slicing"):
        pipe.enable_attention_slicing()
    if hasattr(pipe, "enable_vae_slicing"):
        pipe.enable_vae_slicing()
    _PIPELINES[model_id] = pipe
    return pipe


def _validated_input(job: dict[str, Any]) -> dict[str, Any]:
    data = job.get("input") or {}
    if data.get("contract") != ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_VIDEO_ENGINE_CONTRACT_INVALID")

    capability = _text(data.get("capability"))
    if capability not in CERTIFIED_CAPABILITIES:
        raise ValueError(f"AVANTIQO_VIDEO_CAPABILITY_NOT_CERTIFIED:{capability or 'MISSING'}")

    instruction = _text(data.get("instruction"))
    if not instruction:
        raise ValueError("AVANTIQO_VIDEO_INSTRUCTION_REQUIRED")
    if len(instruction) > 12000:
        raise ValueError("AVANTIQO_VIDEO_INSTRUCTION_TOO_LONG")

    duration = int(data.get("duration_seconds") or 5)
    if duration < 2 or duration > 10:
        raise ValueError("AVANTIQO_VIDEO_DURATION_INVALID")

    fps = int(data.get("fps") or 24)
    if fps < 8 or fps > 30:
        raise ValueError("AVANTIQO_VIDEO_FPS_INVALID")

    aspect_ratio = _text(data.get("aspect_ratio") or "16:9")
    if aspect_ratio not in {"16:9", "9:16", "1:1"}:
        raise ValueError("AVANTIQO_VIDEO_ASPECT_RATIO_INVALID")

    resolution = _text(data.get("resolution") or "720p").lower()
    if resolution != "720p":
        raise ValueError("AVANTIQO_VIDEO_RESOLUTION_UNSUPPORTED")

    references = data.get("reference_images") or []
    if not isinstance(references, list) or len(references) > 4:
        raise ValueError("AVANTIQO_VIDEO_REFERENCE_LIMIT_EXCEEDED")
    data["reference_images"] = [
        _public_https_url(value) for value in references if _text(value)
    ]
    if capability == "ai.video.image_to_video" and not data["reference_images"]:
        raise ValueError("AVANTIQO_VIDEO_IMAGE_TO_VIDEO_REFERENCE_REQUIRED")

    storage_upload = data.get("storage_upload") or {}
    signed_url = _public_https_url(storage_upload.get("signed_url"), upload=True)
    storage_reference = _text(storage_upload.get("storage_reference"))
    if not storage_reference.startswith("storage://creative-assets/"):
        raise ValueError("AVANTIQO_VIDEO_STORAGE_REFERENCE_INVALID")

    data["storage_upload"] = {
        **storage_upload,
        "signed_url": signed_url,
        "storage_reference": storage_reference,
    }
    return data


def _upload_video(path: Path, storage_upload: dict[str, Any]) -> None:
    signed_url = storage_upload["signed_url"]
    with path.open("rb") as file_handle:
        response = requests.put(
            signed_url,
            data=file_handle,
            headers={
                "content-type": "video/mp4",
                "cache-control": "max-age=3600",
                "x-upsert": "false",
            },
            timeout=300,
        )
    if not response.ok:
        detail = response.text[:500].replace("\n", " ")
        raise RuntimeError(
            f"AVANTIQO_VIDEO_STORAGE_UPLOAD_FAILED:{response.status_code}:{detail}"
        )


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data = _validated_input(job)
    started_at = time.perf_counter()
    runpod.serverless.progress_update(job, "loading Avantiqo Cinema")

    model_id = _foundation_model(data)
    pipe = _pipeline(model_id)
    width, height = _dimensions(data.get("aspect_ratio", "16:9"))
    fps = int(data.get("fps") or 24)
    duration_seconds = int(data.get("duration_seconds") or 5)
    frames = _frame_count(duration_seconds, fps)
    seed = data.get("seed")
    if seed is None:
        seed = int.from_bytes(os.urandom(4), "big")
    seed = int(seed)
    if seed < 0 or seed > 4294967295:
        raise ValueError("AVANTIQO_VIDEO_SEED_INVALID")

    generator_device = "cuda" if DEVICE.startswith("cuda") else DEVICE
    generator = torch.Generator(device=generator_device).manual_seed(seed)
    kwargs: dict[str, Any] = {
        "prompt": data["instruction"],
        "width": width,
        "height": height,
        "num_frames": frames,
        "num_inference_steps": int(os.getenv("AVANTIQO_VIDEO_INFERENCE_STEPS", "36")),
        "guidance_scale": float(os.getenv("AVANTIQO_VIDEO_GUIDANCE_SCALE", "5.0")),
        "generator": generator,
    }

    references = data.get("reference_images") or []
    if data["capability"] == "ai.video.image_to_video":
        kwargs["image"] = load_image(references[0])

    runpod.serverless.progress_update(job, "generating cinematic frames")
    result = pipe(**kwargs)
    video_frames = result.frames[0]

    job_id = _text(job.get("id")) or str(int(time.time() * 1000))
    output_path = OUTPUT_DIR / f"{job_id}.mp4"
    export_to_video(video_frames, str(output_path), fps=fps)

    runpod.serverless.progress_update(job, "storing private Avantiqo asset")
    _upload_video(output_path, data["storage_upload"])

    elapsed = time.perf_counter() - started_at
    size_bytes = output_path.stat().st_size
    output_path.unlink(missing_ok=True)

    return {
        "status": "completed",
        "provider": "avantiqo-video",
        "model": _text(data.get("model")) or PRODUCT_MODEL,
        "engine_contract": ENGINE_CONTRACT,
        "capability": data["capability"],
        "storage_reference": data["storage_upload"]["storage_reference"],
        "foundation_model": model_id,
        "foundation_model_source": "runpod-cache" if _cached_model_path(model_id) else "huggingface",
        "seed": seed,
        "duration_seconds": duration_seconds,
        "fps": fps,
        "frame_count": len(video_frames),
        "width": width,
        "height": height,
        "size_bytes": size_bytes,
        "generation_seconds": round(elapsed, 3),
        "quality_profile": _text(data.get("quality_profile")) or "cinema",
        "raw_reasoning_persisted": False,
    }


@runpod.serverless.register_fitness_check
def check_cuda_available():
    if not torch.cuda.is_available():
        raise RuntimeError("AVANTIQO_VIDEO_CUDA_REQUIRED")


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
