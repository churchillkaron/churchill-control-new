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
RUNTIME_CONTRACT = "AVANTIQO_VIDEO_LTX25_HQ4K_V1"
QUALITY_CONTRACT = "AVANTIQO_VIDEO_LTX25_HQ_TWO_STAGE_4K_V1"
MODEL_ROOT = Path(os.getenv("AVANTIQO_VIDEO_LTX25_MODEL_ROOT", "/runpod-volume/ltx-2.5"))
PIPELINE_ROOT = Path(os.getenv("AVANTIQO_VIDEO_LTX25_PIPELINE_ROOT", "/opt/LTX-2"))
DEV_TRANSFORMER = MODEL_ROOT / "diffusion_models/ltx-2.5-22b-dev-transformer-bf16.safetensors"
TEXT_ENCODER = MODEL_ROOT / "text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors"
VIDEO_VAE = MODEL_ROOT / "vae/ltx-2.5-video-vae-bf16.safetensors"
AUDIO_VAE = MODEL_ROOT / "vae/ltx-2.5-audio-vae-bf16.safetensors"
DISTILLED_LORA = MODEL_ROOT / "loras/ltx-2.5-22b-distilled-lora-450-bf16.safetensors"
SPATIAL_UPSAMPLER = MODEL_ROOT / "latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors"
FONT = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
RAW_WIDTH = 3840
RAW_HEIGHT = 1792
DELIVERY_WIDTH = 3840
DELIVERY_HEIGHT = 2160
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
        raise RuntimeError("AVANTIQO_VIDEO_HQ4K_REFERENCE_INVALID")
    path.write_bytes(response.content)


