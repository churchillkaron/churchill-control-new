"""Control-plane-only admission probe for the next Avantiqo Code model.

This script uses Modal's Volume API directly. It creates no Function, container,
Image, GPU, or Volume and downloads no model. The tiny App exists only so the
existing `modal run` CI transport can invoke a local entrypoint; no remote
compute is declared or started.
"""

from __future__ import annotations

import json
from typing import Any

import modal

import code_model_canary_v2 as policy

APP_NAME = "avantiqo-code-model-canary-control-plane"
CURRENT_MARKER = "avantiqo-code-model-ready.json"
CANDIDATE_MARKER = "avantiqo-code-qwen38-canary-ready.json"
CANDIDATE_BYTES = 30_900_000_000

app = modal.App(APP_NAME)


def _read_json(volume: modal.Volume, path: str) -> dict[str, Any]:
    try:
        raw = b"".join(volume.read_file(path))
        value = json.loads(raw.decode("utf-8"))
    except Exception:
        return {}
    return value if isinstance(value, dict) else {}


def inspect_control_plane() -> dict[str, Any]:
    volumes = list(modal.Volume.objects.list())
    names = sorted(
        name
        for name in (getattr(volume, "name", None) for volume in volumes)
        if isinstance(name, str) and name
    )
    code_storage_volumes = [name for name in names if name.startswith("avantiqo-code")]
    if policy.CODE_VOLUME not in names:
        current_marker: dict[str, Any] = {}
        candidate_marker: dict[str, Any] = {}
        volume_id = None
    else:
        volume = modal.Volume.from_name(policy.CODE_VOLUME, create_if_missing=False)
        volume.hydrate()
        volume_id = volume.object_id
        current_marker = _read_json(volume, CURRENT_MARKER)
        candidate_marker = _read_json(volume, CANDIDATE_MARKER)

    snapshot = {
        "candidate_bytes": CANDIDATE_BYTES,
        "candidate_revision": policy.CANDIDATE_REVISION,
        "bootstrap_ephemeral_disk_bytes": policy.PLANNED_BOOTSTRAP_EPHEMERAL_DISK_BYTES,
        "code_storage_volumes": code_storage_volumes,
        "current_model_ready": (
            current_marker.get("runtime_model") == policy.CURRENT_MODEL
            and bool(current_marker.get("revision"))
        ),
        "distributed_volume_storage": True,
        "fixed_capacity_assumption_used": False,
        "inference_requested": False,
        "production_routing_change": False,
        "production_deploy_performed": False,
        "volume_created": False,
    }
    report = policy.admit(snapshot)
    report.update(
        {
            "control_plane_only": True,
            "modal_function_created": False,
            "container_started": False,
            "gpu_used": False,
            "model_download_performed": False,
            "volume_created": False,
            "code_volume_id": volume_id,
            "current_model_revision": current_marker.get("revision"),
            "candidate_already_ready": (
                candidate_marker.get("runtime_model") == policy.CANDIDATE_MODEL
                and candidate_marker.get("revision") == policy.CANDIDATE_REVISION
            ),
            "observed_code_storage_volumes": code_storage_volumes,
        }
    )
    return report


def _run() -> None:
    report = inspect_control_plane()
    print(
        "AVANTIQO_CODE_MODEL_CANARY_PREFLIGHT="
        + json.dumps(report, separators=(",", ":"), sort_keys=True),
        flush=True,
    )
    for field in (
        "control_plane_only",
        "gpu_used",
        "model_download_performed",
        "volume_created",
        "production_routing_change",
        "production_deploy_performed",
    ):
        expected = field == "control_plane_only"
        if report.get(field) is not expected:
            raise RuntimeError(f"{policy.CONTRACT}_{field.upper()}_INVALID")
    if report.get("admitted") is not True:
        raise RuntimeError(f"{policy.CONTRACT}_BLOCKED:{report}")
    print(f"{policy.CONTRACT}=PASS", flush=True)


@app.local_entrypoint()
def modal_main() -> None:
    _run()


if __name__ == "__main__":
    _run()
