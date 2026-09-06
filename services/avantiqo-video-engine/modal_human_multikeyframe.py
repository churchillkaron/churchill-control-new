"""Governed multi-keyframe human conditioning on Avantiqo's proven fast LTX-2.5 lane.

This module does not replace or modify the investor T2V engine. It reuses the exact
DISTILLED_TWO_STAGE worker image, model cache, dimensions, frame cadence and
inference path, then adds approved same-identity image conditions only for shots
that contain a hero human. Generation never authorizes release; downstream human
QC and exact-master visual review remain mandatory.
"""
from __future__ import annotations

import hashlib
import os
import subprocess
import time
from pathlib import Path
from typing import Any

from modal_app import (
    LTX_GEMMA_REALPATH_ENV,
    LTX_GPU,
    LTX_GPU_USD_PER_SECOND,
    LTX_PIPELINE_ROOT,
    LTX_REQUIRED,
    LTX_RUNTIME_IMAGE,
    LTX_SOURCE_REPO,
    NATIVE_ENGINE_CONTRACT,
    app,
    model_volume,
)
from modal_investor_t2v import (
    CONTRACT as FAST_ENGINE_CONTRACT,
    DISTILLED_GEMMA_SUFFIX_COMPAT_ENTRYPOINT,
    DISTILLED_TRANSFORMER,
    DISTILLED_UPSAMPLER,
    FPS,
    HARD_TIMEOUT_SECONDS,
    HEIGHT,
    QUALITY_CONTRACT as FAST_QUALITY_CONTRACT,
    REQUIRED,
    STAGE1_HEIGHT,
    STAGE1_STEPS,
    STAGE1_WIDTH,
    STAGE2_STEPS,
    SUBPROCESS_TIMEOUT_SECONDS,
    WIDTH,
    _frames,
    _prompt,
    _sanitize,
    _snapshot,
    investor_ltx_worker_image,
)

CONTRACT = "AVANTIQO_VIDEO_HUMAN_FAST_DISTILLED_MULTI_KEYFRAME_V1"
SOURCE_REPOSITORY = "churchillkaron/churchill-control-new"
MIN_KEYFRAMES = 3
MAX_KEYFRAMES = 8
MIN_REFERENCE_BYTES = 20_000


def _text(value: Any) -> str:
    return str(value or "").strip()


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _validate_conditions(raw: Any, frame_count: int) -> tuple[str, list[dict[str, Any]]]:
    if not isinstance(raw, list) or not MIN_KEYFRAMES <= len(raw) <= MAX_KEYFRAMES:
        raise RuntimeError("AVANTIQO_VIDEO_HUMAN_KEYFRAME_COUNT_INVALID")

    normalized: list[dict[str, Any]] = []
    character_ids: set[str] = set()
    seen_frames: set[int] = set()
    for index, value in enumerate(raw):
        if not isinstance(value, dict):
            raise RuntimeError(f"AVANTIQO_VIDEO_HUMAN_KEYFRAME_INVALID:{index}")
        relative = _text(value.get("reference_relative"))
        approval_id = _text(value.get("approval_id"))
        character_id = _text(value.get("character_id"))
        expected_sha256 = _text(value.get("sha256")).lower()
        frame = int(value.get("frame") if value.get("frame") is not None else -1)
        strength = float(value.get("strength") if value.get("strength") is not None else 1.0)
        crf = int(value.get("crf") if value.get("crf") is not None else 0)

        if not relative or relative.startswith("/") or ".." in Path(relative).parts:
            raise RuntimeError(f"AVANTIQO_VIDEO_HUMAN_REFERENCE_PATH_INVALID:{index}")
        if not approval_id or not character_id:
            raise RuntimeError(f"AVANTIQO_VIDEO_HUMAN_APPROVAL_IDENTITY_REQUIRED:{index}")
        if len(expected_sha256) != 64 or any(char not in "0123456789abcdef" for char in expected_sha256):
            raise RuntimeError(f"AVANTIQO_VIDEO_HUMAN_REFERENCE_SHA256_INVALID:{index}")
        if frame < 0 or frame >= frame_count or frame in seen_frames:
            raise RuntimeError(f"AVANTIQO_VIDEO_HUMAN_KEYFRAME_POSITION_INVALID:{index}:{frame}")
        if not 0.05 <= strength <= 1.0:
            raise RuntimeError(f"AVANTIQO_VIDEO_HUMAN_KEYFRAME_STRENGTH_INVALID:{index}")
        if crf < 0 or crf > 63:
            raise RuntimeError(f"AVANTIQO_VIDEO_HUMAN_KEYFRAME_CRF_INVALID:{index}")
        if value.get("approved") is not True:
            raise RuntimeError(f"AVANTIQO_VIDEO_HUMAN_KEYFRAME_NOT_APPROVED:{index}")

        seen_frames.add(frame)
        character_ids.add(character_id)
        normalized.append(
            {
                "reference_relative": relative,
                "approval_id": approval_id,
                "character_id": character_id,
                "sha256": expected_sha256,
                "frame": frame,
                "strength": strength,
                "crf": crf,
            }
        )

    if len(character_ids) != 1:
        raise RuntimeError("AVANTIQO_VIDEO_HUMAN_CHARACTER_IDENTITY_MISMATCH")
    normalized.sort(key=lambda item: item["frame"])
    if normalized[0]["frame"] != 0:
        raise RuntimeError("AVANTIQO_VIDEO_HUMAN_OPENING_KEYFRAME_REQUIRED")
    if normalized[-1]["frame"] < int(frame_count * 0.66):
        raise RuntimeError("AVANTIQO_VIDEO_HUMAN_LATE_KEYFRAME_REQUIRED")
    middle = normalized[1:-1]
    if not any(int(frame_count * 0.25) <= item["frame"] <= int(frame_count * 0.75) for item in middle):
        raise RuntimeError("AVANTIQO_VIDEO_HUMAN_MIDDLE_KEYFRAME_REQUIRED")
    return next(iter(character_ids)), normalized


