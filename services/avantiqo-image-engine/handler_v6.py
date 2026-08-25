import os
import shutil
import stat
from pathlib import Path
from typing import Any

import runpod

import handler_v5 as v5

v4 = v5.v4
v3 = v5.v3
v2 = v5.v2
legacy = v5.legacy

RUNTIME_ENTRYPOINT_REVISION = "AVANTIQO_IMAGE_HANDLER_V6_PHYSICAL_VOLUME_USAGE_V1"
RUNTIME_REVISION = "AVANTIQO_IMAGE_MULTI_FOUNDATION_PHYSICAL_VOLUME_USAGE_V1"
PHYSICAL_USAGE_CONTRACT = "AVANTIQO_IMAGE_NETWORK_VOLUME_PHYSICAL_USAGE_V1"
NETWORK_VOLUME_ROOT = v5.NETWORK_VOLUME_ROOT
NETWORK_VOLUME_QUOTA_GB = v5.NETWORK_VOLUME_QUOTA_GB
NETWORK_VOLUME_QUOTA_BYTES = v5.NETWORK_VOLUME_QUOTA_BYTES


def _top_level_name(root: Path, child: Path) -> str:
    try:
        relative = child.relative_to(root)
        return relative.parts[0] if relative.parts else "."
    except ValueError:
        return "UNKNOWN"


def _volume_content_usage(path: Path) -> dict[str, Any]:
    """Measure unique physical allocation below the RunPod network-volume mount.

    V5 intentionally stopped trusting statvfs/disk_usage because RunPod can expose
    the backing storage filesystem rather than the purchased network-volume quota.
    It still summed st_size, however, which is logical file length and can exceed
    physical consumption for sparse files and can double-count hardlinked cache
    content. V6 uses unique inode allocation (st_blocks * 512) when available and
    conservatively falls back to st_size per file when allocation blocks are not
    reported by the mounted filesystem.
    """
    if not path.exists():
        return {
            "logical_bytes": 0,
            "allocated_bytes": 0,
            "unique_file_count": 0,
            "hardlink_duplicate_count": 0,
            "hardlink_duplicate_logical_bytes": 0,
            "allocation_fallback_file_count": 0,
            "top_level": {},
        }

    seen_inodes: set[tuple[int, int]] = set()
    logical_bytes = 0
    allocated_bytes = 0
    unique_file_count = 0
    hardlink_duplicate_count = 0
    hardlink_duplicate_logical_bytes = 0
    allocation_fallback_file_count = 0
    top_level: dict[str, dict[str, int]] = {}

    for child in path.rglob("*"):
        try:
            file_stat = os.lstat(child)
        except OSError:
            continue
        if not stat.S_ISREG(file_stat.st_mode):
            continue

        logical = max(0, int(file_stat.st_size))
        inode_key = None
        if int(getattr(file_stat, "st_ino", 0) or 0) > 0:
            inode_key = (
                int(getattr(file_stat, "st_dev", 0) or 0),
                int(file_stat.st_ino),
            )
        if inode_key is not None and inode_key in seen_inodes:
            hardlink_duplicate_count += 1
            hardlink_duplicate_logical_bytes += logical
            continue
        if inode_key is not None:
            seen_inodes.add(inode_key)

        blocks = int(getattr(file_stat, "st_blocks", 0) or 0)
        if blocks > 0:
            allocated = blocks * 512
        else:
            allocated = logical
            if logical > 0:
                allocation_fallback_file_count += 1

        unique_file_count += 1
        logical_bytes += logical
        allocated_bytes += max(0, allocated)

        top_name = _top_level_name(path, child)
        bucket = top_level.setdefault(
            top_name,
            {
                "logical_bytes": 0,
                "allocated_bytes": 0,
                "unique_file_count": 0,
                "allocation_fallback_file_count": 0,
            },
        )
        bucket["logical_bytes"] += logical
        bucket["allocated_bytes"] += max(0, allocated)
        bucket["unique_file_count"] += 1
        if blocks <= 0 and logical > 0:
            bucket["allocation_fallback_file_count"] += 1

    return {
        "logical_bytes": int(logical_bytes),
        "allocated_bytes": int(allocated_bytes),
        "unique_file_count": int(unique_file_count),
        "hardlink_duplicate_count": int(hardlink_duplicate_count),
        "hardlink_duplicate_logical_bytes": int(hardlink_duplicate_logical_bytes),
        "allocation_fallback_file_count": int(allocation_fallback_file_count),
        "top_level": dict(sorted(top_level.items())),
    }


