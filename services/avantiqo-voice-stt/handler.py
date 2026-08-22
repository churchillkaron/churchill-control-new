import base64
import os
import tempfile
import time
from pathlib import Path
from typing import Any

import runpod
import torch
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline

ENGINE_CONTRACT = "AVANTIQO_VOICE_ENGINE_V1"
CAPABILITY = "ai.speech.to.text"
PRODUCT_MODEL = "avantiqo-voice-stt-v1"
FOUNDATION_MODEL = os.getenv("AVANTIQO_VOICE_STT_FOUNDATION_MODEL", "").strip()
DEVICE = "cuda:0" if torch.cuda.is_available() else "cpu"
DTYPE = torch.float16 if DEVICE.startswith("cuda") else torch.float32
MAX_AUDIO_BYTES = 25 * 1024 * 1024
_PIPELINE: Any | None = None


def _text(value: Any) -> str:
    return str(value or "").strip()


def _recognizer():
    global _PIPELINE
    if _PIPELINE is not None:
        return _PIPELINE
    if not FOUNDATION_MODEL:
        raise RuntimeError("AVANTIQO_VOICE_STT_FOUNDATION_MODEL_REQUIRED")
    model = AutoModelForSpeechSeq2Seq.from_pretrained(
        FOUNDATION_MODEL,
        torch_dtype=DTYPE,
        low_cpu_mem_usage=True,
        use_safetensors=True,
    )
    model.to(DEVICE)
    processor = AutoProcessor.from_pretrained(FOUNDATION_MODEL)
    _PIPELINE = pipeline(
        "automatic-speech-recognition",
        model=model,
        tokenizer=processor.tokenizer,
        feature_extractor=processor.feature_extractor,
        torch_dtype=DTYPE,
        device=0 if DEVICE.startswith("cuda") else -1,
        chunk_length_s=30,
        batch_size=8,
        return_timestamps=False,
    )
    return _PIPELINE


def _validated(job: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    data = job.get("input") or {}
    if data.get("contract") != ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_VOICE_ENGINE_CONTRACT_INVALID")
    if _text(data.get("capability")) != CAPABILITY:
        raise ValueError("AVANTIQO_VOICE_STT_CAPABILITY_INVALID")
    workload = data.get("workload") or {}
    encoded = _text(workload.get("audio_base64"))
    if not encoded:
        raise ValueError("AVANTIQO_VOICE_STT_AUDIO_REQUIRED")
    try:
        audio = base64.b64decode(encoded, validate=True)
    except Exception as exc:
        raise ValueError("AVANTIQO_VOICE_STT_AUDIO_BASE64_INVALID") from exc
    if not audio or len(audio) > MAX_AUDIO_BYTES:
        raise ValueError("AVANTIQO_VOICE_STT_AUDIO_SIZE_INVALID")
    return data, {**workload, "audio_bytes": audio}


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data, workload = _validated(job)
    started = time.perf_counter()
    recognizer = _recognizer()
    suffix = Path(_text(workload.get("file_name")) or "voice.wav").suffix[:10] or ".wav"
    path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
            handle.write(workload["audio_bytes"])
            path = handle.name

        generate_kwargs: dict[str, Any] = {"task": "transcribe"}
        language = _text(workload.get("language"))
        if language:
            generate_kwargs["language"] = language

        runpod.serverless.progress_update(job, "transcribing Avantiqo voice")
        result = recognizer(path, generate_kwargs=generate_kwargs)
        transcript = _text(result.get("text") if isinstance(result, dict) else result)
        if not transcript:
            raise RuntimeError("AVANTIQO_VOICE_STT_TRANSCRIPT_REQUIRED")

        return {
            "status": "completed",
            "provider": "avantiqo-voice",
            "model": PRODUCT_MODEL,
            "foundation_model": FOUNDATION_MODEL,
            "engine_contract": ENGINE_CONTRACT,
            "capability": CAPABILITY,
            "text": transcript,
            "transcript": transcript,
            "language": language or None,
            "vocabulary_context_received": bool(_text(workload.get("vocabulary_context"))),
            "vocabulary_context_applied": False,
            "generation_seconds": round(time.perf_counter() - started, 3),
            "raw_audio_persisted": False,
            "raw_reasoning_persisted": False,
        }
    finally:
        if path:
            Path(path).unlink(missing_ok=True)


@runpod.serverless.register_fitness_check
def check_worker():
    if not FOUNDATION_MODEL:
        raise RuntimeError("AVANTIQO_VOICE_STT_FOUNDATION_MODEL_REQUIRED")
    if not torch.cuda.is_available():
        raise RuntimeError("AVANTIQO_VOICE_STT_CUDA_REQUIRED")


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
