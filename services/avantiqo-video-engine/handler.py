import ipaddress
import os
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import imageio.v3 as iio
import requests
import runpod
import torch
from diffusers import DiffusionPipeline
from diffusers.utils import export_to_video, load_image
from PIL import Image

ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1"
PRODUCT_MODEL = "avantiqo-cinema-v1"
IMPLEMENTED_CAPABILITIES = {
    "ai.video.generate",
    "ai.video.image_to_video",
    "ai.video.video_to_video",
    "ai.video.edit",
    "ai.video.inpaint",
}
DEFAULT_CERTIFIED_CAPABILITIES = {
    "ai.video.generate",
    "ai.video.image_to_video",
}
DEFAULT_MODEL = os.getenv("AVANTIQO_VIDEO_FOUNDATION_MODEL", "").strip()
T2V_MODEL = os.getenv("AVANTIQO_VIDEO_T2V_MODEL", DEFAULT_MODEL).strip()
I2V_MODEL = os.getenv("AVANTIQO_VIDEO_I2V_MODEL", DEFAULT_MODEL).strip()
V2V_MODEL = os.getenv(
    "AVANTIQO_VIDEO_V2V_MODEL",
    "Wan-AI/Wan2.1-VACE-14B-diffusers",
).strip()
EDIT_MODEL = os.getenv("AVANTIQO_VIDEO_EDIT_MODEL", V2V_MODEL).strip()
INPAINT_MODEL = os.getenv("AVANTIQO_VIDEO_INPAINT_MODEL", EDIT_MODEL or V2V_MODEL).strip()
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
CERTIFICATION_EXECUTION_ENABLED = os.getenv(
    "AVANTIQO_VIDEO_CERTIFICATION_EXECUTION_ENABLED",
    "0",
).strip().lower() in {"1", "true", "yes", "on"}
_PIPELINES: dict[str, Any] = {}


def _text(value: Any) -> str:
    return str(value or "").strip()


def _configured_capabilities() -> set[str]:
    configured = {
        item.strip()
        for item in _text(os.getenv("AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES")).split(",")
        if item.strip()
    }
    if not configured:
        return set(DEFAULT_CERTIFIED_CAPABILITIES)
    return configured.intersection(IMPLEMENTED_CAPABILITIES)


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
        model_id = I2V_MODEL
        missing = "AVANTIQO_VIDEO_I2V_MODEL_REQUIRED"
    elif capability == "ai.video.video_to_video":
        model_id = V2V_MODEL
        missing = "AVANTIQO_VIDEO_V2V_MODEL_REQUIRED"
    elif capability == "ai.video.edit":
        model_id = EDIT_MODEL
        missing = "AVANTIQO_VIDEO_EDIT_MODEL_REQUIRED"
    elif capability == "ai.video.inpaint":
        model_id = INPAINT_MODEL
        missing = "AVANTIQO_VIDEO_INPAINT_MODEL_REQUIRED"
    else:
        model_id = T2V_MODEL
        missing = "AVANTIQO_VIDEO_T2V_MODEL_REQUIRED"
    if not model_id:
        raise RuntimeError(missing)
    return model_id


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
    certified = _configured_capabilities()
    certification_execution = (
        data.get("certification_execution") is True and CERTIFICATION_EXECUTION_ENABLED
    )
    if capability not in IMPLEMENTED_CAPABILITIES:
        raise ValueError(f"AVANTIQO_VIDEO_CAPABILITY_NOT_IMPLEMENTED:{capability or 'MISSING'}")
    if capability not in certified and not certification_execution:
        raise ValueError(f"AVANTIQO_VIDEO_CAPABILITY_NOT_CERTIFIED:{capability or 'MISSING'}")
    data["certification_execution"] = certification_execution
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

    source_video = _text(data.get("source_video"))
    if not source_video:
        legacy_sources = data.get("source_videos") or []
        if isinstance(legacy_sources, list) and legacy_sources:
            source_video = _text(legacy_sources[0])
    data["source_video"] = _public_https_url(source_video) if source_video else None

    mask_video = _text(data.get("mask_video"))
    data["mask_video"] = _public_https_url(mask_video) if mask_video else None

    if capability == "ai.video.image_to_video" and not data["reference_images"]:
        raise ValueError("AVANTIQO_VIDEO_IMAGE_TO_VIDEO_REFERENCE_REQUIRED")
    if capability in {"ai.video.video_to_video", "ai.video.edit", "ai.video.inpaint"} and not data["source_video"]:
        raise ValueError("AVANTIQO_VIDEO_SOURCE_VIDEO_REQUIRED")
    if capability == "ai.video.inpaint" and not data["mask_video"]:
        raise ValueError("AVANTIQO_VIDEO_INPAINT_MASK_VIDEO_REQUIRED")

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


def _download_video(url: str, job_id: str, role: str) -> Path:
    path = OUTPUT_DIR / f"{job_id}-{role}.mp4"
    with requests.get(url, stream=True, timeout=180) as response:
        response.raise_for_status()
        content_length = int(response.headers.get("content-length") or 0)
        if content_length > 200 * 1024 * 1024:
            raise ValueError(f"AVANTIQO_VIDEO_{role.upper()}_TOO_LARGE")
        total = 0
        with path.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if not chunk:
                    continue
                total += len(chunk)
                if total > 200 * 1024 * 1024:
                    raise ValueError(f"AVANTIQO_VIDEO_{role.upper()}_TOO_LARGE")
                handle.write(chunk)
    return path


