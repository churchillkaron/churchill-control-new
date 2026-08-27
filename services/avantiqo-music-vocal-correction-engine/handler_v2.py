import hashlib
import json
import shutil
import tempfile
from pathlib import Path

import numpy as np
import python_stretch as ps
import runpod
import soundfile as sf

import handler as base
from key_parser import KEY_PARSER_CONTRACT, parse_music_key
from timing import apply_phrase_timing_correction

ENGINE_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2"
QUALITY_PROFILE = "TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V2"
REPORT_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_REPORT_V2"
TUNING_PLAN_CONTRACT = "AVANTIQO_MUSIC_VOCAL_TUNING_PLAN_V1"
MIN_VOICED_FRAME_RATIO = 0.02
MAX_APPROVED_SEGMENTS = 1200
TONALITY_LIMIT_HZ = 8000.0


def _sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def _validated_source_window(value):
    source = base._object(value)
    offset = max(0.0, base._number(source.get("offset_seconds"), 0.0) or 0.0)
    duration = base._number(source.get("duration_seconds"), None)
    if duration is not None:
        if duration <= 0 or duration > base.MAX_SOURCE_DURATION_SECONDS:
            raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_SOURCE_WINDOW_DURATION_INVALID")
    return {
        "offset_seconds": offset,
        "duration_seconds": duration,
        "source_asset_id": base._text(source.get("source_asset_id")) or None,
    }


