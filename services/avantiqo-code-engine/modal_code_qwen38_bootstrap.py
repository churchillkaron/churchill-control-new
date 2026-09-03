"""Guarded CPU-only Qwen3.8 bootstrap into the existing Avantiqo Code volume.

This module never creates a volume, never starts a GPU, never changes production
routing, and never overwrites the current Qwen3-Coder readiness marker. A model
download is permitted only after the live single-volume capacity contract passes
again inside the mounted volume and an explicit execution approval environment
variable is present.
"""

from __future__ import annotations

import json
import os
import shutil
import time
from pathlib import Path
from typing import Any

import modal

import code_model_canary_v2 as policy

APP_NAME = "avantiqo-code-qwen38-bootstrap"
CONTRACT = "AVANTIQO_CODE_QWEN38_BOOTSTRAP_V1"
MODEL_MOUNT_ROOT = "/models"
HF_ROOT = Path(MODEL_MOUNT_ROOT) / "huggingface"
HF_CACHE_ROOT = HF_ROOT / "hub"
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
image = modal.Image.debian_slim(python_version="3.12").pip_install(
    "huggingface_hub==0.35.0"
)


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


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


def _capacity_snapshot() -> dict[str, Any]:
    usage = shutil.disk_usage(MODEL_MOUNT_ROOT)
    current_marker = _read_json(CURRENT_MARKER)
    return {
        "candidate_bytes": CANDIDATE_BYTES_BUDGET,
        "candidate_revision": policy.CANDIDATE_REVISION,
        "code_volume_free_bytes": int(usage.free),
        "code_storage_volumes": [policy.CODE_VOLUME],
        "current_model_ready": (
            current_marker.get("runtime_model") == policy.CURRENT_MODEL
            and bool(current_marker.get("revision"))
        ),
        "inference_requested": False,
        "production_routing_change": False,
        "production_deploy_performed": False,
    }


@app.function(
    image=image,
    volumes={MODEL_MOUNT_ROOT: model_volume},
    cpu=1.0,
    memory=1024,
    timeout=5 * 60,
)
def inspect() -> dict[str, Any]:
    snapshot = _capacity_snapshot()
    report = policy.admit(snapshot)
    report.update(
        {
            "contract": CONTRACT,
            "candidate_ready": _candidate_ready(),
            "gpu_used": False,
            "download_performed": False,
            "volume_created": False,
            "current_marker_preserved": CURRENT_MARKER.is_file(),
        }
    )
    return report


@app.function(
    image=image,
    volumes={MODEL_MOUNT_ROOT: model_volume},
    cpu=4.0,
    memory=8192,
    timeout=45 * 60,
)
def bootstrap() -> dict[str, Any]:
    if os.environ.get(APPROVAL_ENV) != "YES":
        raise RuntimeError(f"{CONTRACT}_EXPLICIT_APPROVAL_REQUIRED")

    if _candidate_ready():
        return {
            "contract": CONTRACT,
            "ready": True,
            "bootstrapped": False,
            "cache_reused": True,
            "runtime_model": policy.CANDIDATE_MODEL,
            "revision": policy.CANDIDATE_REVISION,
            "model_volume_name": policy.CODE_VOLUME,
            "gpu_used": False,
            "production_routing_change": False,
            "production_deploy_performed": False,
            "volume_created": False,
        }

    admission = policy.assert_admitted(_capacity_snapshot())
    free_before = int(admission["code_volume_free_bytes"])
    current_marker_before = CURRENT_MARKER.read_bytes() if CURRENT_MARKER.is_file() else None

    from huggingface_hub import snapshot_download

    HF_CACHE_ROOT.mkdir(parents=True, exist_ok=True)
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

    usage_after = shutil.disk_usage(MODEL_MOUNT_ROOT)
    if int(usage_after.free) < policy.MIN_FREE_AFTER_DOWNLOAD_BYTES:
        raise RuntimeError(
            f"{CONTRACT}_FREE_SPACE_FLOOR_BREACHED:free={usage_after.free}:"
            f"minimum={policy.MIN_FREE_AFTER_DOWNLOAD_BYTES}"
        )

    if current_marker_before is not None:
        if not CURRENT_MARKER.is_file() or CURRENT_MARKER.read_bytes() != current_marker_before:
            raise RuntimeError(f"{CONTRACT}_CURRENT_MARKER_CHANGED")

    files = [item for item in CANDIDATE_SNAPSHOT.rglob("*") if item.is_file()]
    marker = {
        "contract": CONTRACT,
        "runtime_model": policy.CANDIDATE_MODEL,
        "revision": policy.CANDIDATE_REVISION,
        "source": "huggingface-guarded-same-volume-bootstrap",
        "snapshot_path": str(CANDIDATE_SNAPSHOT),
        "files": len(files),
        "bytes": sum(item.stat().st_size for item in files),
        "free_bytes_before": free_before,
        "free_bytes_after": int(usage_after.free),
        "created_at_epoch_ms": int(time.time() * 1000),
        "production_routing_change": False,
        "production_deploy_performed": False,
    }
    CANDIDATE_MARKER.write_text(json.dumps(marker, indent=2) + "\n", encoding="utf-8")
    model_volume.commit()
    if not _candidate_ready():
        raise RuntimeError(f"{CONTRACT}_COMMIT_NOT_VISIBLE")

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
        "free_bytes_after": marker["free_bytes_after"],
        "gpu_used": False,
        "production_routing_change": False,
        "production_deploy_performed": False,
        "volume_created": False,
        "current_marker_preserved": True,
    }


@app.local_entrypoint()
def main() -> None:
    report = inspect.remote()
    print("AVANTIQO_CODE_QWEN38_BOOTSTRAP_INSPECT=" + json.dumps(report, separators=(",", ":")))
    if os.environ.get(APPROVAL_ENV) != "YES":
        print(f"{CONTRACT}=INSPECT_ONLY")
        return
    result = bootstrap.remote()
    print("AVANTIQO_CODE_QWEN38_BOOTSTRAP_RESULT=" + json.dumps(result, separators=(",", ":")))
    if result.get("ready") is not True:
        raise RuntimeError(f"{CONTRACT}_NOT_READY")
    print(f"{CONTRACT}=PASS")
