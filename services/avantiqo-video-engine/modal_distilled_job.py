"""Cost-bounded LTX-2.5 distilled two-stage Modal lane for Avantiqo Video.

This lane exists because direct full-dev BF16 3840x2176 diffusion is not a
viable production path: a measured 5-second shot reached only step 28/30 at the
1780-second hard timeout on B200. The official LTX-2.5 DistilledPipeline instead
generates stage 1 at half resolution, applies the learned x2 latent spatial
upsampler, and performs the short distilled refinement stage at 1920x1088.
Studio owns the deterministic 4K delivery upscale/crop after generation.
"""
from __future__ import annotations

import os
import re
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any

import modal

from modal_app import (
    HF_CACHE_ROOT,
    LTX_GPU,
    LTX_GPU_USD_PER_SECOND,
    LTX_PIPELINE_ROOT,
    LTX_REQUIRED,
    LTX_SNAPSHOT_ROOT,
    LTX_SOURCE_REPO,
    LTX_SOURCE_REVISION,
    MODEL_SECRET_NAME,
    NATIVE_ENGINE_CONTRACT,
    app,
    ltx_worker_image,
    model_volume,
    seed_image,
)

DISTILLED_JOB_CONTRACT = "AVANTIQO_VIDEO_LTX25_MODAL_DISTILLED_JOB_V1"
DISTILLED_RUNTIME_CONTRACT = "AVANTIQO_VIDEO_LTX25_MODAL_DISTILLED_TWO_STAGE_V1"
DISTILLED_QUALITY_CONTRACT = "AVANTIQO_VIDEO_LTX25_DISTILLED_1920X1088_MASTER_V1"
DISTILLED_WIDTH = 1920
DISTILLED_HEIGHT = 1088
DISTILLED_STAGE1_WIDTH = DISTILLED_WIDTH // 2
DISTILLED_STAGE1_HEIGHT = DISTILLED_HEIGHT // 2
DISTILLED_FPS = 24
DISTILLED_STAGE1_STEPS = 8
DISTILLED_STAGE2_STEPS = 3
DISTILLED_HARD_TIMEOUT_SECONDS = 8 * 60
DISTILLED_SUBPROCESS_TIMEOUT_SECONDS = 7 * 60 + 30
DISTILLED_TRANSFORMER_RELATIVE = "diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors"
DISTILLED_UPSAMPLER_RELATIVE = "latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors"
DISTILLED_REQUIRED = (
    DISTILLED_TRANSFORMER_RELATIVE,
    LTX_REQUIRED[1],
    LTX_REQUIRED[2],
    LTX_REQUIRED[3],
    DISTILLED_UPSAMPLER_RELATIVE,
)
MAX_REFERENCE_BYTES = 100 * 1024 * 1024
MIN_REFERENCE_BYTES = 1024

transport_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("requests==2.32.4")
    .add_local_python_source("modal_app")
)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _sanitize(value: Any, limit: int = 2400) -> str:
    return _text(value).replace("\n", " ")[-limit:]


def _path_token(value: Any, fallback: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9_-]+", "-", _text(value)).strip("-")
    return (normalized or fallback)[:120]


def _snapshot() -> Path:
    root = LTX_SNAPSHOT_ROOT / LTX_SOURCE_REVISION
    if not root.is_dir():
        raise RuntimeError(f"AVANTIQO_VIDEO_LTX25_DISTILLED_CACHE_MISSING:{LTX_SOURCE_REVISION}")
    missing = [
        name for name in DISTILLED_REQUIRED
        if not (root / name).is_file() or (root / name).stat().st_size <= 0
    ]
    if missing:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_DISTILLED_CACHE_INCOMPLETE:" + ",".join(missing))
    return root


@app.function(
    image=seed_image,
    volumes={"/models": model_volume},
    secrets=[modal.Secret.from_name(MODEL_SECRET_NAME)],
    timeout=2 * 60 * 60,
    min_containers=0,
    max_containers=1,
    scaledown_window=5,
    retries=0,
)
def seed_ltx_distilled_cache() -> dict[str, Any]:
    """Populate only missing distilled transformer/upscaler files; zero GPU."""
    from huggingface_hub import snapshot_download

    model_volume.reload()
    try:
        root = _snapshot()
        return {
            "success": True,
            "already_cached": True,
            "revision": root.name,
            "required_files": list(DISTILLED_REQUIRED),
            "gpu_inference_performed": False,
        }
    except RuntimeError:
        pass

    resolved = Path(snapshot_download(
        repo_id=LTX_SOURCE_REPO,
        revision=LTX_SOURCE_REVISION,
        cache_dir=HF_CACHE_ROOT,
        token=os.environ.get("HF_TOKEN") or None,
        allow_patterns=[DISTILLED_TRANSFORMER_RELATIVE, DISTILLED_UPSAMPLER_RELATIVE],
        max_workers=8,
    ))
    if resolved.name != LTX_SOURCE_REVISION:
        raise RuntimeError(f"AVANTIQO_VIDEO_LTX25_DISTILLED_REVISION_INVALID:{resolved.name}")
    model_volume.commit()
    model_volume.reload()
    root = _snapshot()
    return {
        "success": True,
        "already_cached": False,
        "revision": root.name,
        "required_files": list(DISTILLED_REQUIRED),
        "gpu_inference_performed": False,
    }


