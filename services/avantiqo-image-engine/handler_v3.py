import copy
import json
from pathlib import Path
from typing import Any

import runpod

import handler_v2 as v2

CACHE_COMPLETION_CONTRACT = "AVANTIQO_IMAGE_CACHE_COMPLETION_V1"
CACHE_COMPLETION_MARKER = ".avantiqo-cache-complete.json"
RUNTIME_PROBE_OPERATION = "runtime_probe"
RUNTIME_PROBE_CONTRACT = "AVANTIQO_IMAGE_RUNTIME_PROBE_V1"
RUNTIME_ENTRYPOINT_REVISION = "AVANTIQO_IMAGE_HANDLER_V3_QUALITY_COMPILER_V2"
QUALITY_RUNTIME_REVISION = "AVANTIQO_IMAGE_QWEN_2512_QUALITY_V2"
QUALITY_POLICY = "QWEN_IMAGE_2512_REALISM_IDENTITY_PHYSICS_V2"
QUALITY_COMPILER_CONTRACT = "AVANTIQO_IMAGE_QUALITY_COMPILER_V2"
QUALITY_REQUIRED_FILES = (
    "model_index.json",
    "scheduler/scheduler_config.json",
    "text_encoder/config.json",
    "text_encoder/model.safetensors.index.json",
    "text_encoder/model-00001-of-00004.safetensors",
    "text_encoder/model-00002-of-00004.safetensors",
    "text_encoder/model-00003-of-00004.safetensors",
    "text_encoder/model-00004-of-00004.safetensors",
    "tokenizer/tokenizer_config.json",
    "tokenizer/vocab.json",
    "tokenizer/merges.txt",
    "transformer/config.json",
    "transformer/diffusion_pytorch_model.safetensors.index.json",
    "transformer/diffusion_pytorch_model-00001-of-00009.safetensors",
    "transformer/diffusion_pytorch_model-00002-of-00009.safetensors",
    "transformer/diffusion_pytorch_model-00003-of-00009.safetensors",
    "transformer/diffusion_pytorch_model-00004-of-00009.safetensors",
    "transformer/diffusion_pytorch_model-00005-of-00009.safetensors",
    "transformer/diffusion_pytorch_model-00006-of-00009.safetensors",
    "transformer/diffusion_pytorch_model-00007-of-00009.safetensors",
    "transformer/diffusion_pytorch_model-00008-of-00009.safetensors",
    "transformer/diffusion_pytorch_model-00009-of-00009.safetensors",
    "vae/config.json",
    "vae/diffusion_pytorch_model.safetensors",
)

