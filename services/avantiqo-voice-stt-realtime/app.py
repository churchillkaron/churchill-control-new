import asyncio
import base64
import hashlib
import hmac
import json
import os
import time
from contextlib import asynccontextmanager
from typing import Any

import numpy as np
import torch
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline
from transformers.models.whisper.tokenization_whisper import TO_LANGUAGE_CODE

ENGINE_CONTRACT = "AVANTIQO_VOICE_ENGINE_V1"
REALTIME_CONTRACT = "AVANTIQO_VOICE_STT_REALTIME_V1"
CAPABILITY = "ai.speech.to.text.realtime"
PRODUCT_MODEL = "avantiqo-voice-stt-realtime-v1"
EXPECTED_FOUNDATION_MODEL = "openai/whisper-large-v3-turbo"
FOUNDATION_MODEL = os.getenv(
    "AVANTIQO_VOICE_STT_FOUNDATION_MODEL",
    EXPECTED_FOUNDATION_MODEL,
).strip()
DEVICE = "cuda:0" if torch.cuda.is_available() else "cpu"
DTYPE = torch.float16 if DEVICE.startswith("cuda") else torch.float32
TARGET_SAMPLE_RATE = 16000
MAX_SESSION_SECONDS = 30
MAX_AUDIO_BYTES = TARGET_SAMPLE_RATE * 2 * MAX_SESSION_SECONDS
MAX_APPEND_BYTES = TARGET_SAMPLE_RATE * 2 * 2
PARTIAL_INTERVAL_SECONDS = 0.65
PARTIAL_MIN_AUDIO_SECONDS = 0.8
ROLLING_WINDOW_SECONDS = 12
RELAY_TOKEN_MAX_FUTURE_SECONDS = 90
RELAY_TOKEN_CLOCK_SKEW_SECONDS = 10

_PIPELINE: Any | None = None
_MODEL_LOCK = asyncio.Lock()
_SESSION_SEMAPHORE = asyncio.Semaphore(1)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _language_code(value: Any) -> str | None:
    language = _text(value).lower().replace("_", "-")
    if not language:
        return None
    if language.startswith("<|") and language.endswith("|>"):
        language = language[2:-2]
    base = language.split("-")[0]
    if base in TO_LANGUAGE_CODE.values():
        return base
    if language in TO_LANGUAGE_CODE:
        return TO_LANGUAGE_CODE[language]
    if base in TO_LANGUAGE_CODE:
        return TO_LANGUAGE_CODE[base]
    return None


def _detected_language(result: Any) -> str | None:
    if not isinstance(result, dict):
        return None
    direct = _language_code(result.get("language"))
    if direct:
        return direct
    chunks = result.get("chunks")
    if not isinstance(chunks, list):
        return None
    for chunk in chunks:
        if not isinstance(chunk, dict):
            continue
        detected = _language_code(chunk.get("language"))
        if detected:
            return detected
    return None


def _recognizer():
    global _PIPELINE
    if _PIPELINE is not None:
        return _PIPELINE
    if FOUNDATION_MODEL != EXPECTED_FOUNDATION_MODEL:
        raise RuntimeError("AVANTIQO_VOICE_STT_REALTIME_FOUNDATION_MODEL_UNSUPPORTED")
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
        chunk_length_s=15,
        batch_size=1,
        return_timestamps=False,
    )
    return _PIPELINE


def _relay_secret() -> bytes:
    value = _text(os.getenv("AVANTIQO_VOICE_REALTIME_RELAY_SECRET"))
    if len(value) < 32:
        raise RuntimeError("AVANTIQO_VOICE_REALTIME_RELAY_SECRET_REQUIRED")
    return value.encode("utf-8")


def _relay_signature(session_id: str, organization_id: str, expires_at: int) -> str:
    payload = f"{REALTIME_CONTRACT}|{session_id}|{organization_id}|{expires_at}".encode("utf-8")
    return hmac.new(_relay_secret(), payload, hashlib.sha256).hexdigest()