def _plan_fingerprint(plan):
    payload = json.dumps(plan, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _validated_approved_tuning_plan(value, source_window):
    if value is None:
        return None
    plan = base._object(value)
    if base._text(plan.get("contract")) != TUNING_PLAN_CONTRACT:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_APPROVED_PLAN_CONTRACT_INVALID")
    if plan.get("auto_apply_forbidden") is not True:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_APPROVED_PLAN_AUTO_APPLY_GUARD_REQUIRED")
    if plan.get("musician_approval_required") is not True:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_APPROVED_PLAN_MUSICIAN_REVIEW_REQUIRED")
    if plan.get("all_segments_reviewed") is not True:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_APPROVED_PLAN_REVIEW_INCOMPLETE")

    plan_offset = base._number(plan.get("source_offset_seconds"), None)
    plan_duration = base._number(plan.get("source_duration_seconds"), None)
    window_duration = source_window.get("duration_seconds")
    if plan_offset is not None and abs(plan_offset - source_window["offset_seconds"]) > 0.001:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_APPROVED_PLAN_SOURCE_OFFSET_MISMATCH")
    if plan_duration is not None and window_duration is not None and abs(plan_duration - window_duration) > 0.01:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_APPROVED_PLAN_SOURCE_DURATION_MISMATCH")

    settings = base._object(plan.get("settings"))
    max_correction = base._number(settings.get("max_correction_cents"), 200.0) or 200.0
    max_correction = base._clamp(max_correction, 0.0, 600.0)
    raw_segments = plan.get("segments")
    if not isinstance(raw_segments, list):
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_APPROVED_PLAN_SEGMENTS_REQUIRED")
    if len(raw_segments) > MAX_APPROVED_SEGMENTS:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_APPROVED_PLAN_SEGMENT_LIMIT_EXCEEDED")

    events = []
    previous_end = -1.0
    for index, raw_segment in enumerate(raw_segments):
        segment = base._object(raw_segment)
        start = base._number(segment.get("start_seconds"), None)
        end = base._number(segment.get("end_seconds"), None)
        if start is None or end is None or start < 0 or end <= start:
            raise ValueError(
                f"AVANTIQO_MUSIC_VOCAL_CORRECTION_APPROVED_PLAN_SEGMENT_TIME_INVALID:{index}"
            )
        if start < previous_end - 0.001:
            raise ValueError(
                f"AVANTIQO_MUSIC_VOCAL_CORRECTION_APPROVED_PLAN_SEGMENT_OVERLAP:{index}"
            )
        if window_duration is not None and end > window_duration + 0.01:
            raise ValueError(
                f"AVANTIQO_MUSIC_VOCAL_CORRECTION_APPROVED_PLAN_SEGMENT_OUTSIDE_WINDOW:{index}"
            )
        previous_end = end

        correction_cents = base._number(segment.get("proposed_correction_cents"), 0.0) or 0.0
        if abs(correction_cents) > max_correction + 0.1 or abs(correction_cents) > 600.0:
            raise ValueError(
                f"AVANTIQO_MUSIC_VOCAL_CORRECTION_APPROVED_PLAN_SHIFT_LIMIT_EXCEEDED:{index}"
            )
        requires_correction = abs(correction_cents) > 0.01
        if requires_correction and segment.get("approved") is not True:
            raise ValueError(
                f"AVANTIQO_MUSIC_VOCAL_CORRECTION_APPROVED_PLAN_SEGMENT_NOT_APPROVED:{index}"
            )
        if not requires_correction:
            continue

        target_midi = base._integer(segment.get("target_midi"), None)
        if target_midi is None or target_midi < 12 or target_midi > 120:
            raise ValueError(
                f"AVANTIQO_MUSIC_VOCAL_CORRECTION_APPROVED_PLAN_TARGET_MIDI_INVALID:{index}"
            )
        events.append({
            "plan_segment_id": base._text(segment.get("id")) or f"segment-{index + 1}",
            "start_seconds": round(float(start), 6),
            "end_seconds": round(float(end), 6),
            "duration_seconds": round(float(end - start), 6),
            "target_midi": target_midi,
            "raw_error_cents": round(
                float(base._number(segment.get("raw_correction_cents"), correction_cents) or correction_cents),
                3,
            ),
            "applied_shift_cents": round(float(correction_cents), 3),
            "applied_shift_semitones": round(float(correction_cents) / 100.0, 6),
            "mean_periodicity": round(
                float(base._clamp(base._number(segment.get("confidence"), 0.0) or 0.0, 0.0, 1.0)),
                6,
            ),
            "musician_approved": True,
            "musician_target_override": segment.get("musician_target_override") is True,
        })

    return {
        "contract": TUNING_PLAN_CONTRACT,
        "fingerprint": _plan_fingerprint(plan),
        "source_checksum": base._text(plan.get("source_checksum")) or None,
        "source_asset_id": base._text(plan.get("source_asset_id")) or None,
        "source_offset_seconds": plan_offset,
        "source_duration_seconds": plan_duration,
        "musical_key": base._object(plan.get("musical_key")),
        "settings": settings,
        "segment_count": len(raw_segments),
        "correction_segment_count": len(events),
        "events": events,
        "all_segments_reviewed": True,
        "musician_approval_required": True,
    }


def _validated_input(job):
    raw = dict(job or {})
    data = dict(raw.get("input") or {})
    if base._text(data.get("contract")) != ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2_CONTRACT_INVALID")
    if base._text(data.get("quality_profile")) != QUALITY_PROFILE:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2_QUALITY_PROFILE_INVALID")

    source_window = _validated_source_window(data.get("source_window"))
    approved_plan = _validated_approved_tuning_plan(
        data.get("approved_tuning_plan"),
        source_window,
    )

    data["contract"] = base.ENGINE_CONTRACT
    data["quality_profile"] = base.QUALITY_PROFILE
    validated = base._validated_input({"input": data})
    validated["contract"] = ENGINE_CONTRACT
    validated["quality_profile"] = QUALITY_PROFILE
    validated["source_window"] = source_window
    validated["approved_tuning_plan"] = approved_plan

    if approved_plan is not None and validated["correction"]["timing_strength"] > 0:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_MUSICIAN_PLAN_TIMING_REVIEW_REQUIRED")
    return validated


def _pitch_readiness(voiced_frame_ratio, event_count, applied_event_count):
    if voiced_frame_ratio < MIN_VOICED_FRAME_RATIO:
        return {
            "status": "INSUFFICIENT_VOICING",
            "complete": False,
            "reason": "TOO_FEW_RELIABLY_VOICED_FRAMES_FOR_SAFE_PITCH_CORRECTION",
        }
    if event_count == 0:
        return {
            "status": "NO_CORRECTION_NEEDED",
            "complete": True,
            "reason": "NO_SAFE_OUT_OF_TUNE_NOTE_SEGMENTS_EXCEEDED_THE_CORRECTION_THRESHOLD",
        }
    if applied_event_count == event_count:
        return {
            "status": "APPLIED",
            "complete": True,
            "reason": None,
        }
    return {
        "status": "FAILED",
        "complete": False,
        "reason": "ONE_OR_MORE_APPROVED_PITCH_EVENTS_WERE_NOT_RENDERED",
    }


def _fit_length(audio, samples):
    if audio.shape[1] == samples:
        return audio
    if audio.shape[1] > samples:
        return audio[:, :samples]
    padding = np.zeros((audio.shape[0], samples - audio.shape[1]), dtype=audio.dtype)
    return np.concatenate([audio, padding], axis=1)


def _shift_segment_with_tonality(segment, sr, semitones):
    stretch = ps.Signalsmith.Stretch()
    stretch.preset(segment.shape[0], sr)
    tonality_limit = min(0.49, TONALITY_LIMIT_HZ / float(sr))
    stretch.setTransposeSemitones(float(semitones), tonality_limit)
    stretch.timeFactor = 1.0
    processed = np.asarray(stretch.process(segment), dtype=np.float32)
    if processed.ndim == 1:
        processed = processed[np.newaxis, :]
    return _fit_length(processed, segment.shape[1])


def _apply_pitch_correction(source, destination, events):
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
        shifted = _shift_segment_with_tonality(
            original,
            sr,
            float(event["applied_shift_semitones"]),
        )
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
        "tonality_compensation_applied": applied > 0,
        "tonality_limit_hz": TONALITY_LIMIT_HZ,
        "tonality_limit_normalized": round(min(0.49, TONALITY_LIMIT_HZ / float(sr)), 8),
        "formant_preservation_claimed": False,
        "render_strategy": "NOTE_SEGMENT_CONSTANT_SHIFT_WITH_CROSSFADE_AND_TONALITY_LIMIT",
    }


