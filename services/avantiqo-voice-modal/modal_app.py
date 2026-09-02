"""Scale-to-zero Modal workers for the owned Avantiqo Voice engines.

The certified STT and TTS images already contain their model snapshots. Modal
therefore needs no persistent model Volume and no cache-seeding job. Each
capability has its own one-container A10G class. Model weights are loaded once in
the Modal container lifecycle before the first user method runs, while idle
capacity still scales back to zero after the configured drain window.
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
LIFECYCLE_CONTRACT = "AVANTIQO_VOICE_MODAL_CONTAINER_PRELOAD_V1"

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
    result["modal_lifecycle_contract"] = LIFECYCLE_CONTRACT
    result["model_preloaded_before_request"] = True
    return result


@app.cls(
    image=stt_image,
    gpu=GPU,
    timeout=15 * 60,
    startup_timeout=15 * 60,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=5,
)
class VoiceStt:
    @modal.enter()
    def preload(self) -> None:
        os.chdir("/app")
        import handler as voice_engine

        voice_engine.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
        started = time.perf_counter()
        recognizer = voice_engine._recognizer()
        if recognizer is None:
            raise RuntimeError("AVANTIQO_VOICE_MODAL_STT_PRELOAD_FAILED")
        if getattr(voice_engine, "DEVICE", "").startswith("cuda"):
            voice_engine.torch.cuda.synchronize()
        self.voice_engine = voice_engine
        self.preload_seconds = round(time.perf_counter() - started, 3)

    @modal.method()
    def transcribe(self, data: dict[str, Any]) -> dict[str, Any]:
        """Execute one governed STT request on a preloaded Whisper container."""
        os.chdir("/app")
        started = time.perf_counter()
        output = self.voice_engine.handler({
            "id": f"modal-stt-{uuid.uuid4()}",
            "input": data,
        })
        result = _safe_output(
            output,
            capability=STT_CAPABILITY,
            product_model=STT_PRODUCT_MODEL,
        )
        result["modal_container_preload_seconds"] = self.preload_seconds
        result["modal_request_elapsed_seconds"] = round(time.perf_counter() - started, 3)
        result["modal_elapsed_seconds"] = result["modal_request_elapsed_seconds"]
        return result


@app.cls(
    image=tts_image,
    gpu=GPU,
    timeout=20 * 60,
    startup_timeout=20 * 60,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=5,
)
class VoiceTts:
    @modal.enter()
    def preload(self) -> None:
        os.chdir("/app")
        import handler as voice_engine

        voice_engine.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
        started = time.perf_counter()
        model = voice_engine._model()
        if model is None:
            raise RuntimeError("AVANTIQO_VOICE_MODAL_TTS_PRELOAD_FAILED")
        self.voice_engine = voice_engine
        self.preload_seconds = round(time.perf_counter() - started, 3)

    @modal.method()
    def speak(self, data: dict[str, Any]) -> dict[str, Any]:
        """Execute one governed TTS request on a preloaded Chatterbox container."""
        os.chdir("/app")
        started = time.perf_counter()
        output = self.voice_engine.handler({
            "id": f"modal-tts-{uuid.uuid4()}",
            "input": data,
        })
        result = _safe_output(
            output,
            capability=TTS_CAPABILITY,
            product_model=TTS_PRODUCT_MODEL,
        )
        result["modal_container_preload_seconds"] = self.preload_seconds
        result["modal_request_elapsed_seconds"] = round(time.perf_counter() - started, 3)
        result["modal_elapsed_seconds"] = result["modal_request_elapsed_seconds"]
        return result
