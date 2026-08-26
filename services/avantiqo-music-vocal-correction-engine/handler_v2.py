import json
import tempfile
from pathlib import Path

import numpy as np
import runpod

import handler as base
from key_parser import KEY_PARSER_CONTRACT, parse_music_key
from timing import apply_phrase_timing_correction

ENGINE_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2"
QUALITY_PROFILE = "TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V2"
REPORT_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_REPORT_V2"
MIN_VOICED_FRAME_RATIO = 0.02


def _validated_input(job):
    raw = dict(job or {})
    data = dict(raw.get("input") or {})
    if base._text(data.get("contract")) != ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2_CONTRACT_INVALID")
    if base._text(data.get("quality_profile")) != QUALITY_PROFILE:
        raise ValueError("AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2_QUALITY_PROFILE_INVALID")
    data["contract"] = base.ENGINE_CONTRACT
    data["quality_profile"] = base.QUALITY_PROFILE
    validated = base._validated_input({"input": data})
    validated["contract"] = ENGINE_CONTRACT
    validated["quality_profile"] = QUALITY_PROFILE
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
        "reason": "ONE_OR_MORE_DETECTED_PITCH_EVENTS_WERE_NOT_RENDERED",
    }


def _handler(job):
    data = _validated_input(job)
    correction = data["correction"]
    with tempfile.TemporaryDirectory(prefix="avantiqo-music-vocal-correction-v2-") as directory:
        root = Path(directory)
        downloaded = root / "source.bin"
        normalized = root / "source-48k.wav"
        pitch_corrected = root / "pitch-corrected-vocal.wav"
        corrected = root / "corrected-vocal.wav"
        report_path = root / "correction-report.json"

        source_bytes = base._download_source(data["source_audio"], downloaded)
        duration = base._probe_duration(downloaded)
        base._run(
            [
                "ffmpeg", "-y", "-i", str(downloaded), "-vn",
                "-ar", str(base.SAMPLE_RATE), "-ac", "1",
                "-c:a", "pcm_f32le", str(normalized),
            ],
            "AVANTIQO_MUSIC_VOCAL_CORRECTION_V2_NORMALIZE_FAILED",
        )

        times, midi, periodicity, analysis_sr = base._pitch_track(normalized)
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
        pitch_render = base._apply_pitch_correction(normalized, pitch_corrected, events)

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
            "duration_seconds": duration,
            "source_bytes": source_bytes,
            "analysis_sample_rate": analysis_sr,
            "analysis_hop_seconds": base.HOP_SECONDS,
            "voiced_frame_ratio": round(voiced_frame_ratio, 6),
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
                "formant_compensation_explicitly_configured": False,
                "formant_preservation_claimed": False,
                "readiness": pitch_readiness,
                "events": events[:1200],
                "render": pitch_render,
            },
            "timing": timing,
            "safety": {
                "isolated_vocal_only": True,
                "mixed_program_pitch_correction_forbidden": True,
                "whole_phrase_timing_only": True,
                "syllable_time_stretch_forbidden": True,
                "unsafe_phrase_moves_skipped": True,
                "unverified_formant_preservation_claim_forbidden": True,
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
            "corrected_vocal_wav": data["output_uploads"]["corrected_vocal_wav"]["storage_reference"],
            "correction_report_json": data["output_uploads"]["correction_report_json"]["storage_reference"],
            "report": report,
            "provider_job_submitted_by_worker": False,
            "production_certified": False,
        }


if __name__ == "__main__":
    runpod.serverless.start({"handler": _handler})
