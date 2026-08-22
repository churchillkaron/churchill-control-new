import base64
import io
import os
import time
from typing import Any

import runpod
import torch
import torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

ENGINE_CONTRACT = "AVANTIQO_VOICE_ENGINE_V1"
CAPABILITY = "ai.text.to.speech"
PRODUCT_MODEL = "avantiqo-voice-tts-v1"
FOUNDATION_MODEL = os.getenv("AVANTIQO_VOICE_TTS_FOUNDATION_MODEL", "").strip()
DEVICE = os.getenv("AVANTIQO_VOICE_TTS_DEVICE", "cuda")
SUPPORTED_LANGUAGES = {
    "ar", "da", "de", "el", "en", "es", "fi", "fr", "he", "hi", "it",
    "ja", "ko", "ms", "nl", "no", "pl", "pt", "ru", "sv", "sw", "tr", "zh",
}
_MODEL: Any | None = None


def _text(value: Any) -> str:
    return str(value or "").strip()


def _model():
    global _MODEL
    if _MODEL is not None:
        return _MODEL
    if not FOUNDATION_MODEL:
        raise RuntimeError("AVANTIQO_VOICE_TTS_FOUNDATION_MODEL_REQUIRED")
    if FOUNDATION_MODEL != "resemble-ai/chatterbox:multilingual-v3":
        raise RuntimeError("AVANTIQO_VOICE_TTS_FOUNDATION_MODEL_UNSUPPORTED")
    _MODEL = ChatterboxMultilingualTTS.from_pretrained(
        device=DEVICE,
        t3_model="v3",
    )
    return _MODEL


def _validated(job: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    data = job.get("input") or {}
    if data.get("contract") != ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_VOICE_ENGINE_CONTRACT_INVALID")
    if _text(data.get("capability")) != CAPABILITY:
        raise ValueError("AVANTIQO_VOICE_TTS_CAPABILITY_INVALID")
    workload = data.get("workload") or {}
    speech = _text(workload.get("text"))
    if not speech:
        raise ValueError("AVANTIQO_VOICE_TTS_TEXT_REQUIRED")
    if len(speech) > 12000:
        raise ValueError("AVANTIQO_VOICE_TTS_TEXT_TOO_LONG")
    language = (_text(workload.get("language")) or "en").lower().split("-")[0]
    if language not in SUPPORTED_LANGUAGES:
        raise ValueError(f"AVANTIQO_VOICE_TTS_LANGUAGE_NOT_CERTIFIED:{language}")
    if _text(workload.get("voice")):
        raise ValueError("AVANTIQO_VOICE_TTS_CUSTOM_VOICE_NOT_CERTIFIED")
    return data, {**workload, "text": speech, "language": language}


def _wav_base64(wav: torch.Tensor, sample_rate: int) -> str:
    buffer = io.BytesIO()
    ta.save(buffer, wav.detach().cpu(), sample_rate, format="wav")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data, workload = _validated(job)
    started = time.perf_counter()
    runpod.serverless.progress_update(job, "generating Avantiqo voice")
    model = _model()
    wav = model.generate(
        workload["text"],
        language_id=workload["language"],
    )
    encoded = _wav_base64(wav, model.sr)
    if not encoded:
        raise RuntimeError("AVANTIQO_VOICE_TTS_AUDIO_REQUIRED")

    return {
        "status": "completed",
        "provider": "avantiqo-voice",
        "model": PRODUCT_MODEL,
        "foundation_model": FOUNDATION_MODEL,
        "engine_contract": ENGINE_CONTRACT,
        "capability": CAPABILITY,
        "audio_base64": encoded,
        "format": "wav",
        "sample_rate": int(model.sr),
        "language": workload["language"],
        "voice_profile": "avantiqo-default-v1",
        "voice_cloning_used": False,
        "watermarking": "CHATTERBOX_PERTH_BUILT_IN",
        "generation_seconds": round(time.perf_counter() - started, 3),
        "raw_reasoning_persisted": False,
    }


@runpod.serverless.register_fitness_check
def check_worker():
    if FOUNDATION_MODEL != "resemble-ai/chatterbox:multilingual-v3":
        raise RuntimeError("AVANTIQO_VOICE_TTS_FOUNDATION_MODEL_REQUIRED")
    if DEVICE.startswith("cuda") and not torch.cuda.is_available():
        raise RuntimeError("AVANTIQO_VOICE_TTS_CUDA_REQUIRED")


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