def _normalize_source(downloaded, normalized, source_window, full_duration):
    offset = source_window["offset_seconds"]
    if offset >= full_duration:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_SOURCE_WINDOW_OFFSET_OUTSIDE_SOURCE")
    requested_duration = source_window.get("duration_seconds")
    duration = requested_duration if requested_duration is not None else full_duration - offset
    if offset + duration > full_duration + 0.05:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_SOURCE_WINDOW_OUTSIDE_SOURCE")
    args = ["ffmpeg", "-y", "-i", str(downloaded)]
    if offset > 0:
        args.extend(["-ss", f"{offset:.9f}"])
    if duration is not None:
        args.extend(["-t", f"{duration:.9f}"])
    args.extend([
        "-vn",
        "-ar", str(base.SAMPLE_RATE),
        "-ac", "1",
        "-c:a", "pcm_f32le",
        str(normalized),
    ])
    base._run(args, "AVANTIQO_MUSIC_VOCAL_CORRECTION_V2_NORMALIZE_FAILED")
    normalized_duration = base._probe_duration(normalized)
    if requested_duration is not None and abs(normalized_duration - requested_duration) > 0.05:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_SOURCE_WINDOW_RENDER_MISMATCH")
    return {
        **source_window,
        "duration_seconds": normalized_duration,
        "full_source_duration_seconds": full_duration,
    }


def _plan_key(plan):
    musical_key = base._object(plan.get("musical_key"))
    key = base._text(musical_key.get("key"))
    mode = base._text(musical_key.get("mode")).lower()
    if not key or mode not in {"major", "minor"}:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_APPROVED_PLAN_KEY_REQUIRED")
    parsed = parse_music_key(f"{key} {mode}")
    if parsed is None:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_APPROVED_PLAN_KEY_INVALID")
    return parsed


