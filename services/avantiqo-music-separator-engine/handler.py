import ipaddress
import math
import os
import subprocess
import tempfile
import wave
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
import runpod

ENGINE_CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_ENGINE_V1"
CAPABILITY = "ai.audio.stems"
MODEL = "demucs-htdemucs-ft"
DEMUCS_MODEL = "htdemucs_ft"
QUALITY_PROFILE = "DEMUCS_HTDEMUCS_FT_4STEM_V1"
RIGHTS_CONTRACT = "AVANTIQO_SOURCE_AUDIO_RIGHTS_ATTESTATION_V1"
CONTENT_POLICY = "USER_RIGHTS_ATTESTATION_ONLY"
STEMS = ("vocals", "drums", "bass", "other")
BACKING_STEMS = ("drums", "bass", "other")
MAX_SOURCE_DURATION_SECONDS = max(
    60,
    min(1800, int(os.getenv("AVANTIQO_MUSIC_SEPARATOR_MAX_SOURCE_DURATION_SECONDS", "900"))),
)
MAX_SOURCE_BYTES = max(
    10_000_000,
    int(os.getenv("AVANTIQO_MUSIC_SEPARATOR_MAX_SOURCE_BYTES", "629145600")),
)
DOWNLOAD_TIMEOUT_SECONDS = max(
    30,
    int(os.getenv("AVANTIQO_MUSIC_SEPARATOR_DOWNLOAD_TIMEOUT_SECONDS", "300")),
)
UPLOAD_TIMEOUT_SECONDS = max(
    30,
    int(os.getenv("AVANTIQO_MUSIC_SEPARATOR_UPLOAD_TIMEOUT_SECONDS", "300")),
)
SAMPLE_RATE = 44100


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


def _safe_supabase_url(value: Any) -> str:
    source = _text(value)
    parsed = urlparse(source)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("AVANTIQO_MUSIC_SEPARATOR_HTTPS_URL_REQUIRED")
    host = parsed.hostname.lower()
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
        raise ValueError("AVANTIQO_MUSIC_SEPARATOR_PRIVATE_URL_FORBIDDEN")
    try:
        literal = ipaddress.ip_address(host)
        if literal.is_private or literal.is_loopback or literal.is_link_local:
            raise ValueError("AVANTIQO_MUSIC_SEPARATOR_PRIVATE_URL_FORBIDDEN")
    except ValueError as exc:
        if str(exc) == "AVANTIQO_MUSIC_SEPARATOR_PRIVATE_URL_FORBIDDEN":
            raise
    if not (host.endswith(".supabase.co") or host.endswith(".storage.supabase.co")):
        raise ValueError("AVANTIQO_MUSIC_SEPARATOR_STORAGE_HOST_FORBIDDEN")
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
        raise ValueError(f"AVANTIQO_MUSIC_SEPARATOR_SOURCE_PROBE_FAILED:{detail}")
    duration = _number(result.stdout, None)
    if duration is None or duration <= 0:
        raise ValueError("AVANTIQO_MUSIC_SEPARATOR_SOURCE_DURATION_REQUIRED")
    if duration > MAX_SOURCE_DURATION_SECONDS:
        raise ValueError(
            f"AVANTIQO_MUSIC_SEPARATOR_SOURCE_TOO_LONG:{duration:.3f}>{MAX_SOURCE_DURATION_SECONDS}"
        )
    return duration


def _download_source(url: str, path: Path) -> int:
    total = 0
    with requests.get(url, stream=True, timeout=DOWNLOAD_TIMEOUT_SECONDS) as response:
        response.raise_for_status()
        declared = _integer(response.headers.get("content-length"), None)
        if declared is not None and declared > MAX_SOURCE_BYTES:
            raise ValueError("AVANTIQO_MUSIC_SEPARATOR_SOURCE_TOO_LARGE")
        with path.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if not chunk:
                    continue
                total += len(chunk)
                if total > MAX_SOURCE_BYTES:
                    raise ValueError("AVANTIQO_MUSIC_SEPARATOR_SOURCE_TOO_LARGE")
                handle.write(chunk)
    if total <= 0:
        raise ValueError("AVANTIQO_MUSIC_SEPARATOR_SOURCE_EMPTY")
    return total


