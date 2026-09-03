"""CPU-only governed job adapter for the native Avantiqo LTX-2.5 Video worker.

The platform submits one governed payload exactly like the proven Audio and
Intelligence Modal paths. This adapter performs only transport on CPU: it stages
the already-prepared Studio reference on the single Video Volume, invokes the
existing B200 native-master function exactly once, uploads the untouched master
to the signed Studio target, and removes transient job files.
"""
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

JOB_CONTRACT = "AVANTIQO_VIDEO_LTX25_MODAL_NATIVE_JOB_V1"
STUDIO_LINEAGE_CONTRACT = "AVANTIQO_VIDEO_STUDIO_LINEAGE_V1"
SHOT_BIBLE_CONTRACT = "CREATIVE_SHOT_BIBLE_V1"
SUPPORTED_CAPABILITIES = {"ai.video.generate", "ai.video.image_to_video"}
MAX_REFERENCE_BYTES = 100 * 1024 * 1024
MIN_REFERENCE_BYTES = 1024

transport_image = modal.Image.debian_slim(python_version="3.12").pip_install(
    "requests==2.32.4"
)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _path_token(value: Any, fallback: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9_-]+", "-", _text(value)).strip("-")
    return (normalized or fallback)[:120]


def _generation_settings(data: dict[str, Any]) -> tuple[int, int]:
    specification = _object(data.get("structured_specification"))
    generation = _object(specification.get("generation"))
    provider_parameters = {
        **_object(generation.get("provider_parameters")),
        **_object(specification.get("provider_parameters")),
    }
    raw_duration = (
        data.get("duration_seconds")
        or generation.get("duration_seconds")
        or generation.get("duration")
        or provider_parameters.get("duration_seconds")
        or 5
    )
    duration = int(raw_duration)
    if duration <= 0 or duration > 20:
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_DURATION_INVALID")

    raw_seed = (
        data.get("seed")
        if data.get("seed") is not None
        else generation.get("seed")
        if generation.get("seed") is not None
        else provider_parameters.get("seed")
    )
    seed = 4747 if raw_seed in (None, "") else int(raw_seed)
    if seed < 0 or seed > 4294967295:
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_SEED_INVALID")
    return duration, seed


def _source_url(data: dict[str, Any]) -> str:
    roles = _object(data.get("source_asset_roles"))
    candidate = _text(roles.get("source_image"))
    if candidate:
        return candidate
    sources = data.get("source_assets")
    if isinstance(sources, list):
        for source in sources:
            candidate = _text(source)
            if candidate:
                return candidate
    return ""


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
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_SHOT_BIBLE_ORGANIZATION_MISMATCH")

    return {
        "contract": STUDIO_LINEAGE_CONTRACT,
        "shot_id": shot_id,
        "shot_bible_contract": SHOT_BIBLE_CONTRACT,
    }