def _sample_video_frames(
    path: Path,
    width: int,
    height: int,
    frames: int,
    *,
    grayscale: bool = False,
) -> list[Image.Image]:
    source = iio.imread(path, plugin="FFMPEG")
    if len(source) < 2:
        raise ValueError("AVANTIQO_VIDEO_SOURCE_VIDEO_EMPTY")
    indices = [round(index * (len(source) - 1) / max(1, frames - 1)) for index in range(frames)]
    mode = "L" if grayscale else "RGB"
    return [
        Image.fromarray(source[index]).convert(mode).resize((width, height), Image.Resampling.LANCZOS)
        for index in indices
    ]


def _binary_mask_frame(frame: Image.Image) -> Image.Image:
    return frame.convert("L").point(lambda value: 255 if value >= 128 else 0, mode="L")


def _upload_video(path: Path, storage_upload: dict[str, Any]) -> None:
    with path.open("rb") as file_handle:
        response = requests.put(
            storage_upload["signed_url"],
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
    source_path = None
    mask_path = None
    mask_mode = "NONE"
    job_id = _text(job.get("id")) or str(int(time.time() * 1000))
    capability = data["capability"]

    if capability == "ai.video.image_to_video":
        kwargs["image"] = load_image(references[0])
    elif capability in {"ai.video.video_to_video", "ai.video.edit", "ai.video.inpaint"}:
        source_path = _download_video(data["source_video"], job_id, "source-video")
        source_frames = _sample_video_frames(source_path, width, height, frames)
        kwargs["video"] = source_frames

        if data.get("mask_video"):
            mask_path = _download_video(data["mask_video"], job_id, "mask-video")
            mask_frames = _sample_video_frames(
                mask_path,
                width,
                height,
                frames,
                grayscale=True,
            )
            kwargs["mask"] = [_binary_mask_frame(frame) for frame in mask_frames]
            mask_mode = "LOCALIZED_WHITE_REGENERATE_BLACK_PRESERVE"
        else:
            kwargs["mask"] = [Image.new("L", (width, height), 255) for _ in source_frames]
            mask_mode = "FULL_FRAME_REGENERATE"

        kwargs["negative_prompt"] = _text(
            data.get("negative_instruction")
            or "low quality, blurry, malformed, duplicate anatomy, subtitles, watermark"
        )

    runpod.serverless.progress_update(job, "generating cinematic frames")
    try:
        result = pipe(**kwargs)
        video_frames = result.frames[0]
    finally:
        if source_path:
            source_path.unlink(missing_ok=True)
        if mask_path:
            mask_path.unlink(missing_ok=True)

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
        "capability": capability,
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
        "source_video_conditioning": capability in {
            "ai.video.video_to_video",
            "ai.video.edit",
            "ai.video.inpaint",
        },
        "mask_video_conditioning": bool(data.get("mask_video")),
        "mask_mode": mask_mode,
        "localized_editing": mask_mode == "LOCALIZED_WHITE_REGENERATE_BLACK_PRESERVE",
        "certification_execution": data.get("certification_execution") is True,
        "generation_seconds": round(elapsed, 3),
        "quality_profile": _text(data.get("quality_profile")) or "cinema",
        "raw_reasoning_persisted": False,
    }


@runpod.serverless.register_fitness_check
def check_worker():
    if not T2V_MODEL:
        raise RuntimeError("AVANTIQO_VIDEO_T2V_MODEL_REQUIRED")
    if not I2V_MODEL:
        raise RuntimeError("AVANTIQO_VIDEO_I2V_MODEL_REQUIRED")
    if not V2V_MODEL:
        raise RuntimeError("AVANTIQO_VIDEO_V2V_MODEL_REQUIRED")
    if not EDIT_MODEL:
        raise RuntimeError("AVANTIQO_VIDEO_EDIT_MODEL_REQUIRED")
    if not INPAINT_MODEL:
        raise RuntimeError("AVANTIQO_VIDEO_INPAINT_MODEL_REQUIRED")
    if not torch.cuda.is_available():
        raise RuntimeError("AVANTIQO_VIDEO_CUDA_REQUIRED")
    if REQUIRE_CACHED_MODEL:
        required_models = {T2V_MODEL, I2V_MODEL}
        certified = _configured_capabilities()
        if "ai.video.video_to_video" in certified or CERTIFICATION_EXECUTION_ENABLED:
            required_models.add(V2V_MODEL)
        if "ai.video.edit" in certified or CERTIFICATION_EXECUTION_ENABLED:
            required_models.add(EDIT_MODEL)
        if "ai.video.inpaint" in certified or CERTIFICATION_EXECUTION_ENABLED:
            required_models.add(INPAINT_MODEL)
        for model_id in required_models:
            if not _cached_model_path(model_id):
                raise RuntimeError(f"AVANTIQO_VIDEO_CACHED_MODEL_REQUIRED:{model_id}")


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
