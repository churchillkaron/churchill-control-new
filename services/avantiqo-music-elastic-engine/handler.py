from __future__ import annotations

import hashlib
import importlib.metadata
import json
import math
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import numpy as np
import python_stretch as ps
import requests
import runpod
import soundfile as sf

ENGINE_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_AUDIO_ENGINE_V1"
PLAN_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_WARP_PLAN_V1"
REPORT_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_AUDIO_RENDER_REPORT_V1"
PROBE_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_RUNTIME_PROBE_V1"
STRETCH_ENGINE = "SIGNALSMITH_STRETCH_PYTHON_STRETCH_0_3_1"
BOUNDARY_SMOOTHING = "SEAM_TAPER_NO_DUPLICATED_TRAJECTORY_V2"
MAX_DURATION_SECONDS = 900.0
MAX_MARKERS = 4096
MIN_TIME_FACTOR = 0.5
MAX_TIME_FACTOR = 2.0


def _text(value: Any) -> str:
    return str(value or "").strip()


def _number(value: Any, default: float | None = None) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    return result if math.isfinite(result) else default


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _plan_fingerprint(plan: dict[str, Any]) -> str:
    payload = json.dumps(plan, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _download(url: str, destination: Path) -> int:
    if not url.startswith(("https://", "http://")):
        raise ValueError("AVANTIQO_MUSIC_ELASTIC_SOURCE_URL_INVALID")
    with requests.get(url, stream=True, timeout=120) as response:
        response.raise_for_status()
        total = 0
        with destination.open("wb") as output:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if not chunk:
                    continue
                total += len(chunk)
                if total > 1024 * 1024 * 1024:
                    raise ValueError("AVANTIQO_MUSIC_ELASTIC_SOURCE_TOO_LARGE")
                output.write(chunk)
    return total


def _upload(url: str, source: Path, content_type: str) -> None:
    if not url.startswith(("https://", "http://")):
        raise ValueError("AVANTIQO_MUSIC_ELASTIC_OUTPUT_UPLOAD_URL_INVALID")
    with source.open("rb") as handle:
        response = requests.put(url, data=handle, headers={"Content-Type": content_type}, timeout=180)
    response.raise_for_status()


def _run(args: list[str], code: str) -> None:
    completed = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if completed.returncode != 0:
        detail = completed.stderr.decode("utf-8", errors="replace")[-2000:]
        raise RuntimeError(f"{code}:{detail}")


def _normalise_source(source: Path, destination: Path, offset: float, duration: float) -> None:
    _run([
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-ss", f"{offset:.9f}", "-t", f"{duration:.9f}", "-i", str(source),
        "-vn", "-ar", "48000", "-ac", "2", "-c:a", "pcm_f32le", str(destination),
    ], "AVANTIQO_MUSIC_ELASTIC_NORMALIZE_FAILED")


def _fit_length(audio: np.ndarray, samples: int) -> np.ndarray:
    if audio.ndim == 1:
        audio = audio[np.newaxis, :]
    if audio.shape[1] == samples:
        return audio.astype(np.float32, copy=False)
    if audio.shape[1] > samples:
        return audio[:, :samples].astype(np.float32, copy=False)
    return np.concatenate([audio, np.zeros((audio.shape[0], samples - audio.shape[1]), dtype=np.float32)], axis=1)


def _stretch_segment(segment: np.ndarray, sr: int, target_samples: int) -> np.ndarray:
    source_samples = segment.shape[1]
    if source_samples <= 0 or target_samples <= 0:
        raise ValueError("AVANTIQO_MUSIC_ELASTIC_SEGMENT_LENGTH_INVALID")
    factor = target_samples / float(source_samples)
    if factor < MIN_TIME_FACTOR or factor > MAX_TIME_FACTOR:
        raise ValueError(f"AVANTIQO_MUSIC_ELASTIC_TIME_FACTOR_OUTSIDE_CERTIFIABLE_RANGE:{factor:.6f}")
    if abs(factor - 1.0) < 1e-5:
        return _fit_length(segment.copy(), target_samples)
    stretch = ps.Signalsmith.Stretch()
    stretch.preset(segment.shape[0], sr)
    stretch.timeFactor = float(factor)
    processed = np.asarray(stretch.process(segment), dtype=np.float32)
    return _fit_length(processed, target_samples)


def _smooth_join(previous: np.ndarray, current: np.ndarray, fade_samples: int) -> dict[str, int | str]:
    """Smooth a segment boundary without duplicating a crossfade trajectory.

    The old implementation copied one identical left/right blend into both the
    previous tail and current head. Concatenation therefore replayed the same
    transition twice. V2 preserves the exact segment lengths and uses a single
    shared seam value: the previous tail tapers toward the seam while the next
    head independently tapers away from it.
    """
    count = min(fade_samples, previous.shape[1] // 4, current.shape[1] // 4)
    if count <= 1:
        return {"contract": BOUNDARY_SMOOTHING, "smoothed_samples_per_side": 0}
    ramp = np.linspace(0.0, 1.0, count, dtype=np.float32)[np.newaxis, :]
    left = previous[:, -count:].copy()
    right = current[:, :count].copy()
    seam = ((left[:, -1:] + right[:, :1]) * 0.5).astype(np.float32, copy=False)
    previous[:, -count:] = left * (1.0 - ramp) + seam * ramp
    current[:, :count] = seam * (1.0 - ramp) + right * ramp
    return {"contract": BOUNDARY_SMOOTHING, "smoothed_samples_per_side": count}


def _validate_plan(plan: Any, source_duration: float, source_asset_id: str | None) -> tuple[list[dict[str, Any]], str]:
    if not isinstance(plan, dict) or _text(plan.get("contract")) != PLAN_CONTRACT:
        raise ValueError("AVANTIQO_MUSIC_ELASTIC_PLAN_CONTRACT_INVALID")
    if plan.get("automatic_apply_forbidden") is not True:
        raise ValueError("AVANTIQO_MUSIC_ELASTIC_AUTOMATIC_APPLY_GUARD_REQUIRED")
    if plan.get("pitch_preserving_render_required") is not True or plan.get("transient_preservation_required") is not True:
        raise ValueError("AVANTIQO_MUSIC_ELASTIC_RENDER_GOVERNANCE_REQUIRED")
    if plan.get("render_ready") is not True or plan.get("all_reviewed") is not True:
        raise ValueError("AVANTIQO_MUSIC_ELASTIC_PLAN_REVIEW_INCOMPLETE")
    plan_asset_id = _text(plan.get("source_asset_id")) or None
    if source_asset_id and plan_asset_id and source_asset_id != plan_asset_id:
        raise ValueError("AVANTIQO_MUSIC_ELASTIC_SOURCE_ASSET_MISMATCH")
    plan_duration = _number(plan.get("duration_seconds"), None)
    if plan_duration is None or abs(plan_duration - source_duration) > 0.05:
        raise ValueError("AVANTIQO_MUSIC_ELASTIC_SOURCE_DURATION_MISMATCH")
    markers = plan.get("markers")
    if not isinstance(markers, list) or len(markers) > MAX_MARKERS:
        raise ValueError("AVANTIQO_MUSIC_ELASTIC_MARKER_LIMIT_INVALID")

    approved: list[dict[str, Any]] = []
    previous_source = 0.0
    previous_target = 0.0
    for index, raw in enumerate(markers):
        marker = raw if isinstance(raw, dict) else {}
        source = _number(marker.get("source_seconds"), None)
        target = _number(marker.get("target_seconds"), None)
        shift = _number(marker.get("proposed_shift_ms"), 0.0) or 0.0
        needs_move = abs(shift) >= 1.0
        if source is None or target is None or source < 0 or source > source_duration:
            raise ValueError(f"AVANTIQO_MUSIC_ELASTIC_MARKER_TIME_INVALID:{index}")
        if needs_move and marker.get("approved") is not True:
            raise ValueError(f"AVANTIQO_MUSIC_ELASTIC_MARKER_NOT_APPROVED:{index}")
        if not needs_move:
            continue
        if source <= previous_source + 1e-6 or target <= previous_target + 1e-6:
            raise ValueError(f"AVANTIQO_MUSIC_ELASTIC_NON_MONOTONIC_WARP:{index}")
        previous_source = source
        previous_target = target
        approved.append({
            "id": _text(marker.get("id")) or f"warp-{index + 1}",
            "source_seconds": float(source),
            "target_seconds": float(target),
            "requested_shift_ms": float(shift),
            "musician_override": marker.get("musician_override") is True,
        })
    if not approved:
        raise ValueError("AVANTIQO_MUSIC_ELASTIC_APPROVED_MARKER_REQUIRED")
    return approved, _plan_fingerprint(plan)


def _render(source_path: Path, destination_path: Path, markers: list[dict[str, Any]]) -> dict[str, Any]:
    audio, sr = sf.read(str(source_path), always_2d=True, dtype="float32")
    channels = audio.T.copy()
    duration = channels.shape[1] / float(sr)
    anchors = [{"id": "start", "source_seconds": 0.0, "target_seconds": 0.0, "requested_shift_ms": 0.0}]
    anchors.extend(markers)
    anchors.append({"id": "end", "source_seconds": duration, "target_seconds": duration, "requested_shift_ms": 0.0})
    for index in range(1, len(anchors)):
        if anchors[index]["source_seconds"] <= anchors[index - 1]["source_seconds"] + 1e-6:
            raise ValueError(f"AVANTIQO_MUSIC_ELASTIC_SOURCE_ANCHOR_ORDER_INVALID:{index}")
        if anchors[index]["target_seconds"] <= anchors[index - 1]["target_seconds"] + 1e-6:
            raise ValueError(f"AVANTIQO_MUSIC_ELASTIC_TARGET_ANCHOR_ORDER_INVALID:{index}")

    pieces: list[np.ndarray] = []
    evidence: list[dict[str, Any]] = []
    boundary_evidence: list[dict[str, Any]] = []
    fade_samples = max(32, int(sr * 0.006))
    rendered_samples = 0
    for index in range(len(anchors) - 1):
        left = anchors[index]
        right = anchors[index + 1]
        source_start = int(round(left["source_seconds"] * sr))
        source_end = min(channels.shape[1], int(round(right["source_seconds"] * sr)))
        target_start = int(round(left["target_seconds"] * sr))
        target_end = int(round(right["target_seconds"] * sr))
        source_count = source_end - source_start
        target_count = target_end - target_start
        if source_count < 32 or target_count < 32:
            raise ValueError(f"AVANTIQO_MUSIC_ELASTIC_SEGMENT_TOO_SHORT:{index}")
        segment = channels[:, source_start:source_end]
        rendered = _stretch_segment(segment, sr, target_count)
        if pieces:
            smoothing = _smooth_join(pieces[-1], rendered, fade_samples)
            boundary_evidence.append({"boundary_index": index - 1, **smoothing})
        pieces.append(rendered)
        rendered_samples += rendered.shape[1]
        evidence.append({
            "segment_index": index,
            "source_start_seconds": round(source_start / float(sr), 6),
            "source_end_seconds": round(source_end / float(sr), 6),
            "target_start_seconds": round(target_start / float(sr), 6),
            "target_end_seconds": round(target_end / float(sr), 6),
            "source_samples": source_count,
            "rendered_samples": rendered.shape[1],
            "time_factor": round(rendered.shape[1] / float(source_count), 8),
        })
    output = np.concatenate(pieces, axis=1)
    expected = int(round(duration * sr))
    output = _fit_length(output, expected)
    peak = float(np.max(np.abs(output))) if output.size else 0.0
    if peak > 0.98:
        output *= 0.98 / peak
    sf.write(str(destination_path), output.T, sr, subtype="PCM_24")
    return {
        "sample_rate": sr,
        "channels": output.shape[0],
        "source_samples": channels.shape[1],
        "rendered_samples": output.shape[1],
        "duration_seconds": round(output.shape[1] / float(sr), 6),
        "peak_after_safety": round(float(np.max(np.abs(output))) if output.size else 0.0, 6),
        "segment_count": len(evidence),
        "segments": evidence,
        "boundary_count": len(boundary_evidence),
        "boundaries": boundary_evidence,
        "pitch_preserving_time_stretch": True,
        "stretch_engine": STRETCH_ENGINE,
        "boundary_smoothing_contract": BOUNDARY_SMOOTHING,
        "boundary_smoothing_ms": 6,
        "duplicated_transition_trajectory": False,
    }


def _runtime_probe() -> dict[str, Any]:
    python_stretch_version = importlib.metadata.version("python-stretch")
    completed = subprocess.run(
        ["ffmpeg", "-version"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        text=True,
    )
    if completed.returncode != 0:
        detail = completed.stderr[-1000:]
        raise RuntimeError(f"AVANTIQO_MUSIC_ELASTIC_RUNTIME_PROBE_FFMPEG_FAILED:{detail}")
    ffmpeg_version = (completed.stdout.splitlines() or ["unknown"])[0].strip()
    stretch = ps.Signalsmith.Stretch()
    stretch.preset(2, 48000)
    return {
        "success": True,
        "contract": PROBE_CONTRACT,
        "engine_contract": ENGINE_CONTRACT,
        "stretch_engine": STRETCH_ENGINE,
        "python_stretch_version": python_stretch_version,
        "signalsmith_initialization": True,
        "ffmpeg_available": True,
        "ffmpeg_version": ffmpeg_version,
        "boundary_smoothing_contract": BOUNDARY_SMOOTHING,
        "source_download_performed": False,
        "render_performed": False,
        "output_upload_performed": False,
        "automatic_apply_performed": False,
        "provider_job_submitted": False,
        "production_certified": False,
        "human_listening_review_required": True,
    }


def handler(job):
    data = dict((job or {}).get("input") or {})
    if _text(data.get("contract")) != ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_MUSIC_ELASTIC_ENGINE_CONTRACT_INVALID")
    if _text(data.get("mode")).lower() == "runtime_probe":
        return _runtime_probe()
    source_url = _text(data.get("source_audio_url"))
    output_upload_url = _text(data.get("output_upload_url"))
    source_asset_id = _text(data.get("source_asset_id")) or None
    offset = max(0.0, _number(data.get("source_offset_seconds"), 0.0) or 0.0)
    duration = _number(data.get("duration_seconds"), None)
    if duration is None or duration <= 0 or duration > MAX_DURATION_SECONDS:
        raise ValueError("AVANTIQO_MUSIC_ELASTIC_DURATION_INVALID")

    with tempfile.TemporaryDirectory(prefix="avantiqo-elastic-") as directory:
        root = Path(directory)
        downloaded = root / "source.bin"
        normalized = root / "source-48k.wav"
        rendered = root / "elastic-render.wav"
        source_bytes = _download(source_url, downloaded)
        source_file_checksum = _sha256_file(downloaded)
        expected_source_checksum = _text(data.get("source_file_checksum")) or None
        if expected_source_checksum and expected_source_checksum != source_file_checksum:
            raise ValueError("AVANTIQO_MUSIC_ELASTIC_SOURCE_FILE_CHECKSUM_MISMATCH")
        _normalise_source(downloaded, normalized, offset, duration)
        normalized_audio, normalized_sr = sf.read(str(normalized), always_2d=True, dtype="float32")
        normalized_duration = normalized_audio.shape[0] / float(normalized_sr)
        markers, fingerprint = _validate_plan(data.get("approved_warp_plan"), normalized_duration, source_asset_id)
        render = _render(normalized, rendered, markers)
        output_checksum = _sha256_file(rendered)
        _upload(output_upload_url, rendered, "audio/wav")
        return {
            "contract": REPORT_CONTRACT,
            "engine_contract": ENGINE_CONTRACT,
            "stretch_engine": STRETCH_ENGINE,
            "execution_mode": "MUSICIAN_APPROVED_WARP_PLAN",
            "source_asset_id": source_asset_id,
            "source_file_checksum": source_file_checksum,
            "source_bytes": source_bytes,
            "source_offset_seconds": offset,
            "source_duration_seconds": normalized_duration,
            "approved_warp_plan_fingerprint": fingerprint,
            "approved_marker_count": len(markers),
            "output_checksum": output_checksum,
            "output_format": "WAV_PCM24",
            "render": render,
            "original_source_preserved": True,
            "automatic_apply_performed": False,
            "provider_job_submitted": True,
            "production_certified": False,
            "human_listening_review_required": True,
        }


runpod.serverless.start({"handler": handler})