def _human_prompt(instruction: str) -> str:
    value = _text(instruction)
    if not value:
        raise RuntimeError("AVANTIQO_VIDEO_HUMAN_INSTRUCTION_REQUIRED")
    return _prompt(
        value
        + (
            " The approved reference images show one exact person; preserve that same identity, age, face geometry, "
            "skin tone, hairline and body proportions throughout the shot. Render natural skin texture with pores and "
            "subtle asymmetry, stable eyes with natural catchlights and blinks, physically plausible facial muscles and "
            "micro-expressions, anatomically correct hands, fingers, wrists, limbs and joints, realistic cloth-body "
            "interaction and grounded weight transfer. Avoid beauty-filter skin, doll-like faces, face morphing, identity "
            "drift, eye divergence, fused or duplicated fingers, extra digits, broken wrists, duplicate limbs, rubber "
            "motion, floating feet, frozen expressions and temporal anatomy changes."
        )
    )


@app.function(
    image=investor_ltx_worker_image,
    gpu=LTX_GPU,
    volumes={"/models": model_volume},
    timeout=HARD_TIMEOUT_SECONDS,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=5,
    retries=0,
)
def generate_human_native_master(
    conditions: list[dict[str, Any]],
    output_relative: str,
    instruction: str,
    duration_seconds: int = 6,
    seed: int = 260905,
) -> dict[str, Any]:
    """Render a human shot on the same fast distilled lane used by investor T2V."""
    started = time.perf_counter()
    duration = int(duration_seconds)
    if duration <= 0 or duration > 12:
        raise RuntimeError("AVANTIQO_VIDEO_HUMAN_DURATION_INVALID")
    relative_output = _text(output_relative)
    if not relative_output or relative_output.startswith("/") or ".." in Path(relative_output).parts:
        raise RuntimeError("AVANTIQO_VIDEO_HUMAN_OUTPUT_PATH_INVALID")

    model_volume.reload()
    root = _snapshot()
    frame_count = _frames(duration)
    character_id, approved = _validate_conditions(conditions, frame_count)

    resolved_conditions: list[dict[str, Any]] = []
    for index, item in enumerate(approved):
        path = Path("/models") / item["reference_relative"]
        if not path.is_file() or path.stat().st_size < MIN_REFERENCE_BYTES:
            raise RuntimeError(f"AVANTIQO_VIDEO_HUMAN_REFERENCE_FILE_INVALID:{index}")
        digest = _sha256(path)
        if digest != item["sha256"]:
            raise RuntimeError(f"AVANTIQO_VIDEO_HUMAN_REFERENCE_DIGEST_MISMATCH:{index}")
        resolved_conditions.append({**item, "path": path, "bytes": path.stat().st_size})

    output = Path("/models") / relative_output
    output.parent.mkdir(parents=True, exist_ok=True)
    text_encoder = root / LTX_REQUIRED[1]
    text_encoder_real = text_encoder.resolve(strict=True)
    if not text_encoder_real.is_file() or text_encoder_real.stat().st_size <= 0:
        raise RuntimeError("AVANTIQO_VIDEO_HUMAN_GEMMA_REALPATH_INVALID")

    command = [
        "python",
        "-c",
        DISTILLED_GEMMA_SUFFIX_COMPAT_ENTRYPOINT,
        "--transformer-path",
        str(root / DISTILLED_TRANSFORMER),
        "--text-encoder-path",
        str(text_encoder),
        "--video-vae-path",
        str(root / LTX_REQUIRED[2]),
        "--audio-vae-path",
        str(root / LTX_REQUIRED[3]),
        "--spatial-upsampler-path",
        str(root / DISTILLED_UPSAMPLER),
        "--num-frames",
        str(frame_count),
        "--width",
        str(WIDTH),
        "--height",
        str(HEIGHT),
        "--frame-rate",
        str(FPS),
        "--seed",
        str(int(seed)),
        "--output-path",
        str(output),
        "--prompt",
        _human_prompt(instruction),
    ]
    for item in resolved_conditions:
        command.extend(
            [
                "--image",
                str(item["path"]),
                str(item["frame"]),
                str(item["strength"]),
                str(item["crf"]),
            ]
        )

    env = os.environ.copy()
    env[LTX_GEMMA_REALPATH_ENV] = str(text_encoder_real)
    env["PYTHONPATH"] = ":".join(
        [
            str(LTX_PIPELINE_ROOT / "packages/ltx-core/src"),
            str(LTX_PIPELINE_ROOT / "packages/ltx-pipelines/src"),
            env.get("PYTHONPATH", ""),
        ]
    )
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
            timeout=SUBPROCESS_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        detail = _sanitize(getattr(exc, "stdout", "") or getattr(exc, "output", ""))
        raise RuntimeError(f"AVANTIQO_VIDEO_HUMAN_TIMEOUT:{detail}") from exc

    generation_seconds = round(time.perf_counter() - generation_started, 3)
    if completed.returncode != 0:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_HUMAN_COMMAND_FAILED:{completed.returncode}:{_sanitize(completed.stdout)}"
        )
    if not output.is_file() or output.stat().st_size <= 500_000:
        raise RuntimeError("AVANTIQO_VIDEO_HUMAN_OUTPUT_INVALID")

    output_sha256 = _sha256(output)
    model_volume.commit()
    elapsed = round(time.perf_counter() - started, 3)
    return {
        "success": True,
        "status": "completed_qc_pending",
        "contract": CONTRACT,
        "source_repository": SOURCE_REPOSITORY,
        "fast_engine_contract": FAST_ENGINE_CONTRACT,
        "quality_contract": FAST_QUALITY_CONTRACT,
        "engine_contract": NATIVE_ENGINE_CONTRACT,
        "provider": "avantiqo-video",
        "model": "avantiqo-ltx-2.5",
        "foundation_model": LTX_SOURCE_REPO,
        "foundation_revision": root.name,
        "pipeline": "DISTILLED_TWO_STAGE_I2V_MULTI_KEYFRAME_BF16",
        "runtime_image": LTX_RUNTIME_IMAGE,
        "modal_gpu": LTX_GPU,
        "human_mode": True,
        "character_id": character_id,
        "conditioning_mode": "approved_same_identity_multi_keyframe",
        "condition_count": len(resolved_conditions),
        "condition_frames": [item["frame"] for item in resolved_conditions],
        "condition_approvals": [
            {"approval_id": item["approval_id"], "sha256": item["sha256"]}
            for item in resolved_conditions
        ],
        "identity_keyframes_byte_verified": True,
        "width": WIDTH,
        "height": HEIGHT,
        "stage_1_width": STAGE1_WIDTH,
        "stage_1_height": STAGE1_HEIGHT,
        "fps": FPS,
        "stage_1_steps": STAGE1_STEPS,
        "stage_2_steps": STAGE2_STEPS,
        "frame_count": frame_count,
        "duration_seconds_requested": duration,
        "seed": int(seed),
        "output_relative": relative_output,
        "output_size_bytes": output.stat().st_size,
        "output_sha256": output_sha256,
        "generation_seconds": generation_seconds,
        "modal_function_seconds": elapsed,
        "estimated_supplier_gpu_cost_usd": round(elapsed * LTX_GPU_USD_PER_SECOND, 8),
        "fast_engine_runtime_reused": True,
        "general_t2v_engine_modified": False,
        "source_visual_asset_count": len(resolved_conditions),
        "source_image_used": True,
        "source_video_used": False,
        "screenshot_or_browser_capture_used": False,
        "pure_text_to_video": False,
        "newly_generated_asset": True,
        "external_provider_contacted": False,
        "automatic_paid_retry": False,
        "automated_qc_required": True,
        "exact_master_visual_review_required": True,
        "release_authorized": False,
        "pipeline_stdout_tail": _sanitize(completed.stdout),
    }
