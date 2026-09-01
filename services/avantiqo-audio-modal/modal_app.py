"""Scale-to-zero Modal worker for the owned Avantiqo ACE-Step Audio engine.

The certified Audio runtime image contains the exact pinned ACE-Step 1.5 source
but not its model checkpoints. Modal imports that private immutable GHCR image
with an ephemeral registry secret supplied only by the local deployment process,
then bakes the upstream-required main model package plus the certified XL Turbo
DiT into one immutable image layer. No Modal Volume is created and no inference
runs while the image is built. Registry credentials are not attached to the
runtime function.
"""
from __future__ import annotations

import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any

import modal

APP_NAME = "avantiqo-audio-owned"
ENGINE_CONTRACT = "AVANTIQO_AUDIO_ENGINE_V1"
PRODUCT_MODEL = "avantiqo-music-v1"
FOUNDATION_MODEL = "ACE-Step/Ace-Step1.5"
MODEL_VARIANT = "acestep-v15-xl-turbo"
LM_MODEL = "acestep-5Hz-lm-1.7B"
WORKER_IMAGE = (
    "ghcr.io/churchillkaron/avantiqo-audio-worker@"
    "sha256:fe148b123a7c8ce95c639a22abf8f0e918cba5f0e28f71bc4e3fe254c893b56b"
)
CHECKPOINT_DIR = "/opt/ace-step/checkpoints"
GPU = "A10G"
CAPABILITIES = {"ai.music.generate", "ai.audio.remix", "ai.audio.edit"}
MAIN_COMPONENTS = (
    "acestep-v15-turbo",
    "vae",
    "Qwen3-Embedding-0.6B",
    LM_MODEL,
)
_WEIGHT_FILENAMES = (
    "model.safetensors",
    "model.safetensors.index.json",
    "pytorch_model.bin",
    "pytorch_model.bin.index.json",
    "diffusion_pytorch_model.safetensors",
    "diffusion_pytorch_model.safetensors.index.json",
    "diffusion_pytorch_model.bin",
    "diffusion_pytorch_model.bin.index.json",
)

app = modal.App(APP_NAME)


def _private_registry_secret() -> modal.Secret:
    username = str(os.environ.get("AVANTIQO_MODAL_REGISTRY_USERNAME") or "").strip()
    password = str(os.environ.get("AVANTIQO_MODAL_REGISTRY_PASSWORD") or "").strip()
    if not username or not password:
        raise RuntimeError("AVANTIQO_AUDIO_MODAL_PRIVATE_REGISTRY_CREDENTIALS_REQUIRED")
    # Secret.from_dict is anonymous/app-owned in Modal 1.2.6. It is used only by
    # Image.from_registry while importing the private GHCR base image and is not
    # attached to the runtime function below.
    return modal.Secret.from_dict({
        "REGISTRY_USERNAME": username,
        "REGISTRY_PASSWORD": password,
    })


def _assert_nonempty_model(root: Path, model_name: str) -> None:
    model_dir = root / model_name
    if not model_dir.is_dir():
        raise RuntimeError(f"AVANTIQO_AUDIO_MODAL_MODEL_DIRECTORY_MISSING:{model_name}")
    candidates = [model_dir / name for name in _WEIGHT_FILENAMES]
    existing = [path for path in candidates if path.is_file()]
    if not existing:
        raise RuntimeError(f"AVANTIQO_AUDIO_MODAL_MODEL_WEIGHTS_MISSING:{model_name}")
    if any(path.stat().st_size <= 0 for path in existing):
        raise RuntimeError(f"AVANTIQO_AUDIO_MODAL_MODEL_WEIGHT_FILE_EMPTY:{model_name}")


