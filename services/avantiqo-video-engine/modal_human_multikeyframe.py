"""Governed multi-keyframe LTX-2.5 runtime for generated humans.

This is intentionally separate from the generic single-reference renderer. Human
footage requires 3-8 byte-verified, explicitly approved keyframes for one
character identity. Generation can never authorize investor release; downstream
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
    LTX_FPS,
    LTX_GEMMA_REALPATH_ENV,
    LTX_GEMMA_SUFFIX_COMPAT_ENTRYPOINT,
    LTX_GPU,
    LTX_HARD_TIMEOUT_SECONDS,
    LTX_MASTER_HEIGHT,
    LTX_MASTER_WIDTH,
    LTX_MAX_BATCH_SIZE,
    LTX_NUM_INFERENCE_STEPS,
    LTX_PIPELINE_ROOT,
    LTX_REQUIRED,
    LTX_SOURCE_REPO,
    LTX_SUBPROCESS_TIMEOUT_SECONDS,
    _ltx_frame_count,
    _ltx_negative_prompt,
    _ltx_prompt,
    _ltx_snapshot,
    _sanitize,
    app,
    ltx_worker_image,
    model_volume,
)

CONTRACT = "AVANTIQO_VIDEO_HUMAN_MULTI_KEYFRAME_NATIVE_MASTER_V1"
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
        normalized.append({
            "reference_relative": relative,
            "approval_id": approval_id,
            "character_id": character_id,
            "sha256": expected_sha256,
            "frame": frame,
            "strength": strength,
            "crf": crf,
        })

    if len(character_ids) != 1:
        raise RuntimeError("AVANTIQO_VIDEO_HUMAN_CHARACTER_IDENTITY_MISMATCH")
    normalized.sort(key=lambda item: item["frame"])
    if normalized[0]["frame"] != 0:
        raise RuntimeError("AVANTIQO_VIDEO_HUMAN_OPENING_KEYFRAME_REQUIRED")
    if normalized[-1]["frame"] < int(frame_count * 0.66):
        raise RuntimeError("AVANTIQO_VIDEO_HUMAN_LATE_KEYFRAME_REQUIRED")
    if not any(int(frame_count * 0.25) <= item["frame"] <= int(frame_count * 0.75) for item in normalized[1:-1]):
        raise RuntimeError("AVANTIQO_VIDEO_HUMAN_MIDDLE_KEYFRAME_REQUIRED")
    return next(iter(character_ids)), normalized


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
def generate_human_native_master(
    conditions: list[dict[str, Any]],
    output_relative: str,
    instruction: str,
    duration_seconds: int = 5,
    seed: int = 4747,
) -> dict[str, Any]:
    function_started = time.perf_counter()
    if int(duration_seconds) <= 0 or int(duration_seconds) > 20:
        raise RuntimeError("AVANTIQO_VIDEO_HUMAN_DURATION_INVALID")
    if not _text(instruction):
        raise RuntimeError("AVANTIQO_VIDEO_HUMAN_INSTRUCTION_REQUIRED")
    if not _text(output_relative) or output_relative.startswith("/") or ".." in Path(output_relative).parts:
        raise RuntimeError("AVANTIQO_VIDEO_HUMAN_OUTPUT_PATH_INVALID")

    model_volume.reload()
    root = _ltx_snapshot()
    frame_count = _ltx_frame_count(int(duration_seconds))
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

    output = Path("/models") / output_relative
    output.parent.mkdir(parents=True, exist_ok=True)
    transformer = root / LTX_REQUIRED[0]
    text_encoder = root / LTX_REQUIRED[1]
    video_vae = root / LTX_REQUIRED[2]
    audio_vae = root / LTX_REQUIRED[3]
    text_encoder_real = text_encoder.resolve(strict=True)

    human_instruction = _text(instruction) + (
        " Preserve the exact approved person identity across every frame. Natural human skin with pores and subtle asymmetry; "
        "stable eyes and facial geometry; anatomically correct hands, fingers, limbs and joints; realistic cloth-body interaction; "
        "physically plausible body motion and micro-expressions. No face morphing, waxy skin, duplicated anatomy, fused fingers, "
        "extra digits, broken wrists, rubber limbs, identity drift, temporal face changes or beauty-filter appearance."
    )
    negative = _ltx_negative_prompt() + (
        ", identity drift, face morphing, plastic skin, waxy skin, doll face, malformed hands, extra fingers, missing fingers, "
        "fused fingers, broken wrists, duplicate limbs, extra limbs, warped anatomy, rubber limbs, unnatural gait, frozen expression"
    )
    command = [
        "python", "-c", LTX_GEMMA_SUFFIX_COMPAT_ENTRYPOINT,
        "--transformer-path", str(transformer),
        "--text-encoder-path", str(text_encoder),
        "--video-vae-path", str(video_vae),
        "--audio-vae-path", str(audio_vae),
        "--num-frames", str(frame_count),
        "--width", str(LTX_MASTER_WIDTH),
        "--height", str(LTX_MASTER_HEIGHT),
        "--frame-rate", str(LTX_FPS),
        "--num-inference-steps", str(LTX_NUM_INFERENCE_STEPS),
        "--seed", str(int(seed)),
        "--max-batch-size", str(LTX_MAX_BATCH_SIZE),
        "--output-path", str(output),
        "--prompt", _ltx_prompt(human_instruction),
        "--negative-prompt", negative,
    ]
    for item in resolved_conditions:
        command.extend([
            "--image", str(item["path"]), str(item["frame"]), str(item["strength"]), str(item["crf"])
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
        raise RuntimeError(f"AVANTIQO_VIDEO_HUMAN_HARD_TIMEOUT:{detail}") from exc

    generation_seconds = round(time.perf_counter() - generation_started, 3)
    if completed.returncode != 0:
        raise RuntimeError(f"AVANTIQO_VIDEO_HUMAN_COMMAND_FAILED:{completed.returncode}:{_sanitize(completed.stdout)}")
    if not output.is_file() or output.stat().st_size <= 1_000_000:
        raise RuntimeError("AVANTIQO_VIDEO_HUMAN_OUTPUT_INVALID")
    output_sha256 = _sha256(output)
    model_volume.commit()

    return {
        "success": True,
        "status": "completed_qc_pending",
        "contract": CONTRACT,
        "source_repository": SOURCE_REPOSITORY,
        "provider": "avantiqo-video",
        "model": "avantiqo-ltx-2.5",
        "foundation_model": LTX_SOURCE_REPO,
        "foundation_revision": root.name,
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
        "width": LTX_MASTER_WIDTH,
        "height": LTX_MASTER_HEIGHT,
        "fps": LTX_FPS,
        "frame_count": frame_count,
        "duration_seconds_requested": int(duration_seconds),
        "seed": int(seed),
        "output_relative": output_relative,
        "output_size_bytes": output.stat().st_size,
        "output_sha256": output_sha256,
        "generation_seconds": generation_seconds,
        "modal_function_seconds": round(time.perf_counter() - function_started, 3),
        "native_master_generated": True,
        "master_is_exact_model_output": True,
        "external_provider_contacted": False,
        "automatic_paid_retry": False,
        "automated_qc_required": True,
        "exact_master_visual_review_required": True,
        "release_authorized": False,
        "pipeline_stdout_tail": _sanitize(completed.stdout, 1200),
    }
