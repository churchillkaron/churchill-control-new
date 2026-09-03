"""CPU-only governed job adapter for the native Avantiqo LTX-2.5 Video worker."""
from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Any

import modal

from modal_app import (
    LTX_GPU,
    LTX_HARD_TIMEOUT_SECONDS,
    LTX_MASTER_HEIGHT,
    LTX_MASTER_WIDTH,
    LTX_NUM_INFERENCE_STEPS,
    LTX_RUNTIME_CONTRACT,
    NATIVE_ENGINE_CONTRACT,
    app,
    generate_native_master,
    model_volume,
)
from modal_native_controlled_master import (
    CONTROL_CONTRACT,
    generate_native_controlled_master,
)

JOB_CONTRACT = "AVANTIQO_VIDEO_LTX25_MODAL_NATIVE_JOB_V2"
STUDIO_LINEAGE_CONTRACT = "AVANTIQO_VIDEO_STUDIO_LINEAGE_V1"
SHOT_BIBLE_CONTRACT = "CREATIVE_SHOT_BIBLE_V1"
NATIVE_CONTROL_CONTRACT = "CREATIVE_VIDEO_NATIVE_CONTROL_V1"
SUPPORTED_CAPABILITIES = {"ai.video.generate", "ai.video.image_to_video", "ai.video.first_last_frame_to_video"}
MAX_REFERENCE_BYTES = 100 * 1024 * 1024
MIN_REFERENCE_BYTES = 1024
MAX_REFERENCE_CONDITIONS = 8
CONTROLLED_FALSE_PROVENANCE_FLAGS = (
    "pixel_upscale_used",
    "learned_latent_upsampler_used",
    "learned_spatial_upscaler_used",
    "temporal_interpolation_used",
    "resize_used",
    "crop_used",
    "grading_used",
    "assembly_used",
    "delivery_transform_used",
    "automatic_paid_retry",
    "runpod_inference_performed",
    "external_provider_contacted",
)

# Modal serializes this module as the transport function's source. Its imports
# are sibling modules, so explicitly mount those sources into the transport
# image as well; otherwise a cold container can hydrate modal_native_job.py but
# fail before execution with ModuleNotFoundError("modal_app").
transport_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("requests==2.32.4")
    .add_local_python_source("modal_app")
    .add_local_python_source("modal_native_controlled_master")
)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _path_token(value: Any, fallback: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9_-]+", "-", _text(value)).strip("-")
    return (normalized or fallback)[:120]


def _generation_settings(data: dict[str, Any]) -> tuple[int, int]:
    specification = _object(data.get("structured_specification"))
    generation = _object(specification.get("generation"))
    provider_parameters = {**_object(generation.get("provider_parameters")), **_object(specification.get("provider_parameters"))}
    raw_duration = data.get("duration_seconds") or generation.get("duration_seconds") or generation.get("duration") or provider_parameters.get("duration_seconds") or 5
    duration = int(raw_duration)
    if duration <= 0 or duration > 20:
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_DURATION_INVALID")
    raw_seed = data.get("seed") if data.get("seed") is not None else generation.get("seed") if generation.get("seed") is not None else provider_parameters.get("seed")
    seed = 4747 if raw_seed in (None, "") else int(raw_seed)
    if seed < 0 or seed > 4294967295:
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_SEED_INVALID")
    return duration, seed


def _studio_lineage(data: dict[str, Any]) -> dict[str, Any] | None:
    specification = _object(data.get("structured_specification"))
    metadata = _object(specification.get("metadata"))
    lineage = _object(metadata.get("studio_lineage"))
    if not lineage:
        return None
    if _text(lineage.get("contract")) != STUDIO_LINEAGE_CONTRACT:
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_STUDIO_LINEAGE_CONTRACT_INVALID")
    shot_id = _text(lineage.get("shot_id"))
    shot_bible = _object(lineage.get("shot_bible"))
    if not shot_id:
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_SHOT_ID_REQUIRED")
    if _text(shot_bible.get("contract")) != SHOT_BIBLE_CONTRACT:
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_SHOT_BIBLE_INVALID")
    bible_shot_id = _text(shot_bible.get("shot_id"))
    if bible_shot_id and bible_shot_id != shot_id:
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_SHOT_ID_MISMATCH")
    organization_id = _text(data.get("organization_id"))
    bible_organization_id = _text(shot_bible.get("organization_id"))
    if bible_organization_id and bible_organization_id != organization_id:
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_ORGANIZATION_ID_MISMATCH")
    return lineage


