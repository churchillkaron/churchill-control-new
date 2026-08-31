import base64
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

import requests
from PIL import Image, ImageFilter

ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V2"
RUNTIME_CONTRACT = "AVANTIQO_VIDEO_LTX25_NATIVE4K_V1"
QUALITY_CONTRACT = "AVANTIQO_VIDEO_LTX25_NATIVE_MASTER_3840X2176_V1"
MODEL_ROOT = Path(os.getenv("AVANTIQO_VIDEO_LTX25_MODEL_ROOT", "/runpod-volume/ltx-2.5"))
PIPELINE_ROOT = Path(os.getenv("AVANTIQO_VIDEO_LTX25_PIPELINE_ROOT", "/opt/LTX-2"))
DEV_TRANSFORMER = MODEL_ROOT / "diffusion_models/ltx-2.5-22b-dev-transformer-bf16.safetensors"
TEXT_ENCODER = MODEL_ROOT / "text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors"
VIDEO_VAE = MODEL_ROOT / "vae/ltx-2.5-video-vae-bf16.safetensors"
AUDIO_VAE = MODEL_ROOT / "vae/ltx-2.5-audio-vae-bf16.safetensors"
MASTER_WIDTH = 3840
MASTER_HEIGHT = 2176
FPS = 24


def text(value: Any) -> str:
    return str(value or "").strip()


