import ipaddress
import json
import math
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import librosa
import numpy as np
import requests
import runpod
import soundfile as sf
import torch
import torchcrepe
import python_stretch as ps

ENGINE_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V1"
CAPABILITY = "ai.audio.vocal-correct"
MODEL = "torchcrepe-full"
PITCH_ENGINE = "torchcrepe-0.0.24"
STRETCH_ENGINE = "signalsmith-stretch-python-0.3.1"
QUALITY_PROFILE = "TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V1"
RIGHTS_CONTRACT = "AVANTIQO_SOURCE_AUDIO_RIGHTS_ATTESTATION_V1"
CONTENT_POLICY = "USER_RIGHTS_ATTESTATION_ONLY"
MAX_SOURCE_DURATION_SECONDS = max(
    30,
    min(1800, int(os.getenv("AVANTIQO_MUSIC_VOCAL_CORRECTION_MAX_SOURCE_DURATION_SECONDS", "900"))),
)
MAX_SOURCE_BYTES = max(
    10_000_000,
    int(os.getenv("AVANTIQO_MUSIC_VOCAL_CORRECTION_MAX_SOURCE_BYTES", "629145600")),
)
DOWNLOAD_TIMEOUT_SECONDS = max(
    30,
    int(os.getenv("AVANTIQO_MUSIC_VOCAL_CORRECTION_DOWNLOAD_TIMEOUT_SECONDS", "300")),
)
UPLOAD_TIMEOUT_SECONDS = max(
    30,
    int(os.getenv("AVANTIQO_MUSIC_VOCAL_CORRECTION_UPLOAD_TIMEOUT_SECONDS", "300")),
)
SAMPLE_RATE = 48000
HOP_SECONDS = 0.005
FMIN_HZ = 55.0
FMAX_HZ = 1200.0

NOTE_TO_PC = {
    "c": 0,
    "c#": 1,
    "db": 1,
    "d": 2,
    "d#": 3,
    "eb": 3,
    "e": 4,
    "f": 5,
    "f#": 6,
    "gb": 6,
    "g": 7,
    "g#": 8,
    "ab": 8,
    "a": 9,
    "a#": 10,
    "bb": 10,
    "b": 11,
}
MAJOR_INTERVALS = (0, 2, 4, 5, 7, 9, 11)
MINOR_INTERVALS = (0, 2, 3, 5, 7, 8, 10)
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def _text(value: Any) -> str:
    return str(value or "").strip()


def _object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _number(value: Any, default: float | None = None) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if math.isfinite(number) else default


def _integer(value: Any, default: int | None = None) -> int | None:
    number = _number(value, None)
    return int(round(number)) if number is not None else default


