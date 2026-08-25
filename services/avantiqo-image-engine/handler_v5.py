import os
import shutil
from pathlib import Path
from typing import Any

import runpod

import handler_v4 as v4

v3 = v4.v3
v2 = v4.v2
legacy = v4.legacy

RUNTIME_ENTRYPOINT_REVISION = "AVANTIQO_IMAGE_HANDLER_V5_VOLUME_QUOTA_GUARD_V1"
RUNTIME_REVISION = "AVANTIQO_IMAGE_MULTI_FOUNDATION_VOLUME_QUOTA_GUARD_V1"
NETWORK_VOLUME_ROOT = Path(
    os.getenv("AVANTIQO_IMAGE_NETWORK_VOLUME_ROOT", "/runpod-volume").strip()
    or "/runpod-volume"
)
NETWORK_VOLUME_QUOTA_GB = float(
    os.getenv("AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_GB", "80").strip() or "80"
)
NETWORK_VOLUME_QUOTA_BYTES = int(NETWORK_VOLUME_QUOTA_GB * 1_000_000_000)

if NETWORK_VOLUME_QUOTA_GB < 80:
    raise RuntimeError("AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_BELOW_CANONICAL_MINIMUM")
if not str(legacy.HF_CACHE_ROOT).startswith(str(NETWORK_VOLUME_ROOT)):
    raise RuntimeError("AVANTIQO_IMAGE_HF_CACHE_OUTSIDE_NETWORK_VOLUME_ROOT")


def _volume_content_bytes(path: Path) -> int:
    """Conservatively count real files under the RunPod network-volume mount.

    Hugging Face snapshots mainly contain symlinks to blob storage. Symlinks are
    skipped so the same model bytes are not double-counted. Any ordinary file in
    another Image/Video cache directory is included, making this safer than only
    measuring the Image Hugging Face cache.
    """
    if not path.exists():
        return 0
    total = 0
    for child in path.rglob("*"):
        try:
            if child.is_file() and not child.is_symlink():
                total += child.stat().st_size
        except OSError:
            continue
    return total


def _quota_candidate_storage_state() -> dict[str, Any]:
    NETWORK_VOLUME_ROOT.mkdir(parents=True, exist_ok=True)
    legacy.HF_CACHE_ROOT.mkdir(parents=True, exist_ok=True)

    # statvfs/disk_usage on RunPod network volumes can expose the backing storage
    # filesystem rather than the purchased network-volume quota. Keep it only as
    # diagnostic evidence and never use it for the cache decision.
    backing = shutil.disk_usage(NETWORK_VOLUME_ROOT)
    measured_content_bytes = _volume_content_bytes(NETWORK_VOLUME_ROOT)
    quota_free_bytes = max(0, NETWORK_VOLUME_QUOTA_BYTES - measured_content_bytes)

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
        # Preserve the V4 field names for callers, but make them quota-correct.
        "disk_total_bytes": int(NETWORK_VOLUME_QUOTA_BYTES),
        "disk_used_bytes": int(measured_content_bytes),
        "disk_free_bytes": int(quota_free_bytes),
        "cached_blob_bytes": int(cached_blob_bytes),
        "estimated_remaining_bytes": int(estimated_remaining_bytes),
        "required_free_bytes": int(required_free_bytes),
        "headroom_bytes": int(v4.CACHE_HEADROOM_BYTES),
        "quota_guard_contract": "AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_GUARD_V1",
        "quota_source": "AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_GB",
        "network_volume_root": str(NETWORK_VOLUME_ROOT),
        "network_volume_quota_gb": NETWORK_VOLUME_QUOTA_GB,
        "network_volume_quota_bytes": int(NETWORK_VOLUME_QUOTA_BYTES),
        "measured_network_volume_content_bytes": int(measured_content_bytes),
        "backing_filesystem_total_bytes": int(backing.total),
        "backing_filesystem_used_bytes": int(backing.used),
        "backing_filesystem_free_bytes": int(backing.free),
        "backing_filesystem_capacity_used_for_decision": False,
    }


# V4's capacity probe and cache operation both resolve this function through the
# V4 module namespace. Replace it once, before the serverless handler starts, so
# both read-only inspection and any later approved cache job fail closed against
# the purchased RunPod quota.
v4._candidate_storage_state = _quota_candidate_storage_state
v4.RUNTIME_ENTRYPOINT_REVISION = RUNTIME_ENTRYPOINT_REVISION
v4.RUNTIME_REVISION = RUNTIME_REVISION


def _runtime_probe(job: dict[str, Any]) -> dict[str, Any]:
    output = v4._runtime_probe(job)
    if not isinstance(output, dict):
        raise RuntimeError("AVANTIQO_IMAGE_V5_BASE_PROBE_INVALID")
    storage = output.get("photoreal_candidate", {}).get("storage", {})
    if storage.get("backing_filesystem_capacity_used_for_decision") is not False:
        raise RuntimeError("AVANTIQO_IMAGE_V5_QUOTA_GUARD_NOT_EFFECTIVE")
    return {
        **output,
        "entrypoint": "handler_v5.py",
        "entrypoint_revision": RUNTIME_ENTRYPOINT_REVISION,
        "runtime_revision": RUNTIME_REVISION,
        "volume_quota_guard": {
            "contract": "AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_GUARD_V1",
            "network_volume_root": str(NETWORK_VOLUME_ROOT),
            "network_volume_quota_gb": NETWORK_VOLUME_QUOTA_GB,
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