QUALITY_BASE_NEGATIVE = (
    "low resolution, low quality, anatomical deformity, malformed limbs, malformed fingers, "
    "oversaturated image, waxy skin, faces without detail, overly smooth skin, obvious AI-generated "
    "appearance, chaotic composition, blurred text, distorted text"
)
QUALITY_RULES = {
    "identity_separation": {
        "triggers": (
            "two people",
            "two guests",
            "guests",
            "diners",
            "people",
            "multiple people",
            "group of",
            "couple",
            "customers",
            "several people",
        ),
        "positive": (
            "Every separate person must be a genuinely distinct individual. Preserve the requested "
            "person count and roles, but do not reuse one facial identity. Deliberately vary facial "
            "bone structure, eye shape, nose, jaw, hairline and hair texture, age cues, grooming, "
            "clothing, posture and expression so unrelated people cannot read as twins or clones."
        ),
        "negative": (
            "duplicate people, duplicate person, cloned people, cloned face, same face repeated, "
            "identical faces, twin-looking unrelated people, reused facial identity, mirrored faces, "
            "same person shown twice, repeated hairstyle, repeated beard"
        ),
    },
    "requested_hand_visibility": {
        "triggers": ("hand", "hands", "finger", "fingers"),
        "positive": (
            "When the brief requires visible hands or fingers, keep those hands fully inside frame "
            "and unobscured by plates, props, bodies or cropping. Visible means the requested fingers "
            "can actually be inspected, with ordinary anatomy and natural grip or gesture."
        ),
        "negative": (
            "hidden requested hands, obscured hands, cropped hands, fused fingers, extra fingers, "
            "missing fingers, merged hands, hand concealed behind plate"
        ),
    },
    "physical_food_realism": {
        "triggers": (
            "food",
            "steak",
            "beef",
            "dish",
            "plate",
            "meal",
            "dinner",
            "restaurant",
            "asparagus",
            "puree",
            "sauce",
            "jus",
            "cuisine",
        ),
        "positive": (
            "Keep food at physically believable real-world scale relative to the plate, hands and "
            "table. Use irregular organic geometry, natural cooking variation, uneven sear and char, "
            "fibrous cut surfaces and restrained moisture. Plating should show small asymmetries and "
            "ordinary serving variation rather than sculpted or mathematically repeated shapes."
        ),
        "negative": (
            "oversized food, giant steak, cylindrical steak, perfect circular steak, geometric steak, "
            "cube steak, molded meat, plastic food, wax food, lacquered food, polished resin food, "
            "perfect grill grid, mirror-gloss sauce, perfect sauce circle, sculpted puree, identical "
            "vegetables, impossible raw exterior, artificial food shine"
        ),
    },
    "photographic_naturalism": {
        "triggers": (
            "photoreal",
            "photograph",
            "photography",
            "camera",
            "realistic",
            "candid",
            "lens",
        ),
        "positive": (
            "Preserve candid photographic asymmetry and plausible camera evidence: non-identical "
            "micro-expressions, ordinary skin texture, physically consistent light and reflections, "
            "and small natural imperfections. Avoid the visual regularity of synthetic stock imagery."
        ),
        "negative": (
            "stock-photo symmetry, mannequin pose, plastic skin, airbrushed skin, synthetic studio "
            "perfection, CGI look, mirrored composition, repeated facial features"
        ),
    },
}

# V3 owns the active Qwen-2512 runtime contract while retaining V2's proven generation path.
v2.QUALITY_RUNTIME_REVISION = QUALITY_RUNTIME_REVISION


def _text(value: Any) -> str:
    return str(value or "").strip()


def _snapshot_path(model_id: str) -> Path | None:
    cached = v2.legacy._cached_model_path(model_id)
    return Path(cached) if cached else None


def _missing_required_files(snapshot: Path | None) -> list[str]:
    if snapshot is None:
        return list(QUALITY_REQUIRED_FILES)
    return [
        relative
        for relative in QUALITY_REQUIRED_FILES
        if not (snapshot / relative).is_file()
    ]


