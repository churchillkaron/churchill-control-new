"""One-purpose CPU seed for the Avantiqo investor HQ detailing adapter.

No base checkpoint download, no GPU, no inference. This exists only to place the
official LTX-2.5 Pixel Spatial Upscaler IC-LoRA on the canonical Video Modal
Volume, then explicitly commit it.
"""
from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

import modal

MODEL_VOLUME_NAME = "avantiqo-video-models"
MODEL_SECRET_NAME = "huggingface-secret"
DETAILING_REPO = "Lightricks/LTX-2.5-22b-IC-LoRA-Pixel-Spatial-Upscaler"
DETAILING_FILE = "ltx-2.5-22b-ic-lora-pixel-spatial-upscaler-x2-1.0.safetensors"
DETAILING_ROOT = Path("/models/avantiqo-investor-hq-assets")
DETAILING_PATH = DETAILING_ROOT / DETAILING_FILE
CONTRACT = "AVANTIQO_INVESTOR_HQ_ADAPTER_SEED_V1"

app = modal.App("avantiqo-investor-hq-adapter-seed")
model_volume = modal.Volume.from_name(MODEL_VOLUME_NAME, create_if_missing=False)
image = modal.Image.debian_slim(python_version="3.12").pip_install("huggingface_hub")


@app.function(
    image=image,
    volumes={"/models": model_volume},
    secrets=[modal.Secret.from_name(MODEL_SECRET_NAME)],
    timeout=180,
    min_containers=0,
    max_containers=1,
    retries=0,
)
def seed_adapter() -> dict[str, Any]:
    from huggingface_hub import hf_hub_download

    started = time.perf_counter()
    DETAILING_ROOT.mkdir(parents=True, exist_ok=True)
    existing = DETAILING_PATH.is_file() and DETAILING_PATH.stat().st_size > 0
    if not existing:
        downloaded = Path(hf_hub_download(
            repo_id=DETAILING_REPO,
            filename=DETAILING_FILE,
            token=os.environ.get("HF_TOKEN") or None,
            local_dir=str(DETAILING_ROOT),
            etag_timeout=15,
        ))
        if downloaded.resolve() != DETAILING_PATH.resolve():
            raise RuntimeError(f"{CONTRACT}_PATH_INVALID:{downloaded}")
    if not DETAILING_PATH.is_file() or DETAILING_PATH.stat().st_size <= 0:
        raise RuntimeError(f"{CONTRACT}_FILE_INVALID")

    model_volume.commit()
    size = DETAILING_PATH.stat().st_size
    result = {
        "success": True,
        "contract": CONTRACT,
        "adapter": DETAILING_FILE,
        "adapter_size_bytes": size,
        "already_cached": existing,
        "base_checkpoint_downloaded": False,
        "gpu_requested": False,
        "gpu_inference_performed": False,
        "elapsed_seconds": round(time.perf_counter() - started, 3),
    }
    print(result, flush=True)
    print(f"{CONTRACT}=PASS", flush=True)
    return result
