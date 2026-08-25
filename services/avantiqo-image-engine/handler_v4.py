import inspect
import json
import os
import shutil
import time
from pathlib import Path
from typing import Any

import runpod
import torch

import handler_v3 as v3

v2 = v3.v2
legacy = v2.legacy

RUNTIME_ENTRYPOINT_REVISION = "AVANTIQO_IMAGE_HANDLER_V4_MULTI_FOUNDATION_CANDIDATE_V1"
RUNTIME_REVISION = "AVANTIQO_IMAGE_MULTI_FOUNDATION_CANDIDATE_V1"
PHOTOREAL_FOUNDATION_MODEL = "Tongyi-MAI/Z-Image"
PHOTOREAL_FOUNDATION_MODEL_BYTES = 20_500_000_000
PHOTOREAL_PROFILE = "AVANTIQO_IMAGE_COMMERCIAL_PHOTOREAL_CANDIDATE_V1"
PHOTOREAL_POLICY = "Z_IMAGE_RESTRAINED_PHOTOGRAPHIC_V1"
PHOTOREAL_CACHE_CONTRACT = "AVANTIQO_IMAGE_PHOTOREAL_CACHE_COMPLETION_V1"
PHOTOREAL_CACHE_MARKER = ".avantiqo-photoreal-cache-complete.json"
CAPACITY_OPERATION = "inspect_foundation_capacity"
CACHE_OPERATION = v2.MODEL_CACHE_OPERATION
CACHE_HEADROOM_BYTES = 5 * 1024 * 1024 * 1024
DEFAULT_INFERENCE_STEPS = 40
DEFAULT_GUIDANCE_SCALE = 4.0

PHOTOREAL_REQUIRED_FILES = (
    "model_index.json",
    "scheduler/scheduler_config.json",
    "text_encoder/config.json",
    "text_encoder/generation_config.json",
    "text_encoder/model.safetensors.index.json",
    "text_encoder/model-00001-of-00003.safetensors",
    "text_encoder/model-00002-of-00003.safetensors",
    "text_encoder/model-00003-of-00003.safetensors",
    "tokenizer/tokenizer_config.json",
    "tokenizer/tokenizer.json",
    "tokenizer/vocab.json",
    "tokenizer/merges.txt",
    "transformer/config.json",
    "transformer/diffusion_pytorch_model.safetensors.index.json",
    "transformer/diffusion_pytorch_model-00001-of-00002.safetensors",
    "transformer/diffusion_pytorch_model-00002-of-00002.safetensors",
    "vae/config.json",
    "vae/diffusion_pytorch_model.safetensors",
)

PHOTOREAL_NEGATIVE_PROMPT = (
    "CGI, 3D render, illustration, plastic skin, waxy food, duplicated people, "
    "malformed hands, extra fingers, repeated texture, text, watermark"
)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _snapshot_path(model_id: str) -> Path | None:
    cached = legacy._cached_model_path(model_id)
    return Path(cached) if cached else None


def _missing_required_files(snapshot: Path | None) -> list[str]:
    if snapshot is None:
        return list(PHOTOREAL_REQUIRED_FILES)
    return [relative for relative in PHOTOREAL_REQUIRED_FILES if not (snapshot / relative).is_file()]


