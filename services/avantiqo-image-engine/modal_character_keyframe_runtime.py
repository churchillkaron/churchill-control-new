"""Owned identity-preserving character-keyframe runtime for Avantiqo Studio.

The generic Z-Image lane remains the primary photoreal still generator. This
specialist lane uses the Apache-2.0 Qwen-Image-Edit-2511 foundation model only
inside Avantiqo-owned compute to turn one approved portrait/body anchor into
same-character pose/context variants for downstream multi-keyframe LTX-2.5
conditioning.

No generated variant is self-approved. Every output is byte-bound and leaves
this runtime with approval_status=PENDING and animation_authorized=False.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
import uuid
from pathlib import Path
from typing import Any

import modal

APP_NAME = "avantiqo-image-character-owned"
CONTRACT = "AVANTIQO_IMAGE_CHARACTER_KEYFRAME_V1"
SOURCE_REPOSITORY = "churchillkaron/churchill-control-new"
PRODUCT_MODEL = "avantiqo-image-character-v1"
FOUNDATION_MODEL = "Qwen/Qwen-Image-Edit-2511"
FOUNDATION_LICENSE = "Apache-2.0"
DIFFUSERS_REVISION = "c5469b7ceb606edd7ba6570dcd17d38590a18db6"
MODEL_VOLUME_NAME = "avantiqo-image-character-models"
MODEL_SECRET_NAME = "huggingface-secret"
CACHE_ROOT = "/models/huggingface-cache"
MIN_SOURCE_BYTES = 100_000
MIN_OUTPUT_BYTES = 150_000
MAX_SOURCE_PIXELS = 4096 * 4096

app = modal.App(APP_NAME)
model_volume = modal.Volume.from_name(MODEL_VOLUME_NAME, create_if_missing=True)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _safe_relative(value: str, suffix: str) -> Path:
    relative = Path(str(value or "").lstrip("/"))
    if not relative.parts or ".." in relative.parts or relative.suffix.lower() != suffix:
        raise ValueError(f"{CONTRACT}_PATH_INVALID")
    return relative


def _approved_source(metadata: dict[str, Any], source: Path) -> dict[str, str]:
    approval_id = str(metadata.get("approval_id") or "").strip()
    character_id = str(metadata.get("character_id") or "").strip()
    expected_sha = str(metadata.get("sha256") or "").strip().lower()
    status = str(metadata.get("status") or "").strip().upper()
    if status != "APPROVED" or not approval_id or not character_id:
        raise RuntimeError(f"{CONTRACT}_APPROVED_SOURCE_REQUIRED")
    actual_sha = _sha256(source)
    if len(expected_sha) != 64 or expected_sha != actual_sha:
        raise RuntimeError(f"{CONTRACT}_SOURCE_DIGEST_MISMATCH")
    return {
        "approval_id": approval_id,
        "character_id": character_id,
        "sha256": actual_sha,
    }

seed_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("huggingface_hub==0.34.4")
)


@app.function(
    image=seed_image,
    volumes={"/models": model_volume},
    secrets=[modal.Secret.from_name(MODEL_SECRET_NAME)],
    timeout=60 * 60,
)
def seed_character_cache() -> dict[str, Any]:
    from huggingface_hub import snapshot_download

    resolved = Path(snapshot_download(
        repo_id=FOUNDATION_MODEL,
        cache_dir=CACHE_ROOT,
        token=os.environ.get("HF_TOKEN") or None,
        max_workers=8,
    )).resolve()
    if not resolved.is_dir():
        raise RuntimeError(f"{CONTRACT}_MODEL_SNAPSHOT_MISSING")
    marker = Path("/models/.avantiqo-character-cache.json")
    marker.write_text(json.dumps({
        "contract": "AVANTIQO_IMAGE_CHARACTER_CACHE_V1",
        "foundation_model": FOUNDATION_MODEL,
        "foundation_license": FOUNDATION_LICENSE,
        "snapshot_revision": resolved.name,
        "diffusers_revision": DIFFUSERS_REVISION,
    }, sort_keys=True), encoding="utf-8")
    model_volume.commit()
    return {"success": True, "snapshot_revision": resolved.name}


worker_image = (
    modal.Image.from_registry("nvidia/cuda:12.8.1-runtime-ubuntu24.04", add_python="3.12")
    .apt_install("git")
    .pip_install(
        "torch==2.8.0",
        "transformers==4.56.0",
        "accelerate==1.10.1",
        "safetensors==0.6.2",
        "Pillow==11.3.0",
        "huggingface_hub==0.34.4",
        f"git+https://github.com/huggingface/diffusers.git@{DIFFUSERS_REVISION}",
    )
    .env({
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
        "HF_HOME": CACHE_ROOT,
    })
)


def _resolved_snapshot() -> Path:
    snapshots = sorted(Path(CACHE_ROOT).glob("hub/models--Qwen--Qwen-Image-Edit-2511/snapshots/*"))
    snapshots = [path.resolve() for path in snapshots if path.is_dir()]
    if len(snapshots) != 1:
        raise RuntimeError(f"{CONTRACT}_EXACTLY_ONE_CACHED_SNAPSHOT_REQUIRED:{len(snapshots)}")
    return snapshots[0]


@app.function(
    image=worker_image,
    gpu="H100",
    volumes={"/models": model_volume},
    timeout=30 * 60,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=5,
    retries=0,
)
def generate_character_variant(data: dict[str, Any]) -> dict[str, Any]:
    import torch
    from PIL import Image
    from diffusers import QwenImageEditPlusPipeline

    started = time.perf_counter()
    if not isinstance(data, dict):
        raise ValueError(f"{CONTRACT}_INPUT_OBJECT_REQUIRED")
    source_relative = _safe_relative(str(data.get("source_relative") or ""), ".png")
    output_relative = _safe_relative(str(data.get("output_relative") or ""), ".png")
    instruction = str(data.get("instruction") or "").strip()
    if not instruction:
        raise ValueError(f"{CONTRACT}_INSTRUCTION_REQUIRED")
    source = Path("/models") / source_relative
    output = Path("/models") / output_relative
    if not source.is_file() or source.stat().st_size < MIN_SOURCE_BYTES:
        raise RuntimeError(f"{CONTRACT}_SOURCE_MISSING")
    source_meta = _approved_source(data.get("source_approval") or {}, source)

    with Image.open(source) as raw:
        reference = raw.convert("RGB")
        if reference.width * reference.height > MAX_SOURCE_PIXELS:
            raise RuntimeError(f"{CONTRACT}_SOURCE_TOO_LARGE")

    snapshot = _resolved_snapshot()
    pipe = QwenImageEditPlusPipeline.from_pretrained(
        str(snapshot),
        torch_dtype=torch.bfloat16,
        local_files_only=True,
    )
    pipe.to("cuda")
    pipe.set_progress_bar_config(disable=True)

    prompt = (
        "Preserve the exact identity of the approved person: same face geometry, age, ethnicity, hair, "
        "body proportions and distinguishing features. Do not beautify, de-age, face-swap or change identity. "
        "Create a genuinely photographic cinema-camera frame with natural skin pores, subtle asymmetry, "
        "anatomically correct hands and physically plausible posture. " + instruction
    )
    negative = (
        "different person, identity drift, face morph, beauty filter, wax skin, plastic skin, doll face, "
        "bad eyes, crossed eyes, malformed hands, extra fingers, missing fingers, fused fingers, extra limbs, "
        "broken joints, impossible pose, duplicated person, cloned face, CGI, illustration, text, logo, watermark"
    )
    generator = torch.Generator(device="cuda").manual_seed(int(data.get("seed") or 91827))
    result = pipe(
        image=[reference],
        prompt=prompt,
        negative_prompt=negative,
        true_cfg_scale=4.0,
        guidance_scale=1.0,
        num_inference_steps=40,
        generator=generator,
        num_images_per_prompt=1,
    )
    generated = result.images[0].convert("RGB")
    output.parent.mkdir(parents=True, exist_ok=True)
    generated.save(output, format="PNG", optimize=False)
    if not output.is_file() or output.stat().st_size < MIN_OUTPUT_BYTES:
        raise RuntimeError(f"{CONTRACT}_OUTPUT_INVALID")
    output_sha = _sha256(output)
    model_volume.commit()

    del pipe
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    return {
        "success": True,
        "status": "completed_approval_pending",
        "contract": CONTRACT,
        "source_repository": SOURCE_REPOSITORY,
        "provider": "avantiqo-image",
        "model": PRODUCT_MODEL,
        "foundation_model": FOUNDATION_MODEL,
        "foundation_license": FOUNDATION_LICENSE,
        "foundation_revision": snapshot.name,
        "diffusers_revision": DIFFUSERS_REVISION,
        "character_id": source_meta["character_id"],
        "source_approval_id": source_meta["approval_id"],
        "source_sha256": source_meta["sha256"],
        "source_visual_asset_count": 1,
        "source_image_used": True,
        "output_relative": str(output_relative),
        "output_sha256": output_sha,
        "output_size_bytes": output.stat().st_size,
        "width": generated.width,
        "height": generated.height,
        "identity_preservation_requested": True,
        "identity_preservation_claimed_as_pass": False,
        "approval_status": "PENDING",
        "animation_authorized": False,
        "human_visual_review_required": True,
        "external_provider_contacted": False,
        "raw_reasoning_persisted": False,
        "modal_gpu": "H100",
        "modal_elapsed_seconds": round(time.perf_counter() - started, 3),
    }


@app.local_entrypoint()
def main(
    source_path: str,
    source_approval_json: str,
    output_path: str,
    instruction: str,
    seed: int = 91827,
) -> None:
    """Stage one approved source locally, generate one pending same-character variant, and download it."""
    source = Path(source_path).expanduser().resolve()
    destination = Path(output_path).expanduser().resolve()
    if not source.is_file():
        raise SystemExit(f"{CONTRACT}_LOCAL_SOURCE_MISSING")
    source_approval = json.loads(Path(source_approval_json).expanduser().read_text(encoding="utf-8"))
    if not isinstance(source_approval, dict):
        raise SystemExit(f"{CONTRACT}_LOCAL_APPROVAL_OBJECT_REQUIRED")
    expected_sha = str(source_approval.get("sha256") or "").strip().lower()
    if expected_sha != _sha256(source):
        raise SystemExit(f"{CONTRACT}_LOCAL_SOURCE_DIGEST_MISMATCH")

    run_id = uuid.uuid4().hex[:16]
    source_remote = f"character-runs/{run_id}/source.png"
    output_remote = f"character-runs/{run_id}/variant.png"
    with model_volume.batch_upload(force=True) as upload:
        upload.put_file(str(source), source_remote)
    try:
        cache = seed_character_cache.remote()
        if not isinstance(cache, dict) or cache.get("success") is not True:
            raise RuntimeError(f"{CONTRACT}_CACHE_NOT_READY")
        result = generate_character_variant.remote({
            "source_relative": source_remote,
            "output_relative": output_remote,
            "source_approval": source_approval,
            "instruction": instruction,
            "seed": int(seed),
        })
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("wb") as handle:
            for chunk in model_volume.read_file(output_remote):
                handle.write(chunk)
        if _sha256(destination) != result.get("output_sha256"):
            raise RuntimeError(f"{CONTRACT}_DOWNLOAD_DIGEST_MISMATCH")
        destination.with_suffix(".json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(f"{CONTRACT}=PASS_APPROVAL_PENDING", flush=True)
    finally:
        for path in (source_remote, output_remote):
            try:
                model_volume.remove_file(path)
            except Exception:
                pass
