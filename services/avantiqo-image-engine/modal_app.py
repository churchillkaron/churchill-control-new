"""Scale-to-zero Modal runtime for the owned Avantiqo Image engine."""
from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path
from typing import Any

import modal

APP_NAME = "avantiqo-image-owned"
ENGINE_CONTRACT = "AVANTIQO_IMAGE_ENGINE_V1"
PRODUCT_MODEL = "avantiqo-image-v1"
FOUNDATION_MODEL = "Tongyi-MAI/Z-Image"
ANALYZE_MODEL = "Qwen/Qwen2.5-VL-7B-Instruct"
DEPTH_MODEL = "depth-anything/Depth-Anything-V2-Small-hf"
WORKER_IMAGE = (
    "ghcr.io/churchillkaron/avantiqo-image-worker@"
    "sha256:dba91ed34b53d69db5e9edb0894293bd0837ece2676be14184b0bda61296f905"
)
HF_CACHE_ROOT = "/models/huggingface-cache/hub"
MODEL_VOLUME_NAME = "avantiqo-image-models"
MODEL_SECRET_NAME = "huggingface-secret"
INVESTOR_KEYFRAME_CONTRACT = "AVANTIQO_IMAGE_INVESTOR_PHOTOREAL_KEYFRAME_V1"
PHOTOREAL_CACHE_CONTRACT = "AVANTIQO_IMAGE_PHOTOREAL_CACHE_COMPLETION_V1"
MODAL_CACHE_CONTRACT = "AVANTIQO_IMAGE_MODAL_CACHE_COMPLETION_V2"

app = modal.App(APP_NAME)
model_volume = modal.Volume.from_name(MODEL_VOLUME_NAME, create_if_missing=False)


def _seed_one_model(model_id: str, marker_name: str, marker_contract: str) -> Path:
    from huggingface_hub import snapshot_download

    resolved = Path(snapshot_download(
        repo_id=model_id,
        cache_dir=HF_CACHE_ROOT,
        token=os.environ.get("HF_TOKEN") or None,
        max_workers=8,
    ))
    if not resolved.is_dir():
        raise RuntimeError(f"AVANTIQO_IMAGE_MODAL_MODEL_SNAPSHOT_MISSING:{model_id}")
    marker = resolved / marker_name
    marker.write_text(json.dumps({
        "contract": marker_contract,
        "target_model": model_id,
        "snapshot_revision": resolved.name,
        "snapshot_download_completed": True,
        "modal_volume": MODEL_VOLUME_NAME,
    }, separators=(",", ":"), sort_keys=True), encoding="utf-8")
    print(f"AVANTIQO_IMAGE_MODAL_CACHE_READY={model_id}:{resolved}", flush=True)
    return resolved


def _seed_model() -> None:
    _seed_one_model(
        FOUNDATION_MODEL,
        ".avantiqo-photoreal-cache-complete.json",
        PHOTOREAL_CACHE_CONTRACT,
    )
    _seed_one_model(
        ANALYZE_MODEL,
        ".avantiqo-vision-cache-complete.json",
        MODAL_CACHE_CONTRACT,
    )
    _seed_one_model(
        DEPTH_MODEL,
        ".avantiqo-depth-cache-complete.json",
        MODAL_CACHE_CONTRACT,
    )

seed_image = modal.Image.debian_slim(python_version="3.12").pip_install("huggingface_hub")

@app.function(
    image=seed_image,
    volumes={"/models": model_volume},
    secrets=[modal.Secret.from_name(MODEL_SECRET_NAME)],
    timeout=60 * 60,
)
def seed_cache() -> None:
    _seed_model()
    model_volume.commit()

