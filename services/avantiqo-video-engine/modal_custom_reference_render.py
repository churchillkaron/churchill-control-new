"""One-shot governed custom reference render for Avantiqo Video LTX-2.5.

CPU-side transport stages an explicitly approved reference on the single Video
model Volume, proves the premium B200 function is idle, invokes exactly one
native-master generation, downloads the untouched master, and deletes transient
reference/output files. No production routing, pricing, wallet mutation, RunPod,
or delivery transform is performed here.
"""
from __future__ import annotations

import hashlib
import json
import os
import uuid
from pathlib import Path
from typing import Any

from modal_app import (
    LTX_FPS,
    LTX_GPU,
    LTX_MASTER_HEIGHT,
    LTX_MASTER_WIDTH,
    LTX_NUM_INFERENCE_STEPS,
    LTX_RUNTIME_CONTRACT,
    LTX_SOURCE_REVISION,
    NATIVE_ENGINE_CONTRACT,
    app,
    generate_native_master,
    model_volume,
    seed_ltx_cache,
)

CONTRACT = "AVANTIQO_VIDEO_CUSTOM_REFERENCE_RENDER_V1"


def _text(value: Any) -> str:
    return str(value or "").strip()


def _require_idle() -> dict[str, int]:
    stats = generate_native_master.get_current_stats()
    backlog = int(getattr(stats, "backlog", 0) or 0)
    runners = int(getattr(stats, "num_total_runners", 0) or 0)
    running = int(getattr(stats, "num_running_inputs", 0) or 0)
    if backlog or runners or running:
        raise RuntimeError(
            f"{CONTRACT}_DUPLICATE_GPU_GUARD_ACTIVE:backlog={backlog}:runners={runners}:running={running}"
        )
    return {"backlog": backlog, "runners": runners, "running": running}


def _verify_source(path: Path, expected_sha256: str) -> dict[str, Any]:
    if not path.is_file():
        raise RuntimeError(f"{CONTRACT}_SOURCE_MISSING")
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if len(raw) < 20_000:
        raise RuntimeError(f"{CONTRACT}_SOURCE_TOO_SMALL:{len(raw)}")
    if digest != expected_sha256:
        raise RuntimeError(f"{CONTRACT}_SOURCE_DIGEST_INVALID:{digest}")
    return {"bytes": len(raw), "sha256": digest}


@app.local_entrypoint()
def render(
    source_path: str,
    output_path: str,
    expected_sha256: str,
    instruction: str,
    duration_seconds: int = 4,
    seed: int = 91827,
) -> None:
    source = Path(source_path).expanduser().resolve()
    output = Path(output_path).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    source_evidence = _verify_source(source, _text(expected_sha256))
    if not _text(instruction):
        raise RuntimeError(f"{CONTRACT}_INSTRUCTION_REQUIRED")
    if int(duration_seconds) != 4:
        raise RuntimeError(f"{CONTRACT}_DURATION_MUST_BE_FOUR_SECONDS")

    idle = _require_idle()
    cache = seed_ltx_cache.remote()
    if cache.get("success") is not True or cache.get("revision") != LTX_SOURCE_REVISION:
        raise RuntimeError(f"{CONTRACT}_PINNED_CACHE_INVALID")
    idle_immediately_before_paid_call = _require_idle()

    run_id = uuid.uuid4().hex[:16]
    reference_remote = f"custom-reference/{run_id}/reference.jpg"
    output_remote = f"custom-reference/{run_id}/native-master-3840x2176.mp4"
    with model_volume.batch_upload(force=True) as upload:
        upload.put_file(str(source), reference_remote)

    try:
        print(json.dumps({
            "event": "AVANTIQO_VIDEO_CUSTOM_REFERENCE_PAID_GENERATION_START",
            "contract": CONTRACT,
            "gpu": LTX_GPU,
            "duration_seconds": int(duration_seconds),
            "maximum_paid_gpu_jobs": 1,
            "automatic_paid_retry": False,
            "idle": idle,
            "idle_immediately_before_paid_call": idle_immediately_before_paid_call,
        }, separators=(",", ":")), flush=True)

        result = generate_native_master.remote(
            reference_remote,
            output_remote,
            instruction,
            int(duration_seconds),
            int(seed),
        )
        if not isinstance(result, dict):
            raise RuntimeError(f"{CONTRACT}_RESULT_OBJECT_REQUIRED")
        required = {
            "success": True,
            "contract": LTX_RUNTIME_CONTRACT,
            "engine_contract": NATIVE_ENGINE_CONTRACT,
            "foundation_revision": LTX_SOURCE_REVISION,
            "modal_gpu": LTX_GPU,
            "width": LTX_MASTER_WIDTH,
            "height": LTX_MASTER_HEIGHT,
            "fps": LTX_FPS,
            "num_inference_steps": LTX_NUM_INFERENCE_STEPS,
            "duration_seconds_requested": 4,
            "native_master_generated": True,
            "master_is_exact_model_output": True,
            "model_cpu_offload_used": False,
            "pixel_upscale_used": False,
            "learned_latent_upsampler_used": False,
            "learned_spatial_upscaler_used": False,
            "temporal_interpolation_used": False,
            "resize_used": False,
            "crop_used": False,
            "grading_used": False,
            "assembly_used": False,
            "delivery_transform_used": False,
            "automatic_paid_retry": False,
            "runpod_inference_performed": False,
            "external_provider_contacted": False,
        }
        for key, expected in required.items():
            if result.get(key) != expected:
                raise RuntimeError(
                    f"{CONTRACT}_RESULT_INVALID:{key}:{result.get(key)!r}:{expected!r}"
                )

        with output.open("wb") as handle:
            for chunk in model_volume.read_file(output_remote):
                handle.write(chunk)
        if not output.is_file() or output.stat().st_size <= 1_000_000:
            raise RuntimeError(f"{CONTRACT}_LOCAL_OUTPUT_INVALID")

        report = {
            "success": True,
            "contract": CONTRACT,
            "source": source_evidence,
            "generation": result,
            "output": str(output),
            "production_vercel_deploy_performed": False,
            "pricing_activation_performed": False,
            "provider_routing_activation_performed": False,
            "customer_wallet_mutation_performed": False,
        }
        output.with_suffix(".json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"AVANTIQO_VIDEO_CUSTOM_REFERENCE_OUTPUT={output}", flush=True)
        print(f"{CONTRACT}=PASS", flush=True)
    finally:
        for remote in (reference_remote, output_remote):
            try:
                model_volume.remove_file(remote)
            except Exception:
                pass
