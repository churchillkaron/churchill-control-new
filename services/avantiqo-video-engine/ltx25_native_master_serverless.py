import os
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

import requests
import runpod
import torch

CONTRACT = "AVANTIQO_VIDEO_LTX25_NATIVE_MASTER_SERVERLESS_V2"
ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V2"
PIPELINE_ROOT = Path(os.getenv("AVANTIQO_VIDEO_LTX25_PIPELINE_ROOT", "/opt/LTX-2"))
CACHE_ROOT = Path("/runpod-volume/huggingface-cache/hub/models--Lightricks--LTX-2.5/snapshots")
MASTER_WIDTH = 3840
MASTER_HEIGHT = 2176
FPS = 24
REQUIRED = (
    "diffusion_models/ltx-2.5-22b-dev-transformer-bf16.safetensors",
    "text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors",
    "vae/ltx-2.5-video-vae-bf16.safetensors",
    "vae/ltx-2.5-audio-vae-bf16.safetensors",
)


def text(value: Any) -> str:
    return str(value or "").strip()


def obj(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def snapshot() -> Path:
    if not CACHE_ROOT.is_dir():
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_CACHE_ROOT_MISSING")
    candidates = [path for path in CACHE_ROOT.iterdir() if path.is_dir()]
    candidates.sort(key=lambda path: path.stat().st_mtime_ns, reverse=True)
    for candidate in candidates:
        if all((candidate / relative).is_file() and (candidate / relative).stat().st_size > 0 for relative in REQUIRED):
            return candidate
    raise RuntimeError("AVANTIQO_VIDEO_LTX25_FULL_DEV_CACHE_INCOMPLETE")


def frame_count(duration_seconds: int) -> int:
    desired = max(33, duration_seconds * FPS + 1)
    return max(33, ((desired - 1) // 8) * 8 + 1)


def sanitize(value: Any, limit: int = 2200) -> str:
    return text(value).replace("\n", " ")[-limit:]


def download_prepared_reference(url: str, target: Path) -> None:
    if not url.startswith("https://"):
        raise ValueError("AVANTIQO_VIDEO_PREPARED_REFERENCE_URL_INVALID")
    response = requests.get(url, timeout=120, allow_redirects=True)
    response.raise_for_status()
    if not response.content or len(response.content) > 64 * 1024 * 1024:
        raise RuntimeError("AVANTIQO_VIDEO_PREPARED_REFERENCE_INVALID")
    target.write_bytes(response.content)


def cinematic_prompt(data: dict[str, Any]) -> str:
    instruction = text(data.get("instruction"))
    if not instruction:
        raise ValueError("AVANTIQO_VIDEO_INSTRUCTION_REQUIRED")
    return instruction + (
        " Full-bleed cinematic image only. No typography, captions, numbers, logos or letterbox bars. "
        "Preserve skyline geometry and architecture. Premium photographic realism, natural dawn exposure, "
        "physically plausible cloud, water and traffic motion, stabilized aerial camera, no morphing or frame collapse."
    )


def negative_prompt() -> str:
    return (
        "text, typography, captions, numbers, logos, watermarks, black bars, frame collapse, shrinking image, "
        "warped horizon, duplicate buildings, melting architecture, sudden zoom, camera roll, yaw drift, time lapse, "
        "flicker, severe blur, low resolution, overprocessed sharpening, artificial neon"
    )


def run_command(command: list[str], *, cwd: Path, timeout: int) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = ":".join([
        str(PIPELINE_ROOT / "packages/ltx-core/src"),
        str(PIPELINE_ROOT / "packages/ltx-pipelines/src"),
        env.get("PYTHONPATH", ""),
    ])
    env["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
    env["CUDA_MODULE_LOADING"] = "LAZY"
    completed = subprocess.run(
        command,
        cwd=str(cwd),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=timeout,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(f"AVANTIQO_VIDEO_LTX25_COMMAND_FAILED:{completed.returncode}:{sanitize(completed.stdout)}")
    return completed


def upload(path: Path, signed_url: str) -> None:
    with path.open("rb") as handle:
        response = requests.put(
            signed_url,
            data=handle,
            headers={"content-type": "video/mp4", "cache-control": "max-age=3600", "x-upsert": "false"},
            timeout=300,
        )
    if not response.ok:
        raise RuntimeError(f"AVANTIQO_VIDEO_MASTER_UPLOAD_FAILED:{response.status_code}")


def runtime_probe() -> dict[str, Any]:
    root = snapshot()
    return {
        "success": torch.cuda.is_available(),
        "contract": CONTRACT,
        "operation": "runtime_probe",
        "cuda_available": torch.cuda.is_available(),
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "cache_revision": root.name,
        "required_files_present": len(REQUIRED),
        "generation_performed": False,
        "inference_performed": False,
    }


def generate(data: dict[str, Any]) -> dict[str, Any]:
    if text(data.get("contract")) != ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_VIDEO_ENGINE_CONTRACT_INVALID")
    if text(data.get("capability")) != "ai.video.image_to_video":
        raise ValueError("AVANTIQO_VIDEO_NATIVE_MASTER_I2V_REQUIRED")
    if int(data.get("fps") or FPS) != FPS:
        raise ValueError("AVANTIQO_VIDEO_NATIVE_MASTER_FPS_24_REQUIRED")
    references = data.get("reference_images") or []
    if not isinstance(references, list) or not references:
        raise ValueError("AVANTIQO_VIDEO_NATIVE_MASTER_REFERENCE_REQUIRED")
    if text(data.get("reference_prepared")) != "true":
        raise ValueError("AVANTIQO_VIDEO_PREPARED_REFERENCE_REQUIRED")
    output_upload = obj(data.get("output_upload"))
    signed_url = text(output_upload.get("signed_url"))
    storage_reference = text(output_upload.get("storage_reference"))
    if not signed_url.startswith("https://") or not storage_reference.startswith("storage://creative-assets/"):
        raise ValueError("AVANTIQO_VIDEO_NATIVE_MASTER_OUTPUT_UPLOAD_INVALID")

    root = snapshot()
    transformer = root / REQUIRED[0]
    text_encoder = root / REQUIRED[1]
    video_vae = root / REQUIRED[2]
    audio_vae = root / REQUIRED[3]
    duration_seconds = int(data.get("duration_seconds") or 5)
    frames = frame_count(duration_seconds)
    seed = int(data.get("seed") if data.get("seed") is not None else 4747)

    with tempfile.TemporaryDirectory(prefix="avantiqo-ltx25-serverless-") as temp_dir:
        temp = Path(temp_dir)
        reference = temp / "prepared-reference.png"
        master = temp / "scene-native-master-3840x2176.mp4"
        download_prepared_reference(text(references[0]), reference)
        command = [
            "python", "-m", "ltx_pipelines.ti2vid_one_stage",
            "--transformer-path", str(transformer),
            "--text-encoder-path", str(text_encoder),
            "--video-vae-path", str(video_vae),
            "--audio-vae-path", str(audio_vae),
            "--num-frames", str(frames),
            "--width", str(MASTER_WIDTH),
            "--height", str(MASTER_HEIGHT),
            "--frame-rate", str(FPS),
            "--seed", str(seed),
            "--offload", "cpu",
            "--max-batch-size", "1",
            "--output-path", str(master),
            "--prompt", cinematic_prompt(data),
            "--negative-prompt", negative_prompt(),
            "--image", str(reference), "0", "1.0", "0",
        ]
        runpod.serverless.progress_update({"id": text(data.get("usage_id"))}, "native 3840x2176 generation")
        started = time.perf_counter()
        completed = run_command(command, cwd=PIPELINE_ROOT, timeout=int(os.getenv("AVANTIQO_VIDEO_LTX25_HARD_TIMEOUT_SECONDS", "1800")))
        generation_seconds = round(time.perf_counter() - started, 3)
        if not master.is_file() or master.stat().st_size <= 1_000_000:
            raise RuntimeError("AVANTIQO_VIDEO_NATIVE_MASTER_OUTPUT_INVALID")
        upload(master, signed_url)
        return {
            "status": "completed",
            "provider": "avantiqo-video",
            "model": "avantiqo-ltx-2.5",
            "foundation_model": "Lightricks/LTX-2.5",
            "contract": CONTRACT,
            "pipeline": "TI2VID_ONE_STAGE_FULL_DEV_BF16",
            "precision": "BF16",
            "width": MASTER_WIDTH,
            "height": MASTER_HEIGHT,
            "fps": FPS,
            "frame_count": frames,
            "seed": seed,
            "storage_reference": storage_reference,
            "output_size_bytes": master.stat().st_size,
            "generation_seconds": generation_seconds,
            "native_master_generated": True,
            "master_is_exact_model_output": True,
            "native_generation_width": MASTER_WIDTH,
            "native_generation_height": MASTER_HEIGHT,
            "pixel_upscale_used": False,
            "learned_latent_upsampler_used": False,
            "learned_spatial_upscaler_used": False,
            "distilled_lora_used": False,
            "resize_used": False,
            "crop_used": False,
            "delivery_variants_generated": False,
            "deterministic_title_composite": False,
            "external_provider_contacted": False,
            "cache_revision": root.name,
            "pipeline_stdout_tail": sanitize(completed.stdout, 1200),
            "preprocessing_inside_paid_worker": False,
            "ffprobe_inside_paid_worker": False,
        }


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data = obj(job.get("input"))
    try:
        if text(data.get("operation")) == "runtime_probe":
            return runtime_probe()
        return {"success": True, **generate(data)}
    except Exception as exc:
        return {
            "success": False,
            "contract": CONTRACT,
            "error_code": text(exc).split(":", 1)[0][:180],
            "error_detail": sanitize(exc),
        }


@runpod.serverless.register_fitness_check
def fitness_check():
    if not torch.cuda.is_available():
        raise RuntimeError("AVANTIQO_VIDEO_NATIVE_MASTER_CUDA_REQUIRED")
    snapshot()


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
