"""CPU-only bootstrap for the isolated Avantiqo Code Qwen3.8 canary.

This module is intentionally not production routing. It downloads the exactly
pinned candidate into the existing `avantiqo-code-models` Modal Volume only
after the no-download admission contract says the same volume has safe headroom.
It never creates another volume, never uses a GPU, and never replaces the
current production/certification model marker.
"""

from __future__ import annotations

import json
import shutil
import time
from pathlib import Path
from typing import Any

import modal

import code_model_canary_v2 as policy

APP_NAME = "avantiqo-code-model-canary-bootstrap"
CONTRACT = "AVANTIQO_CODE_QWEN38_CANARY_BOOTSTRAP_V1"
MODEL_MOUNT_ROOT = "/models"
HF_CACHE_ROOT = Path(MODEL_MOUNT_ROOT) / "huggingface" / "hub"
CURRENT_MARKER = Path(MODEL_MOUNT_ROOT) / "avantiqo-code-model-ready.json"
CANDIDATE_MARKER = Path(MODEL_MOUNT_ROOT) / "avantiqo-code-qwen38-canary-ready.json"
CANDIDATE_CACHE_DIRNAME = f"models--{policy.CANDIDATE_MODEL.replace('/', '--')}"
CANDIDATE_SNAPSHOT = (
    HF_CACHE_ROOT
    / CANDIDATE_CACHE_DIRNAME
    / "snapshots"
    / policy.CANDIDATE_REVISION
)

app = modal.App(APP_NAME)
model_volume = modal.Volume.from_name(policy.CODE_VOLUME, create_if_missing=False)
image = modal.Image.debian_slim(python_version="3.12").pip_install(
    "huggingface_hub==0.36.0"
)


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def _current_model_intact() -> dict[str, Any]:
    marker = _read_json(CURRENT_MARKER)
    if marker.get("runtime_model") != policy.CURRENT_MODEL:
        raise RuntimeError(f"{CONTRACT}_CURRENT_MODEL_MARKER_INVALID")
    revision = str(marker.get("revision") or "").strip()
    if not revision:
        raise RuntimeError(f"{CONTRACT}_CURRENT_MODEL_REVISION_REQUIRED")
    return marker


def _candidate_ready() -> bool:
    marker = _read_json(CANDIDATE_MARKER)
    return all(
        (
            marker.get("runtime_model") == policy.CANDIDATE_MODEL,
            marker.get("revision") == policy.CANDIDATE_REVISION,
            CANDIDATE_SNAPSHOT.is_dir(),
            (CANDIDATE_SNAPSHOT / "config.json").is_file(),
            any(CANDIDATE_SNAPSHOT.glob("*.safetensors")),
        )
    )


