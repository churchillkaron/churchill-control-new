from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import librosa
import numpy as np
import soundfile as sf


TIMING_CONTRACT = "AVANTIQO_MUSIC_VOCAL_PHRASE_TIMING_V1"


def _number(value: Any, default: float | None = None) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if math.isfinite(number) else default


def _merge_intervals(intervals: np.ndarray, sr: int, maximum_gap_seconds: float) -> list[tuple[int, int]]:
    if intervals.size == 0:
        return []
    maximum_gap = max(1, int(sr * maximum_gap_seconds))
    merged: list[tuple[int, int]] = []
    start = int(intervals[0][0])
    end = int(intervals[0][1])
    for raw_start, raw_end in intervals[1:]:
        next_start = int(raw_start)
        next_end = int(raw_end)
        if next_start - end <= maximum_gap:
            end = max(end, next_end)
            continue
        merged.append((start, end))
        start, end = next_start, next_end
    merged.append((start, end))
    return merged


def _phrase_intervals(audio: np.ndarray, sr: int) -> list[tuple[int, int]]:
    mono = np.mean(audio, axis=0) if audio.ndim == 2 else audio
    raw = librosa.effects.split(
        mono,
        top_db=38,
        frame_length=2048,
        hop_length=256,
    )
    merged = _merge_intervals(raw, sr, maximum_gap_seconds=0.16)
    minimum_phrase = max(1, int(sr * 0.12))
    return [(start, end) for start, end in merged if end - start >= minimum_phrase]


def _nearest_grid_time(source_seconds: float, bpm: float, offset_seconds: float) -> float:
    eighth = 60.0 / bpm / 2.0
    index = round((source_seconds - offset_seconds) / eighth)
    return offset_seconds + index * eighth