def _native_control(data: dict[str, Any]) -> dict[str, Any] | None:
    specification = _object(data.get("structured_specification"))
    metadata = _object(specification.get("metadata"))
    control = _object(metadata.get("creative_video_native_control"))
    if not control:
        return None
    if _text(control.get("contract")) != NATIVE_CONTROL_CONTRACT:
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_NATIVE_CONTROL_CONTRACT_INVALID")
    raw_conditions = _list(control.get("reference_conditions"))
    if not raw_conditions or len(raw_conditions) > MAX_REFERENCE_CONDITIONS:
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_NATIVE_CONTROL_REFERENCE_COUNT_INVALID")
    conditions = []
    for index, raw in enumerate(raw_conditions):
        item = _object(raw)
        source_index = int(item.get("source_asset_index", index))
        if source_index < 0 or source_index >= MAX_REFERENCE_CONDITIONS:
            raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_CONTROL_SOURCE_INDEX_INVALID")
        frame_index = item.get("frame_index")
        frame_fraction = item.get("frame_fraction")
        if frame_index is None and frame_fraction is None:
            raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_CONTROL_FRAME_POSITION_REQUIRED")
        conditions.append({
            "source_asset_index": source_index,
            "frame_index": int(frame_index) if frame_index is not None else None,
            "frame_fraction": float(frame_fraction) if frame_fraction is not None else None,
            "strength": float(item.get("strength", 1)),
            "crf": int(item.get("crf", 0)),
            "role": _text(item.get("role")) or "REFERENCE_KEYFRAME",
        })
    return {**control, "reference_conditions": conditions}


def _source_urls(data: dict[str, Any]) -> list[str]:
    specification = _object(data.get("structured_specification"))
    generation = _object(specification.get("generation"))
    raw = data.get("source_urls") or generation.get("source_urls") or specification.get("source_urls") or []
    return [_text(value) for value in _list(raw) if _text(value)]


def _shot_bible_instruction(instruction: str, lineage: dict[str, Any] | None) -> str:
    if not lineage:
        return instruction
    shot_bible = _object(lineage.get("shot_bible"))
    compact = _text(shot_bible.get("generation_instruction"))
    if compact:
        return compact
    return instruction


