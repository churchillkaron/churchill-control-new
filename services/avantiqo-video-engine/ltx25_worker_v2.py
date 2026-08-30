import base64
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

import requests

ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V2"
RUNTIME_CONTRACT = "AVANTIQO_VIDEO_LTX25_BLACKWELL_V1"
QUALITY_CONTRACT = "AVANTIQO_VIDEO_LTX25_DFR_AGENCY_QUALITY_V1"
SUPPORTED_CAPABILITIES = {"ai.video.generate", "ai.video.image_to_video"}

MODEL_ROOT = Path(os.getenv("AVANTIQO_VIDEO_LTX25_MODEL_ROOT", "/runpod-volume/ltx-2.5"))
PIPELINE_ROOT = Path(os.getenv("AVANTIQO_VIDEO_LTX25_PIPELINE_ROOT", "/opt/LTX-2"))
TRANSFORMER_BF16 = MODEL_ROOT / "diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors"
TRANSFORMER_NVFP4 = MODEL_ROOT / "diffusion_models/ltx-2.5-22b-distilled-transformer-nvfp4.safetensors"
TEXT_ENCODER = MODEL_ROOT / "text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors"
VIDEO_VAE = MODEL_ROOT / "vae/ltx-2.5-video-vae-bf16.safetensors"
AUDIO_VAE = MODEL_ROOT / "vae/ltx-2.5-audio-vae-bf16.safetensors"
SPATIAL_UPSAMPLER = MODEL_ROOT / "latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors"
DETAILING_LORA = MODEL_ROOT / "loras/ltx-2.5-22b-ic-lora-pixel-spatial-upscaler-x2-1.0.safetensors"


def text(value: Any) -> str:
    return str(value or "").strip()


