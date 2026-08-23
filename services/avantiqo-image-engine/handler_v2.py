import json
import os
import re
import time
from pathlib import Path
from typing import Any

import runpod
import torch
from diffusers.utils import load_image
from huggingface_hub import snapshot_download
from PIL import Image
from transformers import pipeline

import handler as legacy

UPSCALE_CAPABILITY = "ai.image.upscale"
ANALYZE_CAPABILITY = "ai.image.analyze"
SPECIAL_CAPABILITIES = {UPSCALE_CAPABILITY, ANALYZE_CAPABILITY}
MODEL_CACHE_OPERATION = "cache_foundation_model"
QUALITY_FOUNDATION_MODEL = "Qwen/Qwen-Image-2512"
MODEL_CACHE_ALLOWLIST = {QUALITY_FOUNDATION_MODEL}
QUALITY_RUNTIME_REVISION = "AVANTIQO_IMAGE_QWEN_2512_QUALITY_V1"
QUALITY_NEGATIVE_PROMPT = (
    "low resolution, low quality, anatomical deformity, malformed limbs, malformed fingers, "
    "oversaturated image, waxy skin, faces without detail, overly smooth skin, obvious AI-generated "
    "appearance, chaotic composition, blurred text, distorted text"
)
UPSCALE_MODEL = os.getenv(
    "AVANTIQO_IMAGE_UPSCALE_MODEL",
    "caidas/swin2SR-realworld-sr-x4-64-bsrgan-psnr",
).strip()
ANALYZE_MODEL = os.getenv(
    "AVANTIQO_IMAGE_ANALYZE_MODEL",
    "Qwen/Qwen2.5-VL-7B-Instruct",
).strip()
MAX_ANALYSIS_TOKENS = max(
    128,
    min(4096, int(os.getenv("AVANTIQO_IMAGE_ANALYZE_MAX_NEW_TOKENS", "1400"))),
)
MAX_UPSCALE_SOURCE_PIXELS = max(
    262144,
    min(16777216, int(os.getenv("AVANTIQO_IMAGE_UPSCALE_MAX_SOURCE_PIXELS", "4194304"))),
)
MAX_UPSCALE_OUTPUT_PIXELS = max(
    1048576,
    min(67108864, int(os.getenv("AVANTIQO_IMAGE_UPSCALE_MAX_OUTPUT_PIXELS", "33554432"))),
)
_OUTPUT_DIR = Path(os.getenv("AVANTIQO_IMAGE_OUTPUT_DIR", "/tmp/avantiqo-image"))
_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
_SPECIAL_PIPELINES: dict[str, Any] = {}

# Keep legacy certification parsing aware of the additional implemented capabilities
# without changing the stable generation/edit/inpaint/outpaint code paths.
legacy.IMPLEMENTED_CAPABILITIES.update(SPECIAL_CAPABILITIES)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _configured_capabilities() -> set[str]:
    configured = {
        item.strip()
        for item in _text(os.getenv("AVANTIQO_IMAGE_CERTIFIED_CAPABILITIES")).split(",")
        if item.strip()
    }
    if not configured:
        return set(legacy.DEFAULT_CERTIFIED_CAPABILITIES)
    return configured.intersection(legacy.IMPLEMENTED_CAPABILITIES)


def _certification_execution(data: dict[str, Any]) -> bool:
    return (
        data.get("certification_execution") is True
        and legacy.CERTIFICATION_EXECUTION_ENABLED
    )


