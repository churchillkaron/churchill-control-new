from __future__ import annotations

import os
import subprocess
import time
from pathlib import Path
from typing import Any

from modal_app import (
    LTX_FPS,
    LTX_GEMMA_REALPATH_ENV,
    LTX_GEMMA_SUFFIX_COMPAT_ENTRYPOINT,
    LTX_GPU,
    LTX_GPU_USD_PER_SECOND,
    LTX_HARD_TIMEOUT_SECONDS,
    LTX_MASTER_HEIGHT,
    LTX_MASTER_WIDTH,
    LTX_NUM_INFERENCE_STEPS,
    LTX_PIPELINE_ROOT,
    LTX_QUALITY_CONTRACT,
    LTX_REQUIRED,
    LTX_RUNTIME_CONTRACT,
    LTX_SOURCE_REPO,
    LTX_SUBPROCESS_TIMEOUT_SECONDS,
    NATIVE_ENGINE_CONTRACT,
    _ltx_frame_count,
    _ltx_negative_prompt,
    _ltx_prompt,
    _ltx_snapshot,
    _sanitize,
    app,
    ltx_worker_image,
    model_volume,
)

CONTROL_CONTRACT = "AVANTIQO_VIDEO_LTX25_NATIVE_CONTROLLED_MASTER_V1"
MAX_CONDITIONS = 8


def _text(value: Any) -> str:
    return str(value or "").strip()


def _finite(value: Any, fallback: float | None = None) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return number


def _condition_frame_index(condition: dict[str, Any], frame_count: int) -> int:
    explicit = _finite(condition.get("frame_index"))
    if explicit is not None:
        return max(0, min(frame_count - 1, int(round(explicit))))
    fraction = _finite(condition.get("frame_fraction"))
    if fraction is None:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_CONTROL_FRAME_POSITION_REQUIRED")
    return max(0, min(frame_count - 1, int(round(max(0.0, min(1.0, fraction)) * (frame_count - 1)))))


def _validated_conditions(reference_conditions: list[dict[str, Any]], frame_count: int) -> list[dict[str, Any]]:
    if not isinstance(reference_conditions, list) or not reference_conditions:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_CONTROL_REFERENCE_CONDITIONS_REQUIRED")
    if len(reference_conditions) > MAX_CONDITIONS:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_CONTROL_TOO_MANY_REFERENCE_CONDITIONS")

    normalized: list[dict[str, Any]] = []
    seen_frames: set[int] = set()
    for condition in reference_conditions:
        if not isinstance(condition, dict):
            raise RuntimeError("AVANTIQO_VIDEO_LTX25_CONTROL_REFERENCE_CONDITION_INVALID")
        relative = _text(condition.get("reference_relative"))
        path = Path("/models") / relative.lstrip("/")
        if not relative or not path.is_file() or path.stat().st_size < 20_000:
            raise RuntimeError("AVANTIQO_VIDEO_LTX25_CONTROL_REFERENCE_INVALID")
        frame_index = _condition_frame_index(condition, frame_count)
        if frame_index in seen_frames:
            raise RuntimeError(f"AVANTIQO_VIDEO_LTX25_CONTROL_DUPLICATE_FRAME_INDEX:{frame_index}")
        seen_frames.add(frame_index)
        strength = max(0.0, min(1.0, float(_finite(condition.get("strength"), 1.0))))
        crf = max(0, min(63, int(round(float(_finite(condition.get("crf"), 0))))))
        normalized.append({
            "reference_relative": relative,
            "path": path,
            "frame_index": frame_index,
            "strength": strength,
            "crf": crf,
            "role": _text(condition.get("role")) or "REFERENCE_KEYFRAME",
        })
    normalized.sort(key=lambda item: item["frame_index"])
    if normalized[0]["frame_index"] != 0:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_CONTROL_OPENING_FRAME_REQUIRED")
    return normalized


