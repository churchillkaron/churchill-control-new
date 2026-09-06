"""Governed generated-human wrapper over Avantiqo's proven fast LTX-2.5 engine.

Human shots use the same distilled two-stage worker, cache, resolution, cadence and
inference budget as the working investor T2V lane. The only difference is 3-8
approved same-identity keyframe conditions plus stricter human realism prompts.
Generation cannot authorize release; byte-bound QC and exact-master visual review
remain mandatory.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import time
import uuid
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
    seed_investor_t2v_cache,
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


def _validate_keyframes(raw: Any, total_frames: int) -> list[dict[str, Any]]:
    if not isinstance(raw, list) or not MIN_KEYFRAMES <= len(raw) <= MAX_KEYFRAMES:
        raise RuntimeError(f"{CONTRACT}_KEYFRAME_COUNT_INVALID")
    normalized: list[dict[str, Any]] = []
    character_ids: set[str] = set()
    frames: list[int] = []
    for index, value in enumerate(raw):
        if not isinstance(value, dict):
            raise RuntimeError(f"{CONTRACT}_KEYFRAME_OBJECT_REQUIRED:{index}")
        relative = _text(value.get("relative_path"))
        approval_id = _text(value.get("approval_id"))
        character_id = _text(value.get("character_id"))
        sha256 = _text(value.get("sha256")).lower()
        status = _text(value.get("status")).upper()
        frame = int(value.get("frame") if value.get("frame") is not None else -1)
        strength = float(value.get("strength") if value.get("strength") is not None else 1.0)
        crf = int(value.get("crf") if value.get("crf") is not None else 0)
        if not relative or relative.startswith("/") or ".." in Path(relative).parts:
            raise RuntimeError(f"{CONTRACT}_KEYFRAME_PATH_INVALID:{index}")
        if not approval_id or not character_id or status != "APPROVED":
            raise RuntimeError(f"{CONTRACT}_KEYFRAME_APPROVAL_INVALID:{index}")
        if len(sha256) != 64 or any(char not in "0123456789abcdef" for char in sha256):
            raise RuntimeError(f"{CONTRACT}_KEYFRAME_SHA256_INVALID:{index}")
        if frame < 0 or frame >= total_frames:
            raise RuntimeError(f"{CONTRACT}_KEYFRAME_FRAME_INVALID:{index}:{frame}")
        if not 0.05 <= strength <= 1.0:
            raise RuntimeError(f"{CONTRACT}_KEYFRAME_STRENGTH_INVALID:{index}")
        if crf < 0 or crf > 63:
            raise RuntimeError(f"{CONTRACT}_KEYFRAME_CRF_INVALID:{index}")
        character_ids.add(character_id)
        frames.append(frame)
        normalized.append({
            "relative_path": relative,
            "approval_id": approval_id,
            "character_id": character_id,
            "sha256": sha256,
            "frame": frame,
            "strength": strength,
            "crf": crf,
        })
    if len(character_ids) != 1:
        raise RuntimeError(f"{CONTRACT}_SAME_IDENTITY_REQUIRED")
    if frames != sorted(set(frames)) or frames[0] != 0:
        raise RuntimeError(f"{CONTRACT}_KEYFRAME_ORDER_INVALID")
    if frames[-1] < int((total_frames - 1) * 0.65):
        raise RuntimeError(f"{CONTRACT}_LATE_IDENTITY_ANCHOR_REQUIRED")
    if not any(frame >= int((total_frames - 1) * 0.25) for frame in frames[1:-1]):
        raise RuntimeError(f"{CONTRACT}_MID_IDENTITY_ANCHOR_REQUIRED")
    return normalized


def _human_prompt(instruction: str) -> str:
    if not _text(instruction):
        raise RuntimeError(f"{CONTRACT}_INSTRUCTION_REQUIRED")
    return _prompt(
        _text(instruction)
        + (
            " Preserve the exact approved person across every frame: same facial identity, age, face geometry, skin tone, "
            "hairline, body proportions and distinguishing features. Natural pores and subtle skin asymmetry; stable eyes with "
            "physically plausible gaze, catchlights and blinks; realistic facial-muscle motion and micro-expression; anatomically "
            "correct hands, fingers, wrists, limbs and joints; grounded weight transfer, breathing, cloth-body interaction and hair "
            "motion. The person must read as live-action cinema, not an AI model or beauty-filter render. Avoid identity drift, face "
            "morphing, wax/plastic skin, doll face, eye divergence, fused/duplicate/missing fingers, extra digits or limbs, broken "
            "wrists, rubber motion, floating feet, frozen expression, duplicated people and temporal anatomy changes."
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
    keyframes: list[dict[str, Any]],
    output_relative: str,
    instruction: str,
    duration_seconds: int = 4,
    seed: int = 91827,
) -> dict[str, Any]:
    """Compatibility name; implementation is the proven fast distilled lane."""
    function_started = time.perf_counter()
    duration = int(duration_seconds)
    if duration <= 0 or duration > 12:
        raise RuntimeError(f"{CONTRACT}_DURATION_INVALID")
    total_frames = _frames(duration)
    approved = _validate_keyframes(keyframes, total_frames)
    model_volume.reload()
    root = _snapshot()
    output = Path("/models") / output_relative.lstrip("/")
    output.parent.mkdir(parents=True, exist_ok=True)

    resolved_references: list[tuple[Path, dict[str, Any]]] = []
    for index, item in enumerate(approved):
        path = Path("/models") / item["relative_path"]
        if not path.is_file() or path.stat().st_size < MIN_REFERENCE_BYTES:
            raise RuntimeError(f"{CONTRACT}_REFERENCE_INVALID:{index}")
        actual_sha256 = _sha256(path)
        if actual_sha256 != item["sha256"]:
            raise RuntimeError(f"{CONTRACT}_REFERENCE_DIGEST_MISMATCH:{index}")
        resolved_references.append((path, item))

    text_encoder = root / LTX_REQUIRED[1]
    text_encoder_real = text_encoder.resolve(strict=True)
    if not text_encoder_real.is_file() or text_encoder_real.stat().st_size <= 0:
        raise RuntimeError(f"{CONTRACT}_GEMMA_REALPATH_INVALID")

    command = [
        "python", "-c", DISTILLED_GEMMA_SUFFIX_COMPAT_ENTRYPOINT,
        "--transformer-path", str(root / DISTILLED_TRANSFORMER),
        "--text-encoder-path", str(text_encoder),
        "--video-vae-path", str(root / LTX_REQUIRED[2]),
        "--audio-vae-path", str(root / LTX_REQUIRED[3]),
        "--spatial-upsampler-path", str(root / DISTILLED_UPSAMPLER),
        "--num-frames", str(total_frames),
        "--width", str(WIDTH),
        "--height", str(HEIGHT),
        "--frame-rate", str(FPS),
        "--seed", str(int(seed)),
        "--output-path", str(output),
        "--prompt", _human_prompt(instruction),
    ]
    for path, item in resolved_references:
        command.extend(["--image", str(path), str(item["frame"]), str(item["strength"]), str(item["crf"])])

    env = os.environ.copy()
    env[LTX_GEMMA_REALPATH_ENV] = str(text_encoder_real)
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
            timeout=SUBPROCESS_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        detail = _sanitize(getattr(exc, "stdout", "") or getattr(exc, "output", ""))
        raise RuntimeError(f"{CONTRACT}_TIMEOUT:{detail}") from exc

    generation_seconds = round(time.perf_counter() - generation_started, 3)
    if completed.returncode != 0:
        raise RuntimeError(f"{CONTRACT}_COMMAND_FAILED:{completed.returncode}:{_sanitize(completed.stdout)}")
    if not output.is_file() or output.stat().st_size <= 500_000:
        raise RuntimeError(f"{CONTRACT}_OUTPUT_INVALID")
    output_sha256 = _sha256(output)
    model_volume.commit()
    function_seconds = round(time.perf_counter() - function_started, 3)
    return {
        "success": True,
        "status": "completed_qc_pending",
        "contract": CONTRACT,
        "source_repository": SOURCE_REPOSITORY,
        "fast_engine_contract": FAST_ENGINE_CONTRACT,
        "engine_contract": NATIVE_ENGINE_CONTRACT,
        "quality_contract": FAST_QUALITY_CONTRACT,
        "provider": "avantiqo-video",
        "model": "avantiqo-ltx-2.5",
        "foundation_model": LTX_SOURCE_REPO,
        "foundation_revision": root.name,
        "pipeline": "DISTILLED_TWO_STAGE_I2V_MULTI_KEYFRAME_BF16",
        "runtime_image": LTX_RUNTIME_IMAGE,
        "modal_gpu": LTX_GPU,
        "human_mode": True,
        "conditioning_mode": "approved_same_identity_multi_keyframe",
        "character_id": approved[0]["character_id"],
        "condition_count": len(approved),
        "condition_frames": [item["frame"] for item in approved],
        "condition_approvals": [
            {"approval_id": item["approval_id"], "sha256": item["sha256"]}
            for item in approved
        ],
        "identity_keyframes_byte_verified": True,
        "width": WIDTH,
        "height": HEIGHT,
        "stage_1_width": STAGE1_WIDTH,
        "stage_1_height": STAGE1_HEIGHT,
        "fps": FPS,
        "stage_1_steps": STAGE1_STEPS,
        "stage_2_steps": STAGE2_STEPS,
        "frame_count": total_frames,
        "duration_seconds_requested": duration,
        "seed": int(seed),
        "output_relative": output_relative,
        "output_size_bytes": output.stat().st_size,
        "output_sha256": output_sha256,
        "generation_seconds": generation_seconds,
        "modal_function_seconds": function_seconds,
        "estimated_supplier_gpu_cost_usd": round(function_seconds * LTX_GPU_USD_PER_SECOND, 8),
        "fast_engine_runtime_reused": True,
        "general_t2v_engine_modified": False,
        "master_is_exact_model_output": True,
        "automatic_paid_retry": False,
        "external_provider_contacted": False,
        "raw_reasoning_persisted": False,
        "post_generation_human_qc_required": True,
        "final_visual_review_required": True,
        "release_authorized": False,
        "pipeline_stdout_tail": _sanitize(completed.stdout, 1200),
    }


def _load_manifest(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise RuntimeError(f"{CONTRACT}_MANIFEST_OBJECT_REQUIRED")
    return data


def _stage_keyframes(manifest: dict[str, Any], run_id: str) -> tuple[list[dict[str, Any]], list[str]]:
    raw = manifest.get("keyframes")
    if not isinstance(raw, list):
        raise RuntimeError(f"{CONTRACT}_MANIFEST_KEYFRAMES_REQUIRED")
    staged: list[dict[str, Any]] = []
    remote_paths: list[str] = []
    for index, value in enumerate(raw):
        if not isinstance(value, dict):
            raise RuntimeError(f"{CONTRACT}_MANIFEST_KEYFRAME_OBJECT_REQUIRED:{index}")
        source = Path(_text(value.get("source_path"))).expanduser().resolve()
        if not source.is_file() or source.stat().st_size < MIN_REFERENCE_BYTES:
            raise RuntimeError(f"{CONTRACT}_SOURCE_INVALID:{index}")
        digest = _sha256(source)
        if digest != _text(value.get("sha256")).lower():
            raise RuntimeError(f"{CONTRACT}_SOURCE_DIGEST_MISMATCH:{index}")
        remote = f"human-multikey/{run_id}/reference-{index:02d}{source.suffix.lower() or '.png'}"
        with model_volume.batch_upload(force=True) as upload:
            upload.put_file(str(source), remote)
        remote_paths.append(remote)
        staged.append({
            "relative_path": remote,
            "approval_id": value.get("approval_id"),
            "character_id": value.get("character_id"),
            "sha256": digest,
            "status": value.get("status"),
            "frame": value.get("frame"),
            "strength": value.get("strength", 1.0),
            "crf": value.get("crf", 0),
        })
    return staged, remote_paths


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--duration-seconds", type=int, default=4)
    parser.add_argument("--seed", type=int, default=91827)
    args = parser.parse_args()

    manifest_path = Path(args.manifest).expanduser().resolve()
    output = Path(args.output).expanduser().resolve()
    manifest = _load_manifest(manifest_path)
    instruction = _text(manifest.get("instruction"))
    run_id = uuid.uuid4().hex[:16]
    output_remote = f"human-multikey/{run_id}/fast-master-1920x1088.mp4"
    transient: list[str] = []
    try:
        cache = seed_investor_t2v_cache.remote()
        if not isinstance(cache, dict) or cache.get("success") is not True:
            raise RuntimeError(f"{CONTRACT}_CACHE_NOT_READY")
        staged, transient = _stage_keyframes(manifest, run_id)
        result = generate_human_native_master.remote(
            staged,
            output_remote,
            instruction,
            int(args.duration_seconds),
            int(args.seed),
        )
        if not isinstance(result, dict) or result.get("success") is not True:
            raise RuntimeError(f"{CONTRACT}_GENERATION_FAILED")
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open("wb") as handle:
            for chunk in model_volume.read_file(output_remote):
                handle.write(chunk)
        if _sha256(output) != result.get("output_sha256"):
            raise RuntimeError(f"{CONTRACT}_DOWNLOADED_MASTER_DIGEST_MISMATCH")
        report = {
            "success": True,
            "status": "QC_PENDING",
            "contract": CONTRACT,
            "source_repository": SOURCE_REPOSITORY,
            "generation": result,
            "release_authorized": False,
        }
        output.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"{CONTRACT}=PASS_QC_PENDING", flush=True)
    finally:
        for path in [*transient, output_remote]:
            try:
                model_volume.remove_file(path)
            except Exception:
                pass


if __name__ == "__main__":
    main()
