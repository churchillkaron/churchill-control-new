#!/usr/bin/env python3
import json
import os
import shutil
import subprocess
import tempfile
import threading
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import flashdreams_flashvsr_worker as worker

API_CONTRACT = "AVANTIQO_FLASHVSR_DELIVERY_ENDPOINT_V1"
WORKER_CONTRACT = worker.CONTRACT
LOCK = threading.Lock()
PORT = int(os.environ.get("PORT", "8000"))


def _text(value):
    return str(value or "").strip()


def _https(value):
    source = _text(value)
    if not source.startswith("https://"):
        raise RuntimeError("AVANTIQO_FLASHVSR_HTTPS_URL_REQUIRED")
    return source


def _download(url: str, target: Path):
    request = urllib.request.Request(url, headers={"User-Agent": "Avantiqo-Cinema/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response, open(target, "wb") as handle:
        shutil.copyfileobj(response, handle, length=8 * 1024 * 1024)
    if not target.is_file() or target.stat().st_size <= 0:
        raise RuntimeError("AVANTIQO_FLASHVSR_SOURCE_DOWNLOAD_FAILED")


def _run(command, error_code):
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"{error_code}:{result.stderr[-4000:]}")
    return result


def _encode_delivery(raw_path: Path, source_path: Path, output_path: Path, fps: float, frame_count: int):
    duration = frame_count / fps
    _run([
        "ffmpeg", "-y",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "3840x2176", "-r", str(fps), "-i", str(raw_path),
        "-i", str(source_path),
        "-filter:v", "crop=3840:2160:0:8",
        "-map", "0:v:0", "-map", "1:a?",
        "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "320k",
        "-t", f"{duration:.6f}", "-movflags", "+faststart", str(output_path),
    ], "AVANTIQO_FLASHVSR_DELIVERY_ENCODE_FAILED")
    if not output_path.is_file() or output_path.stat().st_size <= 0:
        raise RuntimeError("AVANTIQO_FLASHVSR_DELIVERY_OUTPUT_REQUIRED")


def _upload(url: str, file_path: Path):
    size = file_path.stat().st_size
    with open(file_path, "rb") as handle:
        request = urllib.request.Request(
            _https(url),
            data=handle.read(),
            method="PUT",
            headers={"Content-Type": "video/mp4", "Content-Length": str(size)},
        )
        with urllib.request.urlopen(request, timeout=600) as response:
            if int(getattr(response, "status", 200)) >= 300:
                raise RuntimeError("AVANTIQO_FLASHVSR_UPLOAD_FAILED")


def execute(payload: dict):
    if payload.get("contract") != WORKER_CONTRACT:
        raise RuntimeError("AVANTIQO_FLASHVSR_ENDPOINT_CONTRACT_INVALID")
    if payload.get("capability") != "ai.video.upscale":
        raise RuntimeError("AVANTIQO_FLASHVSR_ENDPOINT_CAPABILITY_INVALID")
    source_url = _https(payload.get("source_video"))
    storage = payload.get("storage_upload") or {}
    upload_url = _https(storage.get("signed_url"))
    storage_reference = _text(storage.get("storage_reference"))
    source = payload.get("source") or {}
    fps = float(source.get("fps") or 24)
    frame_count = int(source.get("frame_count") or 0)
    if fps <= 0 or frame_count <= 0:
        raise RuntimeError("AVANTIQO_FLASHVSR_ENDPOINT_TIMING_REQUIRED")
    target = payload.get("delivery") or {}
    if int(target.get("target_width") or 3840) != 3840 or int(target.get("target_height") or 2160) != 2160:
        raise RuntimeError("AVANTIQO_FLASHVSR_ENDPOINT_4K_TARGET_REQUIRED")

    with LOCK, tempfile.TemporaryDirectory(prefix="avantiqo-flashvsr-") as tmp:
        root = Path(tmp)
        source_path = root / "source.mp4"
        raw_path = root / "master.rgb"
        receipt_path = root / "receipt.json"
        final_path = root / "master-3840x2160.mp4"
        _download(source_url, source_path)
        job = {
            "contract": WORKER_CONTRACT,
            "input_path": str(source_path),
            "output_path": str(raw_path),
            "receipt_path": str(receipt_path),
            "source_frame_count": frame_count,
            "width": 3840,
            "height": 2176,
        }
        previous = os.environ.get("AVANTIQO_VIDEO_FLASHVSR_JOB_JSON")
        os.environ["AVANTIQO_VIDEO_FLASHVSR_JOB_JSON"] = json.dumps(job, separators=(",", ":"))
        try:
            worker.main()
        finally:
            if previous is None:
                os.environ.pop("AVANTIQO_VIDEO_FLASHVSR_JOB_JSON", None)
            else:
                os.environ["AVANTIQO_VIDEO_FLASHVSR_JOB_JSON"] = previous
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        if receipt.get("success") is not True:
            raise RuntimeError(f"AVANTIQO_FLASHVSR_WORKER_FAILED:{receipt.get('error_code','UNKNOWN')}")
        _encode_delivery(raw_path, source_path, final_path, fps, frame_count)
        _upload(upload_url, final_path)
        return {
            "success": True,
            "status": "completed",
            "contract": API_CONTRACT,
            "worker_contract": WORKER_CONTRACT,
            "storage_reference": storage_reference,
            "width": 3840,
            "height": 2160,
            "fps": fps,
            "frame_count": frame_count,
            "size_bytes": final_path.stat().st_size,
            "temporal_super_resolution": True,
            "working_width": 1920,
            "working_height": 1088,
            "worker_output_width": 3840,
            "worker_output_height": 2176,
            "delivery_crop_pixels_vertical": 16,
            "audio_remuxed": True,
            "per_frame_independent_sr": False,
            "worker_receipt": receipt,
        }


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        data = json.dumps(body, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path in ("/", "/health"):
            self._send(200, {"ok": True, "contract": API_CONTRACT, "worker_contract": WORKER_CONTRACT})
        else:
            self._send(404, {"error": "NOT_FOUND"})

    def do_POST(self):
        if self.path not in ("/", "/upscale"):
            self._send(404, {"error": "NOT_FOUND"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > 2_000_000:
                raise RuntimeError("AVANTIQO_FLASHVSR_REQUEST_SIZE_INVALID")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            self._send(200, execute(payload))
        except Exception as exc:
            self._send(500, {"success": False, "status": "failed", "error_code": str(exc).split(":", 1)[0], "error_detail": str(exc)[:1000]})

    def log_message(self, *_args):
        return


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
