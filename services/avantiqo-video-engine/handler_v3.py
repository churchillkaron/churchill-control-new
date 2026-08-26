import json
import os
from pathlib import Path
from typing import Any

os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

import runpod
from huggingface_hub import snapshot_download

import handler as legacy
import handler_v2 as v2

RUNTIME_ENTRYPOINT = "handler_v3.py"
RUNTIME_ENTRYPOINT_REVISION = "AVANTIQO_VIDEO_HANDLER_V3_WAN22_A14B_DEFAULT_ROUTING_V1"
RUNTIME_REVISION = "AVANTIQO_VIDEO_WAN22_A14B_DEFAULT_ROUTING_CACHE_V1"
DEFAULT_ROUTING_CONTRACT = "AVANTIQO_VIDEO_WAN22_A14B_DEFAULT_GENERATION_ROUTING_V1"
CACHE_OPERATION = "cache_foundation_model"
CACHE_AUTHORIZATION_CONTRACT = "AVANTIQO_VIDEO_WAN22_CACHE_AUTHORIZATION_V1"
CACHE_COMPLETION_CONTRACT = "AVANTIQO_VIDEO_WAN22_CACHE_COMPLETION_V1"
CACHE_COMPLETION_MARKER = ".avantiqo-video-cache-complete.json"
DEFAULT_T2V_MODEL = "Wan-AI/Wan2.2-T2V-A14B-Diffusers"
DEFAULT_I2V_MODEL = "Wan-AI/Wan2.2-I2V-A14B-Diffusers"
CACHE_DOWNLOAD_WORKERS = max(1, min(4, int(os.getenv("AVANTIQO_VIDEO_CACHE_DOWNLOAD_WORKERS", "2"))))
NETWORK_VOLUME_QUOTA_GB = max(0, int(os.getenv("AVANTIQO_VIDEO_NETWORK_VOLUME_QUOTA_GB", "0")))
CACHE_MIN_FREE_BEFORE_DOWNLOAD_BYTES = max(
    130_000_000_000,
    int(os.getenv("AVANTIQO_VIDEO_CACHE_MIN_FREE_BEFORE_DOWNLOAD_BYTES", "145000000000")),
)

legacy.T2V_MODEL = os.getenv("AVANTIQO_VIDEO_T2V_MODEL", DEFAULT_T2V_MODEL).strip() or DEFAULT_T2V_MODEL
legacy.I2V_MODEL = os.getenv("AVANTIQO_VIDEO_I2V_MODEL", DEFAULT_I2V_MODEL).strip() or DEFAULT_I2V_MODEL
_BASE_CACHED_MODEL_PATH = legacy._cached_model_path


def _text(value: Any) -> str:
    return str(value or "").strip()


def _allowed_cache_models() -> set[str]:
    return {DEFAULT_T2V_MODEL, DEFAULT_I2V_MODEL}


def _configured_capabilities() -> list[str]:
    return sorted(v2._configured_capabilities())