worker_image = (
    modal.Image.from_registry(
        WORKER_IMAGE,
        add_python=None,
        setup_dockerfile_commands=[
            "RUN command -v python >/dev/null 2>&1 || ln -s \"$(command -v python3)\" /usr/local/bin/python",
            "RUN command -v pip >/dev/null 2>&1 || ln -s \"$(command -v pip3)\" /usr/local/bin/pip",
            "RUN python --version && pip --version",
        ],
    )
    .entrypoint([])
    .pip_install("pymupdf==1.26.4")
    .add_local_dir(Path(__file__).parent, remote_path="/app", copy=True, ignore=["__pycache__", "*.pyc"])
    .env({
        "AVANTIQO_IMAGE_HF_CACHE_ROOT": HF_CACHE_ROOT,
        "AVANTIQO_IMAGE_NETWORK_VOLUME_ROOT": "/models",
        "AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_GB": "80",
        "AVANTIQO_IMAGE_FOUNDATION_MODEL": FOUNDATION_MODEL,
        "AVANTIQO_IMAGE_ANALYZE_MODEL": ANALYZE_MODEL,
        "AVANTIQO_IMAGE_DEPTH_MODEL": DEPTH_MODEL,
        "AVANTIQO_IMAGE_CERTIFIED_CAPABILITIES": "ai.image.generate,ai.image.analyze,creative.depth.estimate",
        "AVANTIQO_IMAGE_DEVICE": "cuda",
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
    })
)

@app.function(
    image=worker_image,
    gpu="A100-80GB",
    volumes={"/models": model_volume},
    timeout=20 * 60,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=5,
)
def generate(data: dict[str, Any]) -> dict[str, Any]:
    os.chdir("/app")
    import handler_v9 as image_engine

    image_engine._progress_update = lambda *_args, **_kwargs: None
    started = time.perf_counter()
    output = image_engine.handler({
        "id": f"modal-{uuid.uuid4()}",
        "input": data,
    })
    if not isinstance(output, dict):
        raise RuntimeError("AVANTIQO_IMAGE_MODAL_OUTPUT_OBJECT_REQUIRED")
    result = dict(output)
    result["infrastructure_provider"] = "MODAL"
    result["modal_gpu"] = "A100-80GB"
    result["modal_elapsed_seconds"] = round(time.perf_counter() - started, 3)
    result["runpod_inference_performed"] = False
    result["raw_reasoning_persisted"] = False
    return result

@app.function(
    image=worker_image,
    gpu="A10G",
    volumes={"/models": model_volume},
    timeout=20 * 60,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=5,
)
def analyze(data: dict[str, Any]) -> dict[str, Any]:
    os.chdir("/app")
    import handler_v9 as image_engine

    capability = str(data.get("capability") or "").strip()
    if capability not in {"ai.image.analyze", "document.ocr", "document.classify"}:
        raise RuntimeError("AVANTIQO_IMAGE_ANALYZE_CAPABILITY_REQUIRED")
    image_engine._progress_update = lambda *_args, **_kwargs: None
    started = time.perf_counter()
    output = image_engine.handler({
        "id": f"modal-analyze-{uuid.uuid4()}",
        "input": data,
    })
    if not isinstance(output, dict):
        raise RuntimeError("AVANTIQO_IMAGE_MODAL_OUTPUT_OBJECT_REQUIRED")
    result = dict(output)
    result["infrastructure_provider"] = "MODAL"
    result["modal_gpu"] = "A10G"
    result["modal_elapsed_seconds"] = round(time.perf_counter() - started, 3)
    result["runpod_inference_performed"] = False
    result["raw_reasoning_persisted"] = False
    return result



