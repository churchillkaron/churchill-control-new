import os
from pathlib import Path
from typing import Any

import runpod

import handler as legacy
import handler_v2 as v2

RUNTIME_ENTRYPOINT = "handler_v3.py"
RUNTIME_ENTRYPOINT_REVISION = "AVANTIQO_VIDEO_HANDLER_V3_WAN22_A14B_DEFAULT_ROUTING_V1"
RUNTIME_REVISION = "AVANTIQO_VIDEO_WAN22_A14B_DEFAULT_ROUTING_CACHE_V1"
DEFAULT_ROUTING_CONTRACT = "AVANTIQO_VIDEO_WAN22_A14B_DEFAULT_GENERATION_ROUTING_V1"
DEFAULT_T2V_MODEL = "Wan-AI/Wan2.2-T2V-A14B-Diffusers"
DEFAULT_I2V_MODEL = "Wan-AI/Wan2.2-I2V-A14B-Diffusers"

legacy.T2V_MODEL = os.getenv("AVANTIQO_VIDEO_T2V_MODEL", DEFAULT_T2V_MODEL).strip() or DEFAULT_T2V_MODEL
legacy.I2V_MODEL = os.getenv("AVANTIQO_VIDEO_I2V_MODEL", DEFAULT_I2V_MODEL).strip() or DEFAULT_I2V_MODEL


def _text(value: Any) -> str:
    return str(value or "").strip()


def _configured_capabilities() -> list[str]:
    return sorted(v2._configured_capabilities())


def _model_cache_state(model_id: str) -> dict[str, Any]:
    cached_path = legacy._cached_model_path(model_id)
    return {
        "model": model_id,
        "cache_ready": bool(cached_path),
        "cache_path_present": bool(cached_path),
        "cache_source": "runpod-cache" if cached_path else None,
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
    return {
        "contract": "AVANTIQO_VIDEO_CACHE_CAPACITY_EVIDENCE_V1",
        "hf_cache_root": str(root),
        "allocation_decision_basis": "UNIQUE_INODE_ST_BLOCKS_512_WITH_ST_SIZE_FALLBACK",
        "usage": _physical_usage(root),
        "filesystem": _filesystem_capacity(root),
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
    allowed = {legacy.T2V_MODEL, legacy.I2V_MODEL}
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
    capability = _text(data.get("capability"))
    output = v2.handler(job)
    if isinstance(output, dict):
        return _annotate_generation(output, data, capability)
    return output


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
