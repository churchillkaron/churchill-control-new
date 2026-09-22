from __future__ import annotations
import argparse, json, os, subprocess, tempfile, time
from pathlib import Path
import requests

ROOT = Path(r"C:\Avantiqo\image-generate")
SD_CLI = ROOT / "bin" / "sd-cli.exe"
MODEL_DIR = ROOT / "models"
DIFFUSION = MODEL_DIR / "z_image_turbo-Q3_K.gguf"
LLM = MODEL_DIR / "Qwen3-4B-Instruct-2507-Q4_K_M.gguf"
VAE = MODEL_DIR / "ae.safetensors"
RUNTIME_CONTRACT = "AVANTIQO_NODE01_Z_IMAGE_TURBO_GGUF_V1"
MAX_PIXELS = 1_048_576

def text(value):
    return str(value or "").strip()

def bounded_int(value, fallback, minimum, maximum):
    try:
        value = int(value)
    except Exception:
        value = fallback
    return max(minimum, min(maximum, value))

def bounded_float(value, fallback, minimum, maximum):
    try:
        value = float(value)
    except Exception:
        value = fallback
    return max(minimum, min(maximum, value))

def upload(url: str, target: Path):
    if not url.startswith(("http://", "https://")):
        raise ValueError("AVANTIQO_LOCAL_IMAGE_GENERATE_UPLOAD_URL_INVALID")
    with target.open("rb") as handle:
        response = requests.put(url, data=handle, headers={"Content-Type": "image/png"}, timeout=240)
    response.raise_for_status()

def require_file(path: Path, code: str):
    if not path.is_file():
        raise RuntimeError(f"{code}:{path}")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    args = parser.parse_args()

    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    prompt = text(payload.get("prompt"))
    if not prompt:
        raise ValueError("AVANTIQO_LOCAL_IMAGE_GENERATE_PROMPT_REQUIRED")

    width = bounded_int(payload.get("width"), 768, 256, 1024)
    height = bounded_int(payload.get("height"), 768, 256, 1024)
    if width * height > MAX_PIXELS:
        raise ValueError("AVANTIQO_LOCAL_IMAGE_GENERATE_PIXEL_BUDGET_EXCEEDED")

    steps = bounded_int(payload.get("steps"), 8, 1, 12)
    cfg_scale = bounded_float(payload.get("cfg_scale"), 1.0, 0.1, 4.0)
    seed = bounded_int(payload.get("seed"), -1, -1, 2_147_483_647)
    storage = payload.get("storage_upload") or {}

    require_file(SD_CLI, "AVANTIQO_LOCAL_IMAGE_GENERATE_SD_CLI_REQUIRED")
    require_file(DIFFUSION, "AVANTIQO_LOCAL_IMAGE_GENERATE_DIFFUSION_REQUIRED")
    require_file(LLM, "AVANTIQO_LOCAL_IMAGE_GENERATE_LLM_REQUIRED")
    require_file(VAE, "AVANTIQO_LOCAL_IMAGE_GENERATE_VAE_REQUIRED")

    with tempfile.TemporaryDirectory(prefix="avantiqo-image-generate-") as temp_dir:
        output = Path(temp_dir) / "output.png"
        command = [
            str(SD_CLI),
            "--diffusion-model", str(DIFFUSION),
            "--vae", str(VAE),
            "--llm", str(LLM),
            "-p", prompt,
            "--cfg-scale", str(cfg_scale),
            "--steps", str(steps),
            "--offload-to-cpu",
            "--backend", "te=cpu",
            "--diffusion-fa",
            "--vae-tiling",
            "-H", str(height),
            "-W", str(width),
            "-o", str(output),
        ]
        if seed >= 0:
            command.extend(["--seed", str(seed)])

        started = time.perf_counter()
        completed = subprocess.run(
            command,
            cwd=str(ROOT / "bin"),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=7200,
            check=False,
        )
        elapsed = time.perf_counter() - started
        if completed.returncode != 0:
            tail = completed.stdout[-4000:] if completed.stdout else ""
            raise RuntimeError(f"AVANTIQO_LOCAL_IMAGE_GENERATE_PROCESS_FAILED:{tail}")
        if not output.is_file() or output.stat().st_size <= 0:
            raise RuntimeError("AVANTIQO_LOCAL_IMAGE_GENERATE_OUTPUT_REQUIRED")

        upload(text(storage.get("signed_url")), output)
        print(json.dumps({
            "status": "completed",
            "provider": "avantiqo-image",
            "model": "avantiqo-image-v1",
            "capability": "ai.image.generate",
            "foundation_model": "Tongyi-MAI/Z-Image-Turbo",
            "runtime_model": "z-image-turbo-q3-k",
            "quantization": "Q3_K",
            "storage_reference": text(storage.get("storage_reference")),
            "width": width,
            "height": height,
            "steps": steps,
            "cfg_scale": cfg_scale,
            "seed": seed,
            "size_bytes": output.stat().st_size,
            "execution_resource": "LOCAL_GPU_CPU_OFFLOAD",
            "infrastructure_provider": "AVANTIQO_LOCAL_NODE_V1",
            "runtime_contract": RUNTIME_CONTRACT,
            "inference_seconds": round(elapsed, 3),
            "raw_reasoning_persisted": False,
        }, separators=(",", ":")))

if __name__ == "__main__":
    main()
