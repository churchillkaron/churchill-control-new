"""Fail-fast zero-GPU cache gate for the Avantiqo investor HQ DFR lane.

The successful investor fast lane already proves the pinned distilled LTX-2.5
base pack is present on the canonical `avantiqo-video-models` Modal Volume.
This gate therefore never downloads base checkpoints. It verifies them and only
fetches the one HQ-specific Pixel Spatial Upscaler IC-LoRA when absent.
"""
from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

import modal

from modal_app import (
    LTX_REQUIRED,
    LTX_SNAPSHOT_ROOT,
    LTX_SOURCE_REVISION,
    MODEL_SECRET_NAME,
    model_volume,
    seed_image,
)

APP_NAME = "avantiqo-investor-hq-cache-v2"
CONTRACT = "AVANTIQO_INVESTOR_HQ_CACHE_GATE_V2"
DISTILLED_TRANSFORMER = "diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors"
SPATIAL_UPSAMPLER = "latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors"
DETAILING_REPO = "Lightricks/LTX-2.5-22b-IC-LoRA-Pixel-Spatial-Upscaler"
DETAILING_FILE = "ltx-2.5-22b-ic-lora-pixel-spatial-upscaler-x2-1.0.safetensors"
DETAILING_ROOT = Path("/models/avantiqo-investor-hq-assets")
DETAILING_PATH = DETAILING_ROOT / DETAILING_FILE
BASE_REQUIRED = (
    DISTILLED_TRANSFORMER,
    LTX_REQUIRED[1],
    LTX_REQUIRED[2],
    LTX_REQUIRED[3],
    SPATIAL_UPSAMPLER,
)

app = modal.App(APP_NAME)


def _base_snapshot() -> Path:
    root = LTX_SNAPSHOT_ROOT / LTX_SOURCE_REVISION
    if not root.is_dir():
        raise RuntimeError(f"{CONTRACT}_PINNED_BASE_MISSING:{LTX_SOURCE_REVISION}")
    missing = [
        relative
        for relative in BASE_REQUIRED
        if not (root / relative).is_file() or (root / relative).stat().st_size <= 0
    ]
    if missing:
        raise RuntimeError(f"{CONTRACT}_BASE_CACHE_INCOMPLETE:" + ",".join(missing))
    return root


@app.function(
    image=seed_image,
    volumes={"/models": model_volume},
    secrets=[modal.Secret.from_name(MODEL_SECRET_NAME)],
    timeout=4 * 60,
    min_containers=0,
    max_containers=1,
    scaledown_window=5,
    retries=0,
)
def verify_and_seed_hq_adapter() -> dict[str, Any]:
    """Verify cached base and fetch only the HQ detailing adapter."""
    os.environ["HF_HUB_ETAG_TIMEOUT"] = "15"
    os.environ["HF_HUB_DOWNLOAD_TIMEOUT"] = "120"
    from huggingface_hub import hf_hub_download

    started = time.perf_counter()
    model_volume.reload()
    root = _base_snapshot()
    print(f"{CONTRACT}_BASE_CACHE=PASS:{root.name}", flush=True)

    already_cached = DETAILING_PATH.is_file() and DETAILING_PATH.stat().st_size > 0
    if not already_cached:
        DETAILING_ROOT.mkdir(parents=True, exist_ok=True)
        print(f"{CONTRACT}_ADAPTER_DOWNLOAD=START:{DETAILING_REPO}/{DETAILING_FILE}", flush=True)
        downloaded = Path(hf_hub_download(
            repo_id=DETAILING_REPO,
            filename=DETAILING_FILE,
            token=os.environ.get("HF_TOKEN") or None,
            local_dir=str(DETAILING_ROOT),
            etag_timeout=15,
        ))
        if downloaded.resolve() != DETAILING_PATH.resolve() or downloaded.stat().st_size <= 0:
            raise RuntimeError(f"{CONTRACT}_ADAPTER_DOWNLOAD_INVALID")
        model_volume.commit()
        model_volume.reload()

    if not DETAILING_PATH.is_file() or DETAILING_PATH.stat().st_size <= 0:
        raise RuntimeError(f"{CONTRACT}_ADAPTER_NOT_READY")

    elapsed = round(time.perf_counter() - started, 3)
    result = {
        "success": True,
        "contract": CONTRACT,
        "revision": root.name,
        "base_checkpoint_downloaded": False,
        "adapter": DETAILING_FILE,
        "adapter_already_cached": already_cached,
        "adapter_size_bytes": DETAILING_PATH.stat().st_size,
        "elapsed_seconds": elapsed,
        "gpu_requested": False,
        "gpu_inference_performed": False,
    }
    print(result, flush=True)
    print(f"{CONTRACT}=PASS", flush=True)
    return result


@app.local_entrypoint()
def main() -> None:
    result = verify_and_seed_hq_adapter.remote()
    if result.get("success") is not True:
        raise RuntimeError(f"{CONTRACT}_FAILED")