@app.function(
    image=worker_image,
    gpu="A10G",
    volumes={"/models": model_volume},
    timeout=20 * 60,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=5,
)
def estimate_depth(data: dict[str, Any]) -> dict[str, Any]:
    """Owned monocular depth estimation for governed scene reconstruction."""
    import io
    import requests
    import torch
    import torch.nn.functional as F
    from PIL import Image
    from transformers import AutoImageProcessor, AutoModelForDepthEstimation

    capability = str(data.get("capability") or "").strip()
    if capability != "creative.depth.estimate":
        raise RuntimeError("AVANTIQO_IMAGE_DEPTH_CAPABILITY_REQUIRED")
    source_assets = data.get("source_assets") or []
    if not source_assets:
        raise RuntimeError("AVANTIQO_IMAGE_DEPTH_SOURCE_REQUIRED")
    source_url = str(source_assets[0] or "").strip()
    if not source_url:
        raise RuntimeError("AVANTIQO_IMAGE_DEPTH_SOURCE_REQUIRED")
    storage_upload = data.get("storage_upload") or {}
    signed_upload_url = str(storage_upload.get("signed_url") or "").strip()
    storage_reference = str(storage_upload.get("storage_reference") or "").strip()
    if not signed_upload_url or not storage_reference:
        raise RuntimeError("AVANTIQO_IMAGE_DEPTH_STORAGE_UPLOAD_REQUIRED")

    started = time.perf_counter()
    response = requests.get(source_url, timeout=60)
    response.raise_for_status()
    image = Image.open(io.BytesIO(response.content)).convert("RGB")

    processor = AutoImageProcessor.from_pretrained(
        DEPTH_MODEL, cache_dir=HF_CACHE_ROOT, local_files_only=True,
    )
    model = AutoModelForDepthEstimation.from_pretrained(
        DEPTH_MODEL, cache_dir=HF_CACHE_ROOT, local_files_only=True, torch_dtype=torch.float16,
    ).to("cuda").eval()
    inputs = processor(images=image, return_tensors="pt")
    inputs = {key: value.to("cuda") for key, value in inputs.items()}
    with torch.inference_mode():
        predicted = model(**inputs).predicted_depth
    predicted = F.interpolate(
        predicted.unsqueeze(1), size=(image.height, image.width), mode="bicubic", align_corners=False,
    ).squeeze(1).squeeze(0).float().cpu()
    minimum = float(torch.quantile(predicted, 0.01))
    maximum = float(torch.quantile(predicted, 0.99))
    normalized = ((predicted - minimum) / max(1e-6, maximum - minimum)).clamp(0, 1)
    depth_u16 = (normalized * 65535.0).round().to(torch.uint16).numpy()
    depth_image = Image.fromarray(depth_u16, mode="I;16")
    buffer = io.BytesIO()
    depth_image.save(buffer, format="PNG", optimize=False)
    payload = buffer.getvalue()
    upload = requests.put(
        signed_upload_url, data=payload, headers={"Content-Type": "image/png"}, timeout=90,
    )
    upload.raise_for_status()

    return {
        "success": True,
        "status": "completed",
        "contract": "AVANTIQO_DEPTH_ESTIMATION_V1",
        "capability": capability,
        "provider": "avantiqo-image",
        "model": "avantiqo-depth-v1",
        "foundation_model": DEPTH_MODEL,
        "storage_reference": storage_reference,
        "width": image.width,
        "height": image.height,
        "bit_depth": 16,
        "depth_order_convention": "MODEL_PREDICTION_LOW_TO_HIGH_PRESERVED",
        "higher_normalized_value_means_larger_model_predicted_depth": True,
        "metric_depth": False,
        "normalization": {"near_quantile": 0.01, "far_quantile": 0.99, "raw_min": minimum, "raw_max": maximum},
        "source_visual_asset_count": 1,
        "modal_gpu": "A10G",
        "modal_elapsed_seconds": round(time.perf_counter() - started, 3),
        "raw_reasoning_persisted": False,
    }

@app.function(
    image=worker_image,
    gpu="A10G",
    volumes={"/models": model_volume},
    timeout=20 * 60,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=5,
)
def estimate_materials(data: dict[str, Any]) -> dict[str, Any]:
    """Owned semantic surface/material analysis for scene reconstruction."""
    os.chdir("/app")
    import handler_v9 as image_engine

    capability = str(data.get("capability") or "").strip()
    if capability != "creative.materials.estimate":
        raise RuntimeError("AVANTIQO_IMAGE_MATERIAL_CAPABILITY_REQUIRED")
    source_assets = data.get("source_assets") or []
    if not source_assets:
        raise RuntimeError("AVANTIQO_IMAGE_MATERIAL_SOURCE_REQUIRED")
    instruction = (
        "Analyze only visible physical surfaces and materials in this source image for high-end VFX scene reconstruction. "
        "Return strict JSON with keys regions, global_materials, uncertainty. regions must be an array; each region must contain "
        "id, material_class, visible_evidence, approximate_bbox_normalized [x,y,w,h], roughness_estimate 0-1, metallic_estimate 0-1, "
        "reflective boolean, transparent_or_translucent boolean, shadow_receiver boolean, confidence 0-1. "
        "Use only visibly supported classes such as glass, polished_metal, brushed_metal, painted_wall, wood, cloth, leather, stone, "
        "ceramic, plastic, liquid, vegetation, skin, unknown. Do not invent hidden surfaces or brand/product identity. "
        "global_materials must summarize dominant classes and VFX implications for reflections, contact shadows and relighting."
    )
    payload = dict(data)
    payload["capability"] = "ai.image.analyze"
    payload["instruction"] = instruction
    image_engine._progress_update = lambda *_args, **_kwargs: None
    started = time.perf_counter()
    output = image_engine.handler({
        "id": f"modal-material-{uuid.uuid4()}",
        "input": payload,
    })
    if not isinstance(output, dict):
        raise RuntimeError("AVANTIQO_IMAGE_MATERIAL_OUTPUT_OBJECT_REQUIRED")
    return {
        "success": True,
        "status": "completed",
        "contract": "AVANTIQO_MATERIAL_ESTIMATION_V1",
        "capability": capability,
        "provider": "avantiqo-image",
        "model": "avantiqo-material-v1",
        "foundation_model": ANALYZE_MODEL,
        "result": output.get("result") or output.get("output") or output,
        "source_visual_asset_count": len(source_assets),
        "modal_gpu": "A10G",
        "modal_elapsed_seconds": round(time.perf_counter() - started, 3),
        "raw_reasoning_persisted": False,
    }