def _validate_session_start(message: dict[str, Any]) -> dict[str, Any]:
    if _text(message.get("type")) != "session.start":
        raise ValueError("AVANTIQO_VOICE_REALTIME_SESSION_START_REQUIRED")
    if _text(message.get("contract")) != REALTIME_CONTRACT:
        raise ValueError("AVANTIQO_VOICE_REALTIME_CONTRACT_INVALID")
    if _text(message.get("engine_contract")) != ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_VOICE_ENGINE_CONTRACT_INVALID")
    if _text(message.get("capability")) != CAPABILITY:
        raise ValueError("AVANTIQO_VOICE_REALTIME_CAPABILITY_INVALID")
    if _text(message.get("foundation_model")) != FOUNDATION_MODEL:
        raise ValueError("AVANTIQO_VOICE_REALTIME_FOUNDATION_MODEL_MISMATCH")

    session_id = _text(message.get("session_id"))
    organization_id = _text(message.get("organization_id"))
    signature = _text(message.get("signature"))
    try:
        expires_at = int(message.get("expires_at"))
    except (TypeError, ValueError) as exc:
        raise ValueError("AVANTIQO_VOICE_REALTIME_SESSION_EXPIRY_INVALID") from exc

    if not session_id or not organization_id or not signature:
        raise ValueError("AVANTIQO_VOICE_REALTIME_SESSION_IDENTITY_REQUIRED")
    now = int(time.time())
    if expires_at < now - RELAY_TOKEN_CLOCK_SKEW_SECONDS:
        raise ValueError("AVANTIQO_VOICE_REALTIME_SESSION_EXPIRED")
    if expires_at > now + RELAY_TOKEN_MAX_FUTURE_SECONDS:
        raise ValueError("AVANTIQO_VOICE_REALTIME_SESSION_EXPIRY_TOO_LONG")

    expected = _relay_signature(session_id, organization_id, expires_at)
    if not hmac.compare_digest(signature, expected):
        raise ValueError("AVANTIQO_VOICE_REALTIME_SESSION_SIGNATURE_INVALID")

    sample_rate = int(message.get("sample_rate") or TARGET_SAMPLE_RATE)
    if sample_rate != TARGET_SAMPLE_RATE:
        raise ValueError("AVANTIQO_VOICE_REALTIME_SAMPLE_RATE_INVALID")

    return {
        "session_id": session_id,
        "organization_id": organization_id,
        "language": _language_code(message.get("language")),
        "sample_rate": sample_rate,
    }


def _pcm16_float32(audio_bytes: bytes) -> np.ndarray:
    if not audio_bytes or len(audio_bytes) % 2:
        raise ValueError("AVANTIQO_VOICE_REALTIME_PCM16_INVALID")
    samples = np.frombuffer(audio_bytes, dtype="<i2").astype(np.float32)
    return samples / 32768.0


def _decode_sync(audio_bytes: bytes, language: str | None) -> dict[str, Any]:
    recognizer = _recognizer()
    generate_kwargs: dict[str, Any] = {"task": "transcribe"}
    if language:
        generate_kwargs["language"] = language
    result = recognizer(
        {"array": _pcm16_float32(audio_bytes), "sampling_rate": TARGET_SAMPLE_RATE},
        generate_kwargs=generate_kwargs,
        return_language=True,
    )
    transcript = _text(result.get("text") if isinstance(result, dict) else result)
    return {
        "transcript": transcript,
        "detected_language": _detected_language(result),
    }


async def _decode(audio_bytes: bytes, language: str | None) -> dict[str, Any]:
    async with _MODEL_LOCK:
        return await asyncio.to_thread(_decode_sync, audio_bytes, language)


def _common_word_prefix(previous: str, current: str) -> str:
    left = previous.split()
    right = current.split()
    count = 0
    while count < len(left) and count < len(right) and left[count] == right[count]:
        count += 1
    return " ".join(right[:count]).strip()


async def _send(websocket: WebSocket, payload: dict[str, Any]) -> None:
    await websocket.send_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False))


@asynccontextmanager
async def lifespan(_: FastAPI):
    if FOUNDATION_MODEL != EXPECTED_FOUNDATION_MODEL:
        raise RuntimeError("AVANTIQO_VOICE_STT_REALTIME_FOUNDATION_MODEL_UNSUPPORTED")
    if not torch.cuda.is_available():
        raise RuntimeError("AVANTIQO_VOICE_STT_REALTIME_CUDA_REQUIRED")
    _relay_secret()
    await asyncio.to_thread(_recognizer)
    yield


app = FastAPI(title="Avantiqo Voice Realtime STT", lifespan=lifespan)


@app.get("/ping")
async def ping() -> dict[str, Any]:
    return {
        "status": "ready" if _PIPELINE is not None else "initializing",
        "provider": "avantiqo-voice",
        "model": PRODUCT_MODEL,
        "foundation_model": FOUNDATION_MODEL,
        "engine_contract": ENGINE_CONTRACT,
        "realtime_contract": REALTIME_CONTRACT,
        "capability": CAPABILITY,
        "raw_audio_persisted": False,
        "raw_reasoning_persisted": False,
    }


