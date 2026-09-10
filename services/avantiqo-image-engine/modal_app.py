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
WORKER_IMAGE = (
    "ghcr.io/churchillkaron/avantiqo-image-worker@"
    "sha256:dba91ed34b53d69db5e9edb0894293bd0837ece2676be14184b0bda61296f905"
)
HF_CACHE_ROOT = "/models/huggingface-cache/hub"
MODEL_VOLUME_NAME = "avantiqo-image-models"
MODEL_SECRET_NAME = "huggingface-secret"
INVESTOR_KEYFRAME_CONTRACT = "AVANTIQO_IMAGE_INVESTOR_PHOTOREAL_KEYFRAME_V1"

app = modal.App(APP_NAME)
model_volume = modal.Volume.from_name(MODEL_VOLUME_NAME, create_if_missing=False)


def _seed_one_model(model_id: str, marker_name: str) -> Path:
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
        "contract": "AVANTIQO_IMAGE_MODAL_CACHE_COMPLETION_V2",
        "target_model": model_id,
        "snapshot_revision": resolved.name,
        "snapshot_download_completed": True,
        "modal_volume": MODEL_VOLUME_NAME,
    }, separators=(",", ":"), sort_keys=True), encoding="utf-8")
    print(f"AVANTIQO_IMAGE_MODAL_CACHE_READY={model_id}:{resolved}", flush=True)
    return resolved


def _seed_model() -> None:
    _seed_one_model(FOUNDATION_MODEL, ".avantiqo-photoreal-cache-complete.json")
    _seed_one_model(ANALYZE_MODEL, ".avantiqo-vision-cache-complete.json")

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
    .env({
        "AVANTIQO_IMAGE_HF_CACHE_ROOT": HF_CACHE_ROOT,
        "AVANTIQO_IMAGE_NETWORK_VOLUME_ROOT": "/models",
        "AVANTIQO_IMAGE_NETWORK_VOLUME_QUOTA_GB": "80",
        "AVANTIQO_IMAGE_FOUNDATION_MODEL": FOUNDATION_MODEL,
        "AVANTIQO_IMAGE_ANALYZE_MODEL": ANALYZE_MODEL,
        "AVANTIQO_IMAGE_CERTIFIED_CAPABILITIES": "ai.image.generate,ai.image.analyze",
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

    image_engine.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
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

    image_engine.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
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
