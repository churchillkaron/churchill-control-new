import ipaddress
import os
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
import runpod
import torch
from diffusers import DiffusionPipeline

ENGINE_CONTRACT = "AVANTIQO_IMAGE_ENGINE_V1"
PRODUCT_MODEL = "avantiqo-image-v1"
OUTPUT_DIR = Path(os.getenv("AVANTIQO_IMAGE_OUTPUT_DIR", "/tmp/avantiqo-image"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
DEVICE = os.getenv("AVANTIQO_IMAGE_DEVICE", "cuda")
DTYPE = torch.bfloat16 if os.getenv("AVANTIQO_IMAGE_DTYPE", "bfloat16").lower() == "bfloat16" else torch.float16
FOUNDATION_MODEL = os.getenv("AVANTIQO_IMAGE_FOUNDATION_MODEL", "").strip()
_PIPELINE: Any | None = None


def _text(value: Any) -> str:
    return str(value or "").strip()


def _public_https_url(value: Any, *, upload: bool = False) -> str:
    source = _text(value)
    parsed = urlparse(source)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("AVANTIQO_IMAGE_HTTPS_URL_REQUIRED")
    host = parsed.hostname.lower()
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
        raise ValueError("AVANTIQO_IMAGE_PRIVATE_URL_FORBIDDEN")
    try:
        literal = ipaddress.ip_address(host)
        if literal.is_private or literal.is_loopback or literal.is_link_local:
            raise ValueError("AVANTIQO_IMAGE_PRIVATE_URL_FORBIDDEN")
    except ValueError as exc:
        if str(exc) == "AVANTIQO_IMAGE_PRIVATE_URL_FORBIDDEN":
            raise
    if upload and not (host.endswith(".supabase.co") or host.endswith(".storage.supabase.co")):
        raise ValueError("AVANTIQO_IMAGE_UPLOAD_HOST_FORBIDDEN")
    return source


def _pipeline():
    global _PIPELINE
    if _PIPELINE is not None:
        return _PIPELINE
    if not FOUNDATION_MODEL:
        raise RuntimeError("AVANTIQO_IMAGE_FOUNDATION_MODEL_REQUIRED")
    pipe = DiffusionPipeline.from_pretrained(
        FOUNDATION_MODEL,
        torch_dtype=DTYPE,
        device_map="balanced" if DEVICE.startswith("cuda") else None,
    )
    if not DEVICE.startswith("cuda"):
        pipe.to(DEVICE)
    if hasattr(pipe, "enable_attention_slicing"):
        pipe.enable_attention_slicing()
    if hasattr(pipe, "enable_vae_slicing"):
        pipe.enable_vae_slicing()
    _PIPELINE = pipe
    return pipe


def _dimensions(spec: dict[str, Any]) -> tuple[int, int]:
    output = spec.get("output_spec") or {}
    ratio = _text(output.get("aspect_ratio") or output.get("ratio") or "1:1")
    if ratio == "9:16":
        return 768, 1344
    if ratio == "16:9":
        return 1344, 768
    return 1024, 1024


def _validated_input(job: dict[str, Any]) -> dict[str, Any]:
    data = job.get("input") or {}
    if data.get("contract") != ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_IMAGE_ENGINE_CONTRACT_INVALID")
    if data.get("capability") != "ai.image.generate":
        raise ValueError("AVANTIQO_IMAGE_CAPABILITY_NOT_CERTIFIED")
    instruction = _text(data.get("instruction"))
    if not instruction:
        raise ValueError("AVANTIQO_IMAGE_INSTRUCTION_REQUIRED")
    if len(instruction) > 12000:
        raise ValueError("AVANTIQO_IMAGE_INSTRUCTION_TOO_LONG")
    storage = data.get("storage_upload") or {}
    signed_url = _public_https_url(storage.get("signed_url"), upload=True)
    storage_reference = _text(storage.get("storage_reference"))
    if not storage_reference.startswith("storage://creative-assets/"):
        raise ValueError("AVANTIQO_IMAGE_STORAGE_REFERENCE_INVALID")
    data["storage_upload"] = {
        **storage,
        "signed_url": signed_url,
        "storage_reference": storage_reference,
    }
    return data


def _upload(path: Path, storage: dict[str, Any]) -> None:
    with path.open("rb") as handle:
        response = requests.put(
            storage["signed_url"],
            data=handle,
            headers={"content-type": "image/png", "x-upsert": "false"},
            timeout=180,
        )
    if not response.ok:
        detail = response.text[:500].replace("\n", " ")
        raise RuntimeError(f"AVANTIQO_IMAGE_STORAGE_UPLOAD_FAILED:{response.status_code}:{detail}")


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data = _validated_input(job)
    started = time.perf_counter()
    runpod.serverless.progress_update(job, "loading Avantiqo Image")
    pipe = _pipeline()
    spec = data.get("structured_specification") or {}
    params = spec.get("provider_parameters") or {}
    width, height = _dimensions(spec)
    seed = int(params.get("seed") if params.get("seed") is not None else int.from_bytes(os.urandom(4), "big"))
    if seed < 0 or seed > 4294967295:
        raise ValueError("AVANTIQO_IMAGE_SEED_INVALID")
    generator_device = "cuda" if DEVICE.startswith("cuda") else DEVICE
    generator = torch.Generator(device=generator_device).manual_seed(seed)

    runpod.serverless.progress_update(job, "generating image")
    result = pipe(
        prompt=data["instruction"],
        width=width,
        height=height,
        num_inference_steps=int(params.get("inference_steps") or os.getenv("AVANTIQO_IMAGE_INFERENCE_STEPS", "28")),
        guidance_scale=float(params.get("guidance_scale") or os.getenv("AVANTIQO_IMAGE_GUIDANCE_SCALE", "4.0")),
        generator=generator,
    )
    image = result.images[0]
    job_id = _text(job.get("id")) or str(int(time.time() * 1000))
    path = OUTPUT_DIR / f"{job_id}.png"
    image.save(path, format="PNG")
    runpod.serverless.progress_update(job, "storing private Avantiqo asset")
    _upload(path, data["storage_upload"])
    size_bytes = path.stat().st_size
    path.unlink(missing_ok=True)

    return {
        "status": "completed",
        "provider": "avantiqo-image",
        "model": PRODUCT_MODEL,
        "engine_contract": ENGINE_CONTRACT,
        "capability": data["capability"],
        "storage_reference": data["storage_upload"]["storage_reference"],
        "foundation_model": FOUNDATION_MODEL,
        "seed": seed,
        "width": width,
        "height": height,
        "size_bytes": size_bytes,
        "generation_seconds": round(time.perf_counter() - started, 3),
        "raw_reasoning_persisted": False,
    }


@runpod.serverless.register_fitness_check
def check_worker():
    if not FOUNDATION_MODEL:
        raise RuntimeError("AVANTIQO_IMAGE_FOUNDATION_MODEL_REQUIRED")
    if not torch.cuda.is_available():
        raise RuntimeError("AVANTIQO_IMAGE_CUDA_REQUIRED")


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
