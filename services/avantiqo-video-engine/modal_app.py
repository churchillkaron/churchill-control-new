"""Scale-to-zero Modal runtime for the owned Avantiqo Cinema Wan 2.2 worker."""
from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path
from typing import Any

import modal

APP_NAME = "avantiqo-video-owned"
ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1"
PRODUCT_MODEL = "avantiqo-cinema-v1"
T2V_MODEL = "Wan-AI/Wan2.2-T2V-A14B-Diffusers"
I2V_MODEL = "Wan-AI/Wan2.2-I2V-A14B-Diffusers"
WORKER_IMAGE = (
    "ghcr.io/churchillkaron/avantiqo-video-worker@"
    "sha256:aa2d31c7d7ea6603f747b27edacc742874e56e62fe71bc09365a64dc1b9362e5"
)
HF_CACHE_ROOT = "/models/huggingface-cache/hub"
MODEL_VOLUME_NAME = "avantiqo-video-models"
MODEL_SECRET_NAME = "huggingface-secret"
CACHE_MARKER = ".avantiqo-video-cache-complete.json"
CACHE_CONTRACT = "AVANTIQO_VIDEO_WAN22_CACHE_COMPLETION_V1"

app = modal.App(APP_NAME)
model_volume = modal.Volume.from_name(MODEL_VOLUME_NAME, create_if_missing=True)
seed_image = modal.Image.debian_slim(python_version="3.12").pip_install("huggingface_hub")


def _write_marker(snapshot: Path, model_id: str) -> None:
    (snapshot / CACHE_MARKER).write_text(json.dumps({
        "contract": CACHE_CONTRACT,
        "target_model": model_id,
        "snapshot_revision": snapshot.name,
        "snapshot_download_completed": True,
        "modal_volume": MODEL_VOLUME_NAME,
    }, separators=(",", ":"), sort_keys=True), encoding="utf-8")


@app.function(
    image=seed_image,
    volumes={"/models": model_volume},
    secrets=[modal.Secret.from_name(MODEL_SECRET_NAME)],
    timeout=2 * 60 * 60,
)
def seed_cache() -> None:
    from huggingface_hub import snapshot_download

    for model_id in (T2V_MODEL, I2V_MODEL):
        resolved = Path(snapshot_download(
            repo_id=model_id,
            cache_dir=HF_CACHE_ROOT,
            token=os.environ.get("HF_TOKEN") or None,
            max_workers=8,
        ))
        if not resolved.is_dir() or not (resolved / "model_index.json").is_file():
            raise RuntimeError(f"AVANTIQO_VIDEO_MODAL_MODEL_SNAPSHOT_INVALID:{model_id}")
        _write_marker(resolved, model_id)
        print(f"AVANTIQO_VIDEO_MODAL_CACHE_READY={model_id}:{resolved.name}", flush=True)
    model_volume.commit()


worker_image = (
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
    .env({
        "AVANTIQO_VIDEO_HF_CACHE_ROOT": HF_CACHE_ROOT,
        "AVANTIQO_VIDEO_T2V_MODEL": T2V_MODEL,
        "AVANTIQO_VIDEO_I2V_MODEL": I2V_MODEL,
        "AVANTIQO_VIDEO_REQUIRE_CACHED_MODEL": "1",
        "AVANTIQO_VIDEO_NETWORK_VOLUME_QUOTA_GB": "400",
        "AVANTIQO_VIDEO_DEVICE": "cuda",
        "AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES": "ai.video.generate,ai.video.image_to_video",
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
    })
)


@app.function(
    image=worker_image,
    gpu="A100-80GB",
    volumes={"/models": model_volume},
    timeout=30 * 60,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=5,
)
def generate(data: dict[str, Any]) -> dict[str, Any]:
    os.chdir("/app")
    import handler_v4 as video_engine

    video_engine.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
    video_engine.v3.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
    video_engine.v3.legacy.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
    started = time.perf_counter()
    output = video_engine.handler({
        "id": f"modal-{uuid.uuid4()}",
        "input": data,
    })
    if not isinstance(output, dict):
        raise RuntimeError("AVANTIQO_VIDEO_MODAL_OUTPUT_OBJECT_REQUIRED")
    result = dict(output)
    result["infrastructure_provider"] = "MODAL"
    result["modal_gpu"] = "A100-80GB"
    result["modal_elapsed_seconds"] = round(time.perf_counter() - started, 3)
    result["runpod_inference_performed"] = False
    result["raw_reasoning_persisted"] = False
    return result
