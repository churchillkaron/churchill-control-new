"""Guarded CPU-only Qwen3.8 bootstrap into the existing Avantiqo Code Volume.

The exact Hugging Face snapshot and Xet metadata/cache are written directly to
the mounted persistent Code Volume. No large explicit ephemeral disk is
requested. This preserves the one-storage architecture and avoids paying for or
claiming a second storage surface.

The bootstrap never creates a Volume, starts a GPU, changes production routing,
or overwrites the current Qwen3-Coder readiness marker.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

import modal

import code_model_canary_v2 as policy

APP_NAME = "avantiqo-code-qwen38-bootstrap"
CONTRACT = "AVANTIQO_CODE_QWEN38_BOOTSTRAP_V2"
MODEL_MOUNT_ROOT = "/models"
HF_ROOT = Path(MODEL_MOUNT_ROOT) / "huggingface"
HF_CACHE_ROOT = HF_ROOT / "hub"
HF_XET_CACHE_ROOT = HF_ROOT / "xet"
CURRENT_MARKER = Path(MODEL_MOUNT_ROOT) / "avantiqo-code-model-ready.json"
CANDIDATE_MARKER = Path(MODEL_MOUNT_ROOT) / "avantiqo-code-qwen38-canary-ready.json"
CANDIDATE_CACHE_DIRNAME = f"models--{policy.CANDIDATE_MODEL.replace('/', '--')}"
CANDIDATE_SNAPSHOT = (
    HF_CACHE_ROOT / CANDIDATE_CACHE_DIRNAME / "snapshots" / policy.CANDIDATE_REVISION
)
CANDIDATE_BYTES_BUDGET = 30_900_000_000
APPROVAL_ENV = "AVANTIQO_CODE_QWEN38_BOOTSTRAP_APPROVED"

app = modal.App(APP_NAME)
model_volume = modal.Volume.from_name(policy.CODE_VOLUME, create_if_missing=False)
image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("huggingface_hub==0.35.0")
    .env(
        {
            "HF_HOME": str(HF_ROOT),
            "HF_HUB_CACHE": str(HF_CACHE_ROOT),
            "HF_XET_CACHE": str(HF_XET_CACHE_ROOT),
            "HF_XET_CHUNK_CACHE_SIZE_BYTES": "0",
            "HF_HUB_DISABLE_TELEMETRY": "1",
        }
    )
    .add_local_python_source("code_model_canary_v2")
)


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def _current_model_ready() -> bool:
    marker = _read_json(CURRENT_MARKER)
    return (
        marker.get("runtime_model") == policy.CURRENT_MODEL
        and bool(marker.get("revision"))
    )


def _candidate_ready() -> bool:
    marker = _read_json(CANDIDATE_MARKER)
    return all(
        (
            marker.get("contract") == CONTRACT,
            marker.get("runtime_model") == policy.CANDIDATE_MODEL,
            marker.get("revision") == policy.CANDIDATE_REVISION,
            CANDIDATE_SNAPSHOT.is_dir(),
            (CANDIDATE_SNAPSHOT / "config.json").is_file(),
            any(CANDIDATE_SNAPSHOT.glob("*.safetensors")),
        )
    )


def _mounted_admission_snapshot() -> dict[str, Any]:
    return {
        "candidate_bytes": CANDIDATE_BYTES_BUDGET,
        "candidate_revision": policy.CANDIDATE_REVISION,
        "code_storage_volumes": [policy.CODE_VOLUME],
        "current_model_ready": _current_model_ready(),
        "distributed_volume_storage": True,
        "fixed_capacity_assumption_used": False,
        "direct_to_volume_download": True,
        "explicit_ephemeral_disk_requested": False,
        "inference_requested": False,
        "production_routing_change": False,
        "production_deploy_performed": False,
        "volume_created": False,
    }


@app.function(
    image=image,
    volumes={MODEL_MOUNT_ROOT: model_volume},
    cpu=4.0,
    memory=8192,
    timeout=45 * 60,
)
def bootstrap(approved: bool = False) -> dict[str, Any]:
    if approved is not True:
        raise RuntimeError(f"{CONTRACT}_EXPLICIT_APPROVAL_REQUIRED")

    admission = policy.assert_admitted(_mounted_admission_snapshot())
    if admission.get("single_code_storage") is not True:
        raise RuntimeError(f"{CONTRACT}_SINGLE_CODE_STORAGE_REQUIRED")
    if admission.get("direct_to_volume_download") is not True:
        raise RuntimeError(f"{CONTRACT}_DIRECT_TO_VOLUME_REQUIRED")
    if admission.get("explicit_ephemeral_disk_requested") is not False:
        raise RuntimeError(f"{CONTRACT}_EXPLICIT_EPHEMERAL_DISK_FORBIDDEN")

    current_marker_before = CURRENT_MARKER.read_bytes() if CURRENT_MARKER.is_file() else None
    if current_marker_before is None:
        raise RuntimeError(f"{CONTRACT}_CURRENT_MODEL_MARKER_REQUIRED")

    if _candidate_ready():
        return {
            "contract": CONTRACT,
            "ready": True,
            "bootstrapped": False,
            "cache_reused": True,
            "runtime_model": policy.CANDIDATE_MODEL,
            "revision": policy.CANDIDATE_REVISION,
            "model_volume_name": policy.CODE_VOLUME,
            "direct_to_volume_download": True,
            "explicit_ephemeral_disk_requested": False,
            "gpu_used": False,
            "production_routing_change": False,
            "production_deploy_performed": False,
            "volume_created": False,
            "current_marker_preserved": True,
        }

    from huggingface_hub import snapshot_download

    HF_CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    HF_XET_CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    resolved = Path(
        snapshot_download(
            repo_id=policy.CANDIDATE_MODEL,
            revision=policy.CANDIDATE_REVISION,
            cache_dir=str(HF_CACHE_ROOT),
        )
    )
    if resolved.resolve() != CANDIDATE_SNAPSHOT.resolve():
        raise RuntimeError(
            f"{CONTRACT}_SNAPSHOT_UNEXPECTED:expected={CANDIDATE_SNAPSHOT}:actual={resolved}"
        )
    if not (CANDIDATE_SNAPSHOT / "config.json").is_file():
        raise RuntimeError(f"{CONTRACT}_CONFIG_REQUIRED")
    weights = list(CANDIDATE_SNAPSHOT.glob("*.safetensors"))
    if not weights:
        raise RuntimeError(f"{CONTRACT}_SAFETENSORS_REQUIRED")

    if not CURRENT_MARKER.is_file() or CURRENT_MARKER.read_bytes() != current_marker_before:
        raise RuntimeError(f"{CONTRACT}_CURRENT_MARKER_CHANGED")

    files = [item for item in CANDIDATE_SNAPSHOT.rglob("*") if item.is_file()]
    marker = {
        "contract": CONTRACT,
        "runtime_model": policy.CANDIDATE_MODEL,
        "revision": policy.CANDIDATE_REVISION,
        "source": "huggingface-direct-to-existing-modal-volume-bootstrap",
        "snapshot_path": str(CANDIDATE_SNAPSHOT),
        "files": len(files),
        "bytes": sum(item.stat().st_size for item in files),
        "candidate_bytes_budget": CANDIDATE_BYTES_BUDGET,
        "direct_to_volume_download": True,
        "explicit_ephemeral_disk_requested": False,
        "hf_home": str(HF_ROOT),
        "hf_hub_cache": str(HF_CACHE_ROOT),
        "hf_xet_cache": str(HF_XET_CACHE_ROOT),
        "hf_xet_chunk_cache_size_bytes": 0,
        "distributed_volume_storage": True,
        "fixed_capacity_assumption_used": False,
        "created_at_epoch_ms": int(time.time() * 1000),
        "production_routing_change": False,
        "production_deploy_performed": False,
    }
    CANDIDATE_MARKER.write_text(json.dumps(marker, indent=2) + "\n", encoding="utf-8")
    model_volume.commit()
    if not _candidate_ready():
        raise RuntimeError(f"{CONTRACT}_COMMIT_NOT_VISIBLE")
    if CURRENT_MARKER.read_bytes() != current_marker_before:
        raise RuntimeError(f"{CONTRACT}_CURRENT_MARKER_CHANGED_AFTER_COMMIT")

    return {
        "contract": CONTRACT,
        "ready": True,
        "bootstrapped": True,
        "cache_reused": False,
        "runtime_model": policy.CANDIDATE_MODEL,
        "revision": policy.CANDIDATE_REVISION,
        "model_volume_name": policy.CODE_VOLUME,
        "files": marker["files"],
        "bytes": marker["bytes"],
        "direct_to_volume_download": True,
        "explicit_ephemeral_disk_requested": False,
        "gpu_used": False,
        "production_routing_change": False,
        "production_deploy_performed": False,
        "volume_created": False,
        "current_marker_preserved": True,
    }


@app.local_entrypoint()
def main() -> None:
    if os.environ.get(APPROVAL_ENV) != "YES":
        raise RuntimeError(f"{CONTRACT}_EXPLICIT_APPROVAL_REQUIRED")
    result = bootstrap.remote(approved=True)
    print(
        "AVANTIQO_CODE_QWEN38_BOOTSTRAP_RESULT="
        + json.dumps(result, separators=(",", ":")),
        flush=True,
    )
    if result.get("ready") is not True:
        raise RuntimeError(f"{CONTRACT}_NOT_READY")
    print(f"{CONTRACT}=PASS", flush=True)