def _marker_payload(snapshot: Path) -> dict[str, Any] | None:
    marker = snapshot / CACHE_COMPLETION_MARKER
    if not marker.is_file():
        return None
    try:
        parsed = json.loads(marker.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _quality_cache_readiness() -> dict[str, Any]:
    snapshot = _snapshot_path(v2.QUALITY_FOUNDATION_MODEL)
    missing = _missing_required_files(snapshot)
    marker = _marker_payload(snapshot) if snapshot else None
    marker_valid = bool(
        snapshot
        and marker
        and marker.get("contract") == CACHE_COMPLETION_CONTRACT
        and _text(marker.get("target_model")) == v2.QUALITY_FOUNDATION_MODEL
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


def _quality_rule_names(instruction: str) -> list[str]:
    source = instruction.lower()
    return [
        name
        for name, rule in QUALITY_RULES.items()
        if any(trigger in source for trigger in rule["triggers"])
    ]


def _merge_negative_prompt(existing: str, rule_names: list[str]) -> str:
    segments = [QUALITY_BASE_NEGATIVE]
    if existing:
        segments.append(existing)
    segments.extend(QUALITY_RULES[name]["negative"] for name in rule_names)
    seen: set[str] = set()
    merged: list[str] = []
    for segment in segments:
        normalized = _text(segment)
        if normalized and normalized.lower() not in seen:
            seen.add(normalized.lower())
            merged.append(normalized)
    return ", ".join(merged)


def _compile_quality_job(job: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    prepared = copy.deepcopy(job)
    data = prepared.get("input") or {}
    instruction = _text(data.get("instruction"))
    rule_names = _quality_rule_names(instruction)

    structured = data.get("structured_specification") or {}
    if not isinstance(structured, dict):
        structured = {}
    params = structured.get("provider_parameters") or {}
    if not isinstance(params, dict):
        params = {}
    user_negative = _text(params.get("negative_prompt"))
    params = {
        **params,
        "negative_prompt": _merge_negative_prompt(user_negative, rule_names),
    }
    data["structured_specification"] = {
        **structured,
        "provider_parameters": params,
    }

    positive_constraints = [QUALITY_RULES[name]["positive"] for name in rule_names]
    positive_applied = False
    if positive_constraints:
        suffix = " Avantiqo realism constraints: " + " ".join(positive_constraints)
        if len(instruction) + len(suffix) <= 12000:
            data["instruction"] = instruction + suffix
            positive_applied = True

    prepared["input"] = data
    return prepared, {
        "contract": QUALITY_COMPILER_CONTRACT,
        "quality_policy": QUALITY_POLICY,
        "rules": rule_names,
        "rule_count": len(rule_names),
        "positive_constraints_applied": positive_applied,
        "negative_policy_applied": True,
        "user_negative_prompt_preserved": bool(user_negative),
        "compiled_prompt_persisted": False,
        "raw_reasoning_persisted": False,
    }


def _runtime_probe(job: dict[str, Any]) -> dict[str, Any]:
    data = job.get("input") or {}
    if data.get("contract") != v2.legacy.ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_IMAGE_ENGINE_CONTRACT_INVALID")
    if _text(data.get("operation")) != RUNTIME_PROBE_OPERATION:
        raise ValueError("AVANTIQO_IMAGE_RUNTIME_PROBE_OPERATION_INVALID")

    readiness = _quality_cache_readiness()
    quality_pipeline_already_loaded = (
        v2.QUALITY_FOUNDATION_MODEL in v2.legacy._PIPELINES
    )
    return {
        "status": "completed",
        "provider": "avantiqo-image",
        "model": v2.legacy.PRODUCT_MODEL,
        "engine_contract": v2.legacy.ENGINE_CONTRACT,
        "probe_contract": RUNTIME_PROBE_CONTRACT,
        "operation": RUNTIME_PROBE_OPERATION,
        "entrypoint": "handler_v3.py",
        "entrypoint_revision": RUNTIME_ENTRYPOINT_REVISION,
        "runtime_revision": QUALITY_RUNTIME_REVISION,
        "quality_policy": QUALITY_POLICY,
        "quality_compiler_contract": QUALITY_COMPILER_CONTRACT,
        "configured_generation_foundation": v2.legacy.FOUNDATION_MODEL,
        "quality_foundation_model": v2.QUALITY_FOUNDATION_MODEL,
        "quality_cache": {
            "cache_ready": readiness["cache_ready"],
            "completion_contract": CACHE_COMPLETION_CONTRACT,
            "completion_marker_valid": readiness["completion_marker_valid"],
            "snapshot_present": readiness["snapshot"] is not None,
            "snapshot_revision": readiness["snapshot_revision"],
            "required_file_count": len(QUALITY_REQUIRED_FILES),
            "missing_required_file_count": len(readiness["missing_required_files"]),
            "missing_required_files": readiness["missing_required_files"],
        },
        "cache_transport": v2._cache_transport_state(),
        "generation_pipeline_was_loaded_before_probe": quality_pipeline_already_loaded,
        "generation_pipeline_loaded_by_probe": False,
        "generation_requested": False,
        "inference_performed": False,
        "model_download_performed": False,
        "storage_upload_performed": False,
        "storage_mutation_performed": False,
        "raw_reasoning_persisted": False,
    }


def _write_completion_marker(snapshot: Path) -> None:
    payload = {
        "contract": CACHE_COMPLETION_CONTRACT,
        "target_model": v2.QUALITY_FOUNDATION_MODEL,
        "snapshot_revision": snapshot.name,
        "snapshot_download_completed": True,
        "required_file_count": len(QUALITY_REQUIRED_FILES),
    }
    marker = snapshot / CACHE_COMPLETION_MARKER
    temporary = snapshot / f"{CACHE_COMPLETION_MARKER}.tmp"
    temporary.write_text(
        json.dumps(payload, separators=(",", ":"), sort_keys=True),
        encoding="utf-8",
    )
    temporary.replace(marker)


def _cache_foundation_model(job: dict[str, Any]) -> dict[str, Any]:
    data = job.get("input") or {}
    if data.get("contract") != v2.legacy.ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_IMAGE_ENGINE_CONTRACT_INVALID")
    if _text(data.get("operation")) != v2.MODEL_CACHE_OPERATION:
        raise ValueError("AVANTIQO_IMAGE_MODEL_CACHE_OPERATION_INVALID")
    target_model = _text(data.get("target_model"))
    if target_model != v2.QUALITY_FOUNDATION_MODEL:
        raise ValueError("AVANTIQO_IMAGE_MODEL_CACHE_TARGET_FORBIDDEN")

    transport = v2._cache_transport_state()
    storage = v2._cache_storage_state(target_model)
    if not transport["xet_disabled"]:
        raise RuntimeError("AVANTIQO_IMAGE_CACHE_XET_DISABLE_NOT_EFFECTIVE")

    readiness = _quality_cache_readiness()
    if readiness["cache_ready"]:
        return {
            "status": "completed",
            "provider": "avantiqo-image",
            "model": v2.legacy.PRODUCT_MODEL,
            "engine_contract": v2.legacy.ENGINE_CONTRACT,
            "runtime_revision": QUALITY_RUNTIME_REVISION,
            "operation": v2.MODEL_CACHE_OPERATION,
            "target_model": target_model,
            "foundation_model_source": "runpod-cache",
            "already_cached": True,
            "cache_ready": True,
            "cache_integrity": {
                "contract": CACHE_COMPLETION_CONTRACT,
                "completion_marker_valid": True,
                "missing_required_files": [],
                "snapshot_revision": readiness["snapshot_revision"],
            },
            "cache_transport": transport,
            "cache_storage": storage,
            "inference_performed": False,
            "raw_reasoning_persisted": False,
        }

    if storage["disk_free_bytes"] < storage["required_free_bytes"]:
        inventory = v2._cache_inventory()
        return {
            "status": "completed",
            "provider": "avantiqo-image",
            "model": v2.legacy.PRODUCT_MODEL,
            "engine_contract": v2.legacy.ENGINE_CONTRACT,
            "runtime_revision": QUALITY_RUNTIME_REVISION,
            "operation": v2.MODEL_CACHE_OPERATION,
            "target_model": target_model,
            "foundation_model_source": None,
            "already_cached": False,
            "cache_ready": False,
            "storage_insufficient": True,
            "cache_integrity": {
                "contract": CACHE_COMPLETION_CONTRACT,
                "completion_marker_valid": readiness["completion_marker_valid"],
                "missing_required_files": readiness["missing_required_files"],
                "snapshot_revision": readiness["snapshot_revision"],
            },
            "cache_transport": transport,
            "cache_storage": storage,
            "cache_inventory": inventory,
            "inference_performed": False,
            "raw_reasoning_persisted": False,
        }

    runpod.serverless.progress_update(
        job,
        " ".join(
            [
                f"completing approved Avantiqo Image foundation {target_model}",
                "xet_disabled=true",
                f"max_workers={v2.CACHE_DOWNLOAD_WORKERS}",
                f"missing_required_files={len(readiness['missing_required_files'])}",
                f"free_gib={storage['disk_free_bytes'] / (1024 ** 3):.1f}",
                f"cached_gib={storage['cached_blob_bytes'] / (1024 ** 3):.1f}",
            ]
        ),
    )

    try:
        downloaded = v2.snapshot_download(
            repo_id=target_model,
            cache_dir=str(v2.legacy.HF_CACHE_ROOT),
            local_files_only=False,
            max_workers=v2.CACHE_DOWNLOAD_WORKERS,
            etag_timeout=60,
        )
    except Exception as exc:
        failed_storage = v2._cache_storage_state(target_model)
        failed_readiness = _quality_cache_readiness()
        raise RuntimeError(
            "AVANTIQO_IMAGE_MODEL_CACHE_DOWNLOAD_FAILED:"
            f"{type(exc).__name__}:{_text(exc)}:"
            f"missing_required_files={len(failed_readiness['missing_required_files'])}:"
            f"disk_free_bytes={failed_storage['disk_free_bytes']}:"
            f"cached_blob_bytes={failed_storage['cached_blob_bytes']}"
        ) from exc

    snapshot = Path(downloaded)
    missing_after_download = _missing_required_files(snapshot)
    if missing_after_download:
        raise RuntimeError(
            "AVANTIQO_IMAGE_MODEL_CACHE_INCOMPLETE_AFTER_DOWNLOAD:"
            + "|".join(missing_after_download)
        )

    _write_completion_marker(snapshot)
    final_readiness = _quality_cache_readiness()
    if not final_readiness["cache_ready"]:
        raise RuntimeError(
            "AVANTIQO_IMAGE_MODEL_CACHE_COMPLETION_MARKER_VERIFY_FAILED:"
            f"marker_valid={final_readiness['completion_marker_valid']}:"
            f"missing_required_files={len(final_readiness['missing_required_files'])}"
        )

    final_storage = v2._cache_storage_state(target_model)
    return {
        "status": "completed",
        "provider": "avantiqo-image",
        "model": v2.legacy.PRODUCT_MODEL,
        "engine_contract": v2.legacy.ENGINE_CONTRACT,
        "runtime_revision": QUALITY_RUNTIME_REVISION,
        "operation": v2.MODEL_CACHE_OPERATION,
        "target_model": target_model,
        "foundation_model_source": "runpod-cache",
        "already_cached": False,
        "cache_ready": True,
        "cache_integrity": {
            "contract": CACHE_COMPLETION_CONTRACT,
            "completion_marker_valid": True,
            "missing_required_files": [],
            "snapshot_revision": final_readiness["snapshot_revision"],
        },
        "cache_transport": transport,
        "cache_storage": final_storage,
        "inference_performed": False,
        "raw_reasoning_persisted": False,
    }


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data = job.get("input") or {}
    operation = _text(data.get("operation"))
    if operation == RUNTIME_PROBE_OPERATION:
        return _runtime_probe(job)
    if operation == v2.MODEL_CACHE_OPERATION:
        return _cache_foundation_model(job)

    capability = _text(data.get("capability"))
    requested_foundation = _text(data.get("foundation_model"))
    quality_generation = (
        capability == "ai.image.generate"
        and requested_foundation == v2.QUALITY_FOUNDATION_MODEL
    )
    if quality_generation:
        readiness = _quality_cache_readiness()
        if not readiness["cache_ready"]:
            missing = readiness["missing_required_files"]
            raise RuntimeError(
                "AVANTIQO_IMAGE_2512_CACHE_INCOMPLETE:"
                f"completion_marker_valid={readiness['completion_marker_valid']}:"
                f"missing_required_files={'|'.join(missing) if missing else 'NONE'}"
            )
        prepared, compiler = _compile_quality_job(job)
        output = v2.handler(prepared)
        if isinstance(output, dict):
            output = {**output, "runtime_revision": QUALITY_RUNTIME_REVISION}
            guidance = output.get("generation_guidance") or {}
            output["generation_guidance"] = {
                **guidance,
                "quality_policy": QUALITY_POLICY,
                "quality_compiler_contract": QUALITY_COMPILER_CONTRACT,
            }
            output["quality_compiler"] = compiler
        return output

    return v2.handler(job)


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
