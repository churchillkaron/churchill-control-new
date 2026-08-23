import ipaddress
import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
import runpod
import torch

ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1"
CAPABILITY = "ai.video.lipsync"
PRODUCT_MODEL = "avantiqo-cinema-lipsync-v1"
FOUNDATION_MODEL = "ByteDance/LatentSync-1.6"
UPSTREAM_COMMIT = "a229c3948406bc2cf6eaf4873e662e70c6a04746"
ROOT = Path(os.getenv("AVANTIQO_LATENTSYNC_ROOT", "/opt/latentsync"))
CHECKPOINT_ROOT = Path(
    os.getenv("AVANTIQO_LATENTSYNC_CHECKPOINT_ROOT", "/runpod-volume/latentsync-1.6")
)
OUTPUT_DIR = Path(os.getenv("AVANTIQO_LIPSYNC_OUTPUT_DIR", "/tmp/avantiqo-lipsync"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
MAX_VIDEO_BYTES = 200 * 1024 * 1024
MAX_AUDIO_BYTES = 80 * 1024 * 1024
MAX_DURATION_SECONDS = max(
    2.0,
    min(60.0, float(os.getenv("AVANTIQO_LIPSYNC_MAX_DURATION_SECONDS", "20"))),
)
INFERENCE_STEPS = max(
    20,
    min(50, int(os.getenv("AVANTIQO_LIPSYNC_INFERENCE_STEPS", "30"))),
)
GUIDANCE_SCALE = max(
    1.0,
    min(3.0, float(os.getenv("AVANTIQO_LIPSYNC_GUIDANCE_SCALE", "1.5"))),
)
CERTIFICATION_EXECUTION_ENABLED = os.getenv(
    "AVANTIQO_LIPSYNC_CERTIFICATION_EXECUTION_ENABLED", "0"
).strip().lower() in {"1", "true", "yes", "on"}


def _text(value: Any) -> str:
    return str(value or "").strip()


def _public_https_url(value: Any, *, upload: bool = False) -> str:
    source = _text(value)
    parsed = urlparse(source)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("AVANTIQO_LIPSYNC_HTTPS_URL_REQUIRED")
    host = parsed.hostname.lower()
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
        raise ValueError("AVANTIQO_LIPSYNC_PRIVATE_URL_FORBIDDEN")
    try:
        literal = ipaddress.ip_address(host)
        if literal.is_private or literal.is_loopback or literal.is_link_local:
            raise ValueError("AVANTIQO_LIPSYNC_PRIVATE_URL_FORBIDDEN")
    except ValueError as exc:
        if str(exc) == "AVANTIQO_LIPSYNC_PRIVATE_URL_FORBIDDEN":
            raise
    if upload and not (
        host.endswith(".supabase.co") or host.endswith(".storage.supabase.co")
    ):
        raise ValueError("AVANTIQO_LIPSYNC_UPLOAD_HOST_FORBIDDEN")
    return source


def _download(url: str, path: Path, max_bytes: int, code: str) -> None:
    with requests.get(url, stream=True, timeout=180) as response:
        response.raise_for_status()
        content_length = int(response.headers.get("content-length") or 0)
        if content_length > max_bytes:
            raise ValueError(f"{code}_TOO_LARGE")
        total = 0
        with path.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if not chunk:
                    continue
                total += len(chunk)
                if total > max_bytes:
                    raise ValueError(f"{code}_TOO_LARGE")
                handle.write(chunk)


def _duration(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError("AVANTIQO_LIPSYNC_FFPROBE_FAILED")
    try:
        return float(result.stdout.strip())
    except ValueError as exc:
        raise RuntimeError("AVANTIQO_LIPSYNC_DURATION_INVALID") from exc


def _upload(path: Path, storage: dict[str, Any]) -> None:
    with path.open("rb") as handle:
        response = requests.put(
            storage["signed_url"],
            data=handle,
            headers={"content-type": "video/mp4", "x-upsert": "false"},
            timeout=300,
        )
    if not response.ok:
        detail = response.text[:500].replace("\n", " ")
        raise RuntimeError(
            f"AVANTIQO_LIPSYNC_STORAGE_UPLOAD_FAILED:{response.status_code}:{detail}"
        )


def _checkpoint_paths() -> tuple[Path, Path]:
    return (
        CHECKPOINT_ROOT / "latentsync_unet.pt",
        CHECKPOINT_ROOT / "whisper" / "tiny.pt",
    )


def _ensure_checkpoint_links() -> None:
    unet, whisper = _checkpoint_paths()
    if not unet.is_file():
        raise RuntimeError("AVANTIQO_LIPSYNC_UNET_CHECKPOINT_REQUIRED")
    if not whisper.is_file():
        raise RuntimeError("AVANTIQO_LIPSYNC_WHISPER_CHECKPOINT_REQUIRED")
    target_root = ROOT / "checkpoints"
    target_whisper = target_root / "whisper"
    target_whisper.mkdir(parents=True, exist_ok=True)
    for source, target in [
        (unet, target_root / "latentsync_unet.pt"),
        (whisper, target_whisper / "tiny.pt"),
    ]:
        if target.exists() or target.is_symlink():
            target.unlink()
        target.symlink_to(source)


def _validated(job: dict[str, Any]) -> dict[str, Any]:
    data = job.get("input") or {}
    if data.get("contract") != ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_LIPSYNC_ENGINE_CONTRACT_INVALID")
    if _text(data.get("capability")) != CAPABILITY:
        raise ValueError("AVANTIQO_LIPSYNC_CAPABILITY_INVALID")
    certification_execution = (
        data.get("certification_execution") is True
        and CERTIFICATION_EXECUTION_ENABLED
    )
    certified = {
        item.strip()
        for item in _text(os.getenv("AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES")).split(",")
        if item.strip()
    }
    if CAPABILITY not in certified and not certification_execution:
        raise ValueError("AVANTIQO_VIDEO_CAPABILITY_NOT_CERTIFIED:ai.video.lipsync")

    roles = data.get("source_asset_roles") or {}
    source_video = _text(data.get("source_video") or roles.get("source_video"))
    source_audio = _text(data.get("source_audio") or roles.get("source_audio"))
    if not source_video:
        raise ValueError("AVANTIQO_LIPSYNC_SOURCE_VIDEO_REQUIRED")
    if not source_audio:
        raise ValueError("AVANTIQO_LIPSYNC_SOURCE_AUDIO_REQUIRED")
    storage = data.get("storage_upload") or {}
    signed_url = _public_https_url(storage.get("signed_url"), upload=True)
    storage_reference = _text(storage.get("storage_reference"))
    if not storage_reference.startswith("storage://creative-assets/"):
        raise ValueError("AVANTIQO_LIPSYNC_STORAGE_REFERENCE_INVALID")
    seed = int(data.get("seed") if data.get("seed") is not None else 1247)
    if seed < 0 or seed > 4294967295:
        raise ValueError("AVANTIQO_LIPSYNC_SEED_INVALID")
    return {
        **data,
        "source_video": _public_https_url(source_video),
        "source_audio": _public_https_url(source_audio),
        "storage_upload": {
            **storage,
            "signed_url": signed_url,
            "storage_reference": storage_reference,
        },
        "seed": seed,
        "certification_execution": certification_execution,
    }


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data = _validated(job)
    _ensure_checkpoint_links()
    started = time.perf_counter()
    job_id = _text(job.get("id")) or str(int(time.time() * 1000))
    work = OUTPUT_DIR / job_id
    work.mkdir(parents=True, exist_ok=True)
    source_video = work / "source.mp4"
    source_audio = work / "source.wav"
    output = work / "lipsynced.mp4"
    temp_dir = work / "latent-temp"
    try:
        runpod.serverless.progress_update(job, "downloading governed lip-sync assets")
        _download(data["source_video"], source_video, MAX_VIDEO_BYTES, "AVANTIQO_LIPSYNC_VIDEO")
        _download(data["source_audio"], source_audio, MAX_AUDIO_BYTES, "AVANTIQO_LIPSYNC_AUDIO")
        duration = _duration(source_video)
        if duration <= 0 or duration > MAX_DURATION_SECONDS:
            raise ValueError(f"AVANTIQO_LIPSYNC_DURATION_EXCEEDED:{round(duration, 3)}")

        runpod.serverless.progress_update(job, "running Avantiqo LatentSync 1.6")
        result = subprocess.run(
            [
                "python", "-m", "scripts.inference",
                "--unet_config_path", "configs/unet/stage2_512.yaml",
                "--inference_ckpt_path", "checkpoints/latentsync_unet.pt",
                "--inference_steps", str(INFERENCE_STEPS),
                "--guidance_scale", str(GUIDANCE_SCALE),
                "--enable_deepcache",
                "--video_path", str(source_video),
                "--audio_path", str(source_audio),
                "--video_out_path", str(output),
                "--temp_dir", str(temp_dir),
                "--seed", str(data["seed"]),
            ],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0 or not output.is_file():
            detail = _text(result.stderr or result.stdout)[-1500:]
            raise RuntimeError(f"AVANTIQO_LIPSYNC_INFERENCE_FAILED:{detail}")
        runpod.serverless.progress_update(job, "storing private Avantiqo lip-sync")
        _upload(output, data["storage_upload"])
        size_bytes = output.stat().st_size
        return {
            "status": "completed",
            "provider": "avantiqo-video",
            "model": PRODUCT_MODEL,
            "engine_contract": ENGINE_CONTRACT,
            "capability": CAPABILITY,
            "storage_reference": data["storage_upload"]["storage_reference"],
            "foundation_model": FOUNDATION_MODEL,
            "upstream_commit": UPSTREAM_COMMIT,
            "duration_seconds": round(duration, 3),
            "inference_steps": INFERENCE_STEPS,
            "guidance_scale": GUIDANCE_SCALE,
            "seed": data["seed"],
            "size_bytes": size_bytes,
            "audio_conditioned_latent_diffusion": True,
            "identity_quality_review_required": True,
            "sync_quality_review_required": True,
            "certification_execution": data.get("certification_execution") is True,
            "raw_reasoning_persisted": False,
        }
    finally:
        shutil.rmtree(work, ignore_errors=True)


@runpod.serverless.register_fitness_check
def check_worker():
    if not torch.cuda.is_available():
        raise RuntimeError("AVANTIQO_LIPSYNC_CUDA_REQUIRED")
    if not ROOT.is_dir():
        raise RuntimeError("AVANTIQO_LATENTSYNC_ROOT_REQUIRED")
    _ensure_checkpoint_links()


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