def _marker_payload(snapshot: Path) -> dict[str, Any] | None:
    marker = snapshot / PHOTOREAL_CACHE_MARKER
    if not marker.is_file():
        return None
    try:
        parsed = json.loads(marker.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _photoreal_cache_readiness() -> dict[str, Any]:
    snapshot = _snapshot_path(PHOTOREAL_FOUNDATION_MODEL)
    missing = _missing_required_files(snapshot)
    marker = _marker_payload(snapshot) if snapshot else None
    marker_valid = bool(
        snapshot
        and marker
        and marker.get("contract") == PHOTOREAL_CACHE_CONTRACT
        and _text(marker.get("target_model")) == PHOTOREAL_FOUNDATION_MODEL
        and _text(marker.get("snapshot_revision")) == snapshot.name
        and marker.get("snapshot_download_completed") is True
    )
    return {
        "snapshot": snapshot,
        "snapshot_revision": snapshot.name if snapshot else None,
        "missing_required_files": missing,
        "completion_marker_valid": marker_valid,
        "cache_ready": bool(snapshot and not missing and marker_valid),
    }


def _candidate_storage_state() -> dict[str, int]:
    cache_root = legacy.HF_CACHE_ROOT
    cache_root.mkdir(parents=True, exist_ok=True)
    usage = shutil.disk_usage(cache_root)
    model_root = cache_root / f"models--{PHOTOREAL_FOUNDATION_MODEL.replace('/', '--')}"
    cached_blob_bytes = v2._directory_bytes(model_root / "blobs")
    estimated_remaining_bytes = max(0, PHOTOREAL_FOUNDATION_MODEL_BYTES - cached_blob_bytes)
    required_free_bytes = estimated_remaining_bytes + CACHE_HEADROOM_BYTES
    return {
        "disk_total_bytes": int(usage.total),
        "disk_used_bytes": int(usage.used),
        "disk_free_bytes": int(usage.free),
        "cached_blob_bytes": int(cached_blob_bytes),
        "estimated_remaining_bytes": int(estimated_remaining_bytes),
        "required_free_bytes": int(required_free_bytes),
        "headroom_bytes": int(CACHE_HEADROOM_BYTES),
    }


def _capacity_evidence(job: dict[str, Any]) -> dict[str, Any]:
    data = job.get("input") or {}
    if data.get("contract") != legacy.ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_IMAGE_ENGINE_CONTRACT_INVALID")
    if _text(data.get("operation")) != CAPACITY_OPERATION:
        raise ValueError("AVANTIQO_IMAGE_CAPACITY_OPERATION_INVALID")
    target = _text(data.get("target_model")) or PHOTOREAL_FOUNDATION_MODEL
    if target != PHOTOREAL_FOUNDATION_MODEL:
        raise ValueError("AVANTIQO_IMAGE_CAPACITY_TARGET_FORBIDDEN")

    storage = _candidate_storage_state()
    readiness = _photoreal_cache_readiness()
    inventory = v2._cache_inventory()
    safe_without_reclaim = readiness["cache_ready"] or storage["disk_free_bytes"] >= storage["required_free_bytes"]
    return {
        "status": "completed",
        "provider": "avantiqo-image",
        "model": legacy.PRODUCT_MODEL,
        "engine_contract": legacy.ENGINE_CONTRACT,
        "runtime_revision": RUNTIME_REVISION,
        "operation": CAPACITY_OPERATION,
        "target_model": PHOTOREAL_FOUNDATION_MODEL,
        "candidate_profile": PHOTOREAL_PROFILE,
        "candidate_license": "Apache-2.0",
        "candidate_estimated_model_bytes": PHOTOREAL_FOUNDATION_MODEL_BYTES,
        "candidate_cache_ready": readiness["cache_ready"],
        "candidate_snapshot_revision": readiness["snapshot_revision"],
        "candidate_missing_required_file_count": len(readiness["missing_required_files"]),
        "candidate_storage": storage,
        "cache_inventory": inventory,
        "safe_to_cache_without_reclaim": safe_without_reclaim,
        "download_requested": False,
        "model_download_performed": False,
        "generation_requested": False,
        "inference_performed": False,
        "storage_mutation_performed": False,
        "raw_reasoning_persisted": False,
    }


def _write_completion_marker(snapshot: Path) -> None:
    payload = {
        "contract": PHOTOREAL_CACHE_CONTRACT,
        "target_model": PHOTOREAL_FOUNDATION_MODEL,
        "snapshot_revision": snapshot.name,
        "snapshot_download_completed": True,
        "required_file_count": len(PHOTOREAL_REQUIRED_FILES),
    }
    marker = snapshot / PHOTOREAL_CACHE_MARKER
    temporary = snapshot / f"{PHOTOREAL_CACHE_MARKER}.tmp"
    temporary.write_text(json.dumps(payload, separators=(",", ":"), sort_keys=True), encoding="utf-8")
    temporary.replace(marker)


def _cache_photoreal_foundation(job: dict[str, Any]) -> dict[str, Any]:
    data = job.get("input") or {}
    if data.get("contract") != legacy.ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_IMAGE_ENGINE_CONTRACT_INVALID")
    if _text(data.get("operation")) != CACHE_OPERATION:
        raise ValueError("AVANTIQO_IMAGE_MODEL_CACHE_OPERATION_INVALID")
    if _text(data.get("target_model")) != PHOTOREAL_FOUNDATION_MODEL:
        raise ValueError("AVANTIQO_IMAGE_MODEL_CACHE_TARGET_FORBIDDEN")

    transport = v2._cache_transport_state()
    if not transport["xet_disabled"]:
        raise RuntimeError("AVANTIQO_IMAGE_CACHE_XET_DISABLE_NOT_EFFECTIVE")

    readiness = _photoreal_cache_readiness()
    storage = _candidate_storage_state()
    if readiness["cache_ready"]:
        return {
            "status": "completed",
            "provider": "avantiqo-image",
            "model": legacy.PRODUCT_MODEL,
            "engine_contract": legacy.ENGINE_CONTRACT,
            "runtime_revision": RUNTIME_REVISION,
            "operation": CACHE_OPERATION,
            "target_model": PHOTOREAL_FOUNDATION_MODEL,
            "candidate_profile": PHOTOREAL_PROFILE,
            "foundation_model_source": "runpod-cache",
            "already_cached": True,
            "cache_ready": True,
            "cache_integrity": {
                "contract": PHOTOREAL_CACHE_CONTRACT,
                "completion_marker_valid": True,
                "snapshot_revision": readiness["snapshot_revision"],
                "missing_required_files": [],
            },
            "cache_transport": transport,
            "cache_storage": storage,
            "inference_performed": False,
            "generation_requested": False,
            "raw_reasoning_persisted": False,
        }

    if storage["disk_free_bytes"] < storage["required_free_bytes"]:
        return {
            "status": "completed",
            "provider": "avantiqo-image",
            "model": legacy.PRODUCT_MODEL,
            "engine_contract": legacy.ENGINE_CONTRACT,
            "runtime_revision": RUNTIME_REVISION,
            "operation": CACHE_OPERATION,
            "target_model": PHOTOREAL_FOUNDATION_MODEL,
            "candidate_profile": PHOTOREAL_PROFILE,
            "foundation_model_source": None,
            "already_cached": False,
            "cache_ready": False,
            "storage_insufficient": True,
            "cache_transport": transport,
            "cache_storage": storage,
            "cache_inventory": v2._cache_inventory(),
            "automatic_delete_allowed": False,
            "deletion_performed": False,
            "inference_performed": False,
            "generation_requested": False,
            "raw_reasoning_persisted": False,
        }

    runpod.serverless.progress_update(job, f"caching Avantiqo photoreal candidate {PHOTOREAL_FOUNDATION_MODEL} generation=false")
    downloaded = v2.snapshot_download(
        repo_id=PHOTOREAL_FOUNDATION_MODEL,
        cache_dir=str(legacy.HF_CACHE_ROOT),
        local_files_only=False,
        max_workers=v2.CACHE_DOWNLOAD_WORKERS,
        etag_timeout=60,
    )
    snapshot = Path(downloaded)
    missing = _missing_required_files(snapshot)
    if missing:
        raise RuntimeError("AVANTIQO_IMAGE_PHOTOREAL_CACHE_INCOMPLETE_AFTER_DOWNLOAD:" + "|".join(missing))
    _write_completion_marker(snapshot)
    verified = _photoreal_cache_readiness()
    if not verified["cache_ready"]:
        raise RuntimeError("AVANTIQO_IMAGE_PHOTOREAL_CACHE_COMPLETION_VERIFY_FAILED")

    return {
        "status": "completed",
        "provider": "avantiqo-image",
        "model": legacy.PRODUCT_MODEL,
        "engine_contract": legacy.ENGINE_CONTRACT,
        "runtime_revision": RUNTIME_REVISION,
        "operation": CACHE_OPERATION,
        "target_model": PHOTOREAL_FOUNDATION_MODEL,
        "candidate_profile": PHOTOREAL_PROFILE,
        "foundation_model_source": "runpod-cache",
        "already_cached": False,
        "cache_ready": True,
        "cache_integrity": {
            "contract": PHOTOREAL_CACHE_CONTRACT,
            "completion_marker_valid": True,
            "snapshot_revision": verified["snapshot_revision"],
            "missing_required_files": [],
        },
        "cache_transport": transport,
        "cache_storage": _candidate_storage_state(),
        "inference_performed": False,
        "generation_requested": False,
        "raw_reasoning_persisted": False,
    }


def _photoreal_guidance(pipe: Any, params: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    scale = float(params.get("guidance_scale") or DEFAULT_GUIDANCE_SCALE)
    if scale < 1.0 or scale > 10.0:
        raise ValueError("AVANTIQO_IMAGE_PHOTOREAL_GUIDANCE_SCALE_INVALID")
    negative_prompt = _text(params.get("negative_prompt")) or PHOTOREAL_NEGATIVE_PROMPT
    try:
        accepted = set(inspect.signature(pipe.__call__).parameters)
    except (TypeError, ValueError):
        accepted = set()
    if "guidance_scale" not in accepted:
        raise RuntimeError("AVANTIQO_IMAGE_PHOTOREAL_CFG_REQUIRED")
    if "negative_prompt" not in accepted:
        raise RuntimeError("AVANTIQO_IMAGE_PHOTOREAL_NEGATIVE_CONTROL_REQUIRED")
    kwargs: dict[str, Any] = {"guidance_scale": scale, "negative_prompt": negative_prompt}
    if "cfg_normalization" in accepted:
        kwargs["cfg_normalization"] = False
    return kwargs, {
        "mode": "CFG",
        "scale": scale,
        "negative_prompt_supplied": True,
        "negative_prompt_has_content": bool(negative_prompt),
        "cfg_normalization": False if "cfg_normalization" in accepted else None,
        "quality_profile": PHOTOREAL_PROFILE,
        "quality_policy": PHOTOREAL_POLICY,
        "prompt_rewrite_applied": False,
        "positive_constraint_suffix_applied": False,
    }


def _generate_photoreal_candidate(job: dict[str, Any]) -> dict[str, Any]:
    raw = job.get("input") or {}
    if _text(raw.get("foundation_model")) != PHOTOREAL_FOUNDATION_MODEL:
        raise ValueError("AVANTIQO_IMAGE_PHOTOREAL_FOUNDATION_REQUEST_INVALID")
    readiness = _photoreal_cache_readiness()
    if not readiness["cache_ready"]:
        raise RuntimeError("AVANTIQO_IMAGE_PHOTOREAL_CANDIDATE_NOT_CACHED")

    data = legacy._validated_input(job)
    started = time.perf_counter()
    spec = data.get("structured_specification") or {}
    params = spec.get("provider_parameters") or {}
    width, height = legacy._dimensions(spec)
    seed = int(params.get("seed") if params.get("seed") is not None else int.from_bytes(os.urandom(4), "big"))
    if seed < 0 or seed > 4294967295:
        raise ValueError("AVANTIQO_IMAGE_SEED_INVALID")
    inference_steps = int(params.get("inference_steps") or DEFAULT_INFERENCE_STEPS)
    if inference_steps < 28 or inference_steps > 50:
        raise ValueError("AVANTIQO_IMAGE_PHOTOREAL_INFERENCE_STEPS_INVALID")

    generator_device = "cuda" if legacy.DEVICE.startswith("cuda") else legacy.DEVICE
    generator = torch.Generator(device=generator_device).manual_seed(seed)
    runpod.serverless.progress_update(job, "loading Avantiqo photoreal candidate")
    pipe = legacy._pipeline(PHOTOREAL_FOUNDATION_MODEL)
    guidance_kwargs, guidance_metadata = _photoreal_guidance(pipe, params)
    instruction = data["instruction"]
    runpod.serverless.progress_update(job, "generating Avantiqo photoreal candidate image")
    result = pipe(
        prompt=instruction,
        width=width,
        height=height,
        num_inference_steps=inference_steps,
        generator=generator,
        **guidance_kwargs,
    )
    image = result.images[0].convert("RGB")
    width, height = image.size
    job_id = _text(job.get("id")) or str(int(time.time() * 1000))
    path = Path(os.getenv("AVANTIQO_IMAGE_OUTPUT_DIR", "/tmp/avantiqo-image")) / f"{job_id}-z-image.png"
    image.save(path, format="PNG")
    runpod.serverless.progress_update(job, "storing private Avantiqo photoreal candidate asset")
    legacy._upload(path, data["storage_upload"])
    size_bytes = path.stat().st_size
    path.unlink(missing_ok=True)

    return {
        "status": "completed",
        "provider": "avantiqo-image",
        "model": legacy.PRODUCT_MODEL,
        "engine_contract": legacy.ENGINE_CONTRACT,
        "runtime_revision": RUNTIME_REVISION,
        "capability": "ai.image.generate",
        "storage_reference": data["storage_upload"]["storage_reference"],
        "foundation_model": PHOTOREAL_FOUNDATION_MODEL,
        "foundation_model_source": "runpod-cache",
        "foundation_selection": {
            "quality_profile": PHOTOREAL_PROFILE,
            "selected_foundation": PHOTOREAL_FOUNDATION_MODEL,
            "selection_status": "CERTIFICATION_CANDIDATE_ONLY",
            "automatic_production_routing_enabled": False,
            "qwen_replaced": False,
        },
        "seed": seed,
        "width": width,
        "height": height,
        "size_bytes": size_bytes,
        "generation_guidance": guidance_metadata,
        "inference_steps": inference_steps,
        "certification_execution": data.get("certification_execution") is True,
        "generation_seconds": round(time.perf_counter() - started, 3),
        "raw_reasoning_persisted": False,
    }


def _runtime_probe(job: dict[str, Any]) -> dict[str, Any]:
    base = v3.handler(job)
    if not isinstance(base, dict):
        raise RuntimeError("AVANTIQO_IMAGE_V4_BASE_PROBE_INVALID")
    readiness = _photoreal_cache_readiness()
    storage = _candidate_storage_state()
    return {
        **base,
        "entrypoint": "handler_v4.py",
        "entrypoint_revision": RUNTIME_ENTRYPOINT_REVISION,
        "runtime_revision": RUNTIME_REVISION,
        "qwen_runtime_revision": v3.QUALITY_RUNTIME_REVISION,
        "photoreal_candidate": {
            "quality_profile": PHOTOREAL_PROFILE,
            "quality_policy": PHOTOREAL_POLICY,
            "foundation_model": PHOTOREAL_FOUNDATION_MODEL,
            "license": "Apache-2.0",
            "cache_ready": readiness["cache_ready"],
            "completion_contract": PHOTOREAL_CACHE_CONTRACT,
            "completion_marker_valid": readiness["completion_marker_valid"],
            "snapshot_revision": readiness["snapshot_revision"],
            "missing_required_file_count": len(readiness["missing_required_files"]),
            "estimated_model_bytes": PHOTOREAL_FOUNDATION_MODEL_BYTES,
            "storage": storage,
            "safe_to_cache_without_reclaim": readiness["cache_ready"] or storage["disk_free_bytes"] >= storage["required_free_bytes"],
            "automatic_production_routing_enabled": False,
        },
        "generation_requested": False,
        "inference_performed": False,
        "model_download_performed": False,
        "storage_mutation_performed": False,
    }


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data = job.get("input") or {}
    operation = _text(data.get("operation"))
    if operation == CAPACITY_OPERATION:
        return _capacity_evidence(job)
    if operation == v3.RUNTIME_PROBE_OPERATION:
        return _runtime_probe(job)
    if operation == CACHE_OPERATION and _text(data.get("target_model")) == PHOTOREAL_FOUNDATION_MODEL:
        return _cache_photoreal_foundation(job)

    capability = _text(data.get("capability"))
    requested_foundation = _text(data.get("foundation_model"))
    if capability == "ai.image.generate" and requested_foundation == PHOTOREAL_FOUNDATION_MODEL:
        return _generate_photoreal_candidate(job)
    if requested_foundation == PHOTOREAL_FOUNDATION_MODEL:
        raise ValueError("AVANTIQO_IMAGE_PHOTOREAL_CANDIDATE_GENERATE_ONLY")
    return v3.handler(job)


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