def _cache_foundation_model(job: dict[str, Any]) -> dict[str, Any]:
    data = job.get("input") or {}
    if data.get("contract") != legacy.ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_IMAGE_ENGINE_CONTRACT_INVALID")
    if _text(data.get("operation")) != MODEL_CACHE_OPERATION:
        raise ValueError("AVANTIQO_IMAGE_MODEL_CACHE_OPERATION_INVALID")
    target_model = _text(data.get("target_model"))
    if target_model not in MODEL_CACHE_ALLOWLIST:
        raise ValueError("AVANTIQO_IMAGE_MODEL_CACHE_TARGET_FORBIDDEN")

    existing = legacy._cached_model_path(target_model)
    if existing:
        return {
            "status": "completed",
            "provider": "avantiqo-image",
            "model": legacy.PRODUCT_MODEL,
            "engine_contract": legacy.ENGINE_CONTRACT,
            "runtime_revision": QUALITY_RUNTIME_REVISION,
            "operation": MODEL_CACHE_OPERATION,
            "target_model": target_model,
            "foundation_model_source": "runpod-cache",
            "already_cached": True,
            "cache_ready": True,
            "inference_performed": False,
            "raw_reasoning_persisted": False,
        }

    runpod.serverless.progress_update(
        job,
        f"caching approved Avantiqo Image foundation {target_model}",
    )
    snapshot_download(
        repo_id=target_model,
        cache_dir=str(legacy.HF_CACHE_ROOT),
        local_files_only=False,
    )
    cached = legacy._cached_model_path(target_model)
    if not cached:
        raise RuntimeError(f"AVANTIQO_IMAGE_MODEL_CACHE_VERIFY_FAILED:{target_model}")

    return {
        "status": "completed",
        "provider": "avantiqo-image",
        "model": legacy.PRODUCT_MODEL,
        "engine_contract": legacy.ENGINE_CONTRACT,
        "runtime_revision": QUALITY_RUNTIME_REVISION,
        "operation": MODEL_CACHE_OPERATION,
        "target_model": target_model,
        "foundation_model_source": "runpod-cache",
        "already_cached": False,
        "cache_ready": True,
        "inference_performed": False,
        "raw_reasoning_persisted": False,
    }


def _generate_quality_foundation(job: dict[str, Any]) -> dict[str, Any]:
    raw = job.get("input") or {}
    if _text(raw.get("foundation_model")) != QUALITY_FOUNDATION_MODEL:
        raise ValueError("AVANTIQO_IMAGE_QUALITY_FOUNDATION_REQUEST_INVALID")
    if not legacy._cached_model_path(QUALITY_FOUNDATION_MODEL):
        raise RuntimeError(
            f"AVANTIQO_IMAGE_SELECTED_FOUNDATION_NOT_CACHED:{QUALITY_FOUNDATION_MODEL}"
        )

    data = legacy._validated_input(job)
    started = time.perf_counter()
    spec = data.get("structured_specification") or {}
    params = spec.get("provider_parameters") or {}
    width, height = legacy._dimensions(spec)
    seed = int(
        params.get("seed")
        if params.get("seed") is not None
        else int.from_bytes(os.urandom(4), "big")
    )
    if seed < 0 or seed > 4294967295:
        raise ValueError("AVANTIQO_IMAGE_SEED_INVALID")
    inference_steps = int(params.get("inference_steps") or 50)
    if inference_steps < 1 or inference_steps > 100:
        raise ValueError("AVANTIQO_IMAGE_INFERENCE_STEPS_INVALID")

    generator_device = "cuda" if legacy.DEVICE.startswith("cuda") else legacy.DEVICE
    generator = torch.Generator(device=generator_device).manual_seed(seed)
    runpod.serverless.progress_update(job, "loading Avantiqo Image 2512 quality foundation")
    pipe = legacy._pipeline(QUALITY_FOUNDATION_MODEL)
    guidance_kwargs, guidance_metadata = legacy._generation_guidance(pipe, params)
    if guidance_metadata.get("mode") != "TRUE_CFG":
        raise RuntimeError("AVANTIQO_IMAGE_2512_TRUE_CFG_REQUIRED")
    negative_prompt = _text(params.get("negative_prompt")) or QUALITY_NEGATIVE_PROMPT
    guidance_kwargs["negative_prompt"] = negative_prompt
    guidance_metadata = {
        **guidance_metadata,
        "negative_prompt_supplied": True,
        "negative_prompt_has_content": True,
        "quality_policy": "QWEN_IMAGE_2512_REALISM_V1",
    }

    runpod.serverless.progress_update(job, "generating Avantiqo Image 2512 quality image")
    result = pipe(
        prompt=data["instruction"],
        width=width,
        height=height,
        num_inference_steps=inference_steps,
        generator=generator,
        **guidance_kwargs,
    )
    image = result.images[0].convert("RGB")
    width, height = image.size
    job_id = _text(job.get("id")) or str(int(time.time() * 1000))
    path = _OUTPUT_DIR / f"{job_id}-qwen-2512.png"
    image.save(path, format="PNG")
    runpod.serverless.progress_update(job, "storing private Avantiqo 2512 asset")
    legacy._upload(path, data["storage_upload"])
    size_bytes = path.stat().st_size
    path.unlink(missing_ok=True)

    return {
        "status": "completed",
        "provider": "avantiqo-image",
        "model": legacy.PRODUCT_MODEL,
        "engine_contract": legacy.ENGINE_CONTRACT,
        "runtime_revision": QUALITY_RUNTIME_REVISION,
        "capability": "ai.image.generate",
        "storage_reference": data["storage_upload"]["storage_reference"],
        "foundation_model": QUALITY_FOUNDATION_MODEL,
        "foundation_model_source": "runpod-cache",
        "seed": seed,
        "width": width,
        "height": height,
        "size_bytes": size_bytes,
        "source_asset_count": len(data.get("source_assets") or []),
        "source_asset_roles": sorted((data.get("source_asset_roles") or {}).keys()),
        "semantic_asset_roles_used": bool(data.get("source_asset_roles")),
        "preservation_mode": "NONE",
        "mask_conditioning_used": False,
        "outpaint_canvas_conditioning_used": False,
        "generation_guidance": guidance_metadata,
        "inference_steps": inference_steps,
        "certification_execution": data.get("certification_execution") is True,
        "generation_seconds": round(time.perf_counter() - started, 3),
        "raw_reasoning_persisted": False,
    }