def _snapshot_marker(snapshot: Path) -> dict[str, Any] | None:
    marker = snapshot / CACHE_COMPLETION_MARKER
    if not marker.is_file():
        return None
    try:
        parsed = json.loads(marker.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _snapshot_complete(snapshot: Path | None, model_id: str) -> bool:
    if snapshot is None or not snapshot.is_dir() or not (snapshot / "model_index.json").is_file():
        return False
    marker = _snapshot_marker(snapshot)
    return bool(
        marker
        and marker.get("contract") == CACHE_COMPLETION_CONTRACT
        and _text(marker.get("target_model")) == model_id
        and _text(marker.get("snapshot_revision")) == snapshot.name
        and marker.get("snapshot_download_completed") is True
    )


def _base_snapshot(model_id: str) -> Path | None:
    cached_path = _BASE_CACHED_MODEL_PATH(model_id)
    return Path(cached_path) if cached_path else None


def _verified_cached_model_path(model_id: str) -> str | None:
    cached_path = _BASE_CACHED_MODEL_PATH(model_id)
    if model_id not in _allowed_cache_models() or not cached_path:
        return cached_path
    snapshot = Path(cached_path)
    return str(snapshot) if _snapshot_complete(snapshot, model_id) else None


# V2's registered worker fitness check resolves this function dynamically. By
# replacing the lookup before serverless.start(), a partial Wan2.2 snapshot can
# never satisfy the final cached-model fitness contract.
legacy._cached_model_path = _verified_cached_model_path


def _model_cache_state(model_id: str) -> dict[str, Any]:
    base_snapshot = _base_snapshot(model_id)
    verified_path = _verified_cached_model_path(model_id)
    marker = _snapshot_marker(base_snapshot) if base_snapshot else None
    return {
        "model": model_id,
        "cache_ready": bool(verified_path),
        "cache_path_present": bool(base_snapshot),
        "completion_marker_valid": bool(base_snapshot and _snapshot_complete(base_snapshot, model_id)),
        "snapshot_revision": base_snapshot.name if base_snapshot else None,
        "cache_source": "runpod-cache" if verified_path else None,
        "marker_contract": _text(marker.get("contract")) if marker else None,
    }


def _physical_usage(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {
            "root_present": False,
            "physical_bytes": 0,
            "logical_bytes": 0,
            "unique_inode_count": 0,
        }
    physical = 0
    logical = 0
    inode_keys: set[tuple[int, int]] = set()
    for root, directories, files in os.walk(path):
        directories.sort()
        files.sort()
        for name in files:
            candidate = Path(root) / name
            try:
                stat = candidate.stat(follow_symlinks=False)
            except (FileNotFoundError, PermissionError, OSError):
                continue
            key = (int(stat.st_dev), int(stat.st_ino))
            if key in inode_keys:
                continue
            inode_keys.add(key)
            logical += max(0, int(stat.st_size))
            blocks = max(0, int(getattr(stat, "st_blocks", 0)))
            physical += blocks * 512 if blocks else max(0, int(stat.st_size))
    return {
        "root_present": True,
        "physical_bytes": physical,
        "logical_bytes": logical,
        "unique_inode_count": len(inode_keys),
    }


def _filesystem_capacity(path: Path) -> dict[str, Any]:
    existing = path
    while not existing.exists() and existing != existing.parent:
        existing = existing.parent
    try:
        stats = os.statvfs(existing)
    except OSError:
        return {
            "probe_path": str(existing),
            "capacity_bytes": None,
            "available_bytes": None,
        }
    block_size = int(stats.f_frsize or stats.f_bsize or 4096)
    return {
        "probe_path": str(existing),
        "capacity_bytes": int(stats.f_blocks) * block_size,
        "available_bytes": int(stats.f_bavail) * block_size,
    }


def _cache_evidence() -> dict[str, Any]:
    root = Path(legacy.HF_CACHE_ROOT)
    usage = _physical_usage(root)
    configured_quota_bytes = NETWORK_VOLUME_QUOTA_GB * 1_000_000_000 if NETWORK_VOLUME_QUOTA_GB else None
    physical_free_under_quota = (
        max(0, configured_quota_bytes - int(usage["physical_bytes"]))
        if configured_quota_bytes is not None
        else None
    )
    return {
        "contract": "AVANTIQO_VIDEO_CACHE_CAPACITY_EVIDENCE_V1",
        "hf_cache_root": str(root),
        "allocation_decision_basis": "UNIQUE_INODE_ST_BLOCKS_512_WITH_ST_SIZE_FALLBACK",
        "network_volume_quota_gb": NETWORK_VOLUME_QUOTA_GB or None,
        "configured_quota_bytes": configured_quota_bytes,
        "physical_free_bytes_under_configured_quota": physical_free_under_quota,
        "minimum_free_bytes_before_model_download": CACHE_MIN_FREE_BEFORE_DOWNLOAD_BYTES,
        "backing_filesystem_capacity_used_for_quota_decision": False,
        "usage": usage,
        "filesystem_observation_only": _filesystem_capacity(root),
    }


def _runtime_probe() -> dict[str, Any]:
    return {
        "status": "completed",
        "provider": "avantiqo-video",
        "engine_contract": legacy.ENGINE_CONTRACT,
        "operation": "runtime_probe",
        "probe_contract": "AVANTIQO_VIDEO_RUNTIME_PROBE_V1",
        "entrypoint": RUNTIME_ENTRYPOINT,
        "entrypoint_revision": RUNTIME_ENTRYPOINT_REVISION,
        "runtime_revision": RUNTIME_REVISION,
        "default_generation_routing_contract": DEFAULT_ROUTING_CONTRACT,
        "default_generation_routing_enabled": True,
        "configured_text_to_video_foundation": legacy.T2V_MODEL,
        "configured_image_to_video_foundation": legacy.I2V_MODEL,
        "text_to_video_default_foundation": legacy.T2V_MODEL == DEFAULT_T2V_MODEL,
        "image_to_video_default_foundation": legacy.I2V_MODEL == DEFAULT_I2V_MODEL,
        "certified_capabilities": _configured_capabilities(),
        "require_cached_model": legacy.REQUIRE_CACHED_MODEL,
        "foundations": {
            "text_to_video": _model_cache_state(legacy.T2V_MODEL),
            "image_to_video": _model_cache_state(legacy.I2V_MODEL),
        },
        "cache_evidence": _cache_evidence(),
        "generation_requested": False,
        "inference_performed": False,
        "model_download_performed": False,
        "storage_mutation_performed": False,
        "raw_reasoning_persisted": False,
    }


def _inspect_foundation_capacity(data: dict[str, Any]) -> dict[str, Any]:
    target = _text(data.get("target_model"))
    allowed = _allowed_cache_models()
    if target and target not in allowed:
        raise ValueError("AVANTIQO_VIDEO_CAPACITY_TARGET_MODEL_INVALID")
    targets = [target] if target else [legacy.T2V_MODEL, legacy.I2V_MODEL]
    return {
        "status": "completed",
        "provider": "avantiqo-video",
        "engine_contract": legacy.ENGINE_CONTRACT,
        "operation": "inspect_foundation_capacity",
        "runtime_revision": RUNTIME_REVISION,
        "entrypoint_revision": RUNTIME_ENTRYPOINT_REVISION,
        "default_generation_routing_contract": DEFAULT_ROUTING_CONTRACT,
        "target_model": target or None,
        "foundations": [_model_cache_state(model_id) for model_id in targets],
        "cache_evidence": _cache_evidence(),
        "download_requested": False,
        "model_download_performed": False,
        "generation_requested": False,
        "inference_performed": False,
        "storage_mutation_performed": False,
        "raw_reasoning_persisted": False,
    }


def _write_completion_marker(snapshot: Path, model_id: str) -> None:
    payload = {
        "contract": CACHE_COMPLETION_CONTRACT,
        "target_model": model_id,
        "snapshot_revision": snapshot.name,
        "snapshot_download_completed": True,
    }
    marker = snapshot / CACHE_COMPLETION_MARKER
    temporary = snapshot / f"{CACHE_COMPLETION_MARKER}.tmp"
    temporary.write_text(
        json.dumps(payload, separators=(",", ":"), sort_keys=True),
        encoding="utf-8",
    )
    temporary.replace(marker)


def _cache_foundation_model(job: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
    if data.get("contract") != legacy.ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_VIDEO_ENGINE_CONTRACT_INVALID")
    if _text(data.get("operation")) != CACHE_OPERATION:
        raise ValueError("AVANTIQO_VIDEO_CACHE_OPERATION_INVALID")
    if _text(data.get("cache_authorization_contract")) != CACHE_AUTHORIZATION_CONTRACT:
        raise ValueError("AVANTIQO_VIDEO_CACHE_AUTHORIZATION_REQUIRED")
    target = _text(data.get("target_model"))
    if target not in _allowed_cache_models():
        raise ValueError("AVANTIQO_VIDEO_CACHE_TARGET_FORBIDDEN")
    if NETWORK_VOLUME_QUOTA_GB < 400:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_CACHE_400GB_QUOTA_REQUIRED:configured={NETWORK_VOLUME_QUOTA_GB}"
        )

    state_before = _model_cache_state(target)
    evidence_before = _cache_evidence()
    if state_before["cache_ready"]:
        return {
            "status": "completed",
            "provider": "avantiqo-video",
            "engine_contract": legacy.ENGINE_CONTRACT,
            "operation": CACHE_OPERATION,
            "runtime_revision": RUNTIME_REVISION,
            "entrypoint_revision": RUNTIME_ENTRYPOINT_REVISION,
            "target_model": target,
            "already_cached": True,
            "cache_ready": True,
            "cache_completion_contract": CACHE_COMPLETION_CONTRACT,
            "snapshot_revision": state_before["snapshot_revision"],
            "cache_evidence_before": evidence_before,
            "cache_evidence_after": evidence_before,
            "generation_requested": False,
            "inference_performed": False,
            "model_download_performed": False,
            "storage_mutation_performed": False,
            "raw_reasoning_persisted": False,
        }

    physical_free = evidence_before["physical_free_bytes_under_configured_quota"]
    if physical_free is None or physical_free < CACHE_MIN_FREE_BEFORE_DOWNLOAD_BYTES:
        raise RuntimeError(
            "AVANTIQO_VIDEO_CACHE_PHYSICAL_FREE_SPACE_INSUFFICIENT:"
            f"free={physical_free}:required={CACHE_MIN_FREE_BEFORE_DOWNLOAD_BYTES}"
        )

    runpod.serverless.progress_update(job, f"caching Avantiqo Cinema foundation {target}")
    downloaded = snapshot_download(
        repo_id=target,
        cache_dir=str(legacy.HF_CACHE_ROOT),
        local_files_only=False,
        max_workers=CACHE_DOWNLOAD_WORKERS,
        etag_timeout=60,
    )
    snapshot = Path(downloaded)
    if not snapshot.is_dir() or not (snapshot / "model_index.json").is_file():
        raise RuntimeError("AVANTIQO_VIDEO_CACHE_SNAPSHOT_INVALID_AFTER_DOWNLOAD")
    _write_completion_marker(snapshot, target)
    if not _snapshot_complete(snapshot, target):
        raise RuntimeError("AVANTIQO_VIDEO_CACHE_COMPLETION_MARKER_VERIFY_FAILED")

    state_after = _model_cache_state(target)
    evidence_after = _cache_evidence()
    if not state_after["cache_ready"]:
        raise RuntimeError("AVANTIQO_VIDEO_CACHE_NOT_READY_AFTER_DOWNLOAD")

    return {
        "status": "completed",
        "provider": "avantiqo-video",
        "engine_contract": legacy.ENGINE_CONTRACT,
        "operation": CACHE_OPERATION,
        "runtime_revision": RUNTIME_REVISION,
        "entrypoint_revision": RUNTIME_ENTRYPOINT_REVISION,
        "target_model": target,
        "already_cached": False,
        "cache_ready": True,
        "cache_completion_contract": CACHE_COMPLETION_CONTRACT,
        "snapshot_revision": state_after["snapshot_revision"],
        "cache_evidence_before": evidence_before,
        "cache_evidence_after": evidence_after,
        "generation_requested": False,
        "inference_performed": False,
        "model_download_performed": True,
        "storage_mutation_performed": True,
        "raw_reasoning_persisted": False,
    }


def _annotate_generation(output: dict[str, Any], data: dict[str, Any], capability: str) -> dict[str, Any]:
    if capability not in {"ai.video.generate", "ai.video.image_to_video"}:
        return output
    selected = legacy.I2V_MODEL if capability == "ai.video.image_to_video" else legacy.T2V_MODEL
    requested = _text(data.get("foundation_model"))
    output["entrypoint"] = RUNTIME_ENTRYPOINT
    output["entrypoint_revision"] = RUNTIME_ENTRYPOINT_REVISION
    output["runtime_revision"] = RUNTIME_REVISION
    output["default_generation_routing_contract"] = DEFAULT_ROUTING_CONTRACT
    output["default_generation_routing_applied"] = not bool(requested)
    output["foundation_selection"] = {
        "selection_status": "OWNED_DEFAULT_GENERATION_FOUNDATION" if not requested else "OWNED_CONFIGURED_GENERATION_FOUNDATION",
        "selected_foundation": selected,
        "configured_foundation_authoritative": True,
        "request_foundation_override_present": bool(requested),
        "request_foundation_override_applied": False,
        "default_generation_routing_enabled": True,
    }
    return output


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data = job.get("input") or {}
    operation = _text(data.get("operation"))
    if operation == "runtime_probe":
        return _runtime_probe()
    if operation == "inspect_foundation_capacity":
        return _inspect_foundation_capacity(data)
    if operation == CACHE_OPERATION:
        return _cache_foundation_model(job, data)
    capability = _text(data.get("capability"))
    output = v2.handler(job)
    if isinstance(output, dict):
        return _annotate_generation(output, data, capability)
    return output


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
