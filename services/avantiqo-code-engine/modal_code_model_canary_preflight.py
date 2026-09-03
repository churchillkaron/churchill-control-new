"""CPU-only, no-download admission probe for the next Avantiqo Code model.

This probe mounts the one existing Code volume only to inspect its current
contents and capacity. It performs no model download, no inference, no GPU work
and no production routing/deployment change.

The probe reuses the immutable Code worker image already proven by certification
instead of building a fresh Debian image. This keeps admission latency bounded
and separates storage truth from image-build/provisioning latency.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

import modal

import code_model_canary_v2 as policy

APP_NAME = "avantiqo-code-model-canary-preflight"
MODEL_MOUNT_ROOT = "/models"
CURRENT_MARKER = Path(MODEL_MOUNT_ROOT) / "avantiqo-code-model-ready.json"
CANDIDATE_BYTES = 30_900_000_000
WORKER_IMAGE = (
    "ghcr.io/churchillkaron/avantiqo-code-worker@"
    "sha256:fa6559a184998d75fb6430ea9fa303fe7b6c1af0da441e61ac4bd587b2bdf3c6"
)

app = modal.App(APP_NAME)
model_volume = modal.Volume.from_name(policy.CODE_VOLUME, create_if_missing=False)
image = modal.Image.from_registry(WORKER_IMAGE, add_python=None).entrypoint([])


@app.function(
    image=image,
    volumes={MODEL_MOUNT_ROOT: model_volume},
    cpu=1.0,
    memory=512,
    timeout=3 * 60,
)
def inspect() -> dict[str, Any]:
    marker: dict[str, Any] = {}
    if CURRENT_MARKER.is_file():
        try:
            marker = json.loads(CURRENT_MARKER.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            marker = {}

    usage = shutil.disk_usage(MODEL_MOUNT_ROOT)
    snapshot = {
        "candidate_bytes": CANDIDATE_BYTES,
        "candidate_revision": policy.CANDIDATE_REVISION,
        "code_volume_free_bytes": int(usage.free),
        "code_volume_total_bytes": int(usage.total),
        "code_volume_used_bytes": int(usage.used),
        "code_storage_volumes": [policy.CODE_VOLUME],
        "current_model_ready": (
            marker.get("runtime_model") == policy.CURRENT_MODEL
            and bool(marker.get("revision"))
        ),
        "current_model_revision": marker.get("revision"),
        "inference_requested": False,
        "production_routing_change": False,
        "production_deploy_performed": False,
    }
    report = policy.admit(snapshot)
    report.update(
        {
            "gpu_used": False,
            "model_download_performed": False,
            "volume_created": False,
            "probe_image": WORKER_IMAGE,
            "volume_total_bytes": int(usage.total),
            "volume_used_bytes": int(usage.used),
        }
    )
    return report


@app.local_entrypoint()
def main() -> None:
    report = inspect.remote()
    if not isinstance(report, dict):
        raise RuntimeError(f"{policy.CONTRACT}_REPORT_REQUIRED")
    if report.get("gpu_used") is not False:
        raise RuntimeError(f"{policy.CONTRACT}_GPU_FORBIDDEN")
    if report.get("model_download_performed") is not False:
        raise RuntimeError(f"{policy.CONTRACT}_DOWNLOAD_FORBIDDEN")
    if report.get("volume_created") is not False:
        raise RuntimeError(f"{policy.CONTRACT}_NEW_VOLUME_FORBIDDEN")
    print(
        "AVANTIQO_CODE_MODEL_CANARY_PREFLIGHT="
        + json.dumps(report, separators=(",", ":")),
        flush=True,
    )
    if report.get("admitted") is True:
        print(f"{policy.CONTRACT}=PASS", flush=True)
    else:
        print(f"{policy.CONTRACT}=BLOCKED", flush=True)