def _validate_job(data: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_JOB_OBJECT_REQUIRED")
    if _text(data.get("contract")) != NATIVE_ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_ENGINE_CONTRACT_INVALID")
    capability = _text(data.get("capability"))
    if capability not in SUPPORTED_CAPABILITIES:
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_CAPABILITY_INVALID")
    organization_id = _text(data.get("organization_id"))
    usage_id = _text(data.get("usage_id"))
    instruction = _text(data.get("instruction"))
    if not organization_id:
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_ORGANIZATION_REQUIRED")
    if not usage_id:
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_USAGE_REQUIRED")
    if not instruction:
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_INSTRUCTION_REQUIRED")

    studio_lineage = _studio_lineage(data)
    source_url = _source_url(data)
    # The premium mastered lane is Studio-first: even ai.video.generate reaches
    # this worker after Studio has prepared the opening/reference frame.
    if not source_url.startswith("https://"):
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_STUDIO_REFERENCE_REQUIRED")

    storage = _object(data.get("storage_upload"))
    signed_url = _text(storage.get("signed_url"))
    storage_reference = _text(storage.get("storage_reference"))
    if not signed_url.startswith("https://"):
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_STORAGE_UPLOAD_REQUIRED")
    if not storage_reference.startswith("storage://creative-assets/"):
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_STORAGE_REFERENCE_INVALID")

    duration, seed = _generation_settings(data)
    return {
        "capability": capability,
        "organization_id": organization_id,
        "usage_id": usage_id,
        "instruction": instruction,
        "source_url": source_url,
        "signed_url": signed_url,
        "storage_reference": storage_reference,
        "duration_seconds": duration,
        "seed": seed,
        "studio_lineage": studio_lineage,
    }


def _download_reference(url: str, destination: Path) -> int:
    import requests

    destination.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    with requests.get(url, stream=True, timeout=300) as response:
        if not response.ok:
            raise RuntimeError(
                f"AVANTIQO_VIDEO_LTX25_MODAL_REFERENCE_DOWNLOAD_FAILED:{response.status_code}"
            )
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
        response = requests.put(
            signed_url,
            data=handle,
            headers={
                "content-type": "video/mp4",
                "cache-control": "max-age=3600",
                "x-upsert": "false",
            },
            timeout=300,
        )
    if not response.ok:
        detail = _text(response.text)[:500]
        raise RuntimeError(
            f"AVANTIQO_VIDEO_LTX25_MODAL_STORAGE_UPLOAD_FAILED:{response.status_code}:{detail}"
        )


@app.function(
    image=transport_image,
    volumes={"/models": model_volume},
    timeout=LTX_HARD_TIMEOUT_SECONDS + 10 * 60,
    min_containers=0,
    max_containers=4,
    scaledown_window=5,
    retries=0,
)
def generate_native_job(data: dict[str, Any]) -> dict[str, Any]:
    """Accept one governed payload and execute exactly one native B200 render."""
    job = _validate_job(data)
    job_id = uuid.uuid4().hex
    organization = _path_token(job["organization_id"], "organization")
    usage = _path_token(job["usage_id"], "usage")
    relative_root = Path("runtime-jobs") / organization / usage / job_id
    reference_relative = str(relative_root / "studio-reference.jpg")
    output_relative = str(relative_root / "native-master-3840x2176.mp4")
    reference_path = Path("/models") / reference_relative
    output_path = Path("/models") / output_relative
    reference_bytes = 0

    try:
        # CPU transport only. The B200 function does not download, upload, crop,
        # resize, upscale, grade, assemble or otherwise transform Studio assets.
        reference_bytes = _download_reference(job["source_url"], reference_path)
        model_volume.commit()

        generation = generate_native_master.remote(
            reference_relative,
            output_relative,
            job["instruction"],
            job["duration_seconds"],
            job["seed"],
        )
        if not isinstance(generation, dict) or generation.get("success") is not True:
            raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_NATIVE_RESULT_INVALID")
        if generation.get("contract") != LTX_RUNTIME_CONTRACT:
            raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_NATIVE_CONTRACT_INVALID")
        if generation.get("modal_gpu") != LTX_GPU:
            raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_NATIVE_GPU_INVALID")
        if generation.get("width") != LTX_MASTER_WIDTH or generation.get("height") != LTX_MASTER_HEIGHT:
            raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_NATIVE_DIMENSIONS_INVALID")
        if generation.get("num_inference_steps") != LTX_NUM_INFERENCE_STEPS:
            raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_NATIVE_STEPS_INVALID")
        if generation.get("master_is_exact_model_output") is not True:
            raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_NATIVE_MASTER_INVALID")

        model_volume.reload()
        if not output_path.is_file() or output_path.stat().st_size <= 1_000_000:
            raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_NATIVE_OUTPUT_MISSING")
        output_bytes = output_path.stat().st_size
        _upload_master(output_path, job["signed_url"])

        result = dict(generation)
        result.update({
            "success": True,
            "status": "completed",
            "job_contract": JOB_CONTRACT,
            "engine_contract": NATIVE_ENGINE_CONTRACT,
            "capability": job["capability"],
            "storage_reference": job["storage_reference"],
            "output_relative": None,
            "output_size_bytes": output_bytes,
            "studio_reference_bytes": reference_bytes,
            "studio_reference_staged_on_cpu": True,
            "master_uploaded_on_cpu": True,
            "gpu_transport_io_used": False,
            "gpu_generation_calls": 1,
            "volume_job_artifacts_retained": False,
            "runpod_inference_performed": False,
            "external_provider_contacted": False,
            "raw_reasoning_persisted": False,
        })
        if job["studio_lineage"]:
            result.update({
                "studio_lineage_contract": job["studio_lineage"]["contract"],
                "shot_id": job["studio_lineage"]["shot_id"],
                "shot_bible_contract": job["studio_lineage"]["shot_bible_contract"],
                "studio_lineage_validated": True,
            })
        return result
    finally:
        reference_path.unlink(missing_ok=True)
        output_path.unlink(missing_ok=True)
        try:
            current = output_path.parent
            stop = Path("/models/runtime-jobs")
            while current != stop and current.is_dir():
                current.rmdir()
                current = current.parent
        except OSError:
            pass
        model_volume.commit()