def _handler(job):
    data = _validated_input(job)
    correction = data["correction"]
    approved_plan = data.get("approved_tuning_plan")
    execution_mode = "MUSICIAN_APPROVED_PLAN" if approved_plan is not None else "AUTOMATIC_CERTIFICATION"

    with tempfile.TemporaryDirectory(prefix="avantiqo-music-vocal-correction-v2-") as directory:
        root = Path(directory)
        downloaded = root / "source.bin"
        normalized = root / "source-48k.wav"
        pitch_corrected = root / "pitch-corrected-vocal.wav"
        corrected = root / "corrected-vocal.wav"
        report_path = root / "correction-report.json"

        source_bytes = base._download_source(data["source_audio"], downloaded)
        source_checksum = _sha256_file(downloaded)
        if approved_plan is not None and approved_plan.get("source_checksum"):
            if approved_plan["source_checksum"] != source_checksum:
                raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_APPROVED_PLAN_SOURCE_CHECKSUM_MISMATCH")

        full_duration = base._probe_duration(downloaded)
        source_window = _normalize_source(
            downloaded,
            normalized,
            data["source_window"],
            full_duration,
        )
        duration = source_window["duration_seconds"]

        times, midi, periodicity, analysis_sr = base._pitch_track(normalized)
        if approved_plan is not None:
            root_pc, mode = _plan_key(approved_plan)
            key_confidence = 1.0
            key_source = "MUSICIAN_APPROVED_TUNING_PLAN"
            events = approved_plan["events"]
        else:
            requested_key = parse_music_key(correction["key"] or "") if correction["key"] else None
            if correction["key"] and requested_key is None:
                raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_KEY_INVALID")
            if requested_key:
                root_pc, mode = requested_key
                key_confidence = 1.0
                key_source = "REQUESTED_OR_UPSTREAM_ANALYSIS"
            else:
                root_pc, mode, key_confidence = base._infer_key(midi, periodicity)
                key_source = "INFERRED_FROM_VOCAL_PITCH_CLASS_HISTOGRAM"
            events = base._correction_events(
                times,
                midi,
                periodicity,
                root_pc,
                mode,
                correction["pitch_strength"],
                correction["snap_threshold_cents"],
                correction["max_pitch_shift_cents"],
            )

        pitch_render = _apply_pitch_correction(normalized, pitch_corrected, events)

        if approved_plan is not None:
            shutil.copyfile(pitch_corrected, corrected)
            timing = {
                "status": "DISABLED_BY_MUSICIAN_PLAN",
                "applied": False,
                "reason": "TIMING_REQUIRES_SEPARATE_MUSICIAN_REVIEW",
                "phrase_timing_correction_complete": True,
                "timing_strength": 0.0,
            }
        else:
            timing = apply_phrase_timing_correction(
                pitch_corrected,
                corrected,
                bpm=correction["bpm"],
                offset_seconds=correction["beat_offset_seconds"],
                strength=correction["timing_strength"],
                max_shift_ms=correction["max_timing_shift_ms"],
            )

        voiced = np.isfinite(midi)
        voiced_frame_ratio = float(np.mean(voiced.astype(np.float32))) if voiced.size else 0.0
        pitch_error = [abs(float(event["raw_error_cents"])) for event in events]
        pitch_readiness = _pitch_readiness(
            voiced_frame_ratio,
            len(events),
            int(pitch_render.get("applied_event_count", 0)),
        )
        phrase_timing_ready = timing.get("phrase_timing_correction_complete") is True
        correction_pipeline_complete = pitch_readiness["complete"] is True and phrase_timing_ready

        report = {
            "contract": REPORT_CONTRACT,
            "engine_contract": ENGINE_CONTRACT,
            "capability": base.CAPABILITY,
            "model": base.MODEL,
            "pitch_engine": base.PITCH_ENGINE,
            "stretch_engine": base.STRETCH_ENGINE,
            "quality_profile": QUALITY_PROFILE,
            "execution_mode": execution_mode,
            "duration_seconds": duration,
            "source_bytes": source_bytes,
            "source_checksum": source_checksum,
            "source_window": source_window,
            "analysis_sample_rate": analysis_sr,
            "analysis_hop_seconds": base.HOP_SECONDS,
            "voiced_frame_ratio": round(voiced_frame_ratio, 6),
            "approved_tuning_plan": approved_plan and {
                "contract": approved_plan["contract"],
                "fingerprint": approved_plan["fingerprint"],
                "segment_count": approved_plan["segment_count"],
                "correction_segment_count": approved_plan["correction_segment_count"],
                "all_segments_reviewed": True,
                "musician_approval_required": True,
            },
            "key": {
                "parser_contract": KEY_PARSER_CONTRACT,
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
                "median_detected_error_cents": round(
                    float(np.median(pitch_error)), 3
                ) if pitch_error else 0.0,
                "preserve_vibrato": correction["preserve_vibrato"],
                "preserve_formants_requested": correction["preserve_formants"],
                "tonality_compensation_explicitly_configured": True,
                "tonality_limit_hz": TONALITY_LIMIT_HZ,
                "formant_preservation_claimed": False,
                "readiness": pitch_readiness,
                "events": events[:MAX_APPROVED_SEGMENTS],
                "render": pitch_render,
            },
            "timing": timing,
            "safety": {
                "isolated_vocal_only": True,
                "mixed_program_pitch_correction_forbidden": True,
                "approved_plan_exact_events_required_when_supplied": True,
                "musician_plan_timing_auto_apply_forbidden": True,
                "whole_phrase_timing_only": True,
                "syllable_time_stretch_forbidden": True,
                "unsafe_phrase_moves_skipped": True,
                "unverified_formant_preservation_claim_forbidden": True,
                "original_source_preserved": True,
                "rights_contract": base.RIGHTS_CONTRACT,
                "content_policy": base.CONTENT_POLICY,
            },
            "readiness": {
                "pitch_status": pitch_readiness["status"],
                "pitch_correction_complete": pitch_readiness["complete"],
                "timing_analysis_complete": timing.get("status") != "REFERENCE_REQUIRED",
                "phrase_timing_correction_complete": phrase_timing_ready,
                "correction_pipeline_complete": correction_pipeline_complete,
                "human_listening_review_required_for_certification": True,
                "production_certified": False,
            },
        }

        report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        base._upload(
            corrected,
            data["output_uploads"]["corrected_vocal_wav"],
            "audio/wav",
        )
        base._upload(
            report_path,
            data["output_uploads"]["correction_report_json"],
            "application/json",
        )

        return {
            "success": True,
            "contract": ENGINE_CONTRACT,
            "capability": base.CAPABILITY,
            "model": base.MODEL,
            "quality_profile": QUALITY_PROFILE,
            "execution_mode": execution_mode,
            "corrected_vocal_wav": data["output_uploads"]["corrected_vocal_wav"]["storage_reference"],
            "correction_report_json": data["output_uploads"]["correction_report_json"]["storage_reference"],
            "report": report,
            "provider_job_submitted_by_worker": False,
            "production_certified": False,
        }


if __name__ == "__main__":
    runpod.serverless.start({"handler": _handler})
