"""Zero-GPU exact Gemma compatibility proof for Avantiqo LTX-2.5 on Modal.

Hugging Face snapshots expose the packed Gemma checkpoint as a symlink whose
resolved Modal Volume blob has no `.safetensors` suffix. LTX's GemmaAssets.load
rejects that resolved filename even though the bytes are the exact checkpoint.

The production worker therefore permits one narrowly-scoped compatibility path:
only the exact resolved blob behind the pinned Gemma snapshot entry may bypass
that suffix gate and be opened by GemmaAssets.from_single_file. This guard uses
the same LTX runtime image and proves that exact operation on CPU. It does not
copy, rename, hardlink, or otherwise mutate model bytes.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import modal

APP_NAME = "avantiqo-video-ltx25-cache-guard"
MODEL_VOLUME_NAME = "avantiqo-video-models"
LTX_SOURCE_REVISION = "e8dc69fd26150afbfa20351f6bc9ac384257f9fd"
HF_CACHE_ROOT = Path("/models/huggingface-cache/hub")
SNAPSHOT_ROOT = HF_CACHE_ROOT / "models--Lightricks--LTX-2.5" / "snapshots" / LTX_SOURCE_REVISION
LTX_RUNTIME_IMAGE = (
    "ghcr.io/churchillkaron/avantiqo-video-ltx25-fast-runtime@"
    "sha256:8bbfb6a41849d2ce6f22b4d023859f08fb4a6de652a173a82682e3a3132f1ee6"
)
LTX_PIPELINE_ROOT = Path("/opt/LTX-2")
TEXT_ENCODER_RELATIVE = "text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors"
CONTRACT = "AVANTIQO_VIDEO_LTX25_MODAL_GEMMA_COMPAT_GUARD_V2"

app = modal.App(APP_NAME)
model_volume = modal.Volume.from_name(MODEL_VOLUME_NAME, create_if_missing=False)
worker_image = (
    modal.Image.from_registry(LTX_RUNTIME_IMAGE, add_python=None)
    .entrypoint([])
    .env({
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
    })
)


@app.function(
    image=worker_image,
    volumes={"/models": model_volume},
    timeout=10 * 60,
)
def validate_exact_gemma_compat() -> dict[str, Any]:
    """Prove the exact pinned Gemma blob loads without changing model storage."""
    model_volume.reload()
    if not SNAPSHOT_ROOT.is_dir():
        raise RuntimeError(f"{CONTRACT}_PINNED_SNAPSHOT_MISSING:{LTX_SOURCE_REVISION}")

    text_encoder = SNAPSHOT_ROOT / TEXT_ENCODER_RELATIVE
    if text_encoder.suffix != ".safetensors":
        raise RuntimeError(f"{CONTRACT}_SNAPSHOT_SUFFIX_INVALID")
    if not text_encoder.is_file() or text_encoder.stat().st_size <= 0:
        raise RuntimeError(f"{CONTRACT}_SNAPSHOT_ENTRY_INVALID")

    resolved = text_encoder.resolve(strict=True)
    if not resolved.is_file() or resolved.stat().st_size <= 0:
        raise RuntimeError(f"{CONTRACT}_RESOLVED_BLOB_INVALID")
    if resolved == text_encoder:
        raise RuntimeError(f"{CONTRACT}_EXPECTED_MODAL_HF_INDIRECTION_MISSING")

    sys.path[:0] = [
        str(LTX_PIPELINE_ROOT / "packages/ltx-core/src"),
        str(LTX_PIPELINE_ROOT / "packages/ltx-pipelines/src"),
    ]
    from ltx_core.text_encoders.gemma.gemma_assets import GemmaAssets

    # This is the exact storage-neutral compatibility operation used by the GPU
    # worker after verifying that the resolved path belongs to this pinned entry.
    assets = GemmaAssets.from_single_file(resolved)
    model_type = str(assets.config_dict.get("model_type") or "").strip()
    if not model_type:
        raise RuntimeError(f"{CONTRACT}_GEMMA_MODEL_TYPE_REQUIRED")
    if len(assets.weight_paths) != 1:
        raise RuntimeError(f"{CONTRACT}_GEMMA_SINGLE_WEIGHT_PATH_REQUIRED")

    result = {
        "success": True,
        "contract": CONTRACT,
        "modal_volume": MODEL_VOLUME_NAME,
        "revision": LTX_SOURCE_REVISION,
        "snapshot_relative": TEXT_ENCODER_RELATIVE,
        "snapshot_suffix": text_encoder.suffix,
        "snapshot_is_symlink": text_encoder.is_symlink(),
        "resolved_blob_is_file": True,
        "resolved_blob_suffix": resolved.suffix,
        "compat_loader": "GemmaAssets.from_single_file",
        "compat_loader_accepted": True,
        "model_type": model_type,
        "weight_path_count": len(assets.weight_paths),
        "model_storage_mutated": False,
        "duplicate_model_bytes_created": False,
        "hardlink_created": False,
        "copy_created": False,
        "gpu_requested": False,
        "gpu_inference_performed": False,
        "production_vercel_deploy_performed": False,
    }
    print(result, flush=True)
    print(f"{CONTRACT}=PASS", flush=True)
    return result


@app.local_entrypoint()
def validate() -> None:
    result = validate_exact_gemma_compat.remote()
    if result.get("success") is not True:
        raise RuntimeError(f"{CONTRACT}_FAILED")
    print(f"{CONTRACT}_LOCAL=PASS", flush=True)
