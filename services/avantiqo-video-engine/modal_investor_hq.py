"""Production-quality LTX-2.5 lane for Avantiqo investor-film shots.

This lane is intentionally separate from the fast distilled preview lane.
It uses the full-dev BF16 transformer with the official two-stage HQ pipeline:
stage 1 establishes composition/motion at half resolution and stage 2 performs
learned latent upsampling plus distilled-LoRA refinement at 1920x1088.

No source image, prior video, screenshot, browser capture, or imported visual
asset is accepted. Avantiqo Studio owns deterministic 4K delivery mastering.
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
    LTX_RUNTIME_IMAGE,
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

CONTRACT = "AVANTIQO_INVESTOR_T2V_HQ_MODAL_V1"
QUALITY_CONTRACT = "AVANTIQO_INVESTOR_T2V_FULL_DEV_TWO_STAGE_HQ_1920X1088_V1"
WIDTH = 1920
HEIGHT = 1088
STAGE1_WIDTH = WIDTH // 2
STAGE1_HEIGHT = HEIGHT // 2
FPS = 24
NUM_INFERENCE_STEPS = 30
DISTILLED_LORA_STAGE1_STRENGTH = 0.25
DISTILLED_LORA_STAGE2_STRENGTH = 0.50
HARD_TIMEOUT_SECONDS = 20 * 60
SUBPROCESS_TIMEOUT_SECONDS = HARD_TIMEOUT_SECONDS - 30
DISTILLED_LORA = "loras/ltx-2.5-22b-distilled-lora-450-bf16.safetensors"
SPATIAL_UPSAMPLER = "latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors"
HQ_REQUIRED = (*LTX_REQUIRED, DISTILLED_LORA, SPATIAL_UPSAMPLER)

transport_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("requests==2.32.4")
    .add_local_python_source("modal_app")
)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _sanitize(value: Any, limit: int = 2200) -> str:
    return _text(value).replace("\n", " ")[-limit:]


def _token(value: Any, fallback: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9_-]+", "-", _text(value)).strip("-")
    return (normalized or fallback)[:120]


def _snapshot() -> Path:
    root = LTX_SNAPSHOT_ROOT / LTX_SOURCE_REVISION
    if not root.is_dir():
        raise RuntimeError(f"{CONTRACT}_CACHE_MISSING:{LTX_SOURCE_REVISION}")
    missing = [
        name for name in HQ_REQUIRED
        if not (root / name).is_file() or (root / name).stat().st_size <= 0
    ]
    if missing:
        raise RuntimeError(f"{CONTRACT}_CACHE_INCOMPLETE:" + ",".join(missing))
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
def seed_investor_hq_cache() -> dict[str, Any]:
    """Ensure the two HQ-only assets exist; this function never allocates a GPU."""
    from huggingface_hub import snapshot_download

    model_volume.reload()
    try:
        root = _snapshot()
        return {
            "success": True,
            "already_cached": True,
            "revision": root.name,
            "gpu_inference_performed": False,
        }
    except RuntimeError:
        pass

    resolved = Path(snapshot_download(
        repo_id=LTX_SOURCE_REPO,
        revision=LTX_SOURCE_REVISION,
        cache_dir=HF_CACHE_ROOT,
        token=os.environ.get("HF_TOKEN") or None,
        allow_patterns=[DISTILLED_LORA, SPATIAL_UPSAMPLER],
        max_workers=8,
    ))
    if resolved.name != LTX_SOURCE_REVISION:
        raise RuntimeError(f"{CONTRACT}_REVISION_INVALID:{resolved.name}")
    model_volume.commit()
    model_volume.reload()
    root = _snapshot()
    return {
        "success": True,
        "already_cached": False,
        "revision": root.name,
        "gpu_inference_performed": False,
    }


def _frames(duration_seconds: int) -> int:
    desired = max(33, int(duration_seconds) * FPS + 1)
    return max(33, ((desired - 1) // 8) * 8 + 1)


def _prompt(instruction: str) -> str:
    value = instruction.strip()
    if not value:
        raise ValueError(f"{CONTRACT}_INSTRUCTION_REQUIRED")
    return value + (
        " Premium photographed enterprise cinema, not a software advertisement. "
        "Natural skin texture, anatomically correct hands, believable eye focus, physically plausible cloth, glass, metal, paper and food surfaces. "
        "Motivated practical lighting, controlled highlight rolloff, deep but detailed blacks, realistic lens falloff and depth of field. "
        "Camera movement must be restrained, mechanically coherent and motivated by the action; preserve identity and geometry through the whole shot. "
        "Performances are subtle and serious, never stock-photo smiling or exaggerated surprise. "
        "No typography, captions, readable generated words, numbers, logos, watermark, browser chrome, dashboard montage, floating hologram, neon network, sci-fi particles, plastic skin, extra fingers, warped hands, duplicated people, morphing, temporal flicker, frame collapse, sudden zoom or artificial over-sharpening."
    )


def _negative_prompt() -> str:
    return (
        "text, typography, captions, readable words, numbers, logos, watermarks, browser chrome, generic dashboard, "
        "hologram, neon UI, glowing network, particles, stock footage, smiling corporate actors, plastic skin, wax face, "
        "extra fingers, fused fingers, malformed hands, duplicate people, identity drift, morphing, warped geometry, "
        "melting objects, flicker, frame collapse, camera roll, yaw drift, sudden zoom, severe motion blur, low resolution, "
        "oversharpening, crushed blacks, clipped highlights, teal orange blockbuster grade"
    )


@app.function(
    image=ltx_worker_image,
    gpu=LTX_GPU,
    volumes={"/models": model_volume},
    timeout=HARD_TIMEOUT_SECONDS,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=5,
    retries=0,
)
def generate_investor_hq_master(
    output_relative: str,
    instruction: str,
    duration_seconds: int = 6,
    seed: int = 260905,
) -> dict[str, Any]:
    """Generate one new HQ two-stage shot. No delivery transforms happen here."""
    started = time.perf_counter()
    model_volume.reload()
    root = _snapshot()
    duration = int(duration_seconds)
    if duration <= 0 or duration > 10:
        raise RuntimeError(f"{CONTRACT}_DURATION_INVALID")

    output = Path("/models") / output_relative.lstrip("/")
    output.parent.mkdir(parents=True, exist_ok=True)
    frames = _frames(duration)

    command = [
        "python", "-m", "ltx_pipelines.ti2vid_two_stages_hq",
        "--transformer-path", str(root / LTX_REQUIRED[0]),
        "--text-encoder-path", str(root / LTX_REQUIRED[1]),
        "--video-vae-path", str(root / LTX_REQUIRED[2]),
        "--audio-vae-path", str(root / LTX_REQUIRED[3]),
        "--distilled-lora", str(root / DISTILLED_LORA),
        "--spatial-upsampler-path", str(root / SPATIAL_UPSAMPLER),
        "--num-frames", str(frames),
        "--width", str(WIDTH),
        "--height", str(HEIGHT),
        "--frame-rate", str(FPS),
        "--num-inference-steps", str(NUM_INFERENCE_STEPS),
        "--seed", str(int(seed)),
        "--max-batch-size", "1",
        "--distilled-lora-strength-stage-1", str(DISTILLED_LORA_STAGE1_STRENGTH),
        "--distilled-lora-strength-stage-2", str(DISTILLED_LORA_STAGE2_STRENGTH),
        "--output-path", str(output),
        "--prompt", _prompt(instruction),
        "--negative-prompt", _negative_prompt(),
    ]
    env = os.environ.copy()
    env["PYTHONPATH"] = ":".join([
        str(LTX_PIPELINE_ROOT / "packages/ltx-core/src"),
        str(LTX_PIPELINE_ROOT / "packages/ltx-pipelines/src"),
        env.get("PYTHONPATH", ""),
    ])
    env["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
    env["CUDA_MODULE_LOADING"] = "LAZY"

    try:
        completed = subprocess.run(
            command,
            cwd=str(LTX_PIPELINE_ROOT),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=SUBPROCESS_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(
            f"{CONTRACT}_TIMEOUT:{_sanitize(getattr(exc, 'stdout', '') or getattr(exc, 'output', ''))}"
        ) from exc

    if completed.returncode != 0:
        raise RuntimeError(f"{CONTRACT}_COMMAND_FAILED:{completed.returncode}:{_sanitize(completed.stdout)}")
    if not output.is_file() or output.stat().st_size <= 1_000_000:
        raise RuntimeError(f"{CONTRACT}_OUTPUT_INVALID")

    model_volume.commit()
    elapsed = round(time.perf_counter() - started, 3)
    return {
        "success": True,
        "contract": CONTRACT,
        "quality_contract": QUALITY_CONTRACT,
        "engine_contract": NATIVE_ENGINE_CONTRACT,
        "provider": "avantiqo-video",
        "model": "avantiqo-ltx-2.5",
        "foundation_model": LTX_SOURCE_REPO,
        "foundation_revision": root.name,
        "pipeline": "TI2VID_TWO_STAGES_HQ_FULL_DEV_BF16",
        "runtime_image": LTX_RUNTIME_IMAGE,
        "modal_gpu": LTX_GPU,
        "width": WIDTH,
        "height": HEIGHT,
        "stage_1_width": STAGE1_WIDTH,
        "stage_1_height": STAGE1_HEIGHT,
        "fps": FPS,
        "num_inference_steps": NUM_INFERENCE_STEPS,
        "frame_count": frames,
        "duration_seconds_requested": duration,
        "seed": int(seed),
        "full_dev_transformer_used": True,
        "distilled_transformer_used": False,
        "learned_latent_spatial_upsampler_used": True,
        "distilled_lora_refinement_used": True,
        "distilled_lora_strength_stage_1": DISTILLED_LORA_STAGE1_STRENGTH,
        "distilled_lora_strength_stage_2": DISTILLED_LORA_STAGE2_STRENGTH,
        "output_relative": output_relative,
        "output_size_bytes": output.stat().st_size,
        "modal_function_seconds": elapsed,
        "estimated_supplier_gpu_cost_usd": round(elapsed * LTX_GPU_USD_PER_SECOND, 8),
        "source_visual_asset_count": 0,
        "source_image_used": False,
        "source_video_used": False,
        "screenshot_or_browser_capture_used": False,
        "pure_text_to_video": True,
        "newly_generated_asset": True,
        "external_provider_contacted": False,
        "automatic_paid_retry": False,
        "pipeline_stdout_tail": _sanitize(completed.stdout),
    }


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
        raise RuntimeError(f"{CONTRACT}_UPLOAD_FAILED:{response.status_code}")


@app.function(
    image=transport_image,
    volumes={"/models": model_volume},
    timeout=HARD_TIMEOUT_SECONDS + 5 * 60,
    min_containers=0,
    max_containers=1,
    scaledown_window=5,
    retries=0,
)
def generate_investor_hq_job(data: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError(f"{CONTRACT}_JOB_OBJECT_REQUIRED")
    if _text(data.get("capability")) != "ai.video.generate":
        raise ValueError(f"{CONTRACT}_T2V_CAPABILITY_REQUIRED")
    if data.get("source_urls") or data.get("source_image") or data.get("source_video"):
        raise ValueError(f"{CONTRACT}_EXISTING_VISUAL_INPUT_FORBIDDEN")

    organization_id = _text(data.get("organization_id"))
    usage_id = _text(data.get("usage_id"))
    instruction = _text(data.get("instruction"))
    signed_url = _text((data.get("storage_upload") or {}).get("signed_url"))
    storage_reference = _text((data.get("storage_upload") or {}).get("storage_reference"))
    duration = int(data.get("duration_seconds") or 6)
    seed = int(data.get("seed") or 260905)

    if not organization_id or not usage_id or not instruction:
        raise ValueError(f"{CONTRACT}_GOVERNED_CONTEXT_REQUIRED")
    if not signed_url.startswith("https://") or not storage_reference.startswith("storage://creative-assets/"):
        raise ValueError(f"{CONTRACT}_STORAGE_TARGET_INVALID")

    relative = (
        Path("runtime-investor-hq")
        / _token(organization_id, "org")
        / _token(usage_id, "usage")
        / uuid.uuid4().hex
        / "master.mp4"
    )
    output = Path("/models") / relative
    try:
        generation = generate_investor_hq_master.remote(str(relative), instruction, duration, seed)
        if not isinstance(generation, dict) or generation.get("success") is not True:
            raise RuntimeError(f"{CONTRACT}_RESULT_INVALID")
        if not output.exists() or output.stat().st_size < 1_000_000:
            model_volume.reload()
        if not output.exists() or output.stat().st_size < 1_000_000:
            raise RuntimeError(f"{CONTRACT}_OUTPUT_MISSING")
        _upload(output, signed_url)
        return {
            "success": True,
            "contract": CONTRACT,
            "quality_contract": QUALITY_CONTRACT,
            "engine": "avantiqo-owned",
            "model": "avantiqo-ltx-2.5",
            "pipeline": generation.get("pipeline"),
            "modal_gpu": generation.get("modal_gpu") or LTX_GPU,
            "width": WIDTH,
            "height": HEIGHT,
            "fps": FPS,
            "duration_seconds": duration,
            "seed": seed,
            "storage_reference": storage_reference,
            "generation": generation,
            "gpu_generation_calls": 1,
            "source_visual_asset_count": 0,
            "pure_text_to_video": True,
            "newly_generated_asset": True,
            "external_provider_used": False,
            "automatic_paid_retry": False,
        }
    finally:
        try:
            output.unlink(missing_ok=True)
            parent = output.parent
            while parent != Path("/models") and parent.exists():
                parent.rmdir()
                parent = parent.parent
        except Exception:
            pass
        try:
            model_volume.commit()
        except Exception:
            pass