def _validate_attestation(data: dict[str, Any]) -> dict[str, Any]:
    attestation = _object(data.get("rights_attestation"))
    if attestation.get("confirmed") is not True:
        raise ValueError("AVANTIQO_MUSIC_SEPARATOR_SOURCE_RIGHTS_CONFIRMATION_REQUIRED")
    if _text(attestation.get("contract")) != RIGHTS_CONTRACT:
        raise ValueError("AVANTIQO_MUSIC_SEPARATOR_SOURCE_RIGHTS_CONTRACT_INVALID")
    if _text(attestation.get("content_restriction_policy")) != CONTENT_POLICY:
        raise ValueError("AVANTIQO_MUSIC_SEPARATOR_CONTENT_POLICY_INVALID")
    return {
        "contract": RIGHTS_CONTRACT,
        "confirmed": True,
        "content_restriction_policy": CONTENT_POLICY,
    }


def _validated_uploads(data: dict[str, Any]) -> dict[str, dict[str, str]]:
    source = _object(data.get("output_uploads"))
    required = {"backing_track_wav", "backing_track_mp3", *STEMS}
    if set(source.keys()) != required:
        raise ValueError("AVANTIQO_MUSIC_SEPARATOR_OUTPUT_UPLOAD_SET_INVALID")
    output: dict[str, dict[str, str]] = {}
    for key in sorted(required):
        item = _object(source.get(key))
        signed_url = _safe_supabase_url(item.get("signed_url"))
        storage_reference = _text(item.get("storage_reference"))
        if not storage_reference.startswith("storage://creative-assets/"):
            raise ValueError(f"AVANTIQO_MUSIC_SEPARATOR_STORAGE_REFERENCE_INVALID:{key}")
        output[key] = {
            "signed_url": signed_url,
            "storage_reference": storage_reference,
        }
    return output


def _validated_input(job: dict[str, Any]) -> dict[str, Any]:
    data = _object(job.get("input"))
    if _text(data.get("contract")) != ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_MUSIC_SEPARATOR_ENGINE_CONTRACT_INVALID")
    if _text(data.get("capability")) != CAPABILITY:
        raise ValueError("AVANTIQO_MUSIC_SEPARATOR_CAPABILITY_INVALID")
    if _text(data.get("model")) != MODEL:
        raise ValueError("AVANTIQO_MUSIC_SEPARATOR_MODEL_INVALID")
    if _text(data.get("quality_profile")) != QUALITY_PROFILE:
        raise ValueError("AVANTIQO_MUSIC_SEPARATOR_QUALITY_PROFILE_INVALID")
    source_audio = _safe_supabase_url(data.get("source_audio"))
    attestation = _validate_attestation(data)
    uploads = _validated_uploads(data)
    processing = _object(data.get("processing"))
    key_shift = max(-12, min(12, _integer(processing.get("key_shift_semitones"), 0) or 0))
    tempo_ratio = max(0.5, min(2.0, _number(processing.get("tempo_ratio"), 1.0) or 1.0))
    count_in_bars = max(0, min(8, _integer(processing.get("count_in_bars"), 0) or 0))
    bpm = _number(processing.get("bpm"), None)
    if bpm is not None and not 30 <= bpm <= 300:
        raise ValueError("AVANTIQO_MUSIC_SEPARATOR_BPM_INVALID")
    if count_in_bars > 0 and bpm is None:
        raise ValueError("AVANTIQO_MUSIC_SEPARATOR_BPM_REQUIRED_FOR_COUNT_IN")
    return {
        **data,
        "source_audio": source_audio,
        "rights_attestation": attestation,
        "output_uploads": uploads,
        "processing": {
            "remove_vocals": True,
            "preserve_arrangement": _boolean(processing.get("preserve_arrangement"), True),
            "key_shift_semitones": key_shift,
            "tempo_ratio": tempo_ratio,
            "count_in_bars": count_in_bars,
            "bpm": bpm,
            "export_stems": _boolean(processing.get("export_stems"), True),
            "vocal_cleanup_required": True,
        },
    }