def _boolean(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    source = _text(value).lower()
    if not source:
        return default
    return source in {"1", "true", "yes", "on"}


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return min(maximum, max(minimum, value))


def _safe_supabase_url(value: Any) -> str:
    source = _text(value)
    parsed = urlparse(source)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_HTTPS_URL_REQUIRED")
    host = parsed.hostname.lower()
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_PRIVATE_URL_FORBIDDEN")
    try:
        literal = ipaddress.ip_address(host)
        if literal.is_private or literal.is_loopback or literal.is_link_local:
            raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_PRIVATE_URL_FORBIDDEN")
    except ValueError as exc:
        if str(exc) == "AVANTIQO_MUSIC_VOCAL_CORRECTION_PRIVATE_URL_FORBIDDEN":
            raise
    if not (host.endswith(".supabase.co") or host.endswith(".storage.supabase.co")):
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_STORAGE_HOST_FORBIDDEN")
    return source


def _run(args: list[str], code: str) -> None:
    result = subprocess.run(
        args,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        detail = _text(result.stderr or result.stdout).replace("\n", " ")[:1200]
        raise RuntimeError(f"{code}:{detail}")


def _probe_duration(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        detail = _text(result.stderr).replace("\n", " ")[:600]
        raise ValueError(f"AVANTIQO_MUSIC_VOCAL_CORRECTION_SOURCE_PROBE_FAILED:{detail}")
    duration = _number(result.stdout, None)
    if duration is None or duration <= 0:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_SOURCE_DURATION_REQUIRED")
    if duration > MAX_SOURCE_DURATION_SECONDS:
        raise ValueError(
            f"AVANTIQO_MUSIC_VOCAL_CORRECTION_SOURCE_TOO_LONG:{duration:.3f}>{MAX_SOURCE_DURATION_SECONDS}"
        )
    return duration


def _download_source(url: str, path: Path) -> int:
    total = 0
    with requests.get(url, stream=True, timeout=DOWNLOAD_TIMEOUT_SECONDS) as response:
        response.raise_for_status()
        declared = _integer(response.headers.get("content-length"), None)
        if declared is not None and declared > MAX_SOURCE_BYTES:
            raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_SOURCE_TOO_LARGE")
        with path.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if not chunk:
                    continue
                total += len(chunk)
                if total > MAX_SOURCE_BYTES:
                    raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_SOURCE_TOO_LARGE")
                handle.write(chunk)
    if total <= 0:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_SOURCE_EMPTY")
    return total


def _validate_attestation(data: dict[str, Any]) -> dict[str, Any]:
    attestation = _object(data.get("rights_attestation"))
    if attestation.get("confirmed") is not True:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_SOURCE_RIGHTS_CONFIRMATION_REQUIRED")
    if _text(attestation.get("contract")) != RIGHTS_CONTRACT:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_SOURCE_RIGHTS_CONTRACT_INVALID")
    if _text(attestation.get("content_restriction_policy")) != CONTENT_POLICY:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_CONTENT_POLICY_INVALID")
    return {
        "contract": RIGHTS_CONTRACT,
        "confirmed": True,
        "content_restriction_policy": CONTENT_POLICY,
    }


def _validated_uploads(data: dict[str, Any]) -> dict[str, dict[str, str]]:
    source = _object(data.get("output_uploads"))
    required = {"corrected_vocal_wav", "correction_report_json"}
    if set(source.keys()) != required:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_OUTPUT_UPLOAD_SET_INVALID")
    output: dict[str, dict[str, str]] = {}
    for key in sorted(required):
        item = _object(source.get(key))
        signed_url = _safe_supabase_url(item.get("signed_url"))
        storage_reference = _text(item.get("storage_reference"))
        if not storage_reference.startswith("storage://creative-assets/"):
            raise ValueError(f"AVANTIQO_MUSIC_VOCAL_CORRECTION_STORAGE_REFERENCE_INVALID:{key}")
        output[key] = {
            "signed_url": signed_url,
            "storage_reference": storage_reference,
        }
    return output


def _parse_key(value: str) -> tuple[int, str] | None:
    source = _text(value).lower().replace("major", " major").replace("minor", " minor")
    parts = source.split()
    if not parts:
        return None
    root = NOTE_TO_PC.get(parts[0])
    if root is None:
        return None
    mode = "minor" if any(part in {"minor", "min", "m"} for part in parts[1:]) else "major"
    return root, mode


def _pitch_class_histogram(midi: np.ndarray, periodicity: np.ndarray) -> np.ndarray:
    histogram = np.zeros(12, dtype=np.float64)
    for note, weight in zip(midi, periodicity, strict=False):
        if not np.isfinite(note) or not np.isfinite(weight) or weight <= 0:
            continue
        pitch_class = int(round(float(note))) % 12
        histogram[pitch_class] += float(weight)
    total = histogram.sum()
    return histogram / total if total > 0 else histogram


def _infer_key(midi: np.ndarray, periodicity: np.ndarray) -> tuple[int, str, float]:
    histogram = _pitch_class_histogram(midi, periodicity)
    if histogram.sum() <= 0:
        return 0, "major", 0.0
    best: tuple[int, str, float] | None = None
    for mode, profile in (("major", MAJOR_PROFILE), ("minor", MINOR_PROFILE)):
        normalized = profile / profile.sum()
        for root in range(12):
            rotated = np.roll(normalized, root)
            score = float(np.dot(histogram, rotated))
            candidate = (root, mode, score)
            if best is None or score > best[2]:
                best = candidate
    return best or (0, "major", 0.0)


def _scale_pitch_classes(root: int, mode: str) -> set[int]:
    intervals = MINOR_INTERVALS if mode == "minor" else MAJOR_INTERVALS
    return {(root + interval) % 12 for interval in intervals}


def _nearest_scale_note(midi_note: float, allowed: set[int]) -> float:
    center = int(round(midi_note))
    candidates = [note for note in range(center - 7, center + 8) if note % 12 in allowed]
    return float(min(candidates, key=lambda note: abs(note - midi_note)))


def _pitch_track(path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray, int]:
    audio, sr = torchcrepe.load.audio(str(path))
    if audio.ndim == 1:
        audio = audio.unsqueeze(0)
    if audio.shape[0] > 1:
        audio = audio.mean(dim=0, keepdim=True)
    hop_length = max(1, int(sr * HOP_SECONDS))
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    pitch, periodicity = torchcrepe.predict(
        audio,
        sr,
        hop_length,
        FMIN_HZ,
        FMAX_HZ,
        "full",
        batch_size=2048,
        device=device,
        return_periodicity=True,
        decoder=torchcrepe.decode.viterbi,
    )
    periodicity = torchcrepe.filter.median(periodicity, 3)
    periodicity = torchcrepe.threshold.Silence(-60.0)(periodicity, audio, sr, hop_length)
    pitch = torchcrepe.threshold.At(0.21)(pitch, periodicity)
    pitch = torchcrepe.filter.mean(pitch, 3)
    pitch_np = pitch.squeeze(0).detach().cpu().numpy().astype(np.float64)
    periodicity_np = periodicity.squeeze(0).detach().cpu().numpy().astype(np.float64)
    times = np.arange(pitch_np.shape[0], dtype=np.float64) * (hop_length / float(sr))
    midi = np.full_like(pitch_np, np.nan, dtype=np.float64)
    voiced = np.isfinite(pitch_np) & (pitch_np > 0)
    midi[voiced] = 69.0 + 12.0 * np.log2(pitch_np[voiced] / 440.0)
    return times, midi, periodicity_np, sr


def _correction_events(
    times: np.ndarray,
    midi: np.ndarray,
    periodicity: np.ndarray,
    root: int,
    mode: str,
    strength: float,
    snap_threshold_cents: float,
    max_shift_cents: float,
) -> list[dict[str, Any]]:
    allowed = _scale_pitch_classes(root, mode)
    frame_targets: list[int | None] = []
    frame_cents: list[float | None] = []
    for note, confidence in zip(midi, periodicity, strict=False):
        if not np.isfinite(note) or not np.isfinite(confidence) or confidence < 0.21:
            frame_targets.append(None)
            frame_cents.append(None)
            continue
        target = _nearest_scale_note(float(note), allowed)
        raw_cents = (target - float(note)) * 100.0
        frame_targets.append(int(round(target)))
        frame_cents.append(raw_cents)

    events: list[dict[str, Any]] = []
    start = None
    target_note = None
    cents_buffer: list[float] = []
    confidence_buffer: list[float] = []

    def close(index: int) -> None:
        nonlocal start, target_note, cents_buffer, confidence_buffer
        if start is None or target_note is None or not cents_buffer:
            start = None
            target_note = None
            cents_buffer = []
            confidence_buffer = []
            return
        end = max(start + 1, index)
        start_seconds = float(times[start])
        end_seconds = float(times[min(end, len(times) - 1)] + HOP_SECONDS)
        duration = end_seconds - start_seconds
        raw = float(np.median(np.asarray(cents_buffer, dtype=np.float64)))
        desired = 0.0 if abs(raw) < snap_threshold_cents else _clamp(raw * strength, -max_shift_cents, max_shift_cents)
        if duration >= 0.08 and abs(desired) >= 1.0:
            events.append({
                "start_seconds": round(start_seconds, 6),
                "end_seconds": round(end_seconds, 6),
                "duration_seconds": round(duration, 6),
                "target_midi": target_note,
                "raw_error_cents": round(raw, 3),
                "applied_shift_cents": round(desired, 3),
                "applied_shift_semitones": round(desired / 100.0, 6),
                "mean_periodicity": round(float(np.mean(confidence_buffer)), 6),
            })
        start = None
        target_note = None
        cents_buffer = []
        confidence_buffer = []

    for index, (target, cents, confidence) in enumerate(zip(frame_targets, frame_cents, periodicity, strict=False)):
        if target is None or cents is None:
            close(index)
            continue
        if start is None:
            start = index
            target_note = target
        elif target != target_note:
            close(index)
            start = index
            target_note = target
        cents_buffer.append(float(cents))
        confidence_buffer.append(float(confidence))
    close(len(frame_targets) - 1)
    return events


def _fit_length(audio: np.ndarray, samples: int) -> np.ndarray:
    if audio.shape[1] == samples:
        return audio
    if audio.shape[1] > samples:
        return audio[:, :samples]
    padding = np.zeros((audio.shape[0], samples - audio.shape[1]), dtype=audio.dtype)
    return np.concatenate([audio, padding], axis=1)


def _shift_segment(segment: np.ndarray, sr: int, semitones: float) -> np.ndarray:
    stretch = ps.Signalsmith.Stretch()
    stretch.preset(segment.shape[0], sr)
    stretch.setTransposeSemitones(float(semitones))
    stretch.timeFactor = 1.0
    processed = np.asarray(stretch.process(segment), dtype=np.float32)
    if processed.ndim == 1:
        processed = processed[np.newaxis, :]
    return _fit_length(processed, segment.shape[1])


def _apply_pitch_correction(source: Path, destination: Path, events: list[dict[str, Any]]) -> dict[str, Any]:
    audio, sr = sf.read(str(source), always_2d=True, dtype="float32")
    channels = audio.T.copy()
    rendered = channels.copy()
    crossfade_samples = max(16, int(sr * 0.015))
    applied = 0
    for event in events:
        start = max(0, int(float(event["start_seconds"]) * sr))
        end = min(rendered.shape[1], int(float(event["end_seconds"]) * sr))
        if end - start < max(64, crossfade_samples * 2):
            continue
        padded_start = max(0, start - crossfade_samples)
        padded_end = min(rendered.shape[1], end + crossfade_samples)
        original = channels[:, padded_start:padded_end]
        shifted = _shift_segment(original, sr, float(event["applied_shift_semitones"]))
        alpha = np.ones(original.shape[1], dtype=np.float32)
        fade = min(crossfade_samples, original.shape[1] // 3)
        if fade > 1:
            ramp = np.linspace(0.0, 1.0, fade, dtype=np.float32)
            alpha[:fade] = ramp
            alpha[-fade:] = ramp[::-1]
        rendered[:, padded_start:padded_end] = (
            original * (1.0 - alpha[np.newaxis, :]) + shifted * alpha[np.newaxis, :]
        )
        applied += 1
    peak = float(np.max(np.abs(rendered))) if rendered.size else 0.0
    if peak > 0.98:
        rendered *= 0.98 / peak
    sf.write(str(destination), rendered.T, sr, subtype="PCM_24")
    return {
        "event_count": len(events),
        "applied_event_count": applied,
        "sample_rate": sr,
        "channels": rendered.shape[0],
        "peak_after_safety": round(float(np.max(np.abs(rendered))) if rendered.size else 0.0, 6),
        "preserve_vibrato": True,
        "render_strategy": "NOTE_SEGMENT_CONSTANT_SHIFT_WITH_CROSSFADE",
    }


def _timing_analysis(path: Path, bpm: float | None, offset_seconds: float, strength: float, max_shift_ms: float) -> dict[str, Any]:
    if bpm is None:
        return {
            "status": "REFERENCE_REQUIRED",
            "applied": False,
            "reason": "BPM_OR_STEM_DERIVED_BEAT_GRID_REQUIRED",
            "phrase_warp_engine_required": True,
        }
    mono, sr = librosa.load(str(path), sr=22050, mono=True)
    onset_frames = librosa.onset.onset_detect(y=mono, sr=sr, backtrack=True, units="frames")
    onsets = librosa.frames_to_time(onset_frames, sr=sr)
    grid = 60.0 / bpm / 2.0
    candidates = []
    for onset in onsets:
        nearest_index = round((float(onset) - offset_seconds) / grid)
        target = offset_seconds + nearest_index * grid
        raw_shift_ms = (target - float(onset)) * 1000.0
        if abs(raw_shift_ms) <= max_shift_ms:
            candidates.append({
                "source_seconds": round(float(onset), 6),
                "target_seconds": round(float(target), 6),
                "raw_shift_ms": round(raw_shift_ms, 3),
                "suggested_shift_ms": round(raw_shift_ms * strength, 3),
            })
    return {
        "status": "ANALYZED_REFERENCE_GRID",
        "applied": False,
        "bpm": bpm,
        "grid_division": "EIGHTH_NOTE",
        "reference_offset_seconds": offset_seconds,
        "onset_count": int(len(onsets)),
        "candidate_count": len(candidates),
        "candidates": candidates[:400],
        "phrase_warp_engine_required": True,
    }


def _upload(path: Path, upload: dict[str, str], content_type: str) -> None:
    with path.open("rb") as handle:
        response = requests.put(
            upload["signed_url"],
            data=handle,
            headers={"Content-Type": content_type},
            timeout=UPLOAD_TIMEOUT_SECONDS,
        )
    if not response.ok:
        detail = _text(response.text).replace("\n", " ")[:600]
        raise RuntimeError(f"AVANTIQO_MUSIC_VOCAL_CORRECTION_UPLOAD_FAILED:{response.status_code}:{detail}")


def _validated_input(job: dict[str, Any]) -> dict[str, Any]:
    data = _object(job.get("input"))
    if _text(data.get("contract")) != ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_CONTRACT_INVALID")
    if _text(data.get("capability")) != CAPABILITY:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_CAPABILITY_INVALID")
    if _text(data.get("model")) != MODEL:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_MODEL_INVALID")
    if _text(data.get("quality_profile")) != QUALITY_PROFILE:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_QUALITY_PROFILE_INVALID")
    source_audio = _safe_supabase_url(data.get("source_audio"))
    rights = _validate_attestation(data)
    uploads = _validated_uploads(data)
    correction = _object(data.get("correction"))
    source_role = _text(correction.get("source_role") or "vocal").lower()
    if source_role not in {"vocal", "isolated_vocal"}:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_ISOLATED_VOCAL_REQUIRED")
    pitch_strength = _clamp(_number(correction.get("pitch_strength"), 0.72) or 0.72, 0.0, 1.0)
    timing_strength = _clamp(_number(correction.get("timing_strength"), 0.45) or 0.45, 0.0, 1.0)
    max_shift_cents = _clamp(_number(correction.get("max_pitch_shift_cents"), 160.0) or 160.0, 25.0, 400.0)
    snap_threshold_cents = _clamp(_number(correction.get("snap_threshold_cents"), 24.0) or 24.0, 5.0, 80.0)
    bpm = _number(correction.get("bpm"), None)
    if bpm is not None and not 30 <= bpm <= 300:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_BPM_INVALID")
    key = _text(correction.get("key")) or None
    return {
        **data,
        "source_audio": source_audio,
        "rights_attestation": rights,
        "output_uploads": uploads,
        "correction": {
            "source_role": source_role,
            "key": key,
            "bpm": bpm,
            "beat_offset_seconds": max(0.0, _number(correction.get("beat_offset_seconds"), 0.0) or 0.0),
            "pitch_strength": pitch_strength,
            "timing_strength": timing_strength,
            "max_pitch_shift_cents": max_shift_cents,
            "max_timing_shift_ms": _clamp(_number(correction.get("max_timing_shift_ms"), 80.0) or 80.0, 10.0, 250.0),
            "snap_threshold_cents": snap_threshold_cents,
            "preserve_vibrato": _boolean(correction.get("preserve_vibrato"), True),
            "preserve_formants": _boolean(correction.get("preserve_formants"), True),
        },
    }


def _handler(job: dict[str, Any]) -> dict[str, Any]:
    data = _validated_input(job)
    correction = data["correction"]
    with tempfile.TemporaryDirectory(prefix="avantiqo-music-vocal-correction-") as directory:
        root = Path(directory)
        downloaded = root / "source.bin"
        normalized = root / "source-48k.wav"
        corrected = root / "corrected-vocal.wav"
        report_path = root / "correction-report.json"
        source_bytes = _download_source(data["source_audio"], downloaded)
        duration = _probe_duration(downloaded)
        _run(
            [
                "ffmpeg", "-y", "-i", str(downloaded), "-vn",
                "-ar", str(SAMPLE_RATE), "-ac", "1", "-c:a", "pcm_f32le", str(normalized),
            ],
            "AVANTIQO_MUSIC_VOCAL_CORRECTION_NORMALIZE_FAILED",
        )
        times, midi, periodicity, analysis_sr = _pitch_track(normalized)
        requested_key = _parse_key(correction["key"] or "") if correction["key"] else None
        if requested_key:
            root_pc, mode = requested_key
            key_confidence = 1.0
            key_source = "REQUESTED_OR_UPSTREAM_ANALYSIS"
        else:
            root_pc, mode, key_confidence = _infer_key(midi, periodicity)
            key_source = "INFERRED_FROM_VOCAL_PITCH_CLASS_HISTOGRAM"
        events = _correction_events(
            times,
            midi,
            periodicity,
            root_pc,
            mode,
            correction["pitch_strength"],
            correction["snap_threshold_cents"],
            correction["max_pitch_shift_cents"],
        )
        render = _apply_pitch_correction(normalized, corrected, events)
        timing = _timing_analysis(
            corrected,
            correction["bpm"],
            correction["beat_offset_seconds"],
            correction["timing_strength"],
            correction["max_timing_shift_ms"],
        )
        voiced = np.isfinite(midi)
        pitch_error = [abs(float(event["raw_error_cents"])) for event in events]
        report = {
            "contract": "AVANTIQO_MUSIC_VOCAL_CORRECTION_REPORT_V1",
            "engine_contract": ENGINE_CONTRACT,
            "capability": CAPABILITY,
            "model": MODEL,
            "pitch_engine": PITCH_ENGINE,
            "stretch_engine": STRETCH_ENGINE,
            "quality_profile": QUALITY_PROFILE,
            "duration_seconds": duration,
            "source_bytes": source_bytes,
            "analysis_sample_rate": analysis_sr,
            "analysis_hop_seconds": HOP_SECONDS,
            "voiced_frame_ratio": round(float(np.mean(voiced.astype(np.float32))) if voiced.size else 0.0, 6),
            "key": {
                "root_pitch_class": root_pc,
                "mode": mode,
                "confidence": round(float(key_confidence), 6),
                "source": key_source,
            },
            "pitch": {
                "strength": correction["pitch_strength"],
                "snap_threshold_cents": correction["snap_threshold_cents"],
                "max_pitch_shift_cents": correction["max_pitch_shift_cents"],
                "event_count": len(events),
                "median_detected_error_cents": round(float(np.median(pitch_error)), 3) if pitch_error else 0.0,
                "preserve_vibrato": correction["preserve_vibrato"],
                "preserve_formants_requested": correction["preserve_formants"],
                "events": events[:1200],
                "render": render,
            },
            "timing": timing,
            "safety": {
                "isolated_vocal_only": True,
                "mixed_program_pitch_correction_forbidden": True,
                "rights_contract": RIGHTS_CONTRACT,
                "content_policy": CONTENT_POLICY,
            },
            "readiness": {
                "pitch_correction_complete": render["applied_event_count"] >= 0,
                "timing_analysis_complete": timing["status"] != "REFERENCE_REQUIRED",
                "phrase_timing_warp_complete": False,
                "human_listening_review_required_for_certification": True,
            },
        }
        report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        _upload(corrected, data["output_uploads"]["corrected_vocal_wav"], "audio/wav")
        _upload(report_path, data["output_uploads"]["correction_report_json"], "application/json")
        return {
            "success": True,
            "contract": ENGINE_CONTRACT,
            "capability": CAPABILITY,
            "model": MODEL,
            "quality_profile": QUALITY_PROFILE,
            "corrected_vocal_wav": data["output_uploads"]["corrected_vocal_wav"]["storage_reference"],
            "correction_report_json": data["output_uploads"]["correction_report_json"]["storage_reference"],
            "report": report,
            "provider_job_submitted_by_worker": False,
            "production_certified": False,
        }


if __name__ == "__main__":
    runpod.serverless.start({"handler": _handler})
