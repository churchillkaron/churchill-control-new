import base64
import hashlib
import io
import math
import os
import re
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

print('{"event":"AVANTIQO_VOICE_TTS_PYTHON_PROCESS","phase":"process_started","secrets_printed":false}', flush=True)

import runpod
import torch
import torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

ENGINE_CONTRACT = "AVANTIQO_VOICE_ENGINE_V1"
QUALITY_CONTRACT = "AVANTIQO_VOICE_TTS_QUALITY_V2"
VOICE_REFERENCE_CONTRACT = "AVANTIQO_VOICE_REFERENCE_V1"
CAPABILITY = "ai.text.to.speech"
PRODUCT_MODEL = "avantiqo-voice-tts-v2"
EXPECTED_FOUNDATION_MODEL = "resemble-ai/chatterbox:multilingual-v3"
FOUNDATION_MODEL = os.getenv(
    "AVANTIQO_VOICE_TTS_FOUNDATION_MODEL",
    EXPECTED_FOUNDATION_MODEL,
).strip()
DEVICE = os.getenv("AVANTIQO_VOICE_TTS_DEVICE", "cuda")
MAX_TEXT_CHARS = 6000
MAX_CHUNK_CHARS = 700
MAX_CHUNKS = 24
MAX_OUTPUT_SECONDS = 300.0
MAX_REFERENCE_BYTES = 20 * 1024 * 1024
MIN_REFERENCE_SECONDS = 3.0
MAX_REFERENCE_SECONDS = 30.0
REFERENCE_SAMPLE_RATE = 24000
SUPPORTED_LANGUAGES = {
    "ar", "da", "de", "el", "en", "es", "fi", "fr", "he", "hi", "it",
    "ja", "ko", "ms", "nl", "no", "pl", "pt", "ru", "sv", "sw", "tr", "zh",
}
REFERENCE_MIME_SUFFIX = {
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/wave": ".wav",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/flac": ".flac",
}
VOICE_PROFILES = {
    "avantiqo-secretary-v1": {
        "exaggeration": 0.32,
        "cfg_weight": 0.55,
        "temperature": 0.72,
        "repetition_penalty": 1.25,
        "min_p": 0.04,
        "top_p": 0.96,
        "pause_ms": 105,
        "paragraph_pause_ms": 175,
        "delivery": "professional_conversational",
    },
    "avantiqo-executive-v1": {
        "exaggeration": 0.24,
        "cfg_weight": 0.62,
        "temperature": 0.68,
        "repetition_penalty": 1.30,
        "min_p": 0.04,
        "top_p": 0.92,
        "pause_ms": 115,
        "paragraph_pause_ms": 190,
        "delivery": "calm_executive",
    },
    "avantiqo-warm-v1": {
        "exaggeration": 0.46,
        "cfg_weight": 0.50,
        "temperature": 0.76,
        "repetition_penalty": 1.22,
        "min_p": 0.05,
        "top_p": 0.98,
        "pause_ms": 100,
        "paragraph_pause_ms": 170,
        "delivery": "warm_human",
    },
    "avantiqo-neutral-v1": {
        "exaggeration": 0.30,
        "cfg_weight": 0.56,
        "temperature": 0.72,
        "repetition_penalty": 1.25,
        "min_p": 0.05,
        "top_p": 0.96,
        "pause_ms": 100,
        "paragraph_pause_ms": 175,
        "delivery": "neutral_clear",
    },
}
VOICE_PROFILE_ALIASES = {
    "default": "avantiqo-secretary-v1",
    "secretary": "avantiqo-secretary-v1",
    "executive": "avantiqo-executive-v1",
    "warm": "avantiqo-warm-v1",
    "neutral": "avantiqo-neutral-v1",
}
CONSENT_BASES = {"SELF", "AUTHORIZED", "LICENSED"}
_MODEL: Any | None = None
_DEFAULT_CONDS: Any | None = None
_MODEL_LOAD_ERROR: BaseException | None = None
_MODEL_LOCK = threading.Lock()
_GENERATION_LOCK = threading.Lock()


