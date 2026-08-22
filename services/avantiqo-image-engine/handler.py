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
from diffusers.utils import load_image
from PIL import Image

ENGINE_CONTRACT = "AVANTIQO_IMAGE_ENGINE_V1"
PRODUCT_MODEL = "avantiqo-image-v1"
IMPLEMENTED_CAPABILITIES = {
    "ai.image.generate",
    "ai.image.edit",
    "ai.image.inpaint",
    "ai.image.outpaint",
}
FOUNDATION_MODEL = os.getenv("AVANTIQO_IMAGE_FOUNDATION_MODEL", "").strip()
EDIT_MODEL = os.getenv("AVANTIQO_IMAGE_EDIT_MODEL", "Qwen/Qwen-Image-Edit").strip()
INPAINT_MODEL = os.getenv(
    "AVANTIQO_IMAGE_INPAINT_MODEL",
    "Qwen/Qwen-Image-Edit-2511",
).strip()
OUTPAINT_MODEL = os.getenv(
    "AVANTIQO_IMAGE_OUTPAINT_MODEL",
    INPAINT_MODEL or "Qwen/Qwen-Image-Edit-2511",
).strip()
OUTPUT_DIR = Path(os.getenv("AVANTIQO_IMAGE_OUTPUT_DIR", "/tmp/avantiqo-image"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
DEVICE = os.getenv("AVANTIQO_IMAGE_DEVICE", "cuda")
DTYPE = (
    torch.bfloat16
    if os.getenv("AVANTIQO_IMAGE_DTYPE", "bfloat16").lower() == "bfloat16"
    else torch.float16
)
_PIPELINES: dict[str, Any] = {}


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
    if upload and not (
        host.endswith(".supabase.co") or host.endswith(".storage.supabase.co")
    ):
        raise ValueError("AVANTIQO_IMAGE_UPLOAD_HOST_FORBIDDEN")
    return source


def _foundation_model(capability: str) -> str:
    if capability == "ai.image.edit":
        if not EDIT_MODEL:
            raise RuntimeError("AVANTIQO_IMAGE_EDIT_MODEL_REQUIRED")
        return EDIT_MODEL
    if capability == "ai.image.inpaint":
        if not INPAINT_MODEL:
            raise RuntimeError("AVANTIQO_IMAGE_INPAINT_MODEL_REQUIRED")
        return INPAINT_MODEL
    if capability == "ai.image.outpaint":
        if not OUTPAINT_MODEL:
            raise RuntimeError("AVANTIQO_IMAGE_OUTPAINT_MODEL_REQUIRED")
        return OUTPAINT_MODEL
    if not FOUNDATION_MODEL:
        raise RuntimeError("AVANTIQO_IMAGE_FOUNDATION_MODEL_REQUIRED")
    return FOUNDATION_MODEL


def _pipeline(model_id: str):
    if model_id in _PIPELINES:
        return _PIPELINES[model_id]
    pipe = DiffusionPipeline.from_pretrained(
        model_id,
        torch_dtype=DTYPE,
        device_map="balanced" if DEVICE.startswith("cuda") else None,
    )
    if not DEVICE.startswith("cuda"):
        pipe.to(DEVICE)
    if hasattr(pipe, "enable_attention_slicing"):
        pipe.enable_attention_slicing()
    if hasattr(pipe, "enable_vae_slicing"):
        pipe.enable_vae_slicing()
    _PIPELINES[model_id] = pipe
    return pipe


def _dimensions(spec: dict[str, Any]) -> tuple[int, int]:
    output = spec.get("output_spec") or {}
    requested_width = output.get("width")
    requested_height = output.get("height")
    if requested_width is not None or requested_height is not None:
        width = int(requested_width or 0)
        height = int(requested_height or 0)
        if width < 512 or height < 512 or width > 2048 or height > 2048:
            raise ValueError("AVANTIQO_IMAGE_OUTPUT_DIMENSIONS_INVALID")
        return width, height
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
    capability = _text(data.get("capability"))
    if capability not in IMPLEMENTED_CAPABILITIES:
        raise ValueError(
            f"AVANTIQO_IMAGE_CAPABILITY_NOT_IMPLEMENTED:{capability or 'MISSING'}"
        )
    instruction = _text(data.get("instruction"))
    if not instruction:
        raise ValueError("AVANTIQO_IMAGE_INSTRUCTION_REQUIRED")
    if len(instruction) > 12000:
        raise ValueError("AVANTIQO_IMAGE_INSTRUCTION_TOO_LONG")

    source_assets = data.get("source_assets") or []
    if not isinstance(source_assets, list) or len(source_assets) > 12:
        raise ValueError("AVANTIQO_IMAGE_SOURCE_ASSET_LIMIT_EXCEEDED")
    data["source_assets"] = [
        _public_https_url(value) for value in source_assets if _text(value)
    ]
    if capability in {"ai.image.edit", "ai.image.outpaint"} and not data[
        "source_assets"
    ]:
        raise ValueError("AVANTIQO_IMAGE_SOURCE_REQUIRED")
    if capability == "ai.image.inpaint" and len(data["source_assets"]) < 2:
        raise ValueError("AVANTIQO_IMAGE_INPAINT_SOURCE_AND_MASK_REQUIRED")

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


def _binary_mask(mask: Image.Image, size: tuple[int, int]) -> Image.Image:
    grayscale = mask.convert("L").resize(size, Image.Resampling.LANCZOS)
    return grayscale.point(lambda value: 255 if value >= 128 else 0, mode="L")


def _inpaint_inputs(data: dict[str, Any]) -> tuple[list[Image.Image], Image.Image, Image.Image]:
    source = load_image(data["source_assets"][0]).convert("RGB")
    mask = _binary_mask(load_image(data["source_assets"][1]), source.size)
    mask_visual = Image.merge("RGB", (mask, mask, mask))
    return [source, mask_visual], source, mask


def _outpaint_inputs(
    data: dict[str, Any],
    spec: dict[str, Any],
) -> tuple[list[Image.Image], Image.Image, tuple[int, int, int, int], Image.Image]:
    source = load_image(data["source_assets"][0]).convert("RGB")
    target_width, target_height = _dimensions(spec)
    max_width = max(1, int(target_width * 0.78))
    max_height = max(1, int(target_height * 0.78))
    scale = min(max_width / source.width, max_height / source.height, 1.0)
    preserved = source.resize(
        (
            max(1, int(round(source.width * scale))),
            max(1, int(round(source.height * scale))),
        ),
        Image.Resampling.LANCZOS,
    )
    left = (target_width - preserved.width) // 2
    top = (target_height - preserved.height) // 2
    right = left + preserved.width
    bottom = top + preserved.height
    canvas = Image.new("RGB", (target_width, target_height), (127, 127, 127))
    canvas.paste(preserved, (left, top))
    mask = Image.new("L", canvas.size, 255)
    mask.paste(0, (left, top, right, bottom))
    mask_visual = Image.merge("RGB", (mask, mask, mask))
    return [canvas, mask_visual], preserved, (left, top, right, bottom), mask


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
        raise RuntimeError(
            f"AVANTIQO_IMAGE_STORAGE_UPLOAD_FAILED:{response.status_code}:{detail}"
        )


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data = _validated_input(job)
    started = time.perf_counter()
    capability = data["capability"]
    model_id = _foundation_model(capability)
    runpod.serverless.progress_update(job, "loading Avantiqo Image")
    pipe = _pipeline(model_id)
    spec = data.get("structured_specification") or {}
    params = spec.get("provider_parameters") or {}
    width, height = _dimensions(spec)
    seed = int(
        params.get("seed")
        if params.get("seed") is not None
        else int.from_bytes(os.urandom(4), "big")
    )
    if seed < 0 or seed > 4294967295:
        raise ValueError("AVANTIQO_IMAGE_SEED_INVALID")
    generator_device = "cuda" if DEVICE.startswith("cuda") else DEVICE
    generator = torch.Generator(device=generator_device).manual_seed(seed)
    inference_steps = int(
        params.get("inference_steps")
        or os.getenv("AVANTIQO_IMAGE_INFERENCE_STEPS", "28")
    )
    preservation_mode = "NONE"

    runpod.serverless.progress_update(job, "generating image")
    if capability == "ai.image.edit":
        source_image = load_image(data["source_assets"][0]).convert("RGB")
        result = pipe(
            image=source_image,
            prompt=data["instruction"],
            num_inference_steps=inference_steps,
            generator=generator,
        )
        image = result.images[0].convert("RGB")
    elif capability == "ai.image.inpaint":
        conditions, source_image, mask = _inpaint_inputs(data)
        control_instruction = (
            "Image 1 is the original. Image 2 is a binary region mask: white pixels are the "
            "only pixels that may be regenerated and black pixels must remain unchanged. "
            f"Perform this edit inside the white region only: {data['instruction']}"
        )
        result = pipe(
            image=conditions,
            prompt=control_instruction,
            num_inference_steps=inference_steps,
            generator=generator,
        )
        generated = result.images[0].convert("RGB").resize(
            source_image.size,
            Image.Resampling.LANCZOS,
        )
        image = Image.composite(generated, source_image, mask)
        preservation_mode = "POST_COMPOSITE_UNMASKED_PIXELS_EXACT"
    elif capability == "ai.image.outpaint":
        conditions, preserved_source, source_box, mask = _outpaint_inputs(data, spec)
        control_instruction = (
            "Image 1 is the original image centered on a larger neutral canvas. Image 2 is a "
            "binary expansion mask: white pixels are new canvas that must be generated, black "
            "pixels contain the original image and must stay unchanged. Extend the scene naturally "
            f"into the white area with seamless geometry, lighting and perspective. Instruction: {data['instruction']}"
        )
        result = pipe(
            image=conditions,
            prompt=control_instruction,
            num_inference_steps=inference_steps,
            generator=generator,
        )
        generated = result.images[0].convert("RGB").resize(
            conditions[0].size,
            Image.Resampling.LANCZOS,
        )
        generated.paste(preserved_source, source_box[:2])
        image = generated
        preservation_mode = "POST_COMPOSITE_ORIGINAL_REGION_EXACT"
    else:
        result = pipe(
            prompt=data["instruction"],
            width=width,
            height=height,
            num_inference_steps=inference_steps,
            guidance_scale=float(
                params.get("guidance_scale")
                or os.getenv("AVANTIQO_IMAGE_GUIDANCE_SCALE", "4.0")
            ),
            generator=generator,
        )
        image = result.images[0].convert("RGB")

    width, height = image.size
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
        "capability": capability,
        "storage_reference": data["storage_upload"]["storage_reference"],
        "foundation_model": model_id,
        "seed": seed,
        "width": width,
        "height": height,
        "size_bytes": size_bytes,
        "source_asset_count": len(data.get("source_assets") or []),
        "preservation_mode": preservation_mode,
        "mask_conditioning_used": capability == "ai.image.inpaint",
        "outpaint_canvas_conditioning_used": capability == "ai.image.outpaint",
        "generation_seconds": round(time.perf_counter() - started, 3),
        "raw_reasoning_persisted": False,
    }


@runpod.serverless.register_fitness_check
def check_worker():
    if not FOUNDATION_MODEL:
        raise RuntimeError("AVANTIQO_IMAGE_FOUNDATION_MODEL_REQUIRED")
    if not EDIT_MODEL:
        raise RuntimeError("AVANTIQO_IMAGE_EDIT_MODEL_REQUIRED")
    if not INPAINT_MODEL:
        raise RuntimeError("AVANTIQO_IMAGE_INPAINT_MODEL_REQUIRED")
    if not OUTPAINT_MODEL:
        raise RuntimeError("AVANTIQO_IMAGE_OUTPAINT_MODEL_REQUIRED")
    if not torch.cuda.is_available():
        raise RuntimeError("AVANTIQO_IMAGE_CUDA_REQUIRED")


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
