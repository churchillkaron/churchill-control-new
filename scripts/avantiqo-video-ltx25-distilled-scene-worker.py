import base64
import json
import os
import re
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

import requests

ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V2"
RUNTIME_CONTRACT = "AVANTIQO_VIDEO_LTX25_BLACKWELL_V1"
QUALITY_CONTRACT = "AVANTIQO_VIDEO_LTX25_DISTILLED_FAST_BF16_V2"
MODEL_ROOT = Path(os.getenv("AVANTIQO_VIDEO_LTX25_MODEL_ROOT", "/runpod-volume/ltx-2.5"))
PIPELINE_ROOT = Path(os.getenv("AVANTIQO_VIDEO_LTX25_PIPELINE_ROOT", "/opt/LTX-2"))
TRANSFORMER = MODEL_ROOT / "diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors"
TEXT_ENCODER = MODEL_ROOT / "text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors"
VIDEO_VAE = MODEL_ROOT / "vae/ltx-2.5-video-vae-bf16.safetensors"
AUDIO_VAE = MODEL_ROOT / "vae/ltx-2.5-audio-vae-bf16.safetensors"
SPATIAL_UPSAMPLER = MODEL_ROOT / "latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors"


def text(value: Any) -> str:
    return str(value or "").strip()


def obj(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def required_file(path: Path, code: str) -> str:
    if not path.is_file() or path.stat().st_size <= 0:
        raise RuntimeError(code)
    return str(path)


def native_4k_dimensions(aspect_ratio: str) -> tuple[int, int]:
    if aspect_ratio == "9:16":
        return 2176, 3840
    if aspect_ratio == "1:1":
        return 2176, 2176
    return 3840, 2176


def frame_count(duration_seconds: int, fps: int) -> int:
    desired = max(33, duration_seconds * fps + 1)
    return max(33, ((desired - 1) // 8) * 8 + 1)


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


def sanitize_detail(value: Any) -> str:
    detail = text(value).replace("\n", " ")
    detail = re.sub(r"hf_[A-Za-z0-9_-]{10,}", "[REDACTED_HF_TOKEN]", detail)
    detail = re.sub(r"Bearer\s+[A-Za-z0-9._~+/-]{8,}", "Bearer [REDACTED]", detail, flags=re.IGNORECASE)
    return detail[-2600:]


def download_reference(url: str, path: Path) -> None:
    response = requests.get(url, timeout=120, allow_redirects=True)
    response.raise_for_status()
    if len(response.content) > 64 * 1024 * 1024:
        raise RuntimeError("AVANTIQO_VIDEO_REFERENCE_TOO_LARGE")
    path.write_bytes(response.content)


def upload_file(path: Path, signed_url: str, content_type: str) -> None:
    with path.open("rb") as handle:
        response = requests.put(
            signed_url,
            data=handle,
            headers={"content-type": content_type, "cache-control": "max-age=3600", "x-upsert": "false"},
            timeout=900,
        )
    if not response.ok:
        raise RuntimeError(f"AVANTIQO_VIDEO_OUTPUT_UPLOAD_FAILED:{response.status_code}")


def install_torch_compat(tmp: Path) -> Path:
    """Pinned V5 image has torch 2.7.1 while pinned LTX source references a newer no-op compile decorator.
    The fast Scene-1 lane does not opt into torch.compile, so providing the missing decorator as identity
    preserves eager semantics without changing kernels or numerical execution.
    """
    compat = tmp / "torch-compat"
    compat.mkdir(parents=True, exist_ok=True)
    (compat / "sitecustomize.py").write_text(
        "import torch\n"
        "compiler = getattr(torch, 'compiler', None)\n"
        "if compiler is not None and not hasattr(compiler, 'nested_compile_region'):\n"
        "    compiler.nested_compile_region = lambda fn: fn\n",
        encoding="utf-8",
    )
    return compat


def run_scene(job: dict[str, Any], tmp: Path) -> dict[str, Any]:
    data = obj(job.get("input"))
    if text(data.get("contract")) != ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_VIDEO_ENGINE_CONTRACT_INVALID")
    if text(data.get("capability")) != "ai.video.image_to_video":
        raise ValueError("AVANTIQO_VIDEO_LTX25_SCENE1_I2V_REQUIRED")

    duration_seconds = int(data.get("duration_seconds") or 5)
    fps = int(data.get("fps") or 24)
    if fps != 24:
        raise ValueError("AVANTIQO_VIDEO_LTX25_FPS_24_REQUIRED")
    aspect_ratio = text(data.get("aspect_ratio") or "16:9")
    width, height = native_4k_dimensions(aspect_ratio)
    frames = frame_count(duration_seconds, fps)
    seed = int(data.get("seed") if data.get("seed") is not None else 4747)

    references = data.get("reference_images") or []
    if not isinstance(references, list) or not references:
        raise ValueError("AVANTIQO_VIDEO_IMAGE_TO_VIDEO_REFERENCE_REQUIRED")
    reference = tmp / "scene1-reference.jpg"
    download_reference(text(references[0]), reference)

    upload = obj(data.get("output_upload"))
    output_signed_url = text(upload.get("signed_url"))
    storage_reference = text(upload.get("storage_reference"))
    if not output_signed_url.startswith("https://"):
        raise ValueError("AVANTIQO_VIDEO_OUTPUT_SIGNED_URL_REQUIRED")
    if not storage_reference.startswith("storage://creative-assets/"):
        raise ValueError("AVANTIQO_VIDEO_OUTPUT_STORAGE_REFERENCE_INVALID")

    output = tmp / "ltx25-scene1-fast-bf16.mp4"
    command = [
        "python",
        "-m",
        "ltx_pipelines.distilled",
        "--transformer-path",
        required_file(TRANSFORMER, "AVANTIQO_VIDEO_LTX25_BF16_MODEL_REQUIRED"),
        "--text-encoder-path",
        required_file(TEXT_ENCODER, "AVANTIQO_VIDEO_LTX25_TEXT_ENCODER_REQUIRED"),
        "--video-vae-path",
        required_file(VIDEO_VAE, "AVANTIQO_VIDEO_LTX25_VIDEO_VAE_REQUIRED"),
        "--audio-vae-path",
        required_file(AUDIO_VAE, "AVANTIQO_VIDEO_LTX25_AUDIO_VAE_REQUIRED"),
        "--spatial-upsampler-path",
        required_file(SPATIAL_UPSAMPLER, "AVANTIQO_VIDEO_LTX25_SPATIAL_UPSAMPLER_REQUIRED"),
        "--num-frames",
        str(frames),
        "--width",
        str(width),
        "--height",
        str(height),
        "--frame-rate",
        str(fps),
        "--seed",
        str(seed),
        "--output-path",
        str(output),
        "--prompt",
        cinematic_instruction(data),
        "--image",
        str(reference),
        "0",
        "1.0",
        "0",
    ]

    compat = install_torch_compat(tmp)
    env = os.environ.copy()
    env["PYTHONPATH"] = ":".join(
        [
            str(compat),
            str(PIPELINE_ROOT / "packages/ltx-core/src"),
            str(PIPELINE_ROOT / "packages/ltx-pipelines/src"),
            env.get("PYTHONPATH", ""),
        ]
    )
    env["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
    env["CUDA_MODULE_LOADING"] = "LAZY"

    started = time.perf_counter()
    completed = subprocess.run(
        command,
        cwd=str(PIPELINE_ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=int(os.getenv("AVANTIQO_VIDEO_LTX25_HARD_TIMEOUT_SECONDS", "240")),
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_LTX25_DISTILLED_PIPELINE_FAILED:{completed.returncode}:{sanitize_detail(completed.stdout)}"
        )
    if not output.is_file() or output.stat().st_size <= 0:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_OUTPUT_MISSING")

    upload_file(output, output_signed_url, "video/mp4")
    return {
        "status": "completed",
        "provider": "avantiqo-video",
        "model": "avantiqo-ltx-2.5",
        "engine_contract": ENGINE_CONTRACT,
        "runtime_contract": RUNTIME_CONTRACT,
        "quality_contract": QUALITY_CONTRACT,
        "foundation_model": "Lightricks/LTX-2.5",
        "pipeline": "DISTILLED_TWO_STAGE_FAST_BF16",
        "quality_lane": "hero",
        "precision": "BF16",
        "seed": seed,
        "fps": fps,
        "frame_count": frames,
        "width": width,
        "height": height,
        "internal_generation_resolution": f"{width}x{height}",
        "stage_1_resolution": f"{width // 2}x{height // 2}",
        "storage_reference": storage_reference,
        "output_size_bytes": output.stat().st_size,
        "generation_seconds": round(time.perf_counter() - started, 3),
        "native_audio_generated": True,
        "learned_spatial_upscaler_used": True,
        "detailing_dfr_used": False,
        "pixel_720p_stage_used": False,
        "lanczos_upscale_used": False,
        "external_provider_contacted": False,
        "prompt_persisted": False,
        "torch27_nested_compile_region_compat": True,
        "cpu_offload_used": False,
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
        with tempfile.TemporaryDirectory(prefix="avantiqo-ltx25-fast-bf16-") as tmp_dir:
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
            "error_detail": sanitize_detail(raw),
            "elapsed_seconds": round(time.time() - started, 3),
        }

    response = requests.put(
        receipt_url,
        data=json.dumps(receipt, separators=(",", ":")).encode(),
        headers={"content-type": "application/json", "x-upsert": "false"},
        timeout=120,
    )
    response.raise_for_status()
    print(f"AVANTIQO_VIDEO_LTX25_FAST_BF16_RECEIPT_WRITTEN={str(receipt.get('success') is True).lower()}", flush=True)


if __name__ == "__main__":
    main()