def _text(value: Any) -> str:
    return str(value or "").strip()


def _profile_name(workload: dict[str, Any]) -> str:
    requested = _text(workload.get("voice_profile")).lower() or "avantiqo-secretary-v1"
    requested = VOICE_PROFILE_ALIASES.get(requested, requested)
    if requested not in VOICE_PROFILES:
        raise ValueError(f"AVANTIQO_VOICE_TTS_PROFILE_NOT_CERTIFIED:{requested}")
    return requested


def _model():
    global _MODEL, _DEFAULT_CONDS, _MODEL_LOAD_ERROR
    if _MODEL is not None:
        return _MODEL
    if _MODEL_LOAD_ERROR is not None:
        raise RuntimeError("AVANTIQO_VOICE_TTS_MODEL_PRELOAD_FAILED") from _MODEL_LOAD_ERROR
    if FOUNDATION_MODEL != EXPECTED_FOUNDATION_MODEL:
        raise RuntimeError("AVANTIQO_VOICE_TTS_FOUNDATION_MODEL_UNSUPPORTED")

    with _MODEL_LOCK:
        if _MODEL is not None:
            return _MODEL
        if _MODEL_LOAD_ERROR is not None:
            raise RuntimeError("AVANTIQO_VOICE_TTS_MODEL_PRELOAD_FAILED") from _MODEL_LOAD_ERROR

        print(
            '{"event":"AVANTIQO_VOICE_TTS_SERVING_PROCESS","phase":"model_load_started","secrets_printed":false}',
            flush=True,
        )
        try:
            model = ChatterboxMultilingualTTS.from_pretrained(
                device=DEVICE,
                t3_model="v3",
            )
            if DEVICE.startswith("cuda"):
                torch.cuda.synchronize()
            _MODEL = model
            _DEFAULT_CONDS = model.conds
        except BaseException as error:
            _MODEL_LOAD_ERROR = error
            print(
                '{"event":"AVANTIQO_VOICE_TTS_SERVING_PROCESS","phase":"model_load_failed",'
                f'"error_type":"{type(error).__name__}","secrets_printed":false}}',
                flush=True,
            )
            raise

        print(
            '{"event":"AVANTIQO_VOICE_TTS_SERVING_PROCESS","phase":"model_load_completed","secrets_printed":false}',
            flush=True,
        )
        return _MODEL


def _split_oversized_piece(piece: str) -> list[str]:
    piece = piece.strip()
    if not piece:
        return []
    if len(piece) <= MAX_CHUNK_CHARS:
        return [piece]

    words = piece.split()
    if len(words) <= 1:
        return [piece[index:index + MAX_CHUNK_CHARS] for index in range(0, len(piece), MAX_CHUNK_CHARS)]

    chunks: list[str] = []
    current: list[str] = []
    current_chars = 0
    for word in words:
        extra = len(word) + (1 if current else 0)
        if current and current_chars + extra > MAX_CHUNK_CHARS:
            chunks.append(" ".join(current))
            current = [word]
            current_chars = len(word)
        else:
            current.append(word)
            current_chars += extra
    if current:
        chunks.append(" ".join(current))
    return chunks