def _validate_special(job: dict[str, Any]) -> dict[str, Any]:
    data = job.get("input") or {}
    if data.get("contract") != legacy.ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_IMAGE_ENGINE_CONTRACT_INVALID")
    capability = _text(data.get("capability"))
    if capability not in SPECIAL_CAPABILITIES:
        raise ValueError(f"AVANTIQO_IMAGE_CAPABILITY_NOT_IMPLEMENTED:{capability or 'MISSING'}")
    certification_execution = _certification_execution(data)
    if capability not in _configured_capabilities() and not certification_execution:
        raise ValueError(f"AVANTIQO_IMAGE_CAPABILITY_NOT_CERTIFIED:{capability}")
    instruction = _text(data.get("instruction"))
    if not instruction:
        raise ValueError("AVANTIQO_IMAGE_INSTRUCTION_REQUIRED")
    if len(instruction) > 12000:
        raise ValueError("AVANTIQO_IMAGE_INSTRUCTION_TOO_LONG")

    source_assets = data.get("source_assets") or []
    if not isinstance(source_assets, list) or len(source_assets) > 12:
        raise ValueError("AVANTIQO_IMAGE_SOURCE_ASSET_LIMIT_EXCEEDED")
    source_assets = [
        legacy._public_https_url(value) for value in source_assets if _text(value)
    ]
    raw_roles = data.get("source_asset_roles") or {}
    if not isinstance(raw_roles, dict):
        raise ValueError("AVANTIQO_IMAGE_SOURCE_ASSET_ROLES_INVALID")
    source_image = raw_roles.get("source_image") or (
        source_assets[0] if source_assets else None
    )
    if not _text(source_image):
        raise ValueError("AVANTIQO_IMAGE_SOURCE_REQUIRED")
    source_image = legacy._public_https_url(source_image)

    normalized = {
        **data,
        "capability": capability,
        "instruction": instruction,
        "source_assets": source_assets,
        "resolved_source_image": source_image,
        "certification_execution": certification_execution,
    }

    if capability == UPSCALE_CAPABILITY:
        storage = data.get("storage_upload") or {}
        signed_url = legacy._public_https_url(storage.get("signed_url"), upload=True)
        storage_reference = _text(storage.get("storage_reference"))
        if not storage_reference.startswith("storage://creative-assets/"):
            raise ValueError("AVANTIQO_IMAGE_STORAGE_REFERENCE_INVALID")
        normalized["storage_upload"] = {
            **storage,
            "signed_url": signed_url,
            "storage_reference": storage_reference,
        }
    else:
        normalized.pop("storage_upload", None)

    return normalized


def _cached_source(model_id: str) -> str:
    cached = legacy._cached_model_path(model_id)
    if legacy.REQUIRE_CACHED_MODEL and not cached:
        raise RuntimeError(f"AVANTIQO_IMAGE_CACHED_MODEL_REQUIRED:{model_id}")
    return cached or model_id


def _upscale_pipeline():
    if UPSCALE_MODEL not in _SPECIAL_PIPELINES:
        _SPECIAL_PIPELINES[UPSCALE_MODEL] = pipeline(
            "image-to-image",
            model=_cached_source(UPSCALE_MODEL),
            device=0 if legacy.DEVICE.startswith("cuda") else -1,
        )
    return _SPECIAL_PIPELINES[UPSCALE_MODEL]


