"""Zero-GPU exact Gemma compatibility proof for Avantiqo LTX-2.5 on Modal.

Hugging Face snapshots expose the packed Gemma checkpoint as a symlink whose
resolved Modal Volume blob has no `.safetensors` suffix. LTX uses two separate
single-file checks: GemmaAssets.load and resolve_gemma_weight_paths. Both must
accept the exact pinned blob without copying or mutating model storage.
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
CONTRACT = "AVANTIQO_VIDEO_LTX25_MODAL_GEMMA_COMPAT_GUARD_V3"

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
    """Prove both exact LTX Gemma resolver paths on CPU without storage mutation."""
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
    import ltx_core.text_encoders.gemma as gemma_package
    from ltx_core.text_encoders.gemma import gemma_assets
    from ltx_core.text_encoders.gemma.gemma_assets import GemmaAssets

    original_load = GemmaAssets.load.__func__
    original_resolve = gemma_assets.resolve_gemma_weight_paths

    def exact_path(path: str | Path) -> Path | None:
        candidate = Path(path)
        try:
            candidate_real = candidate.resolve(strict=True)
        except FileNotFoundError:
            return None
        if candidate_real == resolved and candidate_real.is_file():
            return candidate_real
        return None

    def compat_load(cls, path: str | Path):
        candidate_real = exact_path(path)
        if candidate_real is not None:
            return GemmaAssets.from_single_file(resolved)
        return original_load(cls, path)

    def compat_resolve(path: str | Path) -> tuple[str, ...]:
        candidate_real = exact_path(path)
        if candidate_real is not None:
            return (str(candidate_real),)
        return original_resolve(str(path))

    GemmaAssets.load = classmethod(compat_load)
    gemma_assets.resolve_gemma_weight_paths = compat_resolve
    gemma_package.resolve_gemma_weight_paths = compat_resolve

    from ltx_core.text_encoders.gemma.encoders import encoder_configurator
    encoder_configurator.resolve_gemma_weight_paths = compat_resolve

    from ltx_pipelines.utils import blocks
    blocks.resolve_gemma_weight_paths = compat_resolve

    assets = GemmaAssets.load(str(text_encoder))
    model_type = str(assets.config_dict.get("model_type") or "").strip()
    if not model_type:
        raise RuntimeError(f"{CONTRACT}_GEMMA_MODEL_TYPE_REQUIRED")
    if len(assets.weight_paths) != 1 or Path(assets.weight_paths[0]) != resolved:
        raise RuntimeError(f"{CONTRACT}_ASSET_WEIGHT_PATH_INVALID")

    direct_paths = gemma_assets.resolve_gemma_weight_paths(str(text_encoder))
    encoder_paths = encoder_configurator.resolve_gemma_weight_paths(str(text_encoder))
    block_paths = blocks.resolve_gemma_weight_paths(str(text_encoder))
    expected_paths = (str(resolved),)
    if direct_paths != expected_paths or encoder_paths != expected_paths or block_paths != expected_paths:
        raise RuntimeError(f"{CONTRACT}_RESOLVER_PARITY_INVALID")

    gemma_sd_ops, gemma_module_ops = encoder_configurator.get_gemma_ops(str(text_encoder))
    if gemma_sd_ops is None or gemma_module_ops is None:
        raise RuntimeError(f"{CONTRACT}_ENCODER_CONFIGURATOR_OPS_REQUIRED")

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
        "gemma_assets_load_accepted": True,
        "gemma_weight_resolver_accepted": True,
        "encoder_configurator_resolver_accepted": True,
        "pipeline_blocks_resolver_accepted": True,
        "encoder_configurator_get_gemma_ops_accepted": True,
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