def _validate_job(data: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_JOB_OBJECT_REQUIRED")
    capability = _text(data.get("capability"))
    if capability not in SUPPORTED_CAPABILITIES:
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_CAPABILITY_INVALID")
    organization_id = _text(data.get("organization_id"))
    usage_id = _text(data.get("usage_id"))
    instruction = _text(data.get("instruction"))
    if not organization_id or not usage_id or not instruction:
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_GOVERNED_CONTEXT_REQUIRED")
    lineage = _studio_lineage(data)
    control = _native_control(data)
    sources = _source_urls(data)
    if not sources or not sources[0].startswith("https://"):
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_STUDIO_REFERENCE_REQUIRED")
    storage = _object(data.get("storage_upload"))
    signed_url = _text(storage.get("signed_url"))
    storage_reference = _text(storage.get("storage_reference"))
    if not signed_url.startswith("https://") or not storage_reference.startswith("storage://creative-assets/"):
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_STORAGE_TARGET_INVALID")
    duration, seed = _generation_settings(data)
    return {
        "capability": capability,
        "organization_id": organization_id,
        "usage_id": usage_id,
        "instruction": _shot_bible_instruction(instruction, lineage),
        "source_urls": sources,
        "signed_url": signed_url,
        "storage_reference": storage_reference,
        "duration_seconds": duration,
        "seed": seed,
        "studio_lineage": lineage,
        "native_control": control,
    }


def _download_reference(url: str, destination: Path) -> int:
    import requests
    destination.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    with requests.get(url, stream=True, timeout=300) as response:
        if not response.ok:
            raise RuntimeError(f"AVANTIQO_VIDEO_LTX25_MODAL_REFERENCE_DOWNLOAD_FAILED:{response.status_code}")
        with destination.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if not chunk:
                    continue
                total += len(chunk)
                if total > MAX_REFERENCE_BYTES:
                    raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_REFERENCE_TOO_LARGE")
                handle.write(chunk)
    if total < MIN_REFERENCE_BYTES:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_STUDIO_REFERENCE_INVALID")
    return total


def _upload_master(path: Path, signed_url: str) -> None:
    import requests
    with path.open("rb") as handle:
        response = requests.put(signed_url, data=handle, headers={"content-type": "video/mp4", "cache-control": "max-age=3600", "x-upsert": "false"}, timeout=300)
    if not response.ok:
        raise RuntimeError(f"AVANTIQO_VIDEO_LTX25_MODAL_STORAGE_UPLOAD_FAILED:{response.status_code}:{_text(response.text)[:500]}")


def _controlled_conditions(job: dict[str, Any], relative_root: Path) -> tuple[list[dict[str, Any]], int]:
    control = job.get("native_control")
    if not control:
        return [], 0
    urls = job["source_urls"]
    conditions = []
    total_bytes = 0
    for condition in control["reference_conditions"]:
        index = int(condition.get("source_asset_index", -1))
        if index < 0 or index >= len(urls):
            raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_CONTROL_SOURCE_INDEX_INVALID")
        relative = str(relative_root / f"condition-{index:02d}.jpg")
        path = Path("/models") / relative
        total_bytes += _download_reference(urls[index], path)
        conditions.append({
            "reference_relative": relative,
            "frame_index": condition.get("frame_index"),
            "frame_fraction": condition.get("frame_fraction"),
            "strength": condition.get("strength", 1),
            "crf": condition.get("crf", 0),
            "role": condition.get("role") or "REFERENCE_KEYFRAME",
        })
    return conditions, total_bytes


def _controlled_generation_evidence(job: dict[str, Any], generation: dict[str, Any]) -> dict[str, Any]:
    control = _object(job.get("native_control"))
    if not control:
        return {
            "native_control_executed": False,
            "control_contract": None,
            "reference_condition_count": 0,
            "reference_condition_roles": [],
            "first_frame_conditioning_used": False,
            "last_frame_conditioning_used": False,
        }

    conditions = _list(control.get("reference_conditions"))
    expected_roles = [_text(item.get("role")) or "REFERENCE_KEYFRAME" for item in conditions]
    actual_roles = [_text(value) for value in _list(generation.get("reference_condition_roles"))]
    if _text(generation.get("control_contract")) != CONTROL_CONTRACT:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_CONTROL_RESULT_CONTRACT_INVALID")
    if _text(generation.get("modal_gpu")) != LTX_GPU:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_CONTROL_RESULT_GPU_INVALID")
    if int(generation.get("width") or 0) != LTX_MASTER_WIDTH or int(generation.get("height") or 0) != LTX_MASTER_HEIGHT:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_CONTROL_RESULT_RESOLUTION_INVALID")
    if int(generation.get("fps") or 0) != 24 or int(generation.get("num_inference_steps") or 0) != LTX_NUM_INFERENCE_STEPS:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_CONTROL_RESULT_GENERATION_SPEC_INVALID")
    if int(generation.get("reference_condition_count") or -1) != len(conditions) or actual_roles != expected_roles:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_CONTROL_RESULT_REFERENCE_EVIDENCE_INVALID")
    if generation.get("native_master_generated") is not True or generation.get("master_is_exact_model_output") is not True:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_CONTROL_RESULT_MASTER_PROVENANCE_INVALID")
    if "OPENING_FRAME" in expected_roles and generation.get("first_frame_conditioning_used") is not True:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_CONTROL_RESULT_FIRST_FRAME_INVALID")
    if "CLOSING_FRAME" in expected_roles and generation.get("last_frame_conditioning_used") is not True:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_CONTROL_RESULT_LAST_FRAME_INVALID")
    for flag in CONTROLLED_FALSE_PROVENANCE_FLAGS:
        if generation.get(flag) is not False:
            raise RuntimeError(f"AVANTIQO_VIDEO_LTX25_MODAL_CONTROL_RESULT_PROVENANCE_INVALID:{flag}")

    return {
        "native_control_executed": True,
        "control_contract": CONTROL_CONTRACT,
        "reference_condition_count": len(conditions),
        "reference_condition_roles": actual_roles,
        "first_frame_conditioning_used": generation.get("first_frame_conditioning_used") is True,
        "last_frame_conditioning_used": generation.get("last_frame_conditioning_used") is True,
        "native_master_generated": True,
        "master_is_exact_model_output": True,
        **{flag: False for flag in CONTROLLED_FALSE_PROVENANCE_FLAGS},
    }


@app.function(image=transport_image, volumes={"/models": model_volume}, timeout=LTX_HARD_TIMEOUT_SECONDS + 10 * 60, min_containers=0, max_containers=4, scaledown_window=5, retries=0)
def generate_native_job(data: dict[str, Any]) -> dict[str, Any]:
    job = _validate_job(data)
    job_id = uuid.uuid4().hex
    organization = _path_token(job["organization_id"], "organization")
    usage = _path_token(job["usage_id"], "usage")
    relative_root = Path("runtime-jobs") / organization / usage / job_id
    output_relative = str(relative_root / "native-master-3840x2176.mp4")
    output_path = Path("/models") / output_relative
    staged_paths: list[Path] = []
    reference_bytes = 0
    try:
        if job["native_control"]:
            conditions, reference_bytes = _controlled_conditions(job, relative_root)
            staged_paths = [Path("/models") / item["reference_relative"] for item in conditions]
            model_volume.commit()
            generation = generate_native_controlled_master.remote(conditions, output_relative, job["instruction"], job["duration_seconds"], job["seed"])
        else:
            reference_relative = str(relative_root / "studio-reference.jpg")
            reference_path = Path("/models") / reference_relative
            staged_paths = [reference_path]
            reference_bytes = _download_reference(job["source_urls"][0], reference_path)
            model_volume.commit()
            generation = generate_native_master.remote(reference_relative, output_relative, job["instruction"], job["duration_seconds"], job["seed"])

        if not isinstance(generation, dict) or generation.get("success") is not True:
            raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_NATIVE_RESULT_INVALID")
        controlled_evidence = _controlled_generation_evidence(job, generation)
        if not output_path.exists() or output_path.stat().st_size < 1024 * 1024:
            model_volume.reload()
        if not output_path.exists() or output_path.stat().st_size < 1024 * 1024:
            raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_NATIVE_OUTPUT_MISSING")
        _upload_master(output_path, job["signed_url"])
        lineage = _object(job.get("studio_lineage"))
        return {
            "success": True,
            "contract": JOB_CONTRACT,
            "engine": "avantiqo-owned",
            "model": "avantiqo-ltx-2.5",
            "native_engine_contract": NATIVE_ENGINE_CONTRACT,
            "runtime_contract": LTX_RUNTIME_CONTRACT,
            "gpu": LTX_GPU,
            "modal_gpu": _text(generation.get("modal_gpu")) or LTX_GPU,
            "width": LTX_MASTER_WIDTH,
            "height": LTX_MASTER_HEIGHT,
            "fps": 24,
            "steps": LTX_NUM_INFERENCE_STEPS,
            "num_inference_steps": int(generation.get("num_inference_steps") or LTX_NUM_INFERENCE_STEPS),
            "duration_seconds": job["duration_seconds"],
            "seed": job["seed"],
            "supplier_gpu_cost_usd": generation.get("supplier_gpu_cost_usd") or generation.get("estimated_supplier_gpu_cost_usd"),
            "generation": generation,
            "reference_bytes": reference_bytes,
            "storage_reference": job["storage_reference"],
            "studio_lineage": job["studio_lineage"],
            "studio_lineage_validated": bool(lineage),
            "shot_id": _text(lineage.get("shot_id")) or None,
            "native_control": job["native_control"],
            "gpu_generation_calls": 1,
            "automatic_generation_retries": 0,
            "automatic_paid_retry": generation.get("automatic_paid_retry", False),
            "runpod_used": False,
            "external_provider_used": False,
            "runpod_inference_performed": generation.get("runpod_inference_performed", False),
            "external_provider_contacted": generation.get("external_provider_contacted", False),
            **controlled_evidence,
        }
    finally:
        for path in staged_paths:
            try:
                path.unlink(missing_ok=True)
            except Exception:
                pass
        try:
            output_path.unlink(missing_ok=True)
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