def _bake_models() -> None:
    # The pinned ACE-Step runtime intentionally treats the default 1.7B LM as a
    # component of ACE-Step/Ace-Step1.5, not as a standalone SUBMODEL_REGISTRY
    # entry. Build the exact upstream main package first, then the certified XL
    # Turbo submodel.
    from acestep.model_downloader import (
        check_main_model_exists,
        check_model_exists,
        download_main_model,
        download_submodel,
    )

    sys.path.insert(0, "/app")
    from cache_integrity import missing_sharded_checkpoint_files

    checkpoint_dir = Path(CHECKPOINT_DIR)
    checkpoint_dir.mkdir(parents=True, exist_ok=True)

    main_ok, main_status = download_main_model(
        checkpoints_dir=checkpoint_dir,
        force=False,
        prefer_source="huggingface",
    )
    if not main_ok:
        detail = str(main_status or "UNKNOWN").replace("\n", " ")[:1000]
        raise RuntimeError(f"AVANTIQO_AUDIO_MODAL_MAIN_MODEL_BAKE_FAILED:{detail}")

    dit_ok, dit_status = download_submodel(
        MODEL_VARIANT,
        checkpoints_dir=checkpoint_dir,
        force=False,
        prefer_source="huggingface",
    )
    if not dit_ok:
        detail = str(dit_status or "UNKNOWN").replace("\n", " ")[:1000]
        raise RuntimeError(f"AVANTIQO_AUDIO_MODAL_XL_DIT_BAKE_FAILED:{detail}")

    if not check_main_model_exists(checkpoint_dir):
        raise RuntimeError("AVANTIQO_AUDIO_MODAL_MAIN_MODEL_INCOMPLETE")
    if not check_model_exists(MODEL_VARIANT, checkpoint_dir):
        raise RuntimeError("AVANTIQO_AUDIO_MODAL_XL_DIT_INCOMPLETE")

    for model_name in (*MAIN_COMPONENTS, MODEL_VARIANT):
        _assert_nonempty_model(checkpoint_dir, model_name)
        missing = missing_sharded_checkpoint_files(checkpoint_dir, model_name)
        if missing:
            detail = ",".join(missing[:16])
            raise RuntimeError(
                f"AVANTIQO_AUDIO_MODAL_MODEL_SHARDS_INCOMPLETE:{model_name}:{detail}"
            )

    print(
        "AVANTIQO_AUDIO_MODAL_MODEL_BAKE=PASS "
        "main_model_complete=true xl_dit_complete=true "
        "modal_volume_created=false inference_performed=false "
        "registry_credentials_in_runtime=false",
        flush=True,
    )


# Network access is permitted only for this explicitly approved immutable model
# image build. The private-registry secret is consumed by the image import only.
# Runtime inference is forced offline after the model layer is committed.
worker_image = (
    modal.Image.from_registry(
        WORKER_IMAGE,
        secret=_private_registry_secret(),
        add_python=None,
        setup_dockerfile_commands=[
            "RUN command -v python >/dev/null 2>&1 || ln -s \"$(command -v python3)\" /usr/local/bin/python",
            "RUN command -v pip >/dev/null 2>&1 || ln -s \"$(command -v pip3)\" /usr/local/bin/pip",
        ],
    )
    .entrypoint([])
    .env({
        "AVANTIQO_AUDIO_DEVICE": "cuda",
        "AVANTIQO_AUDIO_MODEL_FAMILY": "ACE_STEP_1_5",
        "AVANTIQO_AUDIO_FOUNDATION_MODEL": FOUNDATION_MODEL,
        "AVANTIQO_AUDIO_MODEL_VARIANT": MODEL_VARIANT,
        "AVANTIQO_AUDIO_LM_MODEL": LM_MODEL,
        "AVANTIQO_AUDIO_LM_BACKEND": "vllm",
        "AVANTIQO_AUDIO_MODEL_SOURCE": "huggingface",
        "ACESTEP_INIT_LLM": "true",
        "HF_HUB_OFFLINE": "0",
        "TRANSFORMERS_OFFLINE": "0",
    })
    .run_function(_bake_models, timeout=2 * 60 * 60)
    .env({
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
    })
)


def _safe(value: Any, depth: int = 0) -> Any:
    if depth > 10:
        return "[depth-limited]"
    if isinstance(value, list):
        return [_safe(item, depth + 1) for item in value]
    if not isinstance(value, dict):
        return value
    private = {
        "reasoning", "reasoning_content", "chain_of_thought", "chainofthought",
        "cot", "thoughts", "scratchpad", "analysis",
    }
    return {
        str(key): _safe(child, depth + 1)
        for key, child in value.items()
        if str(key).lower() not in private
    }


@app.function(
    image=worker_image,
    gpu=GPU,
    timeout=30 * 60,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=5,
)
def generate(data: dict[str, Any]) -> dict[str, Any]:
    os.chdir("/app")
    import handler_v2 as audio_engine

    capability = str(data.get("capability") or "").strip()
    if capability not in CAPABILITIES:
        raise ValueError(f"AVANTIQO_AUDIO_MODAL_CAPABILITY_NOT_IMPLEMENTED:{capability}")
    audio_engine.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
    started = time.perf_counter()
    output = audio_engine.handler({
        "id": f"modal-audio-{uuid.uuid4()}",
        "input": data,
    })
    if not isinstance(output, dict):
        raise RuntimeError("AVANTIQO_AUDIO_MODAL_OUTPUT_OBJECT_REQUIRED")
    result = _safe(output)
    result["infrastructure_provider"] = "MODAL_A10G_ASYNC_V1"
    result["modal_gpu"] = GPU
    result["modal_volume_created"] = False
    result["runpod_inference_performed"] = False
    result["raw_reasoning_persisted"] = False
    result["modal_elapsed_seconds"] = round(time.perf_counter() - started, 3)
    return result
