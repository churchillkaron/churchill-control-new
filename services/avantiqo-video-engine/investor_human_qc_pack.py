"""Build byte-bound QC evidence for generated-human investor footage.

This utility never approves a video. It fingerprints the exact MP4, probes its
technical properties, extracts deterministic sampled frames, builds a contact
sheet, and writes PENDING automated-QC and visual-review manifests that are
cryptographically tied to the same video bytes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import subprocess
from pathlib import Path
from typing import Any

CONTRACT = "AVANTIQO_INVESTOR_HUMAN_QC_PACK_V1"
SOURCE_REPOSITORY = "churchillkaron/churchill-control-new"
SAMPLE_COUNT = 16
REQUIRED_CHECKS = (
    "face_identity",
    "face_temporal_stability",
    "eyes",
    "hands",
    "anatomy",
    "skin_texture",
    "motion_physics",
)
VISUAL_DIMENSIONS = ("identity", "face", "eyes", "hands", "anatomy", "skin", "motion")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_binary(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise RuntimeError(f"{CONTRACT}_{name.upper()}_MISSING")
    return path


def run(command: list[str]) -> str:
    completed = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "")[-2000:].replace("\n", " ")
        raise RuntimeError(f"{CONTRACT}_COMMAND_FAILED:{completed.returncode}:{detail}")
    return completed.stdout


def probe_video(video: Path) -> dict[str, Any]:
    ffprobe = require_binary("ffprobe")
    raw = run([
        ffprobe,
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate,avg_frame_rate,nb_frames:format=duration,size",
        "-of", "json",
        str(video),
    ])
    payload = json.loads(raw)
    streams = payload.get("streams") or []
    if not streams:
        raise RuntimeError(f"{CONTRACT}_VIDEO_STREAM_MISSING")
    stream = streams[0]
    fmt = payload.get("format") or {}
    duration = float(fmt.get("duration") or 0.0)
    width = int(stream.get("width") or 0)
    height = int(stream.get("height") or 0)
    if duration <= 0 or width <= 0 or height <= 0:
        raise RuntimeError(f"{CONTRACT}_VIDEO_PROBE_INVALID")
    return {
        "duration_seconds": duration,
        "width": width,
        "height": height,
        "r_frame_rate": str(stream.get("r_frame_rate") or ""),
        "avg_frame_rate": str(stream.get("avg_frame_rate") or ""),
        "nb_frames": str(stream.get("nb_frames") or ""),
        "size_bytes": int(fmt.get("size") or video.stat().st_size),
    }


def sample_timestamps(duration: float, count: int = SAMPLE_COUNT) -> list[float]:
    if count < 3:
        raise ValueError(f"{CONTRACT}_SAMPLE_COUNT_TOO_LOW")
    margin = min(0.08, duration * 0.01)
    usable = max(duration - 2 * margin, duration * 0.9)
    if usable <= 0:
        raise RuntimeError(f"{CONTRACT}_DURATION_TOO_SHORT")
    return [round(margin + usable * index / (count - 1), 6) for index in range(count)]


def extract_frames(video: Path, frames_dir: Path, timestamps: list[float]) -> list[Path]:
    ffmpeg = require_binary("ffmpeg")
    frames_dir.mkdir(parents=True, exist_ok=True)
    outputs: list[Path] = []
    for index, timestamp in enumerate(timestamps):
        output = frames_dir / f"frame-{index:02d}-{timestamp:010.6f}s.png"
        run([
            ffmpeg,
            "-hide_banner", "-loglevel", "error", "-y",
            "-ss", f"{timestamp:.6f}",
            "-i", str(video),
            "-frames:v", "1",
            "-vsync", "0",
            str(output),
        ])
        if not output.is_file() or output.stat().st_size < 10_000:
            raise RuntimeError(f"{CONTRACT}_FRAME_EXTRACTION_INVALID:{index}")
        outputs.append(output)
    return outputs


def build_contact_sheet(frame_paths: list[Path], output: Path) -> None:
    ffmpeg = require_binary("ffmpeg")
    if len(frame_paths) != SAMPLE_COUNT:
        raise RuntimeError(f"{CONTRACT}_CONTACT_SHEET_SAMPLE_COUNT_INVALID")
    concat = output.parent / "contact-sheet-input.txt"
    concat.write_text("".join(f"file '{path.as_posix()}'\nduration 1\n" for path in frame_paths), encoding="utf-8")
    try:
        run([
            ffmpeg,
            "-hide_banner", "-loglevel", "error", "-y",
            "-f", "concat", "-safe", "0", "-i", str(concat),
            "-vf", "scale=480:-2,tile=4x4:padding=4:margin=4",
            "-frames:v", "1",
            str(output),
        ])
    finally:
        concat.unlink(missing_ok=True)
    if not output.is_file() or output.stat().st_size < 20_000:
        raise RuntimeError(f"{CONTRACT}_CONTACT_SHEET_INVALID")


def pending_automated_qc(video_sha: str) -> dict[str, Any]:
    return {
        "status": "PENDING",
        "video_sha256": video_sha,
        "sampled_frames": SAMPLE_COUNT,
        "checks": {
            name: {"status": "PENDING", "evidence_id": None, "score": None}
            for name in REQUIRED_CHECKS
        },
    }


def pending_visual_review(video_sha: str, contact_sheet_sha: str) -> dict[str, Any]:
    return {
        "status": "PENDING",
        "video_sha256": video_sha,
        "contact_sheet_sha256": contact_sheet_sha,
        "reviewer_id": None,
        "reviewed_at": None,
        "dimensions": {name: "PENDING" for name in VISUAL_DIMENSIONS},
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    video = Path(args.video).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    if not video.is_file() or video.suffix.lower() != ".mp4" or video.stat().st_size < 100_000:
        raise SystemExit(f"{CONTRACT}_VIDEO_INVALID")
    output_dir.mkdir(parents=True, exist_ok=True)

    video_sha = sha256(video)
    probe = probe_video(video)
    timestamps = sample_timestamps(float(probe["duration_seconds"]))
    frame_paths = extract_frames(video, output_dir / "frames", timestamps)
    contact_sheet = output_dir / "contact-sheet-4x4.png"
    build_contact_sheet(frame_paths, contact_sheet)
    contact_sha = sha256(contact_sheet)

    frame_evidence = [
        {
            "index": index,
            "timestamp_seconds": timestamps[index],
            "path": str(path.relative_to(output_dir)),
            "sha256": sha256(path),
        }
        for index, path in enumerate(frame_paths)
    ]
    evidence = {
        "success": True,
        "status": "REVIEW_PENDING",
        "release_authorized": False,
        "contract": CONTRACT,
        "source_repository": SOURCE_REPOSITORY,
        "video_path": str(video),
        "video_sha256": video_sha,
        "video_probe": probe,
        "sample_count": SAMPLE_COUNT,
        "sample_timestamps_seconds": timestamps,
        "frames": frame_evidence,
        "contact_sheet": {
            "path": str(contact_sheet.relative_to(output_dir)),
            "sha256": contact_sha,
        },
    }
    automated = pending_automated_qc(video_sha)
    visual = pending_visual_review(video_sha, contact_sha)

    (output_dir / "evidence.json").write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    (output_dir / "automated-qc.json").write_text(json.dumps(automated, indent=2) + "\n", encoding="utf-8")
    (output_dir / "visual-review.json").write_text(json.dumps(visual, indent=2) + "\n", encoding="utf-8")
    print(f"{CONTRACT}=PASS_REVIEW_PENDING")
    print(f"VIDEO_SHA256={video_sha}")
    print(f"CONTACT_SHEET_SHA256={contact_sha}")


if __name__ == "__main__":
    main()