def _analysis_pipeline():
    if ANALYZE_MODEL not in _SPECIAL_PIPELINES:
        _SPECIAL_PIPELINES[ANALYZE_MODEL] = pipeline(
            "image-text-to-text",
            model=_cached_source(ANALYZE_MODEL),
            device_map="auto" if legacy.DEVICE.startswith("cuda") else None,
            torch_dtype=legacy.DTYPE,
        )
    return _SPECIAL_PIPELINES[ANALYZE_MODEL]


def _extract_json(value: Any) -> dict[str, Any] | None:
    source = _text(value)
    if not source:
        return None
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", source, re.DOTALL)
    candidate = fenced.group(1) if fenced else source
    first = candidate.find("{")
    last = candidate.rfind("}")
    if first < 0 or last <= first:
        return None
    try:
        parsed = json.loads(candidate[first : last + 1])
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


def _generated_text(result: Any) -> str:
    if isinstance(result, list) and result:
        item = result[0]
    else:
        item = result
    if isinstance(item, dict):
        value = item.get("generated_text") or item.get("text") or item.get("output_text")
        if isinstance(value, list) and value:
            tail = value[-1]
            if isinstance(tail, dict):
                return _text(tail.get("content") or tail.get("text"))
        return _text(value)
    return _text(item)


def _analyze(data: dict[str, Any], job: dict[str, Any]) -> dict[str, Any]:
    runpod.serverless.progress_update(job, "loading Avantiqo Image visual critic")
    critic = _analysis_pipeline()
    system_contract = (
        "You are Avantiqo's owned visual analysis and perceptual quality intelligence. "
        "Inspect only visible evidence. Do not invent unseen facts. Follow the requested "
        "evaluation contract exactly. Return one strict JSON object only, without markdown. "
        "When scores are requested, use integers from 0 to 100."
    )
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "url": data["resolved_source_image"]},
                {"type": "text", "text": f"{system_contract}\n\nTASK:\n{data['instruction']}"},
            ],
        }
    ]
    runpod.serverless.progress_update(job, "analyzing visual evidence")
    result = critic(
        text=messages,
        max_new_tokens=MAX_ANALYSIS_TOKENS,
        do_sample=False,
    )
    generated = _generated_text(result)
    parsed = _extract_json(generated)
    if parsed is None:
        raise RuntimeError("AVANTIQO_IMAGE_ANALYSIS_JSON_REQUIRED")
    return {
        "status": "completed",
        "provider": "avantiqo-image",
        "model": legacy.PRODUCT_MODEL,
        "engine_contract": legacy.ENGINE_CONTRACT,
        "capability": ANALYZE_CAPABILITY,
        "foundation_model": ANALYZE_MODEL,
        "foundation_model_source": (
            "runpod-cache" if legacy._cached_model_path(ANALYZE_MODEL) else "huggingface"
        ),
        "result": parsed,
        "source_asset_count": len(data.get("source_assets") or []),
        "structured_visual_evidence": True,
        "certification_execution": data.get("certification_execution") is True,
        "raw_reasoning_persisted": False,
    }