def _frame_count(duration_seconds: int) -> int:
    desired = max(33, int(duration_seconds) * DISTILLED_FPS + 1)
    return max(33, ((desired - 1) // 8) * 8 + 1)


def _prompt(instruction: str) -> str:
    value = instruction.strip()
    if not value:
        raise ValueError("AVANTIQO_VIDEO_LTX25_DISTILLED_INSTRUCTION_REQUIRED")
    return value + (
        " Full-bleed cinematic image only. No typography, captions, numbers, logos or letterbox bars."
        " Preserve supplied composition and geometry. Premium photographic realism, physically plausible motion,"
        " natural exposure, stable camera intent, no morphing, flicker or frame collapse."
    )


@app.function(
    image=ltx_worker_image,
    gpu=LTX_GPU,
    volumes={"/models": model_volume},
    timeout=DISTILLED_HARD_TIMEOUT_SECONDS,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=5,
    retries=0,
)
def generate_distilled_master(
    reference_relative: str,
    output_relative: str,
    instruction: str,
    duration_seconds: int = 5,
    seed: int = 4747,
) -> dict[str, Any]:
    """Generate one official two-stage distilled 1920x1088 LTX-2.5 master."""
    function_started = time.perf_counter()
    model_volume.reload()
    root = _snapshot()
    reference = Path("/models") / reference_relative.lstrip("/")
    output = Path("/models") / output_relative.lstrip("/")
    if not reference.is_file() or reference.stat().st_size < MIN_REFERENCE_BYTES:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_DISTILLED_REFERENCE_INVALID")
    duration = int(duration_seconds)
    if duration <= 0 or duration > 20:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_DISTILLED_DURATION_INVALID")
    output.parent.mkdir(parents=True, exist_ok=True)
    frames = _frame_count(duration)

    command = [
        "python", "-m", "ltx_pipelines.distilled",
        "--transformer-path", str(root / DISTILLED_TRANSFORMER_RELATIVE),
        "--text-encoder-path", str(root / LTX_REQUIRED[1]),
        "--video-vae-path", str(root / LTX_REQUIRED[2]),
        "--audio-vae-path", str(root / LTX_REQUIRED[3]),
        "--spatial-upsampler-path", str(root / DISTILLED_UPSAMPLER_RELATIVE),
        "--num-frames", str(frames),
        "--width", str(DISTILLED_WIDTH),
        "--height", str(DISTILLED_HEIGHT),
        "--frame-rate", str(DISTILLED_FPS),
        "--seed", str(int(seed)),
        "--output-path", str(output),
        "--prompt", _prompt(instruction),
        "--image", str(reference), "0", "1.0", "0",
    ]
    env = os.environ.copy()
    env["PYTHONPATH"] = ":".join([
        str(LTX_PIPELINE_ROOT / "packages/ltx-core/src"),
        str(LTX_PIPELINE_ROOT / "packages/ltx-pipelines/src"),
        env.get("PYTHONPATH", ""),
    ])
    env["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
    env["CUDA_MODULE_LOADING"] = "LAZY"

    generation_started = time.perf_counter()
    try:
        completed = subprocess.run(
            command,
            cwd=str(LTX_PIPELINE_ROOT),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=DISTILLED_SUBPROCESS_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        detail = _sanitize(getattr(exc, "stdout", "") or getattr(exc, "output", ""), 1600)
        raise RuntimeError(
            f"AVANTIQO_VIDEO_LTX25_DISTILLED_COST_TIMEOUT:{DISTILLED_SUBPROCESS_TIMEOUT_SECONDS}:{detail}"
        ) from exc
    generation_seconds = round(time.perf_counter() - generation_started, 3)
    if completed.returncode != 0:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_LTX25_DISTILLED_COMMAND_FAILED:{completed.returncode}:{_sanitize(completed.stdout)}"
        )
    if not output.is_file() or output.stat().st_size <= 500_000:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_DISTILLED_OUTPUT_INVALID")
    model_volume.commit()
    function_seconds = round(time.perf_counter() - function_started, 3)
    return {
        "success": True,
        "status": "completed",
        "contract": DISTILLED_RUNTIME_CONTRACT,
        "quality_contract": DISTILLED_QUALITY_CONTRACT,
        "engine_contract": NATIVE_ENGINE_CONTRACT,
        "provider": "avantiqo-video",
        "model": "avantiqo-ltx-2.5",
        "foundation_model": LTX_SOURCE_REPO,
        "foundation_revision": root.name,
        "pipeline": "DISTILLED_TWO_STAGE_BF16",
        "precision": "BF16",
        "modal_gpu": LTX_GPU,
        "width": DISTILLED_WIDTH,
        "height": DISTILLED_HEIGHT,
        "stage_1_width": DISTILLED_STAGE1_WIDTH,
        "stage_1_height": DISTILLED_STAGE1_HEIGHT,
        "fps": DISTILLED_FPS,
        "stage_1_steps": DISTILLED_STAGE1_STEPS,
        "stage_2_steps": DISTILLED_STAGE2_STEPS,
        "frame_count": frames,
        "duration_seconds_requested": duration,
        "seed": int(seed),
        "output_relative": output_relative,
        "output_size_bytes": output.stat().st_size,
        "generation_seconds": generation_seconds,
        "modal_function_seconds": function_seconds,
        "supplier_gpu_rate_usd_per_second": LTX_GPU_USD_PER_SECOND,
        "estimated_supplier_gpu_cost_usd": round(function_seconds * LTX_GPU_USD_PER_SECOND, 8),
        "hard_timeout_seconds": DISTILLED_HARD_TIMEOUT_SECONDS,
        "native_master_generated": True,
        "master_is_exact_model_output": True,
        "native_audio_generated": True,
        "pixel_upscale_used": False,
        "learned_latent_upsampler_used": True,
        "learned_spatial_upscaler_used": True,
        "temporal_interpolation_used": False,
        "distilled_transformer_used": True,
        "distilled_lora_used": False,
        "resize_used": False,
        "crop_used": False,
        "grading_used": False,
        "assembly_used": False,
        "delivery_transform_used": False,
        "runpod_inference_performed": False,
        "external_provider_contacted": False,
        "automatic_paid_retry": False,
        "raw_reasoning_persisted": False,
        "pipeline_stdout_tail": _sanitize(completed.stdout, 1600),
    }


def _download_reference(url: str, destination: Path) -> int:
    import requests

    destination.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    with requests.get(url, stream=True, timeout=300) as response:
        if not response.ok:
            raise RuntimeError(f"AVANTIQO_VIDEO_LTX25_DISTILLED_DOWNLOAD_FAILED:{response.status_code}")
        with destination.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if not chunk:
                    continue
                total += len(chunk)
                if total > MAX_REFERENCE_BYTES:
                    raise RuntimeError("AVANTIQO_VIDEO_LTX25_DISTILLED_REFERENCE_TOO_LARGE")
                handle.write(chunk)
    if total < MIN_REFERENCE_BYTES:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_DISTILLED_REFERENCE_INVALID")
    return total


def _upload(path: Path, signed_url: str) -> None:
    import requests

    with path.open("rb") as handle:
        response = requests.put(
            signed_url,
            data=handle,
            headers={"content-type": "video/mp4", "cache-control": "max-age=3600", "x-upsert": "false"},
            timeout=300,
        )
    if not response.ok:
        raise RuntimeError(f"AVANTIQO_VIDEO_LTX25_DISTILLED_UPLOAD_FAILED:{response.status_code}")


def _validate_job(data: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("AVANTIQO_VIDEO_LTX25_DISTILLED_JOB_OBJECT_REQUIRED")
    if _text(data.get("capability")) != "ai.video.image_to_video":
        raise ValueError("AVANTIQO_VIDEO_LTX25_DISTILLED_I2V_REQUIRED")
    organization_id = _text(data.get("organization_id"))
    usage_id = _text(data.get("usage_id"))
    instruction = _text(data.get("instruction"))
    if not organization_id or not usage_id or not instruction:
        raise ValueError("AVANTIQO_VIDEO_LTX25_DISTILLED_GOVERNED_CONTEXT_REQUIRED")
    specification = _object(data.get("structured_specification"))
    generation = _object(specification.get("generation"))
    raw_duration = data.get("duration_seconds") or generation.get("duration_seconds") or 5
    duration = int(raw_duration)
    if duration <= 0 or duration > 20:
        raise ValueError("AVANTIQO_VIDEO_LTX25_DISTILLED_DURATION_INVALID")
    raw_seed = data.get("seed") if data.get("seed") is not None else generation.get("seed")
    seed = 4747 if raw_seed in (None, "") else int(raw_seed)
    if seed < 0 or seed > 4294967295:
        raise ValueError("AVANTIQO_VIDEO_LTX25_DISTILLED_SEED_INVALID")
    sources = data.get("source_urls") or generation.get("source_urls") or []
    sources = [_text(value) for value in _list(sources) if _text(value)]
    if not sources or not sources[0].startswith("https://"):
        raise ValueError("AVANTIQO_VIDEO_LTX25_DISTILLED_REFERENCE_REQUIRED")
    storage = _object(data.get("storage_upload"))
    signed_url = _text(storage.get("signed_url"))
    storage_reference = _text(storage.get("storage_reference"))
    if not signed_url.startswith("https://") or not storage_reference.startswith("storage://creative-assets/"):
        raise ValueError("AVANTIQO_VIDEO_LTX25_DISTILLED_STORAGE_TARGET_INVALID")
    return {
        "organization_id": organization_id,
        "usage_id": usage_id,
        "instruction": instruction,
        "source_url": sources[0],
        "signed_url": signed_url,
        "storage_reference": storage_reference,
        "duration_seconds": duration,
        "seed": seed,
    }


@app.function(
    image=transport_image,
    volumes={"/models": model_volume},
    timeout=DISTILLED_HARD_TIMEOUT_SECONDS + 5 * 60,
    min_containers=0,
    max_containers=1,
    scaledown_window=5,
    retries=0,
)
def generate_distilled_job(data: dict[str, Any]) -> dict[str, Any]:
    job = _validate_job(data)
    job_id = uuid.uuid4().hex
    organization = _path_token(job["organization_id"], "organization")
    usage = _path_token(job["usage_id"], "usage")
    relative_root = Path("runtime-jobs-distilled") / organization / usage / job_id
    reference_relative = str(relative_root / "studio-reference.jpg")
    output_relative = str(relative_root / "distilled-master-1920x1088.mp4")
    reference_path = Path("/models") / reference_relative
    output_path = Path("/models") / output_relative
    try:
        reference_bytes = _download_reference(job["source_url"], reference_path)
        model_volume.commit()
        generation = generate_distilled_master.remote(
            reference_relative,
            output_relative,
            job["instruction"],
            job["duration_seconds"],
            job["seed"],
        )
        if not isinstance(generation, dict) or generation.get("success") is not True:
            raise RuntimeError("AVANTIQO_VIDEO_LTX25_DISTILLED_RESULT_INVALID")
        if not output_path.exists() or output_path.stat().st_size < 500_000:
            model_volume.reload()
        if not output_path.exists() or output_path.stat().st_size < 500_000:
            raise RuntimeError("AVANTIQO_VIDEO_LTX25_DISTILLED_OUTPUT_MISSING")
        _upload(output_path, job["signed_url"])
        return {
            "success": True,
            "contract": DISTILLED_JOB_CONTRACT,
            "engine": "avantiqo-owned",
            "model": "avantiqo-ltx-2.5",
            "runtime_contract": DISTILLED_RUNTIME_CONTRACT,
            "gpu": LTX_GPU,
            "modal_gpu": _text(generation.get("modal_gpu")) or LTX_GPU,
            "width": DISTILLED_WIDTH,
            "height": DISTILLED_HEIGHT,
            "stage_1_width": DISTILLED_STAGE1_WIDTH,
            "stage_1_height": DISTILLED_STAGE1_HEIGHT,
            "fps": DISTILLED_FPS,
            "stage_1_steps": DISTILLED_STAGE1_STEPS,
            "stage_2_steps": DISTILLED_STAGE2_STEPS,
            "duration_seconds": job["duration_seconds"],
            "seed": job["seed"],
            "supplier_gpu_cost_usd": generation.get("estimated_supplier_gpu_cost_usd"),
            "generation": generation,
            "reference_bytes": reference_bytes,
            "storage_reference": job["storage_reference"],
            "gpu_generation_calls": 1,
            "automatic_generation_retries": 0,
            "automatic_paid_retry": False,
            "runpod_used": False,
            "external_provider_used": False,
            "runpod_inference_performed": False,
            "external_provider_contacted": False,
        }
    finally:
        for path in (reference_path, output_path):
            try:
                path.unlink(missing_ok=True)
            except Exception:
                pass
        try:
            parent = output_path.parent
            while parent != Path("/models") and parent.exists():
                parent.rmdir()
                parent = parent.parent
        except Exception:
            pass
        try:
            model_volume.commit()
        except Exception:
            pass
