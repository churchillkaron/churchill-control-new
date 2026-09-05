from __future__ import annotations

import json
import os
from pathlib import Path

import modal

APP_NAME = "avantiqo-investor-cache-recovery"
MODEL_VOLUME_NAME = "avantiqo-video-models"
MODEL_SECRET_NAME = "huggingface-secret"
REPO = "Lightricks/LTX-2.5"
REVISION = "e8dc69fd26150afbfa20351f6bc9ac384257f9fd"
CACHE_DIR = "/models/huggingface-cache/hub"
DETAIL_REPO = "Lightricks/LTX-2.5-22b-IC-LoRA-Pixel-Spatial-Upscaler"
DETAIL_FILE = "ltx-2.5-22b-ic-lora-pixel-spatial-upscaler-x2-1.0.safetensors"
DETAIL_DIR = "/models/avantiqo-investor-hq-assets"
REQUIRED = (
    "diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors",
    "latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors",
)

app = modal.App(APP_NAME)
volume = modal.Volume.from_name(MODEL_VOLUME_NAME, create_if_missing=False)
image = modal.Image.debian_slim(python_version="3.12").pip_install("huggingface_hub==0.35.1")
secret = modal.Secret.from_name(MODEL_SECRET_NAME)


@app.function(
    image=image,
    volumes={"/models": volume},
    secrets=[secret],
    timeout=2 * 60 * 60,
    min_containers=0,
    max_containers=1,
    scaledown_window=5,
    retries=0,
)
def recover() -> dict:
    from huggingface_hub import hf_hub_download

    token = os.environ.get("HF_TOKEN") or None
    volume.reload()
    completed: list[dict] = []

    for filename in REQUIRED:
        expected = Path(CACHE_DIR) / f"models--Lightricks--LTX-2.5/snapshots/{REVISION}" / filename
        if expected.is_file() and expected.stat().st_size > 0:
            print(f"AVANTIQO_CACHE_FILE_ALREADY_READY={filename}:{expected.stat().st_size}", flush=True)
            completed.append({"file": filename, "status": "already_ready", "bytes": expected.stat().st_size})
            continue

        print(f"AVANTIQO_CACHE_FILE_DOWNLOAD_START={filename}", flush=True)
        resolved = Path(
            hf_hub_download(
                repo_id=REPO,
                filename=filename,
                revision=REVISION,
                cache_dir=CACHE_DIR,
                token=token,
                resume_download=True,
            )
        )
        if not resolved.is_file() or resolved.stat().st_size <= 0:
            raise RuntimeError(f"AVANTIQO_CACHE_FILE_INVALID:{filename}:{resolved}")
        volume.commit()
        volume.reload()
        if not expected.is_file() or expected.stat().st_size <= 0:
            raise RuntimeError(f"AVANTIQO_CACHE_FILE_NOT_COMMITTED:{filename}")
        print(f"AVANTIQO_CACHE_FILE_COMMITTED={filename}:{expected.stat().st_size}", flush=True)
        completed.append({"file": filename, "status": "downloaded", "bytes": expected.stat().st_size})

    detail_root = Path(DETAIL_DIR)
    detail_root.mkdir(parents=True, exist_ok=True)
    detail_path = detail_root / DETAIL_FILE
    if not detail_path.is_file() or detail_path.stat().st_size <= 0:
        print(f"AVANTIQO_CACHE_FILE_DOWNLOAD_START={DETAIL_FILE}", flush=True)
        resolved_detail = Path(
            hf_hub_download(
                repo_id=DETAIL_REPO,
                filename=DETAIL_FILE,
                token=token,
                local_dir=DETAIL_DIR,
            )
        )
        if not resolved_detail.is_file() or resolved_detail.stat().st_size <= 0:
            raise RuntimeError(f"AVANTIQO_DETAIL_FILE_INVALID:{resolved_detail}")
        volume.commit()
        volume.reload()
        if not detail_path.is_file() or detail_path.stat().st_size <= 0:
            raise RuntimeError("AVANTIQO_DETAIL_FILE_NOT_COMMITTED")
        print(f"AVANTIQO_CACHE_FILE_COMMITTED={DETAIL_FILE}:{detail_path.stat().st_size}", flush=True)
        completed.append({"file": DETAIL_FILE, "status": "downloaded", "bytes": detail_path.stat().st_size})
    else:
        print(f"AVANTIQO_CACHE_FILE_ALREADY_READY={DETAIL_FILE}:{detail_path.stat().st_size}", flush=True)
        completed.append({"file": DETAIL_FILE, "status": "already_ready", "bytes": detail_path.stat().st_size})

    return {"success": True, "revision": REVISION, "files": completed}


@app.local_entrypoint()
def main():
    result = recover.remote()
    print("AVANTIQO_INVESTOR_CACHE_RECOVERY_RESULT=" + json.dumps(result, sort_keys=True), flush=True)
    if not result.get("success"):
        raise SystemExit(1)
    print("AVANTIQO_INVESTOR_CACHE_RECOVERY=PASS", flush=True)