def _split_speech(speech: str, profile: dict[str, Any]) -> list[dict[str, Any]]:
    normalized = speech.replace("\r\n", "\n").replace("\r", "\n")
    paragraphs = [part.strip() for part in re.split(r"\n\s*\n+", normalized) if part.strip()]
    if not paragraphs:
        paragraphs = [normalized.strip()]

    chunks: list[dict[str, Any]] = []
    for paragraph_index, paragraph in enumerate(paragraphs):
        sentence_units = [
            unit.strip()
            for unit in re.split(r"(?<=[.!?…。！？])\s+", paragraph)
            if unit.strip()
        ] or [paragraph]

        paragraph_chunks: list[str] = []
        pending = ""
        for sentence in sentence_units:
            candidate = f"{pending} {sentence}".strip() if pending else sentence
            if len(candidate) <= MAX_CHUNK_CHARS:
                pending = candidate
                continue
            if pending:
                paragraph_chunks.append(pending)
                pending = ""
            paragraph_chunks.extend(_split_oversized_piece(sentence))
        if pending:
            paragraph_chunks.append(pending)

        for chunk_index, chunk in enumerate(paragraph_chunks):
            is_last_in_paragraph = chunk_index == len(paragraph_chunks) - 1
            is_last_overall = paragraph_index == len(paragraphs) - 1 and is_last_in_paragraph
            pause_ms = 0 if is_last_overall else (
                profile["paragraph_pause_ms"] if is_last_in_paragraph else profile["pause_ms"]
            )
            chunks.append({"text": chunk, "pause_ms": int(pause_ms)})

    if len(chunks) > MAX_CHUNKS:
        raise ValueError(f"AVANTIQO_VOICE_TTS_TOO_MANY_SEGMENTS:{len(chunks)}")
    return chunks


def _reference_metadata(reference: Any) -> dict[str, Any] | None:
    if reference in (None, ""):
        return None
    if not isinstance(reference, dict):
        raise ValueError("AVANTIQO_VOICE_REFERENCE_INVALID")
    if _text(reference.get("contract")) != VOICE_REFERENCE_CONTRACT:
        raise ValueError("AVANTIQO_VOICE_REFERENCE_CONTRACT_INVALID")

    consent = reference.get("consent") or {}
    if consent.get("confirmed") is not True:
        raise ValueError("AVANTIQO_VOICE_REFERENCE_CONSENT_REQUIRED")
    consent_basis = _text(consent.get("basis")).upper()
    if consent_basis not in CONSENT_BASES:
        raise ValueError("AVANTIQO_VOICE_REFERENCE_CONSENT_BASIS_INVALID")

    encoded = _text(reference.get("audio_base64"))
    if not encoded:
        raise ValueError("AVANTIQO_VOICE_REFERENCE_AUDIO_REQUIRED")
    mime_type = _text(reference.get("mime_type")).lower().split(";")[0]
    if mime_type not in REFERENCE_MIME_SUFFIX:
        raise ValueError(f"AVANTIQO_VOICE_REFERENCE_MIME_NOT_CERTIFIED:{mime_type or 'missing'}")

    try:
        audio_bytes = base64.b64decode(encoded, validate=True)
    except Exception as error:
        raise ValueError("AVANTIQO_VOICE_REFERENCE_BASE64_INVALID") from error
    if not audio_bytes:
        raise ValueError("AVANTIQO_VOICE_REFERENCE_AUDIO_EMPTY")
    if len(audio_bytes) > MAX_REFERENCE_BYTES:
        raise ValueError("AVANTIQO_VOICE_REFERENCE_AUDIO_TOO_LARGE")

    return {
        "bytes": audio_bytes,
        "mime_type": mime_type,
        "suffix": REFERENCE_MIME_SUFFIX[mime_type],
        "sha256": hashlib.sha256(audio_bytes).hexdigest(),
        "consent_basis": consent_basis,
        "consent_evidence_id": _text(consent.get("evidence_id")) or None,
        "profile_id": _text(reference.get("profile_id")) or None,
    }