def detect_active_crop(image: Image.Image) -> tuple[int, int]:
    rgb = image.convert("RGB")
    width, height = rgb.size
    sample_step = max(1, width // 320)

    def row_active(y: int) -> bool:
        pixels = [rgb.getpixel((x, y)) for x in range(0, width, sample_step)]
        mean = sum((r + g + b) / 3 for r, g, b in pixels) / max(1, len(pixels))
        return mean > 10

    top = 0
    for y in range(height):
        if row_active(y):
            top = y
            break
    bottom = height
    for y in range(height - 1, -1, -1):
        if row_active(y):
            bottom = y + 1
            break
    if bottom - top < int(height * 0.55):
        return 0, height
    return top, bottom


def clean_reference(source: Path, target: Path) -> None:
    with Image.open(source) as original:
        image = original.convert("RGB")
    top, bottom = detect_active_crop(image)
    content = image.crop((0, top, image.width, bottom))

    # Remove mutable typography from the conditioning image. The exact title is
    # composited deterministically after diffusion, so the model never owns text.
    x0 = int(content.width * 0.05)
    x1 = int(content.width * 0.58)
    y0 = int(content.height * 0.03)
    y1 = int(content.height * 0.24)
    region = content.crop((x0, y0, x1, y1)).filter(ImageFilter.GaussianBlur(max(14, content.width // 90)))
    content.paste(region, (x0, y0))

    # LTX will handle final conditioning resize. Preserve detail with PNG.
    content.save(target, format="PNG", optimize=True)


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


def run_command(command: list[str], *, cwd: Path | None = None, env: dict[str, str] | None = None, timeout: int) -> subprocess.CompletedProcess[str]:
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
        raise RuntimeError(f"AVANTIQO_VIDEO_HQ4K_COMMAND_FAILED:{command[0]}:{completed.returncode}:{sanitize(completed.stdout)}")
    return completed


def probe_video(path: Path) -> dict[str, Any]:
    completed = run_command(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height,r_frame_rate,codec_name,bit_rate",
            "-show_entries", "format=duration,bit_rate,size",
            "-of", "json", str(path),
        ],
        timeout=30,
    )
    return json.loads(completed.stdout)


def extract_qc_frame(video: Path, target: Path, seconds: float) -> None:
    run_command(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", f"{seconds:.3f}", "-i", str(video),
            "-frames:v", "1", "-vf", "scale=960:-2", "-y", str(target),
        ],
        timeout=60,
    )


def frame_metrics(path: Path) -> dict[str, float]:
    with Image.open(path) as image:
        rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = list(rgb.getdata())
    pure_black = sum(1 for r, g, b in pixels if r <= 5 and g <= 5 and b <= 5) / max(1, len(pixels))
    mean_luma = sum((0.2126 * r + 0.7152 * g + 0.0722 * b) for r, g, b in pixels) / max(1, len(pixels))

    active_rows: list[int] = []
    step = max(1, width // 240)
    for y in range(height):
        active = 0
        count = 0
        for x in range(0, width, step):
            r, g, b = rgb.getpixel((x, y))
            count += 1
            if max(r, g, b) > 14:
                active += 1
        if count and active / count >= 0.18:
            active_rows.append(y)
    span = 0.0 if not active_rows else (max(active_rows) - min(active_rows) + 1) / height
    return {"pure_black_fraction": round(pure_black, 5), "mean_luma": round(mean_luma, 3), "active_span_fraction": round(span, 5)}


def visual_integrity_gate(video: Path, tmp: Path, duration: float) -> dict[str, Any]:
    sample_times = [0.10, 0.90, 1.80, 2.70, 3.60, max(0.1, duration - 0.18)]
    samples: list[dict[str, Any]] = []
    for index, seconds in enumerate(sample_times):
        frame = tmp / f"qc-{index}.png"
        extract_qc_frame(video, frame, min(seconds, max(0.1, duration - 0.05)))
        metrics = frame_metrics(frame)
        metrics["time_seconds"] = round(seconds, 3)
        samples.append(metrics)

    max_black = max(item["pure_black_fraction"] for item in samples)
    min_span = min(item["active_span_fraction"] for item in samples)
    first_luma = max(1.0, samples[0]["mean_luma"])
    last_luma_ratio = samples[-1]["mean_luma"] / first_luma
    black_growth = samples[-1]["pure_black_fraction"] - samples[0]["pure_black_fraction"]

    if max_black > 0.55:
        raise RuntimeError(f"AVANTIQO_VIDEO_HQ4K_QC_BLACK_COLLAPSE:{max_black}")
    if min_span < 0.70:
        raise RuntimeError(f"AVANTIQO_VIDEO_HQ4K_QC_FRAME_SPAN_COLLAPSE:{min_span}")
    if black_growth > 0.24:
        raise RuntimeError(f"AVANTIQO_VIDEO_HQ4K_QC_BLACK_GROWTH:{black_growth}")
    if last_luma_ratio < 0.45:
        raise RuntimeError(f"AVANTIQO_VIDEO_HQ4K_QC_LUMA_COLLAPSE:{last_luma_ratio}")
    return {
        "samples": samples,
        "max_pure_black_fraction": round(max_black, 5),
        "min_active_span_fraction": round(min_span, 5),
        "last_to_first_luma_ratio": round(last_luma_ratio, 5),
        "black_growth": round(black_growth, 5),
    }


def finish_uhd(raw: Path, target: Path) -> None:
    required_file(FONT, "AVANTIQO_VIDEO_HQ4K_FONT_REQUIRED")
    top_pad = (DELIVERY_HEIGHT - RAW_HEIGHT) // 2
    filter_chain = (
        f"pad={DELIVERY_WIDTH}:{DELIVERY_HEIGHT}:0:{top_pad}:black,"
        f"drawtext=fontfile={FONT}:text='04\\:47 AM':fontcolor=white:fontsize=64:x=160:y=45,"
        f"drawtext=fontfile={FONT}:text='BEFORE THE DAY BEGINS':fontcolor=white@0.88:fontsize=34:x=160:y=118"
    )
    run_command(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(raw),
            "-vf", filter_chain,
            "-c:v", "libx264", "-preset", "medium", "-crf", "10", "-pix_fmt", "yuv420p",
            "-profile:v", "high", "-level", "5.2", "-c:a", "aac", "-b:a", "320k",
            "-movflags", "+faststart", "-y", str(target),
        ],
        timeout=180,
    )


def upload_file(path: Path, signed_url: str) -> None:
    with path.open("rb") as handle:
        response = requests.put(
            signed_url,
            data=handle,
            headers={"content-type": "video/mp4", "cache-control": "max-age=3600", "x-upsert": "false"},
            timeout=240,
        )
    if not response.ok:
        raise RuntimeError(f"AVANTIQO_VIDEO_HQ4K_UPLOAD_FAILED:{response.status_code}")


def run_scene(job: dict[str, Any], tmp: Path) -> dict[str, Any]:
    data = obj(job.get("input"))
    if text(data.get("contract")) != ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_VIDEO_ENGINE_CONTRACT_INVALID")
    if text(data.get("capability")) != "ai.video.image_to_video":
        raise ValueError("AVANTIQO_VIDEO_HQ4K_I2V_REQUIRED")
    if int(data.get("fps") or FPS) != FPS:
        raise ValueError("AVANTIQO_VIDEO_HQ4K_FPS_24_REQUIRED")

    duration_seconds = int(data.get("duration_seconds") or 5)
    frames = frame_count(duration_seconds)
    seed = int(data.get("seed") if data.get("seed") is not None else 4747)
    references = data.get("reference_images") or []
    if not isinstance(references, list) or not references:
        raise ValueError("AVANTIQO_VIDEO_HQ4K_REFERENCE_REQUIRED")

    upload = obj(data.get("output_upload"))
    output_signed_url = text(upload.get("signed_url"))
    storage_reference = text(upload.get("storage_reference"))
    if not output_signed_url.startswith("https://") or not storage_reference.startswith("storage://creative-assets/"):
        raise ValueError("AVANTIQO_VIDEO_HQ4K_OUTPUT_UPLOAD_INVALID")

    source_reference = tmp / "scene1-reference.jpg"
    clean = tmp / "scene1-reference-clean.png"
    raw = tmp / "scene1-hq-raw.mp4"
    final = tmp / "scene1-hq4k.mp4"
    download_reference(text(references[0]), source_reference)
    clean_reference(source_reference, clean)

    command = [
        "python", "-m", "ltx_pipelines.ti2vid_two_stages_hq",
        "--transformer-path", required_file(DEV_TRANSFORMER, "AVANTIQO_VIDEO_HQ4K_DEV_TRANSFORMER_REQUIRED"),
        "--text-encoder-path", required_file(TEXT_ENCODER, "AVANTIQO_VIDEO_HQ4K_TEXT_ENCODER_REQUIRED"),
        "--video-vae-path", required_file(VIDEO_VAE, "AVANTIQO_VIDEO_HQ4K_VIDEO_VAE_REQUIRED"),
        "--audio-vae-path", required_file(AUDIO_VAE, "AVANTIQO_VIDEO_HQ4K_AUDIO_VAE_REQUIRED"),
        "--spatial-upsampler-path", required_file(SPATIAL_UPSAMPLER, "AVANTIQO_VIDEO_HQ4K_SPATIAL_UPSAMPLER_REQUIRED"),
        "--distilled-lora", required_file(DISTILLED_LORA, "AVANTIQO_VIDEO_HQ4K_DISTILLED_LORA_REQUIRED"),
        "--num-frames", str(frames),
        "--width", str(RAW_WIDTH),
        "--height", str(RAW_HEIGHT),
        "--frame-rate", str(FPS),
        "--seed", str(seed),
        "--output-path", str(raw),
        "--prompt", cinematic_prompt(data),
        "--negative-prompt", negative_prompt(),
        "--image", str(clean), "0", "1.0", "0",
    ]

    env = os.environ.copy()
    env["PYTHONPATH"] = ":".join([
        str(PIPELINE_ROOT / "packages/ltx-core/src"),
        str(PIPELINE_ROOT / "packages/ltx-pipelines/src"),
        env.get("PYTHONPATH", ""),
    ])
    env["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
    env["CUDA_MODULE_LOADING"] = "LAZY"

    started = time.perf_counter()
    hard_timeout = int(os.getenv("AVANTIQO_VIDEO_LTX25_HARD_TIMEOUT_SECONDS", "360"))
    completed = run_command(command, cwd=PIPELINE_ROOT, env=env, timeout=hard_timeout)
    pipeline_seconds = round(time.perf_counter() - started, 3)
    if not raw.is_file() or raw.stat().st_size <= 1_000_000:
        raise RuntimeError("AVANTIQO_VIDEO_HQ4K_RAW_OUTPUT_INVALID")

    raw_probe = probe_video(raw)
    stream = (raw_probe.get("streams") or [{}])[0]
    if int(stream.get("width") or 0) != RAW_WIDTH or int(stream.get("height") or 0) != RAW_HEIGHT:
        raise RuntimeError(f"AVANTIQO_VIDEO_HQ4K_RAW_DIMENSIONS_INVALID:{stream.get('width')}x{stream.get('height')}")
    duration = float(obj(raw_probe.get("format")).get("duration") or duration_seconds)
    qc = visual_integrity_gate(raw, tmp, duration)

    finish_uhd(raw, final)
    if not final.is_file() or final.stat().st_size <= 2_000_000:
        raise RuntimeError("AVANTIQO_VIDEO_HQ4K_FINAL_OUTPUT_INVALID")
    final_probe = probe_video(final)
    final_stream = (final_probe.get("streams") or [{}])[0]
    if int(final_stream.get("width") or 0) != DELIVERY_WIDTH or int(final_stream.get("height") or 0) != DELIVERY_HEIGHT:
        raise RuntimeError("AVANTIQO_VIDEO_HQ4K_DELIVERY_DIMENSIONS_INVALID")

    upload_file(final, output_signed_url)
    return {
        "status": "completed",
        "provider": "avantiqo-video",
        "model": "avantiqo-ltx-2.5",
        "engine_contract": ENGINE_CONTRACT,
        "runtime_contract": RUNTIME_CONTRACT,
        "quality_contract": QUALITY_CONTRACT,
        "foundation_model": "Lightricks/LTX-2.5",
        "pipeline": "TI2VID_TWO_STAGES_HQ_RES2S",
        "quality_lane": "production-hq4k",
        "precision": "BF16",
        "seed": seed,
        "fps": FPS,
        "frame_count": frames,
        "width": DELIVERY_WIDTH,
        "height": DELIVERY_HEIGHT,
        "internal_generation_resolution": f"{RAW_WIDTH}x{RAW_HEIGHT}",
        "stage_1_resolution": f"{RAW_WIDTH // 2}x{RAW_HEIGHT // 2}",
        "storage_reference": storage_reference,
        "output_size_bytes": final.stat().st_size,
        "generation_seconds": pipeline_seconds,
        "total_worker_seconds": round(time.perf_counter() - started, 3),
        "native_audio_generated": True,
        "learned_spatial_upscaler_used": True,
        "detailing_dfr_used": False,
        "pixel_720p_stage_used": False,
        "lanczos_upscale_used": False,
        "external_provider_contacted": False,
        "prompt_persisted": False,
        "native_4k_claimed": False,
        "uhd_delivery": True,
        "pixel_upscale_used": False,
        "learned_latent_upsampler_used": True,
        "deterministic_title_composite": True,
        "title_text": "04:47 AM / BEFORE THE DAY BEGINS",
        "visual_integrity_qc": qc,
        "raw_probe": raw_probe,
        "final_probe": final_probe,
        "pipeline_stdout_tail": sanitize(completed.stdout, 1800),
    }


def main() -> None:
    encoded = text(os.getenv("AVANTIQO_VIDEO_LTX25_JOB_B64"))
    receipt_url = text(os.getenv("AVANTIQO_VIDEO_LTX25_RECEIPT_SIGNED_URL"))
    receipt_ref = text(os.getenv("AVANTIQO_VIDEO_LTX25_RECEIPT_STORAGE_REFERENCE"))
    if not encoded or not receipt_url or not receipt_ref:
        raise RuntimeError("AVANTIQO_VIDEO_HQ4K_ONE_SHOT_ENV_REQUIRED")

    started = time.time()
    try:
        job = json.loads(base64.b64decode(encoded).decode("utf-8"))
        with tempfile.TemporaryDirectory(prefix="avantiqo-ltx25-hq4k-") as tmp_dir:
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
    print(f"AVANTIQO_VIDEO_HQ4K_RECEIPT_WRITTEN={str(receipt.get('success') is True).lower()}", flush=True)


if __name__ == "__main__":
    main()
