import base64
import json
import os
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import requests

ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V2"
RUNTIME_CONTRACT = "AVANTIQO_VIDEO_LTX25_GLOBAL_POD_ONCE_V1"
QUALITY_CONTRACT = "AVANTIQO_VIDEO_LTX25_NATIVE_MASTER_3840X2176_V1"
SOURCE_REPO = "Lightricks/LTX-2.5"
SOURCE_REVISION = "e8dc69fd26150afbfa20351f6bc9ac384257f9fd"
MODEL_ROOT = Path(os.getenv("AVANTIQO_VIDEO_LTX25_MODEL_ROOT", "/models/ltx-2.5"))
PIPELINE_ROOT = Path(os.getenv("AVANTIQO_VIDEO_LTX25_PIPELINE_ROOT", "/opt/LTX-2"))
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


def sanitize(value: Any, limit: int = 2400) -> str:
    return text(value).replace("\n", " ")[-limit:]


def frame_count(duration_seconds: int) -> int:
    desired = max(33, duration_seconds * FPS + 1)
    return max(33, ((desired - 1) // 8) * 8 + 1)


def download_hf_file(relative: str, token: str) -> tuple[str, int]:
    target = MODEL_ROOT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    url = f"https://huggingface.co/{SOURCE_REPO}/resolve/{SOURCE_REVISION}/{relative}?download=true"
    headers = {"Authorization": f"Bearer {token}"}
    with requests.get(url, headers=headers, stream=True, timeout=(30, 600), allow_redirects=True) as response:
        response.raise_for_status()
        with target.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=8 * 1024 * 1024):
                if chunk:
                    handle.write(chunk)
    size = target.stat().st_size if target.is_file() else 0
    if size <= 0:
        raise RuntimeError(f"AVANTIQO_VIDEO_POD_MODEL_FILE_EMPTY:{relative}")
    return relative, size


def download_models() -> list[dict[str, Any]]:
    token = text(os.getenv("HF_TOKEN") or os.getenv("HUGGING_FACE_HUB_TOKEN") or os.getenv("HUGGINGFACE_TOKEN"))
    if not token:
        raise RuntimeError("AVANTIQO_VIDEO_POD_HF_TOKEN_REQUIRED")
    MODEL_ROOT.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(download_hf_file, relative, token): relative for relative in REQUIRED}
        for future in as_completed(futures):
            relative, size = future.result()
            results.append({"path": relative, "size_bytes": size})
            print(f"AVANTIQO_VIDEO_POD_MODEL_FILE_READY={relative}:{size}", flush=True)
    results.sort(key=lambda row: row["path"])
    if len(results) != len(REQUIRED):
        raise RuntimeError("AVANTIQO_VIDEO_POD_MODEL_INVENTORY_INVALID")
    return results


def download_reference(url: str, target: Path) -> None:
    with requests.get(url, stream=True, timeout=(30, 180), allow_redirects=True) as response:
        response.raise_for_status()
        with target.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    handle.write(chunk)
    if not target.is_file() or target.stat().st_size < 20_000:
        raise RuntimeError("AVANTIQO_VIDEO_POD_REFERENCE_INVALID")


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


def run_generation(data: dict[str, Any], reference: Path, master: Path) -> tuple[float, str]:
    frames = frame_count(int(data.get("duration_seconds") or 5))
    seed = int(data.get("seed") if data.get("seed") is not None else 4747)
    command = [
        "python", "-m", "ltx_pipelines.ti2vid_one_stage",
        "--transformer-path", str(MODEL_ROOT / REQUIRED[0]),
        "--text-encoder-path", str(MODEL_ROOT / REQUIRED[1]),
        "--video-vae-path", str(MODEL_ROOT / REQUIRED[2]),
        "--audio-vae-path", str(MODEL_ROOT / REQUIRED[3]),
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
    env = os.environ.copy()
    env["PYTHONPATH"] = ":".join([
        str(PIPELINE_ROOT / "packages/ltx-core/src"),
        str(PIPELINE_ROOT / "packages/ltx-pipelines/src"),
        env.get("PYTHONPATH", ""),
    ])
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
        timeout=int(os.getenv("AVANTIQO_VIDEO_LTX25_HARD_TIMEOUT_SECONDS", "1800")),
        check=False,
    )
    elapsed = round(time.perf_counter() - started, 3)
    if completed.returncode != 0:
        raise RuntimeError(f"AVANTIQO_VIDEO_POD_GENERATION_FAILED:{completed.returncode}:{sanitize(completed.stdout)}")
    if not master.is_file() or master.stat().st_size <= 1_000_000:
        raise RuntimeError("AVANTIQO_VIDEO_POD_MASTER_INVALID")
    return elapsed, sanitize(completed.stdout, 1400)