def _fade_mask(length: int, fade_samples: int) -> np.ndarray:
    mask = np.ones(length, dtype=np.float32)
    fade = min(max(0, fade_samples), length // 3)
    if fade > 1:
        ramp = np.linspace(0.0, 1.0, fade, dtype=np.float32)
        mask[:fade] = ramp
        mask[-fade:] = ramp[::-1]
    return mask


def _safe_destination(
    index: int,
    source_start: int,
    source_end: int,
    target_start: int,
    intervals: list[tuple[int, int]],
    total_samples: int,
    guard_samples: int,
) -> tuple[bool, str]:
    duration = source_end - source_start
    target_end = target_start + duration
    if target_start < 0 or target_end > total_samples:
        return False, "OUTSIDE_SOURCE_BOUNDS"

    previous_end = intervals[index - 1][1] if index > 0 else 0
    next_start = intervals[index + 1][0] if index + 1 < len(intervals) else total_samples

    # The shifted phrase must still fit inside its own local timing pocket. This
    # avoids collisions with neighboring phrases and preserves the singer's
    # internal phrasing rather than warping every consonant/syllable.
    pocket_start = max(0, previous_end + guard_samples)
    pocket_end = min(total_samples, next_start - guard_samples)
    if target_start < pocket_start or target_end > pocket_end:
        return False, "NEIGHBOR_PHRASE_COLLISION_RISK"
    return True, "SAFE_LOCAL_TIMING_POCKET"


def apply_phrase_timing_correction(
    source_path: Path,
    destination_path: Path,
    *,
    bpm: float | None,
    offset_seconds: float,
    strength: float,
    max_shift_ms: float,
) -> dict[str, Any]:
    if bpm is None:
        source_audio, source_sr = sf.read(str(source_path), always_2d=True, dtype="float32")
        sf.write(str(destination_path), source_audio, source_sr, subtype="PCM_24")
        return {
            "contract": TIMING_CONTRACT,
            "status": "REFERENCE_REQUIRED",
            "applied": False,
            "reason": "BPM_OR_STEM_DERIVED_BEAT_GRID_REQUIRED",
            "phrase_detection_complete": False,
            "phrase_timing_correction_complete": False,
            "bpm": None,
            "candidate_count": 0,
            "applied_phrase_count": 0,
            "skipped_phrase_count": 0,
            "preserve_internal_phrase_timing": True,
            "time_stretch_used": False,
        }

    bpm_value = _number(bpm, None)
    if bpm_value is None or not 30.0 <= bpm_value <= 300.0:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_TIMING_BPM_INVALID")
    strength_value = min(1.0, max(0.0, _number(strength, 0.45) or 0.45))
    maximum_shift_ms = min(250.0, max(10.0, _number(max_shift_ms, 80.0) or 80.0))
    offset = max(0.0, _number(offset_seconds, 0.0) or 0.0)

    source_audio, sr = sf.read(str(source_path), always_2d=True, dtype="float32")
    channels = source_audio.T.copy()
    rendered = channels.copy()
    intervals = _phrase_intervals(channels, sr)
    guard_samples = max(1, int(sr * 0.018))
    fade_samples = max(16, int(sr * 0.012))
    minimum_applied_shift_samples = max(1, int(sr * 0.004))
    candidates: list[dict[str, Any]] = []
    applied = 0
    skipped = 0

    for index, (start, end) in enumerate(intervals):
        source_seconds = start / float(sr)
        nearest = _nearest_grid_time(source_seconds, bpm_value, offset)
        raw_shift_seconds = nearest - source_seconds
        raw_shift_ms = raw_shift_seconds * 1000.0
        desired_shift_ms = max(
            -maximum_shift_ms,
            min(maximum_shift_ms, raw_shift_ms * strength_value),
        )
        shift_samples = int(round(sr * desired_shift_ms / 1000.0))
        event = {
            "phrase_index": index,
            "source_start_seconds": round(source_seconds, 6),
            "source_end_seconds": round(end / float(sr), 6),
            "duration_seconds": round((end - start) / float(sr), 6),
            "nearest_grid_seconds": round(nearest, 6),
            "raw_shift_ms": round(raw_shift_ms, 3),
            "requested_shift_ms": round(desired_shift_ms, 3),
            "applied": False,
            "reason": None,
        }

        if abs(raw_shift_ms) > maximum_shift_ms:
            event["reason"] = "OUTSIDE_CONSERVATIVE_MAX_SHIFT"
            skipped += 1
            candidates.append(event)
            continue
        if abs(shift_samples) < minimum_applied_shift_samples:
            event["reason"] = "ALREADY_CLOSE_TO_REFERENCE_GRID"
            candidates.append(event)
            continue

        target_start = start + shift_samples
        safe, reason = _safe_destination(
            index,
            start,
            end,
            target_start,
            intervals,
            rendered.shape[1],
            guard_samples,
        )
        if not safe:
            event["reason"] = reason
            skipped += 1
            candidates.append(event)
            continue

        duration = end - start
        target_end = target_start + duration
        phrase = channels[:, start:end].copy()
        mask = _fade_mask(duration, fade_samples)
        shaped = phrase * mask[np.newaxis, :]

        # Remove the original phrase only under a short fade window, then place
        # the un-stretched phrase at the safer grid-aligned location. Internal
        # note lengths, vibrato and consonant timing remain untouched.
        rendered[:, start:end] *= (1.0 - mask[np.newaxis, :])
        existing = rendered[:, target_start:target_end]
        rendered[:, target_start:target_end] = (
            existing * (1.0 - mask[np.newaxis, :]) + shaped
        )

        event["applied"] = True
        event["reason"] = reason
        event["applied_shift_ms"] = round(shift_samples / float(sr) * 1000.0, 3)
        event["target_start_seconds"] = round(target_start / float(sr), 6)
        applied += 1
        candidates.append(event)

    peak = float(np.max(np.abs(rendered))) if rendered.size else 0.0
    if peak > 0.98:
        rendered *= 0.98 / peak
    sf.write(str(destination_path), rendered.T, sr, subtype="PCM_24")

    status = "CORRECTED_PHRASES" if applied else "EVALUATED_NO_SAFE_SHIFT"
    return {
        "contract": TIMING_CONTRACT,
        "status": status,
        "applied": applied > 0,
        "bpm": bpm_value,
        "grid_division": "EIGHTH_NOTE",
        "reference_offset_seconds": offset,
        "timing_strength": strength_value,
        "maximum_shift_ms": maximum_shift_ms,
        "phrase_detection_complete": True,
        "phrase_count": len(intervals),
        "candidate_count": len(candidates),
        "applied_phrase_count": applied,
        "skipped_phrase_count": skipped,
        "phrase_timing_correction_complete": True,
        "preserve_internal_phrase_timing": True,
        "preserve_vibrato": True,
        "preserve_formants": True,
        "time_stretch_used": False,
        "render_strategy": "WHOLE_PHRASE_TRANSLATION_WITH_LOCAL_COLLISION_GUARDS",
        "candidates": candidates[:600],
    }
