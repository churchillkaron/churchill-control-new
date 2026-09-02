"""Scale-to-zero direct Modal functions for the owned Avantiqo Voice engines.

Voice follows the same proven transport architecture as Avantiqo Audio:
Service Runtime calls named GPU functions directly through the Modal SDK,
receives a FunctionCall ID, and polls that exact call. There is no CPU Modal
gateway and no persistent Modal Volume. STT and TTS each scale 0 -> 1 -> 0.
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
    "sha256:960ee663a65aa085b46373aa279b91394e95aa7a89da7625f86446eb1122445f"
)
TTS_IMAGE = (
    "ghcr.io/churchillkaron/avantiqo-voice-tts-worker@"
    "sha256:f0919a82eeadb36ea8a0fdf79815f52942d99d13f075ec6cd7f523fe79344221"
)
GPU = "A10G"
DIRECT_TRANSPORT = "modal-js-sdk-function-call-v1"

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
    "AVANTIQO_VOICE_STT_LOCAL_MODEL_PATH": "/opt/avantiqo/models/whisper-large-v3-turbo",
    "HF_HUB_OFFLINE": "1",
    "TRANSFORMERS_OFFLINE": "1",
})

tts_image = _worker_image(TTS_IMAGE).env({
    "AVANTIQO_VOICE_TTS_FOUNDATION_MODEL": TTS_FOUNDATION_MODEL,
    "AVANTIQO_VOICE_TTS_DEVICE": "cuda",
    "HF_HUB_OFFLINE": "1",
    "TRANSFORMERS_OFFLINE": "1",
})


def _safe_output(output: Any, *, capability: str, product_model: str, elapsed: float) -> dict[str, Any]:
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
    result["modal_transport"] = DIRECT_TRANSPORT
    result["modal_gateway_used"] = False
    result["modal_elapsed_seconds"] = round(elapsed, 3)
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
    """Execute one governed STT request through direct Modal function transport."""
    os.chdir("/app")
    import handler as voice_engine

    voice_engine.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
    started = time.perf_counter()
    output = voice_engine.handler({
        "id": f"modal-stt-{uuid.uuid4()}",
        "input": data,
    })
    return _safe_output(
        output,
        capability=STT_CAPABILITY,
        product_model=STT_PRODUCT_MODEL,
        elapsed=time.perf_counter() - started,
    )


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
    """Execute one governed TTS request through direct Modal function transport."""
    os.chdir("/app")
    import handler as voice_engine

    voice_engine.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
    started = time.perf_counter()
    output = voice_engine.handler({
        "id": f"modal-tts-{uuid.uuid4()}",
        "input": data,
    })
    return _safe_output(
        output,
        capability=TTS_CAPABILITY,
        product_model=TTS_PRODUCT_MODEL,
        elapsed=time.perf_counter() - started,
    )