def upload_file(path: Path, signed_url: str, content_type: str) -> None:
    with path.open("rb") as handle:
        response = requests.put(
            signed_url,
            data=handle,
            headers={"content-type": content_type, "cache-control": "max-age=3600", "x-upsert": "false"},
            timeout=600,
        )
    if not response.ok:
        raise RuntimeError(f"AVANTIQO_VIDEO_POD_UPLOAD_FAILED:{response.status_code}")


def write_receipt(receipt: dict[str, Any]) -> None:
    url = text(os.getenv("AVANTIQO_VIDEO_LTX25_RECEIPT_SIGNED_URL"))
    if not url.startswith("https://"):
        raise RuntimeError("AVANTIQO_VIDEO_POD_RECEIPT_URL_REQUIRED")
    response = requests.put(
        url,
        data=json.dumps(receipt, separators=(",", ":")).encode(),
        headers={"content-type": "application/json", "x-upsert": "false"},
        timeout=120,
    )
    response.raise_for_status()


def main() -> None:
    encoded = text(os.getenv("AVANTIQO_VIDEO_LTX25_JOB_B64"))
    if not encoded:
        raise RuntimeError("AVANTIQO_VIDEO_POD_JOB_REQUIRED")
    started = time.perf_counter()
    receipt: dict[str, Any]
    try:
        job = json.loads(base64.b64decode(encoded).decode("utf-8"))
        data = obj(job.get("input"))
        if text(data.get("contract")) != ENGINE_CONTRACT:
            raise ValueError("AVANTIQO_VIDEO_ENGINE_CONTRACT_INVALID")
        if text(data.get("capability")) != "ai.video.image_to_video":
            raise ValueError("AVANTIQO_VIDEO_POD_I2V_REQUIRED")
        if int(data.get("fps") or FPS) != FPS:
            raise ValueError("AVANTIQO_VIDEO_POD_FPS_24_REQUIRED")
        references = data.get("reference_images") or []
        if not isinstance(references, list) or not references:
            raise ValueError("AVANTIQO_VIDEO_POD_REFERENCE_REQUIRED")
        output_upload = obj(data.get("output_upload"))
        output_url = text(output_upload.get("signed_url"))
        storage_reference = text(output_upload.get("storage_reference"))
        if not output_url.startswith("https://") or not storage_reference.startswith("storage://creative-assets/"):
            raise ValueError("AVANTIQO_VIDEO_POD_OUTPUT_UPLOAD_INVALID")

        model_started = time.perf_counter()
        model_files = download_models()
        model_download_seconds = round(time.perf_counter() - model_started, 3)

        with tempfile.TemporaryDirectory(prefix="avantiqo-ltx25-global-pod-") as temp_dir:
            temp = Path(temp_dir)
            reference = temp / "prepared-reference.png"
            master = temp / "scene1-native-master-3840x2176.mp4"
            download_reference(text(references[0]), reference)
            generation_seconds, stdout_tail = run_generation(data, reference, master)
            upload_file(master, output_url, "video/mp4")
            output_size = master.stat().st_size

        frames = frame_count(int(data.get("duration_seconds") or 5))
        receipt = {
            "success": True,
            "contract": RUNTIME_CONTRACT,
            "status": "completed",
            "output": {
                "provider": "avantiqo-video",
                "foundation_model": SOURCE_REPO,
                "foundation_revision": SOURCE_REVISION,
                "pipeline": "TI2VID_ONE_STAGE_FULL_DEV_BF16",
                "quality_contract": QUALITY_CONTRACT,
                "precision": "BF16",
                "width": MASTER_WIDTH,
                "height": MASTER_HEIGHT,
                "fps": FPS,
                "frame_count": frames,
                "seed": int(data.get("seed") if data.get("seed") is not None else 4747),
                "storage_reference": storage_reference,
                "output_size_bytes": output_size,
                "model_download_seconds": model_download_seconds,
                "generation_seconds": generation_seconds,
                "model_files": model_files,
                "native_master_generated": True,
                "master_is_exact_model_output": True,
                "pixel_upscale_used": False,
                "learned_latent_upsampler_used": False,
                "learned_spatial_upscaler_used": False,
                "distilled_lora_used": False,
                "resize_used": False,
                "crop_used": False,
                "preprocessing_inside_paid_worker": False,
                "ffprobe_inside_paid_worker": False,
                "external_provider_contacted": False,
                "pipeline_stdout_tail": stdout_tail,
            },
            "elapsed_seconds": round(time.perf_counter() - started, 3),
        }
    except Exception as exc:
        receipt = {
            "success": False,
            "contract": RUNTIME_CONTRACT,
            "status": "failed",
            "error_code": text(exc).split(":", 1)[0][:180],
            "error_detail": sanitize(exc),
            "elapsed_seconds": round(time.perf_counter() - started, 3),
        }
    write_receipt(receipt)
    print(f"AVANTIQO_VIDEO_GLOBAL_POD_RECEIPT_SUCCESS={str(receipt.get('success') is True).lower()}", flush=True)


if __name__ == "__main__":
    main()
