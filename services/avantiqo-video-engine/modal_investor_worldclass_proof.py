"""One-shot Avantiqo investor-film proof on the already-proven native LTX-2.5 lane.

This module deliberately reuses modal_app.generate_native_master unchanged.
The GPU boundary remains the same canonical B200 / LTX-2.5 full-dev BF16 path
that previously produced the green Scene 1 native master. Only the creative
instruction and output namespace differ.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import uuid
from pathlib import Path
from typing import Any

from modal_app import (
    LTX_FPS,
    LTX_GPU,
    LTX_MASTER_HEIGHT,
    LTX_MASTER_WIDTH,
    LTX_NUM_INFERENCE_STEPS,
    LTX_QUALITY_CONTRACT,
    LTX_RUNTIME_CONTRACT,
    LTX_SOURCE_REVISION,
    app,
    generate_native_master,
    model_volume,
    seed_ltx_cache,
)

CONTRACT = "AVANTIQO_INVESTOR_WORLDCLASS_NATIVE_4K_PROOF_V1"
DURATION_SECONDS = 4
SEED = 26090581
SOURCE_ENV = "AVANTIQO_INVESTOR_PROOF_SOURCE_FRAME"
SOURCE_BYTES = 31376
SOURCE_SHA256 = "cbf4437d77f74b2fd0193f9039ef64c511b597712fe08c466c30d4c231aeb0c5"

PROMPT = (
    "World-class cinematic investor-film opening for Avantiqo. A premium stabilized aerial push over a sophisticated coastal Asian business city at blue-hour dawn, "
    "with physically believable architecture, glass towers, hotels, restaurants, logistics movement and streets gradually coming alive. "
    "The city should feel quietly coordinated by one invisible intelligent operating layer: traffic, deliveries, building lights and human activity synchronize with elegant cause-and-effect timing. "
    "Use only subtle warm bronze-gold light relationships and reflections to suggest intelligence moving through the real world; never show floating UI, holograms, dashboards, text or logos. "
    "Near-future enterprise realism, not science fiction. The camera glides forward with restrained authority and a subtle controlled descent, preserving coherent skyline geometry and perspective. "
    "Natural pre-sunrise atmosphere, premium anamorphic depth, realistic haze, natural exposure, detailed materials, elegant motion, cinematic contrast, believable scale. "
    "The emotional message is: thousands of business decisions becoming one coordinated intelligent system. Sophisticated, expensive, calm, global, credible, futuristic and unmistakably investor-grade."
)


def _source_path() -> Path:
    value = str(os.environ.get(SOURCE_ENV) or "").strip()
    if not value:
        raise RuntimeError(f"{CONTRACT}_SOURCE_REQUIRED")
    return Path(value).expanduser().resolve()


def _verify_source(path: Path) -> None:
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if len(raw) != SOURCE_BYTES or digest != SOURCE_SHA256:
        raise RuntimeError(f"{CONTRACT}_SOURCE_IDENTITY_INVALID:{len(raw)}:{digest}")


def _assert_result(result: dict[str, Any]) -> None:
    expected = {
        "success": True,
        "contract": LTX_RUNTIME_CONTRACT,
        "quality_contract": LTX_QUALITY_CONTRACT,
        "foundation_revision": LTX_SOURCE_REVISION,
        "modal_gpu": LTX_GPU,
        "width": LTX_MASTER_WIDTH,
        "height": LTX_MASTER_HEIGHT,
        "fps": LTX_FPS,
        "num_inference_steps": LTX_NUM_INFERENCE_STEPS,
        "duration_seconds_requested": DURATION_SECONDS,
        "native_master_generated": True,
        "master_is_exact_model_output": True,
        "model_cpu_offload_used": False,
        "pixel_upscale_used": False,
        "learned_latent_upsampler_used": False,
        "learned_spatial_upscaler_used": False,
        "temporal_interpolation_used": False,
        "distilled_transformer_used": False,
        "distilled_lora_used": False,
        "resize_used": False,
        "crop_used": False,
        "grading_used": False,
        "assembly_used": False,
        "delivery_transform_used": False,
        "runpod_inference_performed": False,
        "external_provider_contacted": False,
        "automatic_paid_retry": False,
    }
    for key, value in expected.items():
        if result.get(key) != value:
            raise RuntimeError(f"{CONTRACT}_RESULT_INVALID:{key}:{result.get(key)!r}:{value!r}")


def _probe(path: Path) -> dict[str, Any]:
    completed = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height,r_frame_rate,codec_name,bit_rate",
            "-show_entries", "format=duration,bit_rate,size",
            "-of", "json", str(path),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=30,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(f"{CONTRACT}_FFPROBE_FAILED:{completed.stderr[-1200:]}")
    probe = json.loads(completed.stdout)
    stream = (probe.get("streams") or [{}])[0]
    if int(stream.get("width") or 0) != LTX_MASTER_WIDTH:
        raise RuntimeError(f"{CONTRACT}_WIDTH_INVALID")
    if int(stream.get("height") or 0) != LTX_MASTER_HEIGHT:
        raise RuntimeError(f"{CONTRACT}_HEIGHT_INVALID")
    if str(stream.get("r_frame_rate") or "") != f"{LTX_FPS}/1":
        raise RuntimeError(f"{CONTRACT}_FPS_INVALID")
    return probe


@app.local_entrypoint()
def render(
    output_path: str = "local-audit-output/avantiqo-investor-worldclass-native4k/avantiqo-investor-worldclass-native-3840x2176.mp4",
) -> None:
    source = _source_path()
    _verify_source(source)

    stats = generate_native_master.get_current_stats()
    backlog = int(getattr(stats, "backlog", 0) or 0)
    runners = int(getattr(stats, "num_total_runners", 0) or 0)
    running = int(getattr(stats, "num_running_inputs", 0) or 0)
    if backlog or runners or running:
        raise RuntimeError(f"{CONTRACT}_GPU_LANE_NOT_IDLE:{backlog}:{runners}:{running}")

    output = Path(output_path)
    if not output.is_absolute():
        output = (Path.cwd() / output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    report_path = output.with_suffix(".json")

    run_id = uuid.uuid4().hex[:16]
    reference_remote = f"investor-worldclass-proof/{run_id}/approved-reference.jpg"
    output_remote = f"investor-worldclass-proof/{run_id}/native-master-3840x2176.mp4"

    with model_volume.batch_upload(force=True) as upload:
        upload.put_file(str(source), reference_remote)

    try:
        cache = seed_ltx_cache.remote()
        if cache.get("success") is not True or cache.get("revision") != LTX_SOURCE_REVISION:
            raise RuntimeError(f"{CONTRACT}_PINNED_CACHE_INVALID")

        print(json.dumps({
            "event": "AVANTIQO_INVESTOR_WORLDCLASS_NATIVE_GENERATION_START",
            "contract": CONTRACT,
            "function": "generate_native_master",
            "gpu": LTX_GPU,
            "resolution": f"{LTX_MASTER_WIDTH}x{LTX_MASTER_HEIGHT}",
            "fps": LTX_FPS,
            "steps": LTX_NUM_INFERENCE_STEPS,
            "duration_seconds": DURATION_SECONDS,
            "seed": SEED,
            "automatic_paid_retry": False,
            "external_provider_fallback": False,
        }, separators=(",", ":")), flush=True)

        result = generate_native_master.remote(
            reference_remote,
            output_remote,
            PROMPT,
            DURATION_SECONDS,
            SEED,
        )
        if not isinstance(result, dict):
            raise RuntimeError(f"{CONTRACT}_RESULT_OBJECT_REQUIRED")
        _assert_result(result)

        with output.open("wb") as handle:
            for chunk in model_volume.read_file(output_remote):
                handle.write(chunk)
        if not output.is_file() or output.stat().st_size <= 1_000_000:
            raise RuntimeError(f"{CONTRACT}_OUTPUT_INVALID")

        probe = _probe(output)
        report = {
            "success": True,
            "marker": f"{CONTRACT}=PASS",
            "contract": CONTRACT,
            "creative_direction": "AVANTIQO_NEAR_FUTURE_ENTERPRISE_INTELLIGENCE",
            "prompt": PROMPT,
            "source_sha256": SOURCE_SHA256,
            "generation": result,
            "post_gpu_probe": probe,
            "proof_scope": {
                "native_model_output": True,
                "resolution": f"{LTX_MASTER_WIDTH}x{LTX_MASTER_HEIGHT}",
                "fps": LTX_FPS,
                "upscale_used": False,
                "resize_used": False,
                "interpolation_used": False,
                "assembly_used": False,
                "external_video_provider_used": False,
                "production_deploy_performed": False,
            },
        }
        report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"AVANTIQO_INVESTOR_WORLDCLASS_NATIVE_4K_OUTPUT={output}", flush=True)
        print(f"AVANTIQO_INVESTOR_WORLDCLASS_NATIVE_4K_REPORT={report_path}", flush=True)
        print(f"AVANTIQO_INVESTOR_WORLDCLASS_NATIVE_4K_COST_USD={result.get('estimated_supplier_gpu_cost_usd')}", flush=True)
        print(f"{CONTRACT}=PASS", flush=True)
    finally:
        for remote in (reference_remote, output_remote):
            try:
                model_volume.remove_file(remote)
            except Exception:
                pass