def _upscale(data: dict[str, Any], job: dict[str, Any]) -> dict[str, Any]:
    source = load_image(data["resolved_source_image"]).convert("RGB")
    source_width, source_height = source.size
    source_pixels = source_width * source_height
    if source_pixels > MAX_UPSCALE_SOURCE_PIXELS:
        raise ValueError(
            f"AVANTIQO_IMAGE_UPSCALE_SOURCE_TOO_LARGE:{source_width}x{source_height}"
        )
    if source_pixels * 16 > MAX_UPSCALE_OUTPUT_PIXELS:
        raise ValueError("AVANTIQO_IMAGE_UPSCALE_OUTPUT_PIXEL_BUDGET_EXCEEDED")

    runpod.serverless.progress_update(job, "loading Avantiqo Image super-resolution")
    upscaler = _upscale_pipeline()
    runpod.serverless.progress_update(job, "upscaling image")
    result = upscaler(source)
    if isinstance(result, dict):
        result = result.get("image") or result.get("images") or result.get("output")
    if isinstance(result, list):
        result = result[0] if result else None
    if not isinstance(result, Image.Image):
        raise RuntimeError("AVANTIQO_IMAGE_UPSCALE_OUTPUT_INVALID")
    image = result.convert("RGB")
    width, height = image.size
    output_pixels = width * height
    if width < source_width * 2 or height < source_height * 2:
        raise RuntimeError("AVANTIQO_IMAGE_UPSCALE_FACTOR_INVALID")
    if output_pixels > MAX_UPSCALE_OUTPUT_PIXELS:
        raise RuntimeError("AVANTIQO_IMAGE_UPSCALE_OUTPUT_TOO_LARGE")

    job_id = _text(job.get("id")) or str(int(time.time() * 1000))
    path = _OUTPUT_DIR / f"{job_id}-upscale.png"
    image.save(path, format="PNG")
    runpod.serverless.progress_update(job, "storing private Avantiqo upscale")
    legacy._upload(path, data["storage_upload"])
    size_bytes = path.stat().st_size
    path.unlink(missing_ok=True)

    return {
        "status": "completed",
        "provider": "avantiqo-image",
        "model": legacy.PRODUCT_MODEL,
        "engine_contract": legacy.ENGINE_CONTRACT,
        "capability": UPSCALE_CAPABILITY,
        "storage_reference": data["storage_upload"]["storage_reference"],
        "foundation_model": UPSCALE_MODEL,
        "foundation_model_source": (
            "runpod-cache" if legacy._cached_model_path(UPSCALE_MODEL) else "huggingface"
        ),
        "source_width": source_width,
        "source_height": source_height,
        "width": width,
        "height": height,
        "scale_x": round(width / source_width, 4),
        "scale_y": round(height / source_height, 4),
        "size_bytes": size_bytes,
        "source_asset_count": len(data.get("source_assets") or []),
        "super_resolution": True,
        "resource_budget_contract": "AVANTIQO_IMAGE_UPSCALE_RESOURCE_BUDGET_V1",
        "source_pixels": source_pixels,
        "output_pixels": output_pixels,
        "max_source_pixels": MAX_UPSCALE_SOURCE_PIXELS,
        "max_output_pixels": MAX_UPSCALE_OUTPUT_PIXELS,
        "certification_execution": data.get("certification_execution") is True,
        "raw_reasoning_persisted": False,
    }


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data = job.get("input") or {}
    if _text(data.get("operation")) == MODEL_CACHE_OPERATION:
        return _cache_foundation_model(job)

    capability = _text(data.get("capability"))
    requested_foundation = _text(data.get("foundation_model"))
    if capability == "ai.image.generate" and requested_foundation == QUALITY_FOUNDATION_MODEL:
        return _generate_quality_foundation(job)
    if requested_foundation and requested_foundation not in {
        legacy.FOUNDATION_MODEL,
        QUALITY_FOUNDATION_MODEL,
    }:
        raise ValueError("AVANTIQO_IMAGE_FOUNDATION_MODEL_NOT_APPROVED")
    if capability not in SPECIAL_CAPABILITIES:
        return legacy.handler(job)
    data = _validate_special(job)
    started = time.perf_counter()
    output = _upscale(data, job) if capability == UPSCALE_CAPABILITY else _analyze(data, job)
    output["generation_seconds"] = round(time.perf_counter() - started, 3)
    return output


@runpod.serverless.register_fitness_check
def check_worker():
    if not legacy.FOUNDATION_MODEL:
        raise RuntimeError("AVANTIQO_IMAGE_FOUNDATION_MODEL_REQUIRED")
    if not torch.cuda.is_available():
        raise RuntimeError("AVANTIQO_IMAGE_CUDA_REQUIRED")

    required = _configured_capabilities()
    if legacy.CERTIFICATION_EXECUTION_ENABLED:
        required = set(legacy.IMPLEMENTED_CAPABILITIES)
    models = set()
    for capability in required:
        if capability == UPSCALE_CAPABILITY:
            models.add(UPSCALE_MODEL)
        elif capability == ANALYZE_CAPABILITY:
            models.add(ANALYZE_MODEL)
        else:
            models.add(legacy._model_for_capability(capability))
    if legacy.REQUIRE_CACHED_MODEL:
        for model_id in models:
            if not legacy._cached_model_path(model_id):
                raise RuntimeError(f"AVANTIQO_IMAGE_CACHED_MODEL_REQUIRED:{model_id}")


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