def _prepare_reference_audio(reference: dict[str, Any], directory: str) -> tuple[str, dict[str, Any]]:
    source_path = Path(directory) / f"reference{reference['suffix']}"
    wav_path = Path(directory) / "reference-normalized.wav"
    source_path.write_bytes(reference["bytes"])

    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
        "-i", str(source_path),
        "-vn", "-ac", "1", "-ar", str(REFERENCE_SAMPLE_RATE),
        "-c:a", "pcm_s16le", str(wav_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True, timeout=45, check=False)
    if result.returncode != 0 or not wav_path.is_file():
        raise ValueError("AVANTIQO_VOICE_REFERENCE_AUDIO_DECODE_FAILED")

    wav, sample_rate = ta.load(str(wav_path))
    if wav.ndim != 2 or wav.shape[-1] <= 0:
        raise ValueError("AVANTIQO_VOICE_REFERENCE_AUDIO_SHAPE_INVALID")
    if not bool(torch.isfinite(wav).all().item()):
        raise ValueError("AVANTIQO_VOICE_REFERENCE_AUDIO_NONFINITE")

    duration_seconds = float(wav.shape[-1]) / float(sample_rate)
    if duration_seconds < MIN_REFERENCE_SECONDS:
        raise ValueError("AVANTIQO_VOICE_REFERENCE_TOO_SHORT")
    if duration_seconds > MAX_REFERENCE_SECONDS:
        raise ValueError("AVANTIQO_VOICE_REFERENCE_TOO_LONG")

    peak = float(wav.abs().max().item())
    rms = float(torch.sqrt(torch.mean(wav.float().pow(2))).item())
    if peak < 0.005 or rms < 0.0005:
        raise ValueError("AVANTIQO_VOICE_REFERENCE_TOO_QUIET")

    quality = {
        "duration_seconds": round(duration_seconds, 3),
        "sample_rate": int(sample_rate),
        "channels": int(wav.shape[0]),
        "peak": round(peak, 6),
        "rms": round(rms, 6),
    }
    return str(wav_path), quality


