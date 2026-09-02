"""CPU-only persistent model bootstrap for Avantiqo Code.

This module intentionally has no imports from sibling Code certification modules.
It exists so the named Modal Volume can be populated and verified before any H100
certification function is allowed to start.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

import modal

APP_NAME = "avantiqo-code-model-bootstrap"
CONTRACT = "AVANTIQO_CODE_PERSISTENT_MODEL_BOOTSTRAP_V1"
RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8"
MODEL_REVISION = "dcaee4d4dfc5ee71ad501f01f530e5652438fde0"
WORKER_IMAGE = (
    "ghcr.io/churchillkaron/avantiqo-code-worker@"
    "sha256:fa6559a184998d75fb6430ea9fa303fe7b6c1af0da441e61ac4bd587b2bdf3c6"
)
MODEL_VOLUME_NAME = "avantiqo-code-models"
MODEL_MOUNT_ROOT = "/models"
PERSISTENT_HF_ROOT = f"{MODEL_MOUNT_ROOT}/huggingface"
PERSISTENT_HF_CACHE_ROOT = f"{PERSISTENT_HF_ROOT}/hub"
PERSISTENT_VLLM_CACHE_ROOT = f"{MODEL_MOUNT_ROOT}/vllm-cache"
MODEL_MARKER = f"{MODEL_MOUNT_ROOT}/avantiqo-code-model-ready.json"
MODEL_CACHE_DIRNAME = f"models--{RUNTIME_MODEL.replace('/', '--')}"
MODEL_SNAPSHOT_PATH = (
    Path(PERSISTENT_HF_CACHE_ROOT)
    / MODEL_CACHE_DIRNAME
    / "snapshots"
    / MODEL_REVISION
)

app = modal.App(APP_NAME)
model_volume = modal.Volume.from_name(MODEL_VOLUME_NAME, create_if_missing=True)

image = (
    modal.Image.from_registry(
        WORKER_IMAGE,
        add_python=None,
        setup_dockerfile_commands=[
            "RUN command -v python >/dev/null 2>&1 || ln -s \"$(command -v python3)\" /usr/local/bin/python",
            "RUN command -v pip >/dev/null 2>&1 || ln -s \"$(command -v pip3)\" /usr/local/bin/pip",
            "RUN python --version && pip --version",
        ],
    )
    .entrypoint([])
    .env(
        {
            "HF_HOME": PERSISTENT_HF_ROOT,
            "HF_HUB_DISABLE_TELEMETRY": "1",
        }
    )
)


def _marker() -> dict[str, Any] | None:
    marker_path = Path(MODEL_MARKER)
    if not marker_path.is_file() or not MODEL_SNAPSHOT_PATH.is_dir():
        return None
    try:
        data = json.loads(marker_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if data.get("runtime_model") != RUNTIME_MODEL:
        return None
    if data.get("revision") != MODEL_REVISION:
        return None
    if not (MODEL_SNAPSHOT_PATH / "config.json").is_file():
        return None
    if not any(MODEL_SNAPSHOT_PATH.glob("*.safetensors")):
        return None
    return data


@app.function(
    image=image,
    volumes={MODEL_MOUNT_ROOT: model_volume},
    cpu=4.0,
    memory=16384,
    timeout=30 * 60,
)
def ensure_model_volume() -> dict[str, Any]:
    existing = _marker()
    if existing is not None:
        return {
            "contract": CONTRACT,
            "ready": True,
            "reused": True,
            "bootstrapped": False,
            "runtime_model": RUNTIME_MODEL,
            "revision": MODEL_REVISION,
            "model_volume_name": MODEL_VOLUME_NAME,
            "snapshot_path": str(MODEL_SNAPSHOT_PATH),
            "bytes": existing.get("bytes"),
            "files": existing.get("files"),
            "gpu_used": False,
            "production_deploy_performed": False,
        }

    from huggingface_hub import snapshot_download

    Path(PERSISTENT_HF_CACHE_ROOT).mkdir(parents=True, exist_ok=True)
    Path(PERSISTENT_VLLM_CACHE_ROOT).mkdir(parents=True, exist_ok=True)
    resolved = Path(
        snapshot_download(
            repo_id=RUNTIME_MODEL,
            revision=MODEL_REVISION,
            cache_dir=PERSISTENT_HF_CACHE_ROOT,
        )
    )
    if resolved.resolve() != MODEL_SNAPSHOT_PATH.resolve():
        raise RuntimeError(
            f"{CONTRACT}_SNAPSHOT_PATH_INVALID:"
            f"expected={MODEL_SNAPSHOT_PATH}:actual={resolved}"
        )
    if not (MODEL_SNAPSHOT_PATH / "config.json").is_file():
        raise RuntimeError(f"{CONTRACT}_CONFIG_MISSING")
    if not any(MODEL_SNAPSHOT_PATH.glob("*.safetensors")):
        raise RuntimeError(f"{CONTRACT}_SAFETENSORS_MISSING")

    files = [item for item in MODEL_SNAPSHOT_PATH.rglob("*") if item.is_file()]
    marker = {
        "contract": CONTRACT,
        "runtime_model": RUNTIME_MODEL,
        "revision": MODEL_REVISION,
        "source": "huggingface-one-time-volume-bootstrap",
        "snapshot_path": str(MODEL_SNAPSHOT_PATH),
        "files": len(files),
        "bytes": sum(item.stat().st_size for item in files),
        "created_at_epoch_ms": int(time.time() * 1000),
    }
    Path(MODEL_MARKER).write_text(json.dumps(marker, indent=2) + "\n", encoding="utf-8")
    model_volume.commit()

    committed = _marker()
    if committed is None:
        raise RuntimeError(f"{CONTRACT}_COMMIT_NOT_VISIBLE")
    return {
        "contract": CONTRACT,
        "ready": True,
        "reused": False,
        "bootstrapped": True,
        "runtime_model": RUNTIME_MODEL,
        "revision": MODEL_REVISION,
        "model_volume_name": MODEL_VOLUME_NAME,
        "snapshot_path": str(MODEL_SNAPSHOT_PATH),
        "bytes": committed.get("bytes"),
        "files": committed.get("files"),
        "gpu_used": False,
        "production_deploy_performed": False,
    }


@app.local_entrypoint()
def main() -> None:
    result = ensure_model_volume.remote()
    if not isinstance(result, dict) or result.get("ready") is not True:
        raise RuntimeError(f"{CONTRACT}_READY_REQUIRED")
    if result.get("gpu_used") is not False:
        raise RuntimeError(f"{CONTRACT}_GPU_FORBIDDEN")
    if result.get("production_deploy_performed") is not False:
        raise RuntimeError(f"{CONTRACT}_PRODUCTION_DEPLOY_FORBIDDEN")
    print("AVANTIQO_CODE_MODEL_STORAGE=" + json.dumps(result, separators=(",", ":")), flush=True)
    print(f"{CONTRACT}=PASS", flush=True)
