"""Scale-to-zero Modal worker for the owned Avantiqo ACE-Step Audio engine.

The existing immutable Audio runtime image contains the exact ACE-Step source but
not its model checkpoints. This Modal image definition bakes the XL Turbo DiT
and 1.7B LM into an immutable image layer at deploy time. No Modal Volume is
created and no inference runs while the image is built.
"""
from __future__ import annotations

import os
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

app = modal.App(APP_NAME)


def _bake_models() -> None:
    from acestep.model_downloader import download_submodel, ensure_lm_model

    checkpoint_dir = Path(CHECKPOINT_DIR)
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    download_submodel(
        MODEL_VARIANT,
        checkpoints_dir=str(checkpoint_dir),
        force=False,
        prefer_source="huggingface",
    )
    lm_ok, lm_status = ensure_lm_model(
        model_name=LM_MODEL,
        checkpoints_dir=str(checkpoint_dir),
        prefer_source="huggingface",
    )
    if not lm_ok:
        raise RuntimeError(f"AVANTIQO_AUDIO_MODAL_LM_BAKE_FAILED:{str(lm_status)[:500]}")
    variant = checkpoint_dir / MODEL_VARIANT
    if not variant.is_dir():
        raise RuntimeError("AVANTIQO_AUDIO_MODAL_DIT_BAKE_MISSING")
    if not any(variant.glob("*.safetensors")):
        raise RuntimeError("AVANTIQO_AUDIO_MODAL_DIT_WEIGHTS_MISSING")
    print(
        "AVANTIQO_AUDIO_MODAL_MODEL_BAKE=PASS modal_volume_created=false inference_performed=false",
        flush=True,
    )


worker_image = (
    modal.Image.from_registry(
        WORKER_IMAGE,
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
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
    })
    .run_function(_bake_models, timeout=2 * 60 * 60)
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