@app.function(
    image=image,
    volumes={MODEL_MOUNT_ROOT: model_volume},
    cpu=4.0,
    memory=8192,
    timeout=30 * 60,
)
def bootstrap() -> dict[str, Any]:
    current_before = _current_model_intact()
    if _candidate_ready():
        return {
            "contract": CONTRACT,
            "ready": True,
            "reused": True,
            "bootstrapped": False,
            "runtime_model": policy.CANDIDATE_MODEL,
            "revision": policy.CANDIDATE_REVISION,
            "model_volume_name": policy.CODE_VOLUME,
            "snapshot_path": str(CANDIDATE_SNAPSHOT),
            "current_model_preserved": _read_json(CURRENT_MARKER) == current_before,
            "gpu_used": False,
            "volume_created": False,
            "production_routing_change": False,
            "production_deploy_performed": False,
        }

    usage_before = shutil.disk_usage(MODEL_MOUNT_ROOT)
    admission = policy.admit(
        {
            "candidate_bytes": 30_900_000_000,
            "candidate_revision": policy.CANDIDATE_REVISION,
            "code_volume_free_bytes": int(usage_before.free),
            "code_storage_volumes": [policy.CODE_VOLUME],
            "current_model_ready": True,
            "current_model_revision": current_before.get("revision"),
            "inference_requested": False,
            "production_routing_change": False,
            "production_deploy_performed": False,
        }
    )
    if admission.get("admitted") is not True:
        raise RuntimeError(f"{CONTRACT}_ZERO_GPU_ADMISSION_REQUIRED:{admission}")

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
            f"{CONTRACT}_SNAPSHOT_PATH_INVALID:expected={CANDIDATE_SNAPSHOT}:actual={resolved}"
        )
    if not (CANDIDATE_SNAPSHOT / "config.json").is_file():
        raise RuntimeError(f"{CONTRACT}_CONFIG_MISSING")
    if not any(CANDIDATE_SNAPSHOT.glob("*.safetensors")):
        raise RuntimeError(f"{CONTRACT}_SAFETENSORS_MISSING")

    files = [item for item in CANDIDATE_SNAPSHOT.rglob("*") if item.is_file()]
    candidate_bytes = sum(item.stat().st_size for item in files)
    marker = {
        "contract": CONTRACT,
        "runtime_model": policy.CANDIDATE_MODEL,
        "revision": policy.CANDIDATE_REVISION,
        "source": "huggingface-isolated-same-volume-canary",
        "snapshot_path": str(CANDIDATE_SNAPSHOT),
        "files": len(files),
        "bytes": candidate_bytes,
        "created_at_epoch_ms": int(time.time() * 1000),
    }
    CANDIDATE_MARKER.write_text(json.dumps(marker, indent=2) + "\n", encoding="utf-8")
    model_volume.commit()

    if not _candidate_ready():
        raise RuntimeError(f"{CONTRACT}_COMMIT_NOT_VISIBLE")
    current_after = _read_json(CURRENT_MARKER)
    if current_after != current_before:
        raise RuntimeError(f"{CONTRACT}_CURRENT_MODEL_MARKER_CHANGED")
    usage_after = shutil.disk_usage(MODEL_MOUNT_ROOT)
    if int(usage_after.free) < policy.MIN_FREE_AFTER_DOWNLOAD_BYTES:
        raise RuntimeError(
            f"{CONTRACT}_FREE_SPACE_SAFETY_VIOLATION:free={usage_after.free}:minimum={policy.MIN_FREE_AFTER_DOWNLOAD_BYTES}"
        )

    return {
        "contract": CONTRACT,
        "ready": True,
        "reused": False,
        "bootstrapped": True,
        "runtime_model": policy.CANDIDATE_MODEL,
        "revision": policy.CANDIDATE_REVISION,
        "model_volume_name": policy.CODE_VOLUME,
        "snapshot_path": str(CANDIDATE_SNAPSHOT),
        "bytes": candidate_bytes,
        "files": len(files),
        "free_bytes_after": int(usage_after.free),
        "current_model_preserved": True,
        "gpu_used": False,
        "volume_created": False,
        "production_routing_change": False,
        "production_deploy_performed": False,
    }


@app.local_entrypoint()
def main() -> None:
    result = bootstrap.remote()
    if not isinstance(result, dict) or result.get("ready") is not True:
        raise RuntimeError(f"{CONTRACT}_READY_REQUIRED")
    for key in (
        "gpu_used",
        "volume_created",
        "production_routing_change",
        "production_deploy_performed",
    ):
        if result.get(key) is not False:
            raise RuntimeError(f"{CONTRACT}_{key.upper()}_FORBIDDEN")
    if result.get("current_model_preserved") is not True:
        raise RuntimeError(f"{CONTRACT}_CURRENT_MODEL_PRESERVATION_REQUIRED")
    print("AVANTIQO_CODE_QWEN38_CANARY_STORAGE=" + json.dumps(result, separators=(",", ":")), flush=True)
    print(f"{CONTRACT}=PASS", flush=True)