def _validated(job: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    data = job.get("input") or {}
    if data.get("contract") != ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_VOICE_ENGINE_CONTRACT_INVALID")
    if _text(data.get("capability")) != CAPABILITY:
        raise ValueError("AVANTIQO_VOICE_TTS_CAPABILITY_INVALID")
    if _text(data.get("foundation_model")) != FOUNDATION_MODEL:
        raise ValueError("AVANTIQO_VOICE_TTS_FOUNDATION_MODEL_MISMATCH")

    workload = data.get("workload") or {}
    speech = _text(workload.get("text"))
    if not speech:
        raise ValueError("AVANTIQO_VOICE_TTS_TEXT_REQUIRED")
    if len(speech) > MAX_TEXT_CHARS:
        raise ValueError("AVANTIQO_VOICE_TTS_TEXT_TOO_LONG")

    language = (_text(workload.get("language")) or "en").lower().split("-")[0]
    if language not in SUPPORTED_LANGUAGES:
        raise ValueError(f"AVANTIQO_VOICE_TTS_LANGUAGE_NOT_CERTIFIED:{language}")

    response_format = (_text(workload.get("response_format")) or "wav").lower()
    if response_format != "wav":
        raise ValueError("AVANTIQO_VOICE_TTS_FORMAT_NOT_CERTIFIED")

    profile_name = _profile_name(workload)
    profile = VOICE_PROFILES[profile_name]
    reference = _reference_metadata(workload.get("voice_reference"))
    chunks = _split_speech(speech, profile)

    return data, {
        **workload,
        "text": speech,
        "language": language,
        "response_format": response_format,
        "voice_profile": profile_name,
        "profile": profile,
        "voice_reference": reference,
        "chunks": chunks,
    }


def _coerce_waveform(wav: torch.Tensor) -> torch.Tensor:
    if not isinstance(wav, torch.Tensor):
        raise RuntimeError("AVANTIQO_VOICE_TTS_AUDIO_TENSOR_REQUIRED")
    if wav.ndim == 1:
        wav = wav.unsqueeze(0)
    if wav.ndim != 2 or wav.shape[-1] <= 0:
        raise RuntimeError("AVANTIQO_VOICE_TTS_AUDIO_SHAPE_INVALID")
    if not bool(torch.isfinite(wav).all().item()):
        raise RuntimeError("AVANTIQO_VOICE_TTS_AUDIO_NONFINITE")
    return wav.detach()


def _finalize_audio(wav: torch.Tensor, sample_rate: int) -> tuple[torch.Tensor, dict[str, Any]]:
    wav = _coerce_waveform(wav)
    peak_before = float(wav.abs().max().item())
    rms_before = float(torch.sqrt(torch.mean(wav.float().pow(2))).item())
    if peak_before < 1e-5 or rms_before < 1e-6:
        raise RuntimeError("AVANTIQO_VOICE_TTS_AUDIO_SILENT")

    peak_normalized = False
    if peak_before > 0.98:
        wav = wav * (0.98 / peak_before)
        peak_normalized = True

    peak = float(wav.abs().max().item())
    rms = float(torch.sqrt(torch.mean(wav.float().pow(2))).item())
    duration_seconds = float(wav.shape[-1]) / float(sample_rate)
    if duration_seconds < 0.12:
        raise RuntimeError("AVANTIQO_VOICE_TTS_AUDIO_TOO_SHORT")
    if duration_seconds > MAX_OUTPUT_SECONDS:
        raise RuntimeError("AVANTIQO_VOICE_TTS_AUDIO_TOO_LONG")

    return wav, {
        "finite": True,
        "non_silent": True,
        "peak_normalized": peak_normalized,
        "peak": round(peak, 6),
        "rms": round(rms, 6),
        "peak_dbfs": round(20.0 * math.log10(max(peak, 1e-9)), 3),
        "duration_seconds": round(duration_seconds, 3),
    }


def _wav_base64(wav: torch.Tensor, sample_rate: int) -> str:
    buffer = io.BytesIO()
    ta.save(buffer, wav.detach().cpu(), sample_rate, format="wav")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def _generate_segment(model: Any, segment: str, language: str, profile: dict[str, Any]) -> torch.Tensor:
    return model.generate(
        segment,
        language_id=language,
        exaggeration=profile["exaggeration"],
        cfg_weight=profile["cfg_weight"],
        temperature=profile["temperature"],
        repetition_penalty=profile["repetition_penalty"],
        min_p=profile["min_p"],
        top_p=profile["top_p"],
    )


def _render(job: dict[str, Any], model: Any, workload: dict[str, Any], reference_path: str | None) -> torch.Tensor:
    global _DEFAULT_CONDS
    profile = workload["profile"]
    generated: list[torch.Tensor] = []
    sample_rate = int(model.sr)

    if reference_path:
        model.prepare_conditionals(reference_path, exaggeration=profile["exaggeration"])
    else:
        if _DEFAULT_CONDS is None:
            raise RuntimeError("AVANTIQO_VOICE_TTS_DEFAULT_CONDITIONALS_REQUIRED")
        model.conds = _DEFAULT_CONDS

    try:
        with torch.inference_mode():
            for index, chunk in enumerate(workload["chunks"], start=1):
                runpod.serverless.progress_update(
                    job,
                    f"generating Avantiqo voice segment {index}/{len(workload['chunks'])}",
                )
                segment_wav = _coerce_waveform(
                    _generate_segment(
                        model,
                        chunk["text"],
                        workload["language"],
                        profile,
                    )
                )
                generated.append(segment_wav)
                pause_ms = int(chunk["pause_ms"])
                if pause_ms > 0:
                    pause_samples = max(1, round(sample_rate * pause_ms / 1000.0))
                    generated.append(torch.zeros(
                        (segment_wav.shape[0], pause_samples),
                        dtype=segment_wav.dtype,
                        device=segment_wav.device,
                    ))
    finally:
        if _DEFAULT_CONDS is not None:
            model.conds = _DEFAULT_CONDS

    if not generated:
        raise RuntimeError("AVANTIQO_VOICE_TTS_AUDIO_REQUIRED")
    return torch.cat(generated, dim=-1)


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data, workload = _validated(job)
    started = time.perf_counter()
    runpod.serverless.progress_update(job, "loading Avantiqo voice model")
    model = _model()
    sample_rate = int(model.sr)
    reference = workload["voice_reference"]
    reference_quality = None

    with _GENERATION_LOCK:
        if reference:
            with tempfile.TemporaryDirectory(prefix="avantiqo-voice-reference-") as directory:
                reference_path, reference_quality = _prepare_reference_audio(reference, directory)
                wav = _render(job, model, workload, reference_path)
        else:
            wav = _render(job, model, workload, None)

    if DEVICE.startswith("cuda"):
        torch.cuda.synchronize()

    wav, audio_health = _finalize_audio(wav, sample_rate)
    encoded = _wav_base64(wav, sample_rate)
    if not encoded:
        raise RuntimeError("AVANTIQO_VOICE_TTS_AUDIO_REQUIRED")

    generation_seconds = time.perf_counter() - started
    duration_seconds = float(audio_health["duration_seconds"])
    real_time_factor = generation_seconds / duration_seconds if duration_seconds > 0 else None

    return {
        "status": "completed",
        "provider": "avantiqo-voice",
        "model": PRODUCT_MODEL,
        "foundation_model": FOUNDATION_MODEL,
        "engine_contract": ENGINE_CONTRACT,
        "quality_contract": QUALITY_CONTRACT,
        "voice_reference_contract": VOICE_REFERENCE_CONTRACT if reference else None,
        "capability": CAPABILITY,
        "audio_base64": encoded,
        "format": "wav",
        "sample_rate": sample_rate,
        "language": workload["language"],
        "voice_profile": workload["voice_profile"],
        "delivery": workload["profile"]["delivery"],
        "segments_generated": len(workload["chunks"]),
        "long_form_chunking": len(workload["chunks"]) > 1,
        "audio_health": audio_health,
        "voice_cloning_used": bool(reference),
        "voice_identity_source": "recorded_reference" if reference else "avantiqo_builtin",
        "voice_reference_sha256": reference["sha256"] if reference else None,
        "voice_reference_profile_id": reference["profile_id"] if reference else None,
        "voice_reference_consent_basis": reference["consent_basis"] if reference else None,
        "voice_reference_quality": reference_quality,
        "watermarking": "CHATTERBOX_PERTH_BUILT_IN",
        "generation_seconds": round(generation_seconds, 3),
        "real_time_factor": round(real_time_factor, 4) if real_time_factor is not None else None,
        "raw_reasoning_persisted": False,
    }


@runpod.serverless.register_fitness_check
def check_worker():
    if FOUNDATION_MODEL != EXPECTED_FOUNDATION_MODEL:
        raise RuntimeError("AVANTIQO_VOICE_TTS_FOUNDATION_MODEL_UNSUPPORTED")
    if _MODEL_LOAD_ERROR is not None:
        raise RuntimeError("AVANTIQO_VOICE_TTS_MODEL_LOAD_FAILED") from _MODEL_LOAD_ERROR
    if DEVICE.startswith("cuda"):
        if not torch.cuda.is_available():
            raise RuntimeError("AVANTIQO_VOICE_TTS_CUDA_REQUIRED")
        probe = torch.empty(1, device="cuda")
        del probe
        torch.cuda.synchronize()


if __name__ == "__main__":
    print(
        '{"event":"AVANTIQO_VOICE_TTS_SERVING_PROCESS","phase":"model_preload_started","secrets_printed":false}',
        flush=True,
    )
    _model()
    print(
        '{"event":"AVANTIQO_VOICE_TTS_SERVING_PROCESS","phase":"model_preload_completed","secrets_printed":false}',
        flush=True,
    )
    print(
        '{"event":"AVANTIQO_VOICE_TTS_SERVING_PROCESS","phase":"serverless_starting",'
        '"model_preloaded_before_serverless_start":true,"quality_contract":"AVANTIQO_VOICE_TTS_QUALITY_V2",'
        '"recorded_reference_voice_implemented":true,"secrets_printed":false}',
        flush=True,
    )
    runpod.serverless.start({"handler": handler})