@app.function(
    image=worker_image,
    gpu="A100-80GB",
    volumes={"/models": model_volume},
    timeout=20 * 60,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=5,
    retries=0,
)
def certify_document_vision(source_url: str) -> dict[str, Any]:
    os.chdir("/app")
    import handler_v9 as image_engine

    cases = [
        ("ai.image.analyze", "Inspect this document. Return strict JSON with visible_title, certification_id, document_type, account_name, date, opening_balance, credit, closing_balance, confidence."),
        ("document.ocr", "Extract every visible line faithfully. Return strict JSON with text, fields, and confidence. Preserve numbers and dates exactly."),
        ("document.classify", "Classify this document from visible evidence. Return strict JSON with document_type, confidence, candidate_domains, and key_fields. Use bank_statement only if the evidence proves it."),
    ]
    expected = ["AVQ-DOC-2026-0910", "CERTIFICATION TEST COMPANY", "2026-09-10", "1250"]
    observations = []
    for requested_capability, instruction in cases:
        started = time.perf_counter()
        output = image_engine.handler({
            "id": f"modal-cert-{uuid.uuid4()}",
            "input": {
                "contract": ENGINE_CONTRACT,
                "capability": "ai.image.analyze",
                "instruction": instruction,
                "source_assets": [source_url],
                "source_asset_roles": {"source_image": source_url},
                "organization_id": "benchmark-only",
                "usage_id": f"benchmark-{requested_capability}",
            },
        })
        evidence = output.get("result") if isinstance(output, dict) else None
        flattened = json.dumps(evidence or {}, sort_keys=True).lower()
        passed = all(value.lower() in flattened for value in expected)
        if requested_capability == "document.classify":
            passed = passed and ("bank_statement" in flattened or "bank statement" in flattened)
        observations.append({
            "requested_capability": requested_capability,
            "execution_capability": "ai.image.analyze",
            "foundation_model": output.get("foundation_model") if isinstance(output, dict) else None,
            "elapsed_seconds": round(time.perf_counter() - started, 3),
            "structured_visual_evidence": bool(output.get("structured_visual_evidence")) if isinstance(output, dict) else False,
            "raw_reasoning_persisted": output.get("raw_reasoning_persisted") if isinstance(output, dict) else None,
            "passed": passed and output.get("raw_reasoning_persisted") is False,
            "evidence": evidence,
        })
    report = {
        "contract": "AVANTIQO_DOCUMENT_VISION_CERTIFICATION_V1",
        "provider": "avantiqo-image",
        "model": ANALYZE_MODEL,
        "measured_capabilities": [item[0] for item in cases],
        "summary": {"passed": all(item["passed"] for item in observations), "runs": len(observations)},
        "observations": observations,
        "activation_allowed": False,
        "pricing_activation_performed": False,
        "production_deploy_performed": False,
        "raw_reasoning_persisted": False,
    }
    print("AVANTIQO_DOCUMENT_VISION_CERTIFICATION_RESULT=" + json.dumps(report, separators=(",", ":"), sort_keys=True), flush=True)
    return report


