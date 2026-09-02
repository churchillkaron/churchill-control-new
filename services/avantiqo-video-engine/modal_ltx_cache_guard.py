"""Zero-GPU cache-path repair and validation for Avantiqo LTX-2.5 on Modal.

Hugging Face snapshots normally expose model files as symlinks into hash-named
blob files. The LTX Gemma loader requires a path whose final filename still
ends in `.safetensors`. Some LTX/runtime combinations resolve the HF symlink
before this check, so the hash-named blob is rejected even though the bytes are
correct.

This guard converts the four pinned LTX snapshot entries from symlinks to hard
links to the exact same blob in the same Video Volume. That preserves one copy
of every model byte while retaining the required `.safetensors` filenames.
It then calls the LTX runtime's own GemmaAssets loader on CPU, reproducing the
loader check that must pass before any paid B200 request is allowed.
"""
from __future__ import annotations

import os
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
LTX_REQUIRED = (
    "diffusion_models/ltx-2.5-22b-dev-transformer-bf16.safetensors",
    "text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors",
    "vae/ltx-2.5-video-vae-bf16.safetensors",
    "vae/ltx-2.5-audio-vae-bf16.safetensors",
)
TEXT_ENCODER_RELATIVE = LTX_REQUIRED[1]
CONTRACT = "AVANTIQO_VIDEO_LTX25_MODAL_CACHE_PATH_GUARD_V1"

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


def _hardlink_snapshot_entry(path: Path) -> dict[str, Any]:
    if not path.exists() and not path.is_symlink():
        raise RuntimeError(f"{CONTRACT}_REQUIRED_ENTRY_MISSING:{path.name}")
    if path.suffix != ".safetensors":
        raise RuntimeError(f"{CONTRACT}_SNAPSHOT_SUFFIX_INVALID:{path.name}")

    was_symlink = path.is_symlink()
    resolved = path.resolve(strict=True)
    if not resolved.is_file() or resolved.stat().st_size <= 0:
        raise RuntimeError(f"{CONTRACT}_BLOB_INVALID:{path.name}")

    if was_symlink:
        temp = path.with_name(path.name + ".avantiqo-hardlink-tmp")
        if temp.exists() or temp.is_symlink():
            temp.unlink()
        try:
            os.link(resolved, temp)
        except OSError as exc:
            raise RuntimeError(
                f"{CONTRACT}_HARDLINK_UNSUPPORTED:{path.name}:{exc.errno}:{exc.strerror}"
            ) from exc
        if temp.is_symlink() or not temp.is_file() or temp.suffix != ".avantiqo-hardlink-tmp":
            # The temporary suffix itself is not used by LTX; verify inode identity
            # before atomically replacing the HF symlink with the hard link.
            if temp.exists() or temp.is_symlink():
                temp.unlink()
            raise RuntimeError(f"{CONTRACT}_TEMP_HARDLINK_INVALID:{path.name}")
        if not os.path.samefile(temp, resolved):
            temp.unlink(missing_ok=True)
            raise RuntimeError(f"{CONTRACT}_TEMP_HARDLINK_INODE_MISMATCH:{path.name}")
        os.replace(temp, path)

    if path.is_symlink():
        raise RuntimeError(f"{CONTRACT}_SNAPSHOT_ENTRY_STILL_SYMLINK:{path.name}")
    if path.suffix != ".safetensors":
        raise RuntimeError(f"{CONTRACT}_FINAL_SUFFIX_INVALID:{path.name}")
    if not path.is_file() or path.stat().st_size <= 0:
        raise RuntimeError(f"{CONTRACT}_FINAL_ENTRY_INVALID:{path.name}")
    if not os.path.samefile(path, resolved):
        raise RuntimeError(f"{CONTRACT}_FINAL_HARDLINK_INODE_MISMATCH:{path.name}")

    return {
        "relative": str(path.relative_to(SNAPSHOT_ROOT)),
        "bytes": path.stat().st_size,
        "was_symlink": was_symlink,
        "is_symlink": False,
        "suffix": path.suffix,
        "same_inode_as_hf_blob": True,
        "duplicate_model_bytes_created": False,
    }


@app.function(
    image=worker_image,
    volumes={"/models": model_volume},
    timeout=10 * 60,
)
def repair_and_validate() -> dict[str, Any]:
    """Repair HF snapshot paths and validate the exact LTX Gemma loader on CPU."""
    model_volume.reload()
    if not SNAPSHOT_ROOT.is_dir():
        raise RuntimeError(f"{CONTRACT}_PINNED_SNAPSHOT_MISSING:{LTX_SOURCE_REVISION}")

    entries = [_hardlink_snapshot_entry(SNAPSHOT_ROOT / relative) for relative in LTX_REQUIRED]
    model_volume.commit()

    # Use the exact runtime source and exact loader that failed on the paid B200.
    sys.path[:0] = [
        str(LTX_PIPELINE_ROOT / "packages/ltx-core/src"),
        str(LTX_PIPELINE_ROOT / "packages/ltx-pipelines/src"),
    ]
    from ltx_core.text_encoders.gemma.gemma_assets import GemmaAssets

    text_encoder = SNAPSHOT_ROOT / TEXT_ENCODER_RELATIVE
    assets = GemmaAssets.load(str(text_encoder))
    model_type = str(assets.config_dict.get("model_type") or "").strip()
    if not model_type:
        raise RuntimeError(f"{CONTRACT}_GEMMA_MODEL_TYPE_REQUIRED")
    if not assets.weight_paths:
        raise RuntimeError(f"{CONTRACT}_GEMMA_WEIGHT_PATHS_REQUIRED")

    result = {
        "success": True,
        "contract": CONTRACT,
        "modal_volume": MODEL_VOLUME_NAME,
        "revision": LTX_SOURCE_REVISION,
        "entries": entries,
        "gemma_loader": {
            "accepted": True,
            "source_suffix": text_encoder.suffix,
            "source_is_symlink": text_encoder.is_symlink(),
            "model_type": model_type,
            "weight_path_count": len(assets.weight_paths),
        },
        "gpu_requested": False,
        "gpu_inference_performed": False,
        "duplicate_model_bytes_created": False,
        "production_vercel_deploy_performed": False,
    }
    print(result, flush=True)
    print(f"{CONTRACT}=PASS", flush=True)
    return result


@app.local_entrypoint()
def validate() -> None:
    result = repair_and_validate.remote()
    if result.get("success") is not True:
        raise RuntimeError(f"{CONTRACT}_FAILED")
    print(f"{CONTRACT}_LOCAL=PASS", flush=True)