def _quota_candidate_storage_state() -> dict[str, Any]:
    NETWORK_VOLUME_ROOT.mkdir(parents=True, exist_ok=True)
    legacy.HF_CACHE_ROOT.mkdir(parents=True, exist_ok=True)

    backing = shutil.disk_usage(NETWORK_VOLUME_ROOT)
    usage = _volume_content_usage(NETWORK_VOLUME_ROOT)
    measured_allocated_bytes = int(usage["allocated_bytes"])
    quota_free_bytes = max(0, NETWORK_VOLUME_QUOTA_BYTES - measured_allocated_bytes)

    model_root = (
        legacy.HF_CACHE_ROOT
        / f"models--{v4.PHOTOREAL_FOUNDATION_MODEL.replace('/', '--')}"
    )
    cached_blob_bytes = v2._directory_bytes(model_root / "blobs")
    estimated_remaining_bytes = max(
        0,
        v4.PHOTOREAL_FOUNDATION_MODEL_BYTES - cached_blob_bytes,
    )
    required_free_bytes = estimated_remaining_bytes + v4.CACHE_HEADROOM_BYTES

    return {
        "disk_total_bytes": int(NETWORK_VOLUME_QUOTA_BYTES),
        "disk_used_bytes": measured_allocated_bytes,
        "disk_free_bytes": int(quota_free_bytes),
        "cached_blob_bytes": int(cached_blob_bytes),
        "estimated_remaining_bytes": int(estimated_remaining_bytes),
        "required_free_bytes": int(required_free_bytes),
        "headroom_bytes": int(v4.CACHE_HEADROOM_BYTES),
        "quota_guard_contract": "AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_GUARD_V1",
        "physical_usage_contract": PHYSICAL_USAGE_CONTRACT,
        "quota_source": "AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_GB",
        "network_volume_root": str(NETWORK_VOLUME_ROOT),
        "network_volume_quota_gb": NETWORK_VOLUME_QUOTA_GB,
        "network_volume_quota_bytes": int(NETWORK_VOLUME_QUOTA_BYTES),
        # Preserve the legacy field name for the controller, but it now means
        # physical allocated bytes rather than summed logical file lengths.
        "measured_network_volume_content_bytes": measured_allocated_bytes,
        "measured_network_volume_allocated_bytes": measured_allocated_bytes,
        "measured_network_volume_logical_bytes": int(usage["logical_bytes"]),
        "unique_file_count": int(usage["unique_file_count"]),
        "hardlink_duplicate_count": int(usage["hardlink_duplicate_count"]),
        "hardlink_duplicate_logical_bytes": int(usage["hardlink_duplicate_logical_bytes"]),
        "allocation_fallback_file_count": int(usage["allocation_fallback_file_count"]),
        "logical_minus_allocated_bytes": int(
            max(0, int(usage["logical_bytes"]) - measured_allocated_bytes)
        ),
        "top_level_usage": usage["top_level"],
        "allocation_decision_basis": "UNIQUE_INODE_ST_BLOCKS_512_WITH_ST_SIZE_FALLBACK",
        "backing_filesystem_total_bytes": int(backing.total),
        "backing_filesystem_used_bytes": int(backing.used),
        "backing_filesystem_free_bytes": int(backing.free),
        "backing_filesystem_capacity_used_for_decision": False,
    }


# V4 owns the cache operation. Replace its storage resolver with the V6 physical
# allocation guard before serverless dispatch so both inspection and caching use
# the same quota-safe calculation.
v4._candidate_storage_state = _quota_candidate_storage_state
v4.RUNTIME_ENTRYPOINT_REVISION = RUNTIME_ENTRYPOINT_REVISION
v4.RUNTIME_REVISION = RUNTIME_REVISION


def _runtime_probe(job: dict[str, Any]) -> dict[str, Any]:
    output = v4._runtime_probe(job)
    if not isinstance(output, dict):
        raise RuntimeError("AVANTIQO_IMAGE_V6_BASE_PROBE_INVALID")
    storage = output.get("photoreal_candidate", {}).get("storage", {})
    if storage.get("backing_filesystem_capacity_used_for_decision") is not False:
        raise RuntimeError("AVANTIQO_IMAGE_V6_BACKING_FS_GUARD_NOT_EFFECTIVE")
    if storage.get("physical_usage_contract") != PHYSICAL_USAGE_CONTRACT:
        raise RuntimeError("AVANTIQO_IMAGE_V6_PHYSICAL_USAGE_GUARD_NOT_EFFECTIVE")
    return {
        **output,
        "entrypoint": "handler_v6.py",
        "entrypoint_revision": RUNTIME_ENTRYPOINT_REVISION,
        "runtime_revision": RUNTIME_REVISION,
        "volume_quota_guard": {
            "contract": "AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_GUARD_V1",
            "physical_usage_contract": PHYSICAL_USAGE_CONTRACT,
            "network_volume_root": str(NETWORK_VOLUME_ROOT),
            "network_volume_quota_gb": NETWORK_VOLUME_QUOTA_GB,
            "allocation_decision_basis": "UNIQUE_INODE_ST_BLOCKS_512_WITH_ST_SIZE_FALLBACK",
            "backing_filesystem_capacity_used_for_decision": False,
        },
    }


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data = job.get("input") or {}
    operation = str(data.get("operation") or "").strip()
    if operation == v3.RUNTIME_PROBE_OPERATION:
        return _runtime_probe(job)
    return v4.handler(job)


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