def obj(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def required_file(path: Path, code: str) -> str:
    if not path.is_file() or path.stat().st_size <= 0:
        raise RuntimeError(code)
    return str(path)


def frame_count(duration_seconds: int) -> int:
    desired = max(33, duration_seconds * FPS + 1)
    return max(33, ((desired - 1) // 8) * 8 + 1)


def sanitize(value: Any, limit: int = 3200) -> str:
    return text(value).replace("\n", " ")[-limit:]


def download_reference(url: str, path: Path) -> None:
    response = requests.get(url, timeout=120, allow_redirects=True)
    response.raise_for_status()
    if not response.content or len(response.content) > 64 * 1024 * 1024:
        raise RuntimeError("AVANTIQO_VIDEO_NATIVE4K_REFERENCE_INVALID")
    path.write_bytes(response.content)


def clean_reference(source: Path, target: Path) -> None:
    with Image.open(source) as original:
        image = original.convert("RGB")

    # Remove mutable reference typography before diffusion without cropping or
    # resizing the source. The native generated master remains untouched;
    # Studio owns all titles, crops and delivery formatting after generation.
    x0 = int(image.width * 0.05)
    x1 = int(image.width * 0.58)
    y0 = int(image.height * 0.03)
    y1 = int(image.height * 0.24)
    region = image.crop((x0, y0, x1, y1)).filter(ImageFilter.GaussianBlur(max(14, image.width // 90)))
    image.paste(region, (x0, y0))
    image.save(target, format="PNG", optimize=True)


def cinematic_prompt(data: dict[str, Any]) -> str:
    base = text(data.get("instruction"))
    if not base:
        raise ValueError("AVANTIQO_VIDEO_INSTRUCTION_REQUIRED")
    return (
        base
        + " Full-bleed cinematic image only. No typography, no captions, no numbers, no logos, no letterbox bars. "
        + "Preserve architecture, skyline geometry and horizon. Premium photographic realism, natural dawn exposure, "
        + "physically plausible cloud, water and traffic motion, stable aerial camera, no morphing or frame collapse."
    )


def negative_prompt() -> str:
    return (
        "text, typography, captions, numbers, logos, watermarks, black bars, frame collapse, shrinking image, "
        "warped horizon, duplicate buildings, melting architecture, sudden zoom, camera roll, yaw drift, time lapse, "
        "flicker, severe blur, low resolution, overprocessed sharpening, artificial neon"
    )


def run_command(
    command: list[str],
    *,
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
    timeout: int,
) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=timeout,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_NATIVE4K_COMMAND_FAILED:{command[0]}:{completed.returncode}:{sanitize(completed.stdout)}"
        )
    return completed


def probe_video(path: Path) -> dict[str, Any]:
    completed = run_command(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,r_frame_rate,codec_name,bit_rate",
            "-show_entries",
            "format=duration,bit_rate,size",
            "-of",
            "json",
            str(path),
        ],
        timeout=30,
    )
    return json.loads(completed.stdout)


def upload_file(path: Path, signed_url: str) -> None:
    with path.open("rb") as handle:
        response = requests.put(
            signed_url,
            data=handle,
            headers={
                "content-type": "video/mp4",
                "cache-control": "max-age=3600",
                "x-upsert": "false",
            },
            timeout=240,
        )
    if not response.ok:
        raise RuntimeError(f"AVANTIQO_VIDEO_NATIVE4K_UPLOAD_FAILED:{response.status_code}")


def run_scene(job: dict[str, Any], tmp: Path) -> dict[str, Any]:
    data = obj(job.get("input"))
    if text(data.get("contract")) != ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_VIDEO_ENGINE_CONTRACT_INVALID")
    if text(data.get("capability")) != "ai.video.image_to_video":
        raise ValueError("AVANTIQO_VIDEO_NATIVE4K_I2V_REQUIRED")
    if int(data.get("fps") or FPS) != FPS:
        raise ValueError("AVANTIQO_VIDEO_NATIVE4K_FPS_24_REQUIRED")

    duration_seconds = int(data.get("duration_seconds") or 5)
    frames = frame_count(duration_seconds)
    seed = int(data.get("seed") if data.get("seed") is not None else 4747)
    references = data.get("reference_images") or []
    if not isinstance(references, list) or not references:
        raise ValueError("AVANTIQO_VIDEO_NATIVE4K_REFERENCE_REQUIRED")

    upload = obj(data.get("output_upload"))
    output_signed_url = text(upload.get("signed_url"))
    storage_reference = text(upload.get("storage_reference"))
    if not output_signed_url.startswith("https://") or not storage_reference.startswith("storage://creative-assets/"):
        raise ValueError("AVANTIQO_VIDEO_NATIVE4K_OUTPUT_UPLOAD_INVALID")

    source_reference = tmp / "scene1-reference.jpg"
    clean = tmp / "scene1-reference-clean.png"
    master = tmp / "scene1-native-master-3840x2176.mp4"
    download_reference(text(references[0]), source_reference)
    clean_reference(source_reference, clean)

    command = [
        "python",
        "-m",
        "ltx_pipelines.ti2vid_one_stage",
        "--transformer-path",
        required_file(DEV_TRANSFORMER, "AVANTIQO_VIDEO_NATIVE4K_DEV_TRANSFORMER_REQUIRED"),
        "--text-encoder-path",
        required_file(TEXT_ENCODER, "AVANTIQO_VIDEO_NATIVE4K_TEXT_ENCODER_REQUIRED"),
        "--video-vae-path",
        required_file(VIDEO_VAE, "AVANTIQO_VIDEO_NATIVE4K_VIDEO_VAE_REQUIRED"),
        "--audio-vae-path",
        required_file(AUDIO_VAE, "AVANTIQO_VIDEO_NATIVE4K_AUDIO_VAE_REQUIRED"),
        "--num-frames",
        str(frames),
        "--width",
        str(MASTER_WIDTH),
        "--height",
        str(MASTER_HEIGHT),
        "--frame-rate",
        str(FPS),
        "--seed",
        str(seed),
        "--offload",
        "cpu",
        "--max-batch-size",
        "1",
        "--output-path",
        str(master),
        "--prompt",
        cinematic_prompt(data),
        "--negative-prompt",
        negative_prompt(),
        "--image",
        str(clean),
        "0",
        "1.0",
        "0",
    ]

    env = os.environ.copy()
    env["PYTHONPATH"] = ":".join(
        [
            str(PIPELINE_ROOT / "packages/ltx-core/src"),
            str(PIPELINE_ROOT / "packages/ltx-pipelines/src"),
            env.get("PYTHONPATH", ""),
        ]
    )
    env["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
    env["CUDA_MODULE_LOADING"] = "LAZY"

    started = time.perf_counter()
    hard_timeout = int(os.getenv("AVANTIQO_VIDEO_LTX25_HARD_TIMEOUT_SECONDS", "1800"))
    completed = run_command(command, cwd=PIPELINE_ROOT, env=env, timeout=hard_timeout)
    pipeline_seconds = round(time.perf_counter() - started, 3)
    if not master.is_file() or master.stat().st_size <= 1_000_000:
        raise RuntimeError("AVANTIQO_VIDEO_NATIVE4K_MASTER_OUTPUT_INVALID")

    master_probe = probe_video(master)
    stream = (master_probe.get("streams") or [{}])[0]
    if int(stream.get("width") or 0) != MASTER_WIDTH or int(stream.get("height") or 0) != MASTER_HEIGHT:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_NATIVE4K_MASTER_DIMENSIONS_INVALID:{stream.get('width')}x{stream.get('height')}"
        )

    # The GPU lane ends with the exact model output. No crop, resize, upscale,
    # transcode, title composite, delivery render or QC derivative is created.
    upload_file(master, output_signed_url)
    return {
        "status": "completed",
        "provider": "avantiqo-video",
        "model": "avantiqo-ltx-2.5",
        "engine_contract": ENGINE_CONTRACT,
        "runtime_contract": RUNTIME_CONTRACT,
        "quality_contract": QUALITY_CONTRACT,
        "foundation_model": "Lightricks/LTX-2.5",
        "pipeline": "TI2VID_ONE_STAGE_FULL_DEV_BF16",
        "quality_lane": "production-native-master",
        "precision": "BF16",
        "seed": seed,
        "fps": FPS,
        "frame_count": frames,
        "width": MASTER_WIDTH,
        "height": MASTER_HEIGHT,
        "master_width": MASTER_WIDTH,
        "master_height": MASTER_HEIGHT,
        "internal_generation_resolution": f"{MASTER_WIDTH}x{MASTER_HEIGHT}",
        "storage_reference": storage_reference,
        "output_size_bytes": master.stat().st_size,
        "generation_seconds": pipeline_seconds,
        "total_worker_seconds": round(time.perf_counter() - started, 3),
        "native_audio_generated": True,
        "native_master_generated": True,
        "master_is_exact_model_output": True,
        "learned_spatial_upscaler_used": False,
        "detailing_dfr_used": False,
        "pixel_720p_stage_used": False,
        "lanczos_upscale_used": False,
        "external_provider_contacted": False,
        "prompt_persisted": False,
        "native_4k_claimed": True,
        "native_generation_width": MASTER_WIDTH,
        "native_generation_height": MASTER_HEIGHT,
        "uhd_delivery": False,
        "pixel_upscale_used": False,
        "learned_latent_upsampler_used": False,
        "distilled_lora_used": False,
        "resize_used": False,
        "crop_used": False,
        "delivery_crop_only": False,
        "delivery_variants_generated": False,
        "deterministic_title_composite": False,
        "title_text": "",
        "visual_integrity_qc_deferred_to_studio": True,
        "master_probe": master_probe,
        "pipeline_stdout_tail": sanitize(completed.stdout, 1800),
    }


def main() -> None:
    encoded = text(os.getenv("AVANTIQO_VIDEO_LTX25_JOB_B64"))
    receipt_url = text(os.getenv("AVANTIQO_VIDEO_LTX25_RECEIPT_SIGNED_URL"))
    receipt_ref = text(os.getenv("AVANTIQO_VIDEO_LTX25_RECEIPT_STORAGE_REFERENCE"))
    if not encoded or not receipt_url or not receipt_ref:
        raise RuntimeError("AVANTIQO_VIDEO_NATIVE4K_ONE_SHOT_ENV_REQUIRED")

    started = time.time()
    try:
        job = json.loads(base64.b64decode(encoded).decode("utf-8"))
        with tempfile.TemporaryDirectory(prefix="avantiqo-ltx25-native-master-") as tmp_dir:
            output = run_scene(job, Path(tmp_dir))
        receipt = {
            "success": True,
            "contract": RUNTIME_CONTRACT,
            "status": "completed",
            "output": output,
            "receipt_storage_reference": receipt_ref,
            "elapsed_seconds": round(time.time() - started, 3),
        }
    except Exception as exc:
        raw = str(exc)
        receipt = {
            "success": False,
            "contract": RUNTIME_CONTRACT,
            "status": "failed",
            "error_code": raw.split(":", 1)[0][:180],
            "error_detail": sanitize(raw),
            "elapsed_seconds": round(time.time() - started, 3),
        }

    response = requests.put(
        receipt_url,
        data=json.dumps(receipt, separators=(",", ":")).encode(),
        headers={"content-type": "application/json", "x-upsert": "false"},
        timeout=120,
    )
    response.raise_for_status()
    print(
        f"AVANTIQO_VIDEO_NATIVE4K_RECEIPT_WRITTEN={str(receipt.get('success') is True).lower()}",
        flush=True,
    )


if __name__ == "__main__":
    main()