@app.function(
    image=ltx_worker_image,
    gpu=LTX_GPU,
    volumes={"/models": model_volume},
    timeout=LTX_HARD_TIMEOUT_SECONDS,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=5,
    retries=0,
)
def generate_native_controlled_master(
    reference_conditions: list[dict[str, Any]],
    output_relative: str,
    instruction: str,
    duration_seconds: int = 5,
    seed: int = 4747,
) -> dict[str, Any]:
    function_started = time.perf_counter()
    model_volume.reload()
    root = _ltx_snapshot()
    output = Path("/models") / output_relative.lstrip("/")
    if int(duration_seconds) <= 0 or int(duration_seconds) > 20:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_DURATION_INVALID")
    output.parent.mkdir(parents=True, exist_ok=True)

    transformer = root / LTX_REQUIRED[0]
    text_encoder = root / LTX_REQUIRED[1]
    video_vae = root / LTX_REQUIRED[2]
    audio_vae = root / LTX_REQUIRED[3]
    text_encoder_real = text_encoder.resolve(strict=True)
    if not text_encoder_real.is_file() or text_encoder_real.stat().st_size <= 0:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_GEMMA_REALPATH_INVALID")

    frames = _ltx_frame_count(int(duration_seconds))
    conditions = _validated_conditions(reference_conditions, frames)
    command = [
        "python", "-c", LTX_GEMMA_SUFFIX_COMPAT_ENTRYPOINT,
        "--transformer-path", str(transformer),
        "--text-encoder-path", str(text_encoder),
        "--video-vae-path", str(video_vae),
        "--audio-vae-path", str(audio_vae),
        "--num-frames", str(frames),
        "--width", str(LTX_MASTER_WIDTH),
        "--height", str(LTX_MASTER_HEIGHT),
        "--frame-rate", str(LTX_FPS),
        "--num-inference-steps", str(LTX_NUM_INFERENCE_STEPS),
        "--seed", str(int(seed)),
        "--max-batch-size", "1",
        "--output-path", str(output),
        "--prompt", _ltx_prompt(instruction),
        "--negative-prompt", _ltx_negative_prompt(),
    ]
    for condition in conditions:
        command.extend([
            "--image",
            str(condition["path"]),
            str(condition["frame_index"]),
            str(condition["strength"]),
            str(condition["crf"]),
        ])

    env = os.environ.copy()
    env[LTX_GEMMA_REALPATH_ENV] = str(text_encoder_real)
    env["PYTHONPATH"] = ":".join([
        str(LTX_PIPELINE_ROOT / "packages/ltx-core/src"),
        str(LTX_PIPELINE_ROOT / "packages/ltx-pipelines/src"),
        env.get("PYTHONPATH", ""),
    ])
    generation_started = time.perf_counter()
    try:
        completed = subprocess.run(
            command,
            cwd=str(LTX_PIPELINE_ROOT),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=LTX_SUBPROCESS_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        detail = _sanitize(getattr(exc, "stdout", "") or getattr(exc, "output", ""), 1200)
        raise RuntimeError(
            f"AVANTIQO_VIDEO_LTX25_MODAL_HARD_TIMEOUT:{LTX_SUBPROCESS_TIMEOUT_SECONDS}:{detail}"
        ) from exc
    generation_seconds = round(time.perf_counter() - generation_started, 3)
    if completed.returncode != 0:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_LTX25_MODAL_COMMAND_FAILED:{completed.returncode}:"
            f"{_sanitize(completed.stdout)}"
        )
    if not output.is_file() or output.stat().st_size <= 1_000_000:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_OUTPUT_INVALID")
    model_volume.commit()
    function_seconds = round(time.perf_counter() - function_started, 3)
    return {
        "success": True,
        "status": "completed",
        "contract": LTX_RUNTIME_CONTRACT,
        "control_contract": CONTROL_CONTRACT,
        "quality_contract": LTX_QUALITY_CONTRACT,
        "engine_contract": NATIVE_ENGINE_CONTRACT,
        "provider": "avantiqo-video",
        "model": "avantiqo-ltx-2.5",
        "foundation_model": LTX_SOURCE_REPO,
        "foundation_revision": root.name,
        "pipeline": "TI2VID_ONE_STAGE_FULL_DEV_BF16_MULTI_CONDITION",
        "precision": "BF16",
        "quantization": "NONE",
        "modal_gpu": LTX_GPU,
        "width": LTX_MASTER_WIDTH,
        "height": LTX_MASTER_HEIGHT,
        "fps": LTX_FPS,
        "num_inference_steps": LTX_NUM_INFERENCE_STEPS,
        "frame_count": frames,
        "duration_seconds_requested": int(duration_seconds),
        "seed": int(seed),
        "reference_condition_count": len(conditions),
        "reference_condition_frames": [item["frame_index"] for item in conditions],
        "reference_condition_roles": [item["role"] for item in conditions],
        "output_relative": output_relative,
        "output_size_bytes": output.stat().st_size,
        "generation_seconds": generation_seconds,
        "modal_function_seconds": function_seconds,
        "supplier_gpu_rate_usd_per_second": LTX_GPU_USD_PER_SECOND,
        "estimated_supplier_gpu_cost_usd": round(function_seconds * LTX_GPU_USD_PER_SECOND, 8),
        "hard_timeout_seconds": LTX_HARD_TIMEOUT_SECONDS,
        "native_master_generated": True,
        "master_is_exact_model_output": True,
        "multi_keyframe_conditioning_used": len(conditions) > 1,
        "first_frame_conditioning_used": any(item["frame_index"] == 0 for item in conditions),
        "last_frame_conditioning_used": any(item["frame_index"] == frames - 1 for item in conditions),
        "model_cpu_offload_used": False,
        "pixel_upscale_used": False,
        "learned_latent_upsampler_used": False,
        "learned_spatial_upscaler_used": False,
        "temporal_interpolation_used": False,
        "distilled_transformer_used": False,
        "distilled_lora_used": False,
        "resize_used": False,
        "crop_used": False,
        "grading_used": False,
        "assembly_used": False,
        "delivery_transform_used": False,
        "reference_preprocessing_inside_paid_worker": False,
        "ffprobe_inside_paid_worker": False,
        "runpod_inference_performed": False,
        "external_provider_contacted": False,
        "automatic_paid_retry": False,
        "raw_reasoning_persisted": False,
        "pipeline_stdout_tail": _sanitize(completed.stdout, 1200),
    }
