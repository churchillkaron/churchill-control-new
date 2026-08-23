import os
import subprocess
import time
from pathlib import Path
from typing import Any

import imageio.v3 as iio
import runpod
import torch
from PIL import Image
from transformers import pipeline

import handler as legacy

EXTEND_CAPABILITY = "ai.video.extend"
UPSCALE_CAPABILITY = "ai.video.upscale"
SPECIAL_CAPABILITIES = {EXTEND_CAPABILITY, UPSCALE_CAPABILITY}
UPSCALE_MODEL = os.getenv(
    "AVANTIQO_VIDEO_UPSCALE_MODEL",
    "caidas/swin2SR-realworld-sr-x4-64-bsrgan-psnr",
).strip()
MAX_UPSCALE_SOURCE_SECONDS = max(
    2.0,
    min(60.0, float(os.getenv("AVANTIQO_VIDEO_UPSCALE_MAX_SOURCE_SECONDS", "15"))),
)
MAX_UPSCALE_OUTPUT_PIXELS = max(
    921600,
    min(8294400, int(os.getenv("AVANTIQO_VIDEO_UPSCALE_MAX_OUTPUT_PIXELS", "2073600"))),
)
OUTPUT_DIR = Path(os.getenv("AVANTIQO_VIDEO_OUTPUT_DIR", "/tmp/avantiqo-video"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
_SPECIAL_PIPELINES: dict[str, Any] = {}

legacy.IMPLEMENTED_CAPABILITIES.update(SPECIAL_CAPABILITIES)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _configured_capabilities() -> set[str]:
    configured = {
        item.strip()
        for item in _text(os.getenv("AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES")).split(",")
        if item.strip()
    }
    if not configured:
        return set(legacy.DEFAULT_CERTIFIED_CAPABILITIES)
    return configured.intersection(legacy.IMPLEMENTED_CAPABILITIES)


def _certification_execution(data: dict[str, Any]) -> bool:
    return (
        data.get("certification_execution") is True
        and legacy.CERTIFICATION_EXECUTION_ENABLED
    )


def _structured_transport(data: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    specification = _object(data.get("structured_specification"))
    generation = _object(specification.get("generation"))
    provider_parameters = {
        **_object(generation.get("provider_parameters")),
        **_object(specification.get("provider_parameters")),
    }
    return specification, generation, provider_parameters


def _governed_control(
    data: dict[str, Any],
    specification: dict[str, Any],
    generation: dict[str, Any],
) -> dict[str, Any]:
    existing = _object(data.get("cinematic_control"))
    if existing:
        return existing
    requirements = _object(specification.get("requirements"))
    shot_specification = _object(
        generation.get("shot_specification")
        or generation.get("shotSpecification")
        or requirements.get("shot_specification")
        or requirements.get("shotSpecification")
    )
    return {
        "contract": legacy.CINEMATIC_CONTROL_CONTRACT,
        "identity_lock": _object(
            specification.get("identity_lock")
            or generation.get("identity_lock")
            or requirements.get("identity_lock")
        ),
        "shot_specification": shot_specification,
        "camera": _object(
            generation.get("camera")
            or shot_specification.get("camera")
            or requirements.get("camera")
        ),
        "continuity": _object(
            generation.get("continuity")
            or shot_specification.get("continuity")
            or requirements.get("continuity")
        ),
        "frame_contract": _object(
            generation.get("frame_contract")
            or shot_specification.get("frame_contract")
            or requirements.get("frame_contract")
        ),
        "negative_constraints": (
            requirements.get("negative_constraints")
            if isinstance(requirements.get("negative_constraints"), list)
            else []
        ),
    }


def _validate_special(job: dict[str, Any]) -> dict[str, Any]:
    data = job.get("input") or {}
    if data.get("contract") != legacy.ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_VIDEO_ENGINE_CONTRACT_INVALID")
    capability = _text(data.get("capability"))
    if capability not in SPECIAL_CAPABILITIES:
        raise ValueError(f"AVANTIQO_VIDEO_CAPABILITY_NOT_IMPLEMENTED:{capability or 'MISSING'}")
    certification_execution = _certification_execution(data)
    if capability not in _configured_capabilities() and not certification_execution:
        raise ValueError(f"AVANTIQO_VIDEO_CAPABILITY_NOT_CERTIFIED:{capability}")

    instruction = _text(data.get("instruction"))
    if not instruction:
        raise ValueError("AVANTIQO_VIDEO_INSTRUCTION_REQUIRED")
    if len(instruction) > 12000:
        raise ValueError("AVANTIQO_VIDEO_INSTRUCTION_TOO_LONG")

    specification, generation, provider_parameters = _structured_transport(data)
    duration = int(
        data.get("duration_seconds")
        or generation.get("duration_seconds")
        or generation.get("duration")
        or provider_parameters.get("duration_seconds")
        or 5
    )
    if duration < 2 or duration > 10:
        raise ValueError("AVANTIQO_VIDEO_DURATION_INVALID")
    fps = int(
        data.get("fps")
        or generation.get("fps")
        or provider_parameters.get("fps")
        or 24
    )
    if fps < 8 or fps > 30:
        raise ValueError("AVANTIQO_VIDEO_FPS_INVALID")
    aspect_ratio = _text(
        data.get("aspect_ratio")
        or generation.get("aspect_ratio")
        or generation.get("ratio")
        or provider_parameters.get("aspect_ratio")
        or "16:9"
    )
    if aspect_ratio not in {"16:9", "9:16", "1:1"}:
        raise ValueError("AVANTIQO_VIDEO_ASPECT_RATIO_INVALID")
    resolution = _text(
        data.get("resolution")
        or generation.get("resolution")
        or provider_parameters.get("resolution")
        or "720p"
    ).lower()
    if resolution != "720p":
        raise ValueError("AVANTIQO_VIDEO_RESOLUTION_UNSUPPORTED")

    roles = _object(data.get("source_asset_roles"))
    source_video = _text(data.get("source_video") or roles.get("source_video"))
    if not source_video:
        source_assets = data.get("source_assets") or []
        if isinstance(source_assets, list) and source_assets:
            source_video = _text(source_assets[0])
    if not source_video:
        raise ValueError("AVANTIQO_VIDEO_SOURCE_VIDEO_REQUIRED")
    source_video = legacy._public_https_url(source_video)

    raw_seed = (
        data.get("seed")
        if data.get("seed") is not None
        else generation.get("seed")
        if generation.get("seed") is not None
        else provider_parameters.get("seed")
    )
    seed = int(raw_seed) if raw_seed is not None and raw_seed != "" else None
    if seed is not None and (seed < 0 or seed > 4294967295):
        raise ValueError("AVANTIQO_VIDEO_SEED_INVALID")

    storage_upload = data.get("storage_upload") or {}
    signed_url = legacy._public_https_url(storage_upload.get("signed_url"), upload=True)
    storage_reference = _text(storage_upload.get("storage_reference"))
    if not storage_reference.startswith("storage://creative-assets/"):
        raise ValueError("AVANTIQO_VIDEO_STORAGE_REFERENCE_INVALID")

    normalized = {
        **data,
        "capability": capability,
        "instruction": instruction,
        "duration_seconds": duration,
        "fps": fps,
        "aspect_ratio": aspect_ratio,
        "resolution": resolution,
        "source_video": source_video,
        "seed": seed,
        "cinematic_control": _governed_control(data, specification, generation),
        "storage_upload": {
            **storage_upload,
            "signed_url": signed_url,
            "storage_reference": storage_reference,
        },
        "certification_execution": certification_execution,
    }
    legacy._validate_control(normalized)
    return normalized


def _cached_source(model_id: str) -> str:
    cached = legacy._cached_model_path(model_id)
    if legacy.REQUIRE_CACHED_MODEL and not cached:
        raise RuntimeError(f"AVANTIQO_VIDEO_CACHED_MODEL_REQUIRED:{model_id}")
    return cached or model_id


def _upscale_pipeline():
    if UPSCALE_MODEL not in _SPECIAL_PIPELINES:
        _SPECIAL_PIPELINES[UPSCALE_MODEL] = pipeline(
            "image-to-image",
            model=_cached_source(UPSCALE_MODEL),
            device=0 if legacy.DEVICE.startswith("cuda") else -1,
        )
    return _SPECIAL_PIPELINES[UPSCALE_MODEL]


def _last_frame(path: Path) -> Image.Image:
    latest = None
    for frame in iio.imiter(path, plugin="FFMPEG"):
        latest = frame
    if latest is None:
        raise ValueError("AVANTIQO_VIDEO_SOURCE_VIDEO_EMPTY")
    return Image.fromarray(latest).convert("RGB")


def _run(command: list[str], error_code: str) -> None:
    result = subprocess.run(
        command,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        detail = _text(result.stderr)[-1000:]
        raise RuntimeError(f"{error_code}:{detail}")


def _join_extension(source: Path, continuation: Path, output: Path, width: int, height: int) -> None:
    graph = (
        f"[0:v:0]scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v0];"
        "[1:v:0]setsar=1[v1];[v0][v1]concat=n=2:v=1:a=0[v]"
    )
    _run([
        "ffmpeg", "-y", "-i", str(source), "-i", str(continuation),
        "-filter_complex", graph, "-map", "[v]", "-an",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output),
    ], "AVANTIQO_VIDEO_EXTEND_JOIN_FAILED")


def _extend(data: dict[str, Any], job: dict[str, Any]) -> dict[str, Any]:
    job_id = _text(job.get("id")) or str(int(time.time() * 1000))
    source_path = legacy._download_video(data["source_video"], job_id, "extend-source")
    continuation_path = OUTPUT_DIR / f"{job_id}-continuation.mp4"
    output_path = OUTPUT_DIR / f"{job_id}-extended.mp4"
    try:
        boundary = _last_frame(source_path)
        width, height = legacy._dimensions(data["aspect_ratio"])
        fps = data["fps"]
        duration = data["duration_seconds"]
        frame_count = legacy._frame_count(duration, fps)
        seed = int(data.get("seed") if data.get("seed") is not None else int.from_bytes(os.urandom(4), "big"))
        if seed < 0 or seed > 4294967295:
            raise ValueError("AVANTIQO_VIDEO_SEED_INVALID")
        generator_device = "cuda" if legacy.DEVICE.startswith("cuda") else legacy.DEVICE
        generator = torch.Generator(device=generator_device).manual_seed(seed)
        runpod.serverless.progress_update(job, "loading Avantiqo Cinema continuation")
        pipe = legacy._pipeline(legacy.I2V_MODEL)
        runpod.serverless.progress_update(job, "generating governed continuation")
        result = pipe(
            prompt=legacy._cinematic_instruction(data),
            image=boundary.resize((width, height), Image.Resampling.LANCZOS),
            width=width,
            height=height,
            num_frames=frame_count,
            num_inference_steps=int(os.getenv("AVANTIQO_VIDEO_INFERENCE_STEPS", "36")),
            guidance_scale=float(os.getenv("AVANTIQO_VIDEO_GUIDANCE_SCALE", "5.0")),
            generator=generator,
        )
        continuation_frames = result.frames[0]
        legacy.export_to_video(
            continuation_frames,
            str(continuation_path),
            fps=fps,
            quality=max(0.0, min(10.0, legacy.EXPORT_QUALITY)),
        )
        runpod.serverless.progress_update(job, "joining source and continuation")
        _join_extension(source_path, continuation_path, output_path, width, height)
        legacy._upload_video(output_path, data["storage_upload"])
        size_bytes = output_path.stat().st_size
        return {
            "status": "completed",
            "provider": "avantiqo-video",
            "model": legacy.PRODUCT_MODEL,
            "engine_contract": legacy.ENGINE_CONTRACT,
            "capability": EXTEND_CAPABILITY,
            "storage_reference": data["storage_upload"]["storage_reference"],
            "foundation_model": legacy.I2V_MODEL,
            "foundation_model_source": "runpod-cache" if legacy._cached_model_path(legacy.I2V_MODEL) else "huggingface",
            "extension_seconds": duration,
            "continuation_frame_count": len(continuation_frames),
            "fps": fps,
            "width": width,
            "height": height,
            "size_bytes": size_bytes,
            "seed": seed,
            "boundary_frame_from_exact_source_tail": True,
            "source_then_generated_continuation": True,
            "continuity_control_bound": bool((data.get("cinematic_control") or {}).get("continuity")),
            "cinematic_control_contract": _text((data.get("cinematic_control") or {}).get("contract")) or None,
            "native_audio": False,
            "certification_execution": data.get("certification_execution") is True,
            "raw_reasoning_persisted": False,
        }
    finally:
        source_path.unlink(missing_ok=True)
        continuation_path.unlink(missing_ok=True)
        output_path.unlink(missing_ok=True)


def _upscale(data: dict[str, Any], job: dict[str, Any]) -> dict[str, Any]:
    job_id = _text(job.get("id")) or str(int(time.time() * 1000))
    source_path = legacy._download_video(data["source_video"], job_id, "upscale-source")
    frames_dir = OUTPUT_DIR / f"{job_id}-upscale-frames"
    output_path = OUTPUT_DIR / f"{job_id}-upscaled.mp4"
    frames_dir.mkdir(parents=True, exist_ok=True)
    fps = data["fps"]
    max_frames = int(MAX_UPSCALE_SOURCE_SECONDS * fps)
    upscaler = _upscale_pipeline()
    frame_count = 0
    source_width = 0
    source_height = 0
    output_width = 0
    output_height = 0
    try:
        runpod.serverless.progress_update(job, "upscaling cinematic frames")
        for frame in iio.imiter(source_path, plugin="FFMPEG", fps=fps):
            if frame_count >= max_frames:
                raise ValueError("AVANTIQO_VIDEO_UPSCALE_SOURCE_DURATION_EXCEEDED")
            source = Image.fromarray(frame).convert("RGB")
            source_width, source_height = source.size
            result = upscaler(source)
            if isinstance(result, dict):
                result = result.get("image") or result.get("images") or result.get("output")
            if isinstance(result, list):
                result = result[0] if result else None
            if not isinstance(result, Image.Image):
                raise RuntimeError("AVANTIQO_VIDEO_UPSCALE_FRAME_OUTPUT_INVALID")
            superres = result.convert("RGB")
            ratio = min(1.0, (MAX_UPSCALE_OUTPUT_PIXELS / (superres.width * superres.height)) ** 0.5)
            if ratio < 1.0:
                superres = superres.resize(
                    (
                        max(2, int(superres.width * ratio) // 2 * 2),
                        max(2, int(superres.height * ratio) // 2 * 2),
                    ),
                    Image.Resampling.LANCZOS,
                )
            output_width, output_height = superres.size
            if output_width <= source_width or output_height <= source_height:
                raise RuntimeError("AVANTIQO_VIDEO_UPSCALE_FACTOR_INVALID")
            superres.save(frames_dir / f"{frame_count:08d}.png", format="PNG")
            frame_count += 1
        if frame_count < 2:
            raise ValueError("AVANTIQO_VIDEO_SOURCE_VIDEO_EMPTY")
        _run([
            "ffmpeg", "-y", "-framerate", str(fps),
            "-i", str(frames_dir / "%08d.png"), "-an",
            "-c:v", "libx264", "-preset", "medium", "-crf", "16",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output_path),
        ], "AVANTIQO_VIDEO_UPSCALE_ENCODE_FAILED")
        legacy._upload_video(output_path, data["storage_upload"])
        size_bytes = output_path.stat().st_size
        return {
            "status": "completed",
            "provider": "avantiqo-video",
            "model": legacy.PRODUCT_MODEL,
            "engine_contract": legacy.ENGINE_CONTRACT,
            "capability": UPSCALE_CAPABILITY,
            "storage_reference": data["storage_upload"]["storage_reference"],
            "foundation_model": UPSCALE_MODEL,
            "foundation_model_source": "runpod-cache" if legacy._cached_model_path(UPSCALE_MODEL) else "huggingface",
            "source_width": source_width,
            "source_height": source_height,
            "width": output_width,
            "height": output_height,
            "fps": fps,
            "frame_count": frame_count,
            "size_bytes": size_bytes,
            "deterministic_frame_super_resolution": True,
            "temporal_quality_review_required": True,
            "native_audio": False,
            "certification_execution": data.get("certification_execution") is True,
            "raw_reasoning_persisted": False,
        }
    finally:
        source_path.unlink(missing_ok=True)
        output_path.unlink(missing_ok=True)
        if frames_dir.exists():
            for child in frames_dir.iterdir():
                child.unlink(missing_ok=True)
            frames_dir.rmdir()


def handler(job: dict[str, Any]) -> dict[str, Any]:
    capability = _text((job.get("input") or {}).get("capability"))
    if capability not in SPECIAL_CAPABILITIES:
        return legacy.handler(job)
    data = _validate_special(job)
    started = time.perf_counter()
    output = _extend(data, job) if capability == EXTEND_CAPABILITY else _upscale(data, job)
    output["generation_seconds"] = round(time.perf_counter() - started, 3)
    return output


def _required_cached_models(capabilities: set[str]) -> set[str]:
    required_models: set[str] = set()
    for capability in capabilities:
        if capability == "ai.video.generate":
            required_models.add(legacy.T2V_MODEL)
        elif capability == "ai.video.image_to_video":
            required_models.add(legacy.I2V_MODEL)
        elif capability == "ai.video.first_last_frame_to_video":
            required_models.add(legacy.FIRST_LAST_MODEL)
        elif capability == "ai.video.video_to_video":
            required_models.add(legacy.V2V_MODEL)
        elif capability == "ai.video.edit":
            required_models.add(legacy.EDIT_MODEL)
        elif capability == "ai.video.inpaint":
            required_models.add(legacy.INPAINT_MODEL)
        elif capability == EXTEND_CAPABILITY:
            required_models.add(legacy.I2V_MODEL)
        elif capability == UPSCALE_CAPABILITY:
            required_models.add(UPSCALE_MODEL)
    return {model_id for model_id in required_models if model_id}


@runpod.serverless.register_fitness_check
def check_worker():
    if not torch.cuda.is_available():
        raise RuntimeError("AVANTIQO_VIDEO_CUDA_REQUIRED")
    required = _configured_capabilities()
    if not required:
        raise RuntimeError("AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES_REQUIRED")
    required_models = _required_cached_models(required)
    if legacy.REQUIRE_CACHED_MODEL:
        for model_id in required_models:
            if not legacy._cached_model_path(model_id):
                raise RuntimeError(f"AVANTIQO_VIDEO_CACHED_MODEL_REQUIRED:{model_id}")


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
