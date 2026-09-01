"""Scale-to-zero Modal workers for the owned Avantiqo Voice engines.

The certified STT and TTS images already contain their model snapshots. Modal
therefore needs no persistent model Volume and no cache-seeding job. Each
capability has its own one-container A10G function and reuses the exact
source-owned handler contract; only RunPod progress telemetry is disabled.
"""
from __future__ import annotations

import os
import time
import uuid
from typing import Any

import modal

APP_NAME = "avantiqo-voice-owned"
ENGINE_CONTRACT = "AVANTIQO_VOICE_ENGINE_V1"
STT_CAPABILITY = "ai.speech.to.text"
TTS_CAPABILITY = "ai.text.to.speech"
STT_PRODUCT_MODEL = "avantiqo-voice-stt-v1"
TTS_PRODUCT_MODEL = "avantiqo-voice-tts-v2"
STT_FOUNDATION_MODEL = "openai/whisper-large-v3-turbo"
TTS_FOUNDATION_MODEL = "resemble-ai/chatterbox:multilingual-v3"
STT_IMAGE = (
    "ghcr.io/churchillkaron/avantiqo-voice-stt-worker@"
    "sha256:56764563a8c19eed1cfcf4b13cdee18d93217fef5ccbcf61e5e1d72330b2e625"
)
TTS_IMAGE = (
    "ghcr.io/churchillkaron/avantiqo-voice-tts-worker@"
    "sha256:f0919a82eeadb36ea8a0fdf79815f52942d99d13f075ec6cd7f523fe79344221"
)
GPU = "A10G"

app = modal.App(APP_NAME)


def _worker_image(reference: str) -> modal.Image:
    return (
        modal.Image.from_registry(
            reference,
            add_python=None,
            setup_dockerfile_commands=[
                "RUN command -v python >/dev/null 2>&1 || ln -s \"$(command -v python3)\" /usr/local/bin/python",
                "RUN command -v pip >/dev/null 2>&1 || ln -s \"$(command -v pip3)\" /usr/local/bin/pip",
                "RUN python --version && pip --version",
            ],
        )
        .entrypoint([])
    )


stt_image = _worker_image(STT_IMAGE).env({
    "AVANTIQO_VOICE_STT_FOUNDATION_MODEL": STT_FOUNDATION_MODEL,
    "HF_HUB_OFFLINE": "1",
    "TRANSFORMERS_OFFLINE": "1",
})
tts_image = _worker_image(TTS_IMAGE).env({
    "AVANTIQO_VOICE_TTS_FOUNDATION_MODEL": TTS_FOUNDATION_MODEL,
    "AVANTIQO_VOICE_TTS_DEVICE": "cuda",
    "HF_HUB_OFFLINE": "1",
    "TRANSFORMERS_OFFLINE": "1",
})


def _safe_output(output: Any, *, capability: str, product_model: str) -> dict[str, Any]:
    if not isinstance(output, dict):
        raise RuntimeError("AVANTIQO_VOICE_MODAL_OUTPUT_OBJECT_REQUIRED")
    result = dict(output)
    if str(result.get("status") or "").strip() != "completed":
        raise RuntimeError("AVANTIQO_VOICE_MODAL_COMPLETED_STATUS_REQUIRED")
    if str(result.get("provider") or "").strip() != "avantiqo-voice":
        raise RuntimeError("AVANTIQO_VOICE_MODAL_PROVIDER_CONTRACT_INVALID")
    if str(result.get("engine_contract") or "").strip() != ENGINE_CONTRACT:
        raise RuntimeError("AVANTIQO_VOICE_MODAL_ENGINE_CONTRACT_INVALID")
    if str(result.get("capability") or "").strip() != capability:
        raise RuntimeError("AVANTIQO_VOICE_MODAL_CAPABILITY_CONTRACT_INVALID")
    if str(result.get("model") or "").strip() != product_model:
        raise RuntimeError("AVANTIQO_VOICE_MODAL_PRODUCT_MODEL_INVALID")
    if result.get("raw_reasoning_persisted") is not False:
        raise RuntimeError("AVANTIQO_VOICE_MODAL_REASONING_BOUNDARY_INVALID")
    result["infrastructure_provider"] = "MODAL_A10G_ASYNC_V1"
    result["modal_gpu"] = GPU
    result["modal_volume_created"] = False
    result["runpod_inference_performed"] = False
    result["raw_reasoning_persisted"] = False
    return result


@app.function(
    image=stt_image,
    gpu=GPU,
    timeout=15 * 60,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=5,
)
def transcribe(data: dict[str, Any]) -> dict[str, Any]:
    """Execute one governed STT request on the certified Whisper image."""
    os.chdir("/app")
    import handler as voice_engine

    voice_engine.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
    started = time.perf_counter()
    output = voice_engine.handler({
        "id": f"modal-stt-{uuid.uuid4()}",
        "input": data,
    })
    result = _safe_output(
        output,
        capability=STT_CAPABILITY,
        product_model=STT_PRODUCT_MODEL,
    )
    result["modal_elapsed_seconds"] = round(time.perf_counter() - started, 3)
    return result


@app.function(
    image=tts_image,
    gpu=GPU,
    timeout=20 * 60,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=5,
)
def speak(data: dict[str, Any]) -> dict[str, Any]:
    """Execute one governed TTS request on the certified Chatterbox image."""
    os.chdir("/app")
    import handler as voice_engine

    voice_engine.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
    started = time.perf_counter()
    output = voice_engine.handler({
        "id": f"modal-tts-{uuid.uuid4()}",
        "input": data,
    })
    result = _safe_output(
        output,
        capability=TTS_CAPABILITY,
        product_model=TTS_PRODUCT_MODEL,
    )
    result["modal_elapsed_seconds"] = round(time.perf_counter() - started, 3)
    return result