@app.websocket("/v1/realtime/transcribe")
async def realtime_transcribe(websocket: WebSocket) -> None:
    await websocket.accept()
    acquired = False
    partial_task: asyncio.Task[Any] | None = None
    audio = bytearray()
    session: dict[str, Any] | None = None
    previous_partial = ""
    last_partial_at = 0.0
    sequence = 0

    async def emit_error(code: str) -> None:
        await _send(
            websocket,
            {
                "type": "session.error",
                "contract": REALTIME_CONTRACT,
                "code": code,
                "raw_audio_persisted": False,
            },
        )

    async def emit_partial(snapshot: bytes) -> None:
        nonlocal previous_partial, sequence
        if not session:
            return
        window_bytes = TARGET_SAMPLE_RATE * 2 * ROLLING_WINDOW_SECONDS
        result = await _decode(snapshot[-window_bytes:], session.get("language"))
        transcript = _text(result.get("transcript"))
        if not transcript:
            return
        stable = _common_word_prefix(previous_partial, transcript)
        previous_partial = transcript
        sequence += 1
        await _send(
            websocket,
            {
                "type": "transcript.partial",
                "contract": REALTIME_CONTRACT,
                "sequence": sequence,
                "transcript": transcript,
                "stable_prefix": stable,
                "language": session.get("language") or result.get("detected_language"),
                "audio_ms": round(len(snapshot) / (TARGET_SAMPLE_RATE * 2) * 1000),
                "raw_audio_persisted": False,
            },
        )

    try:
        try:
            await asyncio.wait_for(_SESSION_SEMAPHORE.acquire(), timeout=0.1)
            acquired = True
        except TimeoutError:
            await websocket.close(code=1013, reason="AVANTIQO_VOICE_REALTIME_WORKER_BUSY")
            return

        first = json.loads(await asyncio.wait_for(websocket.receive_text(), timeout=10))
        session = _validate_session_start(first)
        await _send(
            websocket,
            {
                "type": "session.ready",
                "contract": REALTIME_CONTRACT,
                "session_id": session["session_id"],
                "sample_rate": TARGET_SAMPLE_RATE,
                "provider": "avantiqo-voice",
                "model": PRODUCT_MODEL,
                "foundation_model": FOUNDATION_MODEL,
                "raw_audio_persisted": False,
            },
        )

        while True:
            message = json.loads(await websocket.receive_text())
            event_type = _text(message.get("type"))

            if event_type == "audio.append":
                encoded = _text(message.get("audio"))
                if not encoded:
                    raise ValueError("AVANTIQO_VOICE_REALTIME_AUDIO_REQUIRED")
                try:
                    chunk = base64.b64decode(encoded, validate=True)
                except Exception as exc:
                    raise ValueError("AVANTIQO_VOICE_REALTIME_AUDIO_BASE64_INVALID") from exc
                if not chunk or len(chunk) > MAX_APPEND_BYTES or len(chunk) % 2:
                    raise ValueError("AVANTIQO_VOICE_REALTIME_AUDIO_CHUNK_INVALID")
                if len(audio) + len(chunk) > MAX_AUDIO_BYTES:
                    raise ValueError("AVANTIQO_VOICE_REALTIME_AUDIO_LIMIT_EXCEEDED")
                audio.extend(chunk)

                elapsed = time.monotonic() - last_partial_at
                audio_seconds = len(audio) / (TARGET_SAMPLE_RATE * 2)
                if (
                    audio_seconds >= PARTIAL_MIN_AUDIO_SECONDS
                    and elapsed >= PARTIAL_INTERVAL_SECONDS
                    and (partial_task is None or partial_task.done())
                ):
                    snapshot = bytes(audio)
                    last_partial_at = time.monotonic()
                    partial_task = asyncio.create_task(emit_partial(snapshot))
                continue

            if event_type == "audio.commit":
                if partial_task is not None:
                    await partial_task
                if not audio:
                    raise ValueError("AVANTIQO_VOICE_REALTIME_AUDIO_REQUIRED")
                started = time.perf_counter()
                result = await _decode(bytes(audio), session.get("language"))
                transcript = _text(result.get("transcript"))
                if not transcript:
                    raise RuntimeError("AVANTIQO_VOICE_REALTIME_TRANSCRIPT_REQUIRED")
                sequence += 1
                await _send(
                    websocket,
                    {
                        "type": "transcript.final",
                        "contract": REALTIME_CONTRACT,
                        "sequence": sequence,
                        "transcript": transcript,
                        "language": session.get("language") or result.get("detected_language"),
                        "detected_language": result.get("detected_language"),
                        "language_source": "requested" if session.get("language") else "detected",
                        "audio_ms": round(len(audio) / (TARGET_SAMPLE_RATE * 2) * 1000),
                        "generation_seconds": round(time.perf_counter() - started, 3),
                        "raw_audio_persisted": False,
                        "raw_reasoning_persisted": False,
                    },
                )
                await websocket.close(code=1000, reason="complete")
                return

            if event_type == "session.cancel":
                await websocket.close(code=1000, reason="cancelled")
                return

            if event_type == "session.ping":
                await _send(websocket, {"type": "session.pong", "contract": REALTIME_CONTRACT})
                continue

            raise ValueError("AVANTIQO_VOICE_REALTIME_EVENT_INVALID")

    except WebSocketDisconnect:
        return
    except Exception as exc:
        try:
            await emit_error(_text(exc) or "AVANTIQO_VOICE_REALTIME_FAILED")
            await websocket.close(code=1011, reason="voice realtime failed")
        except Exception:
            pass
    finally:
        if partial_task is not None and not partial_task.done():
            partial_task.cancel()
        audio.clear()
        session = None
        if acquired:
            _SESSION_SEMAPHORE.release()


if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "80")),
        log_level="warning",
        access_log=False,
    )