def _separate(source_path: Path, output_root: Path) -> dict[str, Path]:
    _run(
        [
            "python",
            "-m",
            "demucs.separate",
            "-n",
            DEMUCS_MODEL,
            "--device",
            "cuda",
            "--float32",
            "--jobs",
            "1",
            "--out",
            str(output_root),
            str(source_path),
        ],
        "AVANTIQO_MUSIC_SEPARATOR_DEMUCS_FAILED",
    )
    stem_dir = output_root / DEMUCS_MODEL / source_path.stem
    paths = {stem: stem_dir / f"{stem}.wav" for stem in STEMS}
    missing = [stem for stem, path in paths.items() if not path.is_file()]
    if missing:
        raise RuntimeError(
            f"AVANTIQO_MUSIC_SEPARATOR_STEM_OUTPUT_MISSING:{','.join(missing)}"
        )
    return paths


def _mix_backing(stems: dict[str, Path], destination: Path) -> None:
    _run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-i",
            str(stems["drums"]),
            "-i",
            str(stems["bass"]),
            "-i",
            str(stems["other"]),
            "-filter_complex",
            "[0:a][1:a][2:a]amix=inputs=3:duration=longest:normalize=0,alimiter=limit=0.95[out]",
            "-map",
            "[out]",
            "-ar",
            str(SAMPLE_RATE),
            "-ac",
            "2",
            "-c:a",
            "pcm_f32le",
            str(destination),
        ],
        "AVANTIQO_MUSIC_SEPARATOR_BACKING_MIX_FAILED",
    )


def _transform_filter(key_shift: int, tempo_ratio: float) -> str:
    filters: list[str] = []
    if key_shift:
        pitch_ratio = 2 ** (key_shift / 12)
        filters.extend(
            [
                f"asetrate={SAMPLE_RATE}*{pitch_ratio:.10f}",
                f"aresample={SAMPLE_RATE}",
                f"atempo={1 / pitch_ratio:.10f}",
            ]
        )
    if abs(tempo_ratio - 1.0) > 1e-9:
        filters.append(f"atempo={tempo_ratio:.10f}")
    return ",".join(filters)


def _transform_backing(source: Path, destination: Path, processing: dict[str, Any]) -> None:
    key_shift = int(processing["key_shift_semitones"])
    tempo_ratio = float(processing["tempo_ratio"])
    filter_chain = _transform_filter(key_shift, tempo_ratio)
    if not filter_chain:
        _run(
            [
                "ffmpeg",
                "-y",
                "-v",
                "error",
                "-i",
                str(source),
                "-ar",
                str(SAMPLE_RATE),
                "-ac",
                "2",
                "-c:a",
                "pcm_f32le",
                str(destination),
            ],
            "AVANTIQO_MUSIC_SEPARATOR_BACKING_COPY_FAILED",
        )
        return
    _run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-i",
            str(source),
            "-af",
            filter_chain,
            "-ar",
            str(SAMPLE_RATE),
            "-ac",
            "2",
            "-c:a",
            "pcm_f32le",
            str(destination),
        ],
        "AVANTIQO_MUSIC_SEPARATOR_BACKING_TRANSFORM_FAILED",
    )


def _write_count_in(path: Path, bars: int, bpm: float) -> None:
    beats = bars * 4
    seconds_per_beat = 60.0 / bpm
    duration = beats * seconds_per_beat
    frames = max(1, int(duration * SAMPLE_RATE))
    pulse_frames = max(1, int(0.04 * SAMPLE_RATE))
    amplitude = 0.32
    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(2)
        audio.setsampwidth(2)
        audio.setframerate(SAMPLE_RATE)
        payload = bytearray()
        for index in range(frames):
            position = index / SAMPLE_RATE
            beat_position = position % seconds_per_beat
            sample = 0.0
            if beat_position < pulse_frames / SAMPLE_RATE:
                beat = int(position / seconds_per_beat)
                frequency = 1500.0 if beat % 4 == 0 else 1000.0
                envelope = max(0.0, 1.0 - beat_position / (pulse_frames / SAMPLE_RATE))
                sample = amplitude * envelope * math.sin(2 * math.pi * frequency * beat_position)
            pcm = max(-32767, min(32767, int(sample * 32767)))
            encoded = int(pcm).to_bytes(2, byteorder="little", signed=True)
            payload.extend(encoded)
            payload.extend(encoded)
        audio.writeframes(payload)