def obj(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def enabled(name: str, default: bool = False) -> bool:
    raw = text(os.getenv(name, "1" if default else "0")).lower()
    return raw in {"1", "true", "yes", "on", "enabled"}


def required_file(path: Path, code: str) -> str:
    if not path.is_file() or path.stat().st_size <= 0:
        raise RuntimeError(code)
    return str(path)


def native_4k_dimensions(aspect_ratio: str) -> tuple[int, int]:
    # Official LTX-2.5 DFR UHD alignment is 3840x2176 rather than 3840x2160.
    # We preserve that learned/model-native 4K frame through generation and only
    # allow a later Studio crop from 2176 to 2160; no pixel upscaling is needed.
    if aspect_ratio == "9:16":
        return 2176, 3840
    if aspect_ratio == "1:1":
        return 2176, 2176
    return 3840, 2176


def frame_count(duration_seconds: int, fps: int) -> int:
    desired = max(33, duration_seconds * fps + 1)
    return max(33, ((desired - 1) // 8) * 8 + 1)


def quality_lane(data: dict[str, Any]) -> str:
    explicit = text(data.get("quality_lane")).lower()
    if explicit in {"hero", "film"}:
        return "hero"
    return "production"


def cinematic_instruction(data: dict[str, Any]) -> str:
    base = text(data.get("instruction"))
    if not base:
        raise ValueError("AVANTIQO_VIDEO_INSTRUCTION_REQUIRED")
    control = obj(data.get("cinematic_control"))
    if not control:
        return base
    bounded = {
        "camera": obj(control.get("camera")),
        "continuity": obj(control.get("continuity")),
        "frame_contract": obj(control.get("frame_contract")),
        "shot_specification": obj(control.get("shot_specification")),
        "identity_lock": obj(control.get("identity_lock")),
        "negative_constraints": control.get("negative_constraints") if isinstance(control.get("negative_constraints"), list) else [],
    }
    serialized = json.dumps(bounded, separators=(",", ":"), ensure_ascii=True)
    if len(serialized) > 6000:
        raise ValueError("AVANTIQO_VIDEO_CINEMATIC_CONTROL_TOO_LARGE")
    return f"{base}\n\nGOVERNED CINEMATIC CONTROL:\n{serialized}"


def validate(job: dict[str, Any]) -> dict[str, Any]:
    data = obj(job.get("input"))
    if text(data.get("contract")) != ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_VIDEO_ENGINE_CONTRACT_INVALID")
    capability = text(data.get("capability"))
    if capability not in SUPPORTED_CAPABILITIES:
        raise ValueError(f"AVANTIQO_VIDEO_CAPABILITY_UNSUPPORTED:{capability or 'MISSING'}")
    duration_seconds = int(data.get("duration_seconds") or 5)
    if duration_seconds < 2 or duration_seconds > 20:
        raise ValueError("AVANTIQO_VIDEO_DURATION_INVALID")
    fps = int(data.get("fps") or 24)
    if fps != 24:
        raise ValueError("AVANTIQO_VIDEO_LTX25_FPS_24_REQUIRED")
    aspect_ratio = text(data.get("aspect_ratio") or "16:9")
    if aspect_ratio not in {"16:9", "9:16", "1:1"}:
        raise ValueError("AVANTIQO_VIDEO_ASPECT_RATIO_INVALID")
    requested_resolution = text(data.get("resolution") or "native-4k").lower()
    if requested_resolution in {"720p", "1280x720", "720x1280"}:
        raise ValueError("AVANTIQO_VIDEO_720P_FORBIDDEN")
    if requested_resolution not in {"native-4k", "4k", "2160p", "uhd"}:
        raise ValueError("AVANTIQO_VIDEO_LTX25_4K_REQUIRED")
    upload = obj(data.get("output_upload"))
    signed_url = text(upload.get("signed_url"))
    storage_reference = text(upload.get("storage_reference"))
    if not signed_url.startswith("https://"):
        raise ValueError("AVANTIQO_VIDEO_OUTPUT_SIGNED_URL_REQUIRED")
    if not storage_reference.startswith("storage://creative-assets/"):
        raise ValueError("AVANTIQO_VIDEO_OUTPUT_STORAGE_REFERENCE_INVALID")
    references = data.get("reference_images") or []
    if not isinstance(references, list) or len(references) > 4:
        raise ValueError("AVANTIQO_VIDEO_REFERENCE_LIMIT_EXCEEDED")
    if capability == "ai.video.image_to_video" and not references:
        raise ValueError("AVANTIQO_VIDEO_IMAGE_TO_VIDEO_REFERENCE_REQUIRED")
    return {
        **data,
        "capability": capability,
        "duration_seconds": duration_seconds,
        "fps": fps,
        "aspect_ratio": aspect_ratio,
        "reference_images": references,
        "output_upload": {"signed_url": signed_url, "storage_reference": storage_reference},
    }


def download_reference(url: str, path: Path) -> str:
    response = requests.get(url, timeout=120, allow_redirects=False)
    response.raise_for_status()
    if len(response.content) > 64 * 1024 * 1024:
        raise RuntimeError("AVANTIQO_VIDEO_REFERENCE_TOO_LARGE")
    path.write_bytes(response.content)
    return str(path)


def nvfp4_available() -> bool:
    if not enabled("AVANTIQO_VIDEO_LTX25_NVFP4_ENABLED"):
        return False
    if not TRANSFORMER_NVFP4.is_file():
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_NVFP4_MODEL_REQUIRED")
    # Certification sets this only after the image has proven the SM100 kernel.
    if not enabled("AVANTIQO_VIDEO_LTX25_NVFP4_KERNEL_CERTIFIED"):
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_NVFP4_KERNEL_CERTIFICATION_REQUIRED")
    return True


def transformer_args(lane: str) -> tuple[str, list[str], str]:
    if lane == "production" and nvfp4_available():
        return required_file(TRANSFORMER_NVFP4, "AVANTIQO_VIDEO_LTX25_NVFP4_MODEL_REQUIRED"), ["--quantization", "nvfp4-prequant"], "NVFP4_PREQUANT"
    return required_file(TRANSFORMER_BF16, "AVANTIQO_VIDEO_LTX25_BF16_MODEL_REQUIRED"), [], "BF16"


def run_pipeline(data: dict[str, Any], root: Path) -> tuple[Path, dict[str, Any]]:
    lane = quality_lane(data)
    width, height = native_4k_dimensions(data["aspect_ratio"])
    frames = frame_count(data["duration_seconds"], data["fps"])
    seed = int(data.get("seed") if data.get("seed") is not None else int.from_bytes(os.urandom(4), "big"))
    if seed < 0 or seed > 4294967295:
        raise ValueError("AVANTIQO_VIDEO_SEED_INVALID")

    transformer, quant_args, precision = transformer_args(lane)
    output = root / "ltx25-output.mp4"
    command = [
        "python", "-m", "ltx_pipelines.dfr_pipeline",
        "--transformer-path", transformer,
        "--text-encoder-path", required_file(TEXT_ENCODER, "AVANTIQO_VIDEO_LTX25_TEXT_ENCODER_REQUIRED"),
        "--video-vae-path", required_file(VIDEO_VAE, "AVANTIQO_VIDEO_LTX25_VIDEO_VAE_REQUIRED"),
        "--audio-vae-path", required_file(AUDIO_VAE, "AVANTIQO_VIDEO_LTX25_AUDIO_VAE_REQUIRED"),
        "--spatial-upsampler-path", required_file(SPATIAL_UPSAMPLER, "AVANTIQO_VIDEO_LTX25_SPATIAL_UPSAMPLER_REQUIRED"),
        "--detailing-lora", required_file(DETAILING_LORA, "AVANTIQO_VIDEO_LTX25_DETAILING_LORA_REQUIRED"),
        "--num-frames", str(frames),
        "--width", str(width),
        "--height", str(height),
        "--seed", str(seed),
        "--output-path", str(output),
        "--prompt", cinematic_instruction(data),
        *quant_args,
    ]
    if data["capability"] == "ai.video.image_to_video":
        reference = download_reference(data["reference_images"][0], root / "reference-image")
        command.extend(["--image", reference, "0", "1.0", "0"])

    env = os.environ.copy()
    env["PYTHONPATH"] = f"{PIPELINE_ROOT / 'packages/ltx-core/src'}:{PIPELINE_ROOT / 'packages/ltx-pipelines/src'}:{env.get('PYTHONPATH', '')}"
    started = time.perf_counter()
    completed = subprocess.run(
        command,
        cwd=str(PIPELINE_ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=int(os.getenv("AVANTIQO_VIDEO_LTX25_HARD_TIMEOUT_SECONDS", "7200")),
        check=False,
    )
    if completed.returncode != 0:
        tail = completed.stdout[-4000:].replace("\n", " ")
        raise RuntimeError(f"AVANTIQO_VIDEO_LTX25_PIPELINE_FAILED:{completed.returncode}:{tail}")
    if not output.is_file() or output.stat().st_size <= 0:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_OUTPUT_MISSING")
    return output, {
        "lane": lane,
        "width": width,
        "height": height,
        "fps": data["fps"],
        "frame_count": frames,
        "seed": seed,
        "precision": precision,
        "generation_seconds": round(time.perf_counter() - started, 3),
    }


def upload_output(path: Path, signed_url: str) -> None:
    with path.open("rb") as handle:
        response = requests.put(
            signed_url,
            data=handle,
            headers={"content-type": "video/mp4", "cache-control": "max-age=3600", "x-upsert": "false"},
            timeout=600,
        )
    if not response.ok:
        raise RuntimeError(f"AVANTIQO_VIDEO_OUTPUT_UPLOAD_FAILED:{response.status_code}")


def execute(job: dict[str, Any]) -> dict[str, Any]:
    data = validate(job)
    with tempfile.TemporaryDirectory(prefix="avantiqo-ltx25-") as tmp:
        path, meta = run_pipeline(data, Path(tmp))
        upload_output(path, data["output_upload"]["signed_url"])
        size = path.stat().st_size
    return {
        "status": "completed",
        "provider": "avantiqo-video",
        "model": "avantiqo-ltx-2.5",
        "engine_contract": ENGINE_CONTRACT,
        "runtime_contract": RUNTIME_CONTRACT,
        "quality_contract": QUALITY_CONTRACT,
        "foundation_model": "Lightricks/LTX-2.5",
        "pipeline": "DFR",
        "quality_lane": meta["lane"],
        "precision": meta["precision"],
        "seed": meta["seed"],
        "fps": meta["fps"],
        "frame_count": meta["frame_count"],
        "width": meta["width"],
        "height": meta["height"],
        "internal_generation_resolution": f"{meta['width']}x{meta['height']}",
        "storage_reference": data["output_upload"]["storage_reference"],
        "output_size_bytes": size,
        "generation_seconds": meta["generation_seconds"],
        "native_audio_generated": True,
        "learned_spatial_upscaler_used": True,
        "detailing_dfr_used": True,
        "pixel_720p_stage_used": False,
        "lanczos_upscale_used": False,
        "external_provider_contacted": False,
        "prompt_persisted": False,
    }


def main() -> None:
    encoded = text(os.getenv("AVANTIQO_VIDEO_LTX25_JOB_B64"))
    receipt_url = text(os.getenv("AVANTIQO_VIDEO_LTX25_RECEIPT_SIGNED_URL"))
    receipt_ref = text(os.getenv("AVANTIQO_VIDEO_LTX25_RECEIPT_STORAGE_REFERENCE"))
    if not encoded or not receipt_url or not receipt_ref:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_ONE_SHOT_ENV_REQUIRED")
    started = time.time()
    try:
        job = json.loads(base64.b64decode(encoded).decode("utf-8"))
        output = execute(job)
        receipt = {
            "success": True,
            "contract": RUNTIME_CONTRACT,
            "status": "completed",
            "output": output,
            "receipt_storage_reference": receipt_ref,
            "elapsed_seconds": round(time.time() - started, 3),
        }
    except Exception as exc:
        receipt = {
            "success": False,
            "contract": RUNTIME_CONTRACT,
            "status": "failed",
            "error_code": str(exc).split(":", 1)[0][:180],
            "elapsed_seconds": round(time.time() - started, 3),
        }
    response = requests.put(
        receipt_url,
        data=json.dumps(receipt, separators=(",", ":")).encode(),
        headers={"content-type": "application/json", "x-upsert": "false"},
        timeout=120,
    )
    response.raise_for_status()
    print(f"AVANTIQO_VIDEO_LTX25_RECEIPT_WRITTEN={str(receipt.get('success') is True).lower()}", flush=True)


if __name__ == "__main__":
    main()
