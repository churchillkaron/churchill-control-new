import os
import time
from pathlib import Path

import runpod
import torch

CONTRACT = "AVANTIQO_VIDEO_LTX25_SERVERLESS_CACHE_PROBE_V1"
MODEL_CACHE_ROOT = Path("/runpod-volume/huggingface-cache/hub/models--Lightricks--LTX-2.5/snapshots")
REQUIRED = (
    "diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors",
    "text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors",
    "vae/ltx-2.5-video-vae-bf16.safetensors",
    "vae/ltx-2.5-audio-vae-bf16.safetensors",
    "latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors",
    "loras/ltx-2.5-22b-ic-lora-pixel-spatial-upscaler-x2-1.0.safetensors",
)
PROCESS_STARTED = time.perf_counter()


def _snapshot():
    if not MODEL_CACHE_ROOT.is_dir():
        return None
    candidates = [p for p in MODEL_CACHE_ROOT.iterdir() if p.is_dir()]
    if not candidates:
        return None
    candidates.sort(key=lambda p: p.stat().st_mtime_ns, reverse=True)
    return candidates[0]


def _probe():
    started = time.perf_counter()
    snapshot = _snapshot()
    files = []
    missing = []
    total_bytes = 0
    if snapshot:
        for relative in REQUIRED:
            path = snapshot / relative
            if path.is_file() and path.stat().st_size > 0:
                size = path.stat().st_size
                total_bytes += size
                files.append({"path": relative, "bytes": size})
            else:
                missing.append(relative)
    else:
        missing = list(REQUIRED)

    cuda_available = torch.cuda.is_available()
    gpu_name = None
    capability = None
    if cuda_available:
        torch.cuda.init()
        gpu_name = torch.cuda.get_device_name(0)
        capability = list(torch.cuda.get_device_capability(0))

    return {
        "success": snapshot is not None and not missing and cuda_available,
        "contract": CONTRACT,
        "mode": "CACHE_AND_CUDA_READY",
        "process_uptime_seconds": round(time.perf_counter() - PROCESS_STARTED, 3),
        "probe_seconds": round(time.perf_counter() - started, 3),
        "cuda_available": cuda_available,
        "gpu_name": gpu_name,
        "cuda_capability": capability,
        "torch_version": torch.__version__,
        "cache_snapshot_present": snapshot is not None,
        "cache_snapshot_revision": snapshot.name if snapshot else None,
        "required_files_present": len(files),
        "required_files_expected": len(REQUIRED),
        "required_bytes": total_bytes,
        "missing_files": missing,
        "model_reference": "Lightricks/LTX-2.5",
        "generation_performed": False,
        "inference_performed": False,
        "external_video_provider_used": False,
    }


def handler(job):
    data = job.get("input") if isinstance(job, dict) else None
    if not isinstance(data, dict) or data.get("contract") != CONTRACT:
        return {"success": False, "contract": CONTRACT, "error_code": "AVANTIQO_VIDEO_CACHE_PROBE_CONTRACT_INVALID"}
    return _probe()


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