def _prepend_count_in(source: Path, destination: Path, bars: int, bpm: float) -> None:
    count_in = destination.with_name("count-in.wav")
    _write_count_in(count_in, bars, bpm)
    _run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-i",
            str(count_in),
            "-i",
            str(source),
            "-filter_complex",
            "[0:a][1:a]concat=n=2:v=0:a=1[out]",
            "-map",
            "[out]",
            "-ar",
            str(SAMPLE_RATE),
            "-ac",
            "2",
            "-c:a",
            "pcm_f32le",
            str(destination),
        ],
        "AVANTIQO_MUSIC_SEPARATOR_COUNT_IN_FAILED",
    )


def _encode_mp3(source: Path, destination: Path) -> None:
    _run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-i",
            str(source),
            "-c:a",
            "libmp3lame",
            "-b:a",
            "320k",
            str(destination),
        ],
        "AVANTIQO_MUSIC_SEPARATOR_MP3_FAILED",
    )


def _upload(path: Path, target: dict[str, str], content_type: str) -> None:
    with path.open("rb") as handle:
        response = requests.put(
            target["signed_url"],
            data=handle,
            headers={"Content-Type": content_type},
            timeout=UPLOAD_TIMEOUT_SECONDS,
        )
    if not response.ok:
        detail = _text(response.text).replace("\n", " ")[:500]
        raise RuntimeError(
            f"AVANTIQO_MUSIC_SEPARATOR_UPLOAD_FAILED:{response.status_code}:{detail}"
        )


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data = _validated_input(job)
    processing = data["processing"]
    with tempfile.TemporaryDirectory(prefix="avantiqo-music-separator-") as temp:
        root = Path(temp)
        source_path = root / "source-audio"
        source_bytes = _download_source(data["source_audio"], source_path)
        source_duration = _probe_duration(source_path)
        separated = _separate(source_path, root / "separated")

        raw_backing = root / "backing-raw.wav"
        transformed_backing = root / "backing-transformed.wav"
        final_backing = root / "backing-track.wav"
        backing_mp3 = root / "backing-track.mp3"
        _mix_backing(separated, raw_backing)
        _transform_backing(raw_backing, transformed_backing, processing)
        if processing["count_in_bars"] > 0:
            _prepend_count_in(
                transformed_backing,
                final_backing,
                int(processing["count_in_bars"]),
                float(processing["bpm"]),
            )
        else:
            _run(
                [
                    "ffmpeg",
                    "-y",
                    "-v",
                    "error",
                    "-i",
                    str(transformed_backing),
                    "-c:a",
                    "pcm_f32le",
                    str(final_backing),
                ],
                "AVANTIQO_MUSIC_SEPARATOR_FINALIZE_WAV_FAILED",
            )
        _encode_mp3(final_backing, backing_mp3)

        uploads = data["output_uploads"]
        _upload(final_backing, uploads["backing_track_wav"], "audio/wav")
        _upload(backing_mp3, uploads["backing_track_mp3"], "audio/mpeg")
        for stem in STEMS:
            _upload(separated[stem], uploads[stem], "audio/wav")

        final_duration = _probe_duration(final_backing)
        return {
            "success": True,
            "contract": ENGINE_CONTRACT,
            "capability": CAPABILITY,
            "model": MODEL,
            "demucs_model": DEMUCS_MODEL,
            "quality_profile": QUALITY_PROFILE,
            "source_duration_seconds": round(source_duration, 6),
            "source_bytes": source_bytes,
            "output_duration_seconds": round(final_duration, 6),
            "stem_names": list(STEMS),
            "backing_track_stems": list(BACKING_STEMS),
            "storage_references": {
                key: target["storage_reference"] for key, target in uploads.items()
            },
            "processing": {
                "remove_vocals": True,
                "preserve_arrangement": processing["preserve_arrangement"],
                "key_shift_semitones": processing["key_shift_semitones"],
                "tempo_ratio": processing["tempo_ratio"],
                "count_in_bars": processing["count_in_bars"],
                "export_stems": processing["export_stems"],
                "vocal_cleanup_required": True,
            },
            "rights_attestation": data["rights_attestation"],
            "content_restriction_policy": CONTENT_POLICY,
            "raw_reasoning_persisted": False,
        }


if __name__ == "__main__":
    print(
        f"AVANTIQO_MUSIC_SEPARATOR_ENGINE_STARTUP={ENGINE_CONTRACT}:{DEMUCS_MODEL}:{QUALITY_PROFILE}",
        flush=True,
    )
    runpod.serverless.start({"handler": handler})