@app.function(
    image=worker_image,
    gpu="A100-80GB",
    volumes={"/models": model_volume},
    timeout=20 * 60,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=5,
    retries=0,
)
def generate_investor_keyframe(
    output_relative: str,
    instruction: str,
    width: int = 1920,
    height: int = 1088,
    seed: int = 260906,
) -> dict[str, Any]:
    """Create a fresh photoreal still used only as a controlled investor-film keyframe."""
    os.chdir("/app")
    import torch
    import handler_v9 as image_engine

    started = time.perf_counter()
    if not str(instruction or "").strip():
        raise ValueError("AVANTIQO_IMAGE_INVESTOR_KEYFRAME_INSTRUCTION_REQUIRED")
    width = int(width)
    height = int(height)
    if width < 1024 or height < 576 or width > 2048 or height > 2048:
        raise ValueError("AVANTIQO_IMAGE_INVESTOR_KEYFRAME_DIMENSIONS_INVALID")
    if width % 16 or height % 16:
        raise ValueError("AVANTIQO_IMAGE_INVESTOR_KEYFRAME_DIMENSIONS_MULTIPLE_OF_16_REQUIRED")
    relative = Path(str(output_relative or "").lstrip("/"))
    if not relative.parts or ".." in relative.parts or relative.suffix.lower() != ".png":
        raise ValueError("AVANTIQO_IMAGE_INVESTOR_KEYFRAME_OUTPUT_INVALID")
    output = Path("/models") / relative
    output.parent.mkdir(parents=True, exist_ok=True)

    photoreal = image_engine.v4
    readiness = photoreal._photoreal_cache_readiness()
    if not readiness.get("cache_ready"):
        raise RuntimeError("AVANTIQO_IMAGE_INVESTOR_KEYFRAME_CACHE_NOT_READY")

    pipe = photoreal.legacy._pipeline(photoreal.PHOTOREAL_FOUNDATION_MODEL)
    negative_prompt = (
        "CGI, 3D render, illustration, artificial skin, plastic skin, beauty retouching, waxy faces, "
        "duplicated people, cloned faces, malformed hands, extra fingers, extra limbs, synthetic lighting, "
        "perfect symmetry, uncanny expressions, fake corporate stock photo, futuristic interface, computer monitor, "
        "laptop, tablet, phone, screen, dashboard, hologram, floating graphic, neon UI, robot, science fiction, "
        "paper, folder, clipboard, signage, text, letters, logo, watermark, oversharpening, HDR look"
    )
    guidance_kwargs, guidance_metadata = photoreal._photoreal_guidance(pipe, {
        "guidance_scale": 4.0,
        "negative_prompt": negative_prompt,
    })
    generator = torch.Generator(device="cuda").manual_seed(int(seed))
    result = pipe(
        prompt=str(instruction).strip(),
        width=width,
        height=height,
        num_inference_steps=32,
        generator=generator,
        **guidance_kwargs,
    )
    image = result.images[0].convert("RGB")
    image.save(output, format="PNG", optimize=False)
    if not output.is_file() or output.stat().st_size < 250_000:
        raise RuntimeError("AVANTIQO_IMAGE_INVESTOR_KEYFRAME_OUTPUT_INVALID")
    model_volume.commit()
    return {
        "success": True,
        "status": "completed",
        "contract": INVESTOR_KEYFRAME_CONTRACT,
        "provider": "avantiqo-image",
        "model": PRODUCT_MODEL,
        "foundation_model": photoreal.PHOTOREAL_FOUNDATION_MODEL,
        "width": image.size[0],
        "height": image.size[1],
        "seed": int(seed),
        "inference_steps": 32,
        "guidance": guidance_metadata,
        "output_relative": str(relative),
        "output_size_bytes": output.stat().st_size,
        "modal_gpu": "A100-80GB",
        "modal_elapsed_seconds": round(time.perf_counter() - started, 3),
        "source_visual_asset_count": 0,
        "source_image_used": False,
        "source_video_used": False,
        "newly_generated_asset": True,
        "external_provider_contacted": False,
        "production_routing_changed": False,
        "pricing_changed": False,
        "raw_reasoning_persisted": False,
    }
