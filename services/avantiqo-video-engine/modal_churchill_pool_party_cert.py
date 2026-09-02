"""One-shot governed Churchill pool-party Video proof on the canonical Avantiqo LTX lane.

This reuses the already-certified premium B200 function. It performs only CPU
preflight/cache work outside the single paid call, uploads the user-approved
Churchill reference into the existing Video model volume for the duration of the
run, downloads the untouched native model output, verifies it locally, and
removes both temporary volume objects afterwards.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import uuid
from pathlib import Path
from typing import Any

from modal_app import (
    APP_NAME,
    LTX_FPS,
    LTX_GPU,
    LTX_GPU_USD_PER_SECOND,
    LTX_HARD_TIMEOUT_SECONDS,
    LTX_MASTER_HEIGHT,
    LTX_MASTER_WIDTH,
    LTX_NUM_INFERENCE_STEPS,
    LTX_SOURCE_REVISION,
    app,
    generate_native_master,
    model_volume,
    seed_ltx_cache,
)
from modal_scene1_cert import (
    _cost_preflight,
    _modal_stats,
    _pricing_and_wallet_preflight,
    _validate_native_result,
)

CONTRACT = "AVANTIQO_VIDEO_CHURCHILL_POOL_PARTY_PROOF_V1"
APPROVAL_ENV = "AVANTIQO_VIDEO_CHURCHILL_PARTY_REAL_INFERENCE_APPROVED"
SOURCE_ENV = "AVANTIQO_VIDEO_CHURCHILL_PARTY_SOURCE_FRAME"
DURATION_SECONDS = 4
SEED = 9137
SOURCE_BYTES = 31806
SOURCE_SHA256 = "06cc6b2b2b1799e650d574e18ffbc03a58f9ca3ee2d53b4cf4da8fec81408387"

PROMPT = (
    "Premium cinematic image-to-video shot inside Churchill Restaurant & Bar. "
    "Preserve the exact pool-room architecture, pool tables, fixtures, practical lighting, signage, lens perspective and spatial layout from the supplied reference. "
    "Bring the venue naturally to life as a lively upscale evening pool party with believable adult guests standing, talking, laughing and playing pool around the tables. "
    "People move independently and subtly; a few guests take pool shots, others converse or raise drinks casually, with realistic body mechanics, cloth motion and hair motion. "
    "The camera makes a slow stabilized forward dolly with gentle parallax while the room geometry remains locked and coherent. "
    "Warm practical ambience, natural skin tones, realistic depth and physically plausible motion. "
    "No morphing, no duplicated people, no warped faces or hands, no bent pool cues, no changing table geometry, no floating objects, no fantasy elements, no artificial timelapse, no added text or logos. "
    "The result should feel like a high-end hospitality commercial filmed by a top New York production company."
)


def _yes(value: Any) -> bool:
    return str(value or "").strip().upper() in {"YES", "TRUE", "1", "APPROVED", "ON"}


def _source_path() -> Path:
    value = str(os.environ.get(SOURCE_ENV) or "").strip()
    if not value:
        raise RuntimeError(f"{CONTRACT}_SOURCE_REQUIRED")
    return Path(value).expanduser().resolve()


def _verify_source(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise RuntimeError(f"{CONTRACT}_SOURCE_MISSING")
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if len(raw) != SOURCE_BYTES:
        raise RuntimeError(f"{CONTRACT}_SOURCE_SIZE_INVALID:{len(raw)}")
    if digest != SOURCE_SHA256:
        raise RuntimeError(f"{CONTRACT}_SOURCE_SHA256_INVALID:{digest}")
    return {"bytes": len(raw), "sha256": digest}


def _preflight() -> dict[str, Any]:
    source = _verify_source(_source_path())
    governance = _pricing_and_wallet_preflight()
    modal_stats = _modal_stats()
    cost = _cost_preflight()
    return {
        "success": True,
        "contract": CONTRACT,
        "phase": "PREFLIGHT",
        "source": source,
        "governance": governance,
        "modal": {
            "app": APP_NAME,
            "function": "generate_native_master",
            "gpu": LTX_GPU,
            "scale_to_zero": True,
            "maximum_paid_gpu_jobs": 1,
            "automatic_paid_retry": False,
            **modal_stats,
        },
        "generation": {
            "width": LTX_MASTER_WIDTH,
            "height": LTX_MASTER_HEIGHT,
            "fps": LTX_FPS,
            "num_inference_steps": LTX_NUM_INFERENCE_STEPS,
            "duration_seconds": DURATION_SECONDS,
            "seed": SEED,
            "foundation_revision": LTX_SOURCE_REVISION,
            "pixel_upscale": False,
            "temporal_interpolation": False,
            "crop": False,
            "resize": False,
        },
        "cost": cost,
        "runpod_used": False,
        "external_provider_fallback_allowed": False,
        "production_vercel_deploy_performed": False,
        "gpu_requested": False,
    }


@app.local_entrypoint()
def preflight() -> None:
    report = _preflight()
    print(json.dumps(report, indent=2), flush=True)
    print(f"{CONTRACT}_PREFLIGHT=PASS", flush=True)


@app.local_entrypoint()
def certify(
    output_path: str = "local-audit-output/avantiqo-video-churchill-pool-party/churchill-pool-party-native-3840x2176.mp4",
) -> None:
    report = _preflight()
    if not _yes(os.environ.get(APPROVAL_ENV)):
        raise RuntimeError(f"{APPROVAL_ENV}=YES_REQUIRED")

    source = _source_path()
    repository_root = Path.cwd().resolve()
    local_output = Path(output_path)
    if not local_output.is_absolute():
        local_output = (repository_root / local_output).resolve()
    local_output.parent.mkdir(parents=True, exist_ok=True)
    report_path = local_output.with_suffix(".json")

    run_id = uuid.uuid4().hex[:16]
    reference_remote = f"churchill-pool-party-proof/{run_id}/reference.jpg"
    output_remote = f"churchill-pool-party-proof/{run_id}/native-master-3840x2176.mp4"

    with model_volume.batch_upload(force=True) as upload:
        upload.put_file(str(source), reference_remote)

    try:
        cache = seed_ltx_cache.remote()
        if cache.get("success") is not True:
            raise RuntimeError(f"{CONTRACT}_CACHE_FAILED")
        if cache.get("revision") != LTX_SOURCE_REVISION:
            raise RuntimeError(f"{CONTRACT}_CACHE_REVISION_INVALID")

        paid_stats = _modal_stats()
        print(json.dumps({
            "event": "AVANTIQO_VIDEO_CHURCHILL_POOL_PARTY_PAID_START",
            "function": "generate_native_master",
            "gpu": LTX_GPU,
            "duration_seconds": DURATION_SECONDS,
            "hard_timeout_seconds": LTX_HARD_TIMEOUT_SECONDS,
            "hard_gpu_cost_ceiling_usd": round(LTX_GPU_USD_PER_SECOND * LTX_HARD_TIMEOUT_SECONDS, 6),
            "maximum_paid_gpu_jobs": 1,
            "automatic_paid_retry": False,
            "backlog": paid_stats["backlog"],
            "runners": paid_stats["num_total_runners"],
            "production_deploy_performed": False,
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
        _validate_native_result(result)

        with local_output.open("wb") as handle:
            for chunk in model_volume.read_file(output_remote):
                handle.write(chunk)
        if not local_output.is_file() or local_output.stat().st_size <= 1_000_000:
            raise RuntimeError(f"{CONTRACT}_LOCAL_OUTPUT_INVALID")

        ffprobe_data = None
        ffprobe = shutil.which("ffprobe")
        if ffprobe:
            completed = subprocess.run(
                [
                    ffprobe,
                    "-v", "error",
                    "-select_streams", "v:0",
                    "-show_entries", "stream=width,height,r_frame_rate,nb_frames,codec_name,bit_rate",
                    "-show_entries", "format=duration,bit_rate,size",
                    "-of", "json",
                    str(local_output),
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=30,
                check=False,
            )
            if completed.returncode != 0:
                raise RuntimeError(f"{CONTRACT}_FFPROBE_FAILED:{completed.stderr[-500:]}")
            ffprobe_data = json.loads(completed.stdout)
            stream = (ffprobe_data.get("streams") or [{}])[0]
            if int(stream.get("width") or 0) != LTX_MASTER_WIDTH:
                raise RuntimeError(f"{CONTRACT}_WIDTH_INVALID")
            if int(stream.get("height") or 0) != LTX_MASTER_HEIGHT:
                raise RuntimeError(f"{CONTRACT}_HEIGHT_INVALID")
            if str(stream.get("r_frame_rate") or "") != f"{LTX_FPS}/1":
                raise RuntimeError(f"{CONTRACT}_FPS_INVALID")

        final_report = {
            **report,
            "phase": "COMPLETED",
            "paid_approval_observed": True,
            "cache": cache,
            "generation_result": result,
            "post_gpu_local_probe": ffprobe_data,
            "customer_charge_performed": False,
            "pricing_activation_performed": False,
            "provider_routing_activation_performed": False,
            "production_vercel_deploy_performed": False,
        }
        report_path.write_text(json.dumps(final_report, indent=2), encoding="utf-8")
        print(f"AVANTIQO_VIDEO_CHURCHILL_POOL_PARTY_OUTPUT={local_output}", flush=True)
        print(f"AVANTIQO_VIDEO_CHURCHILL_POOL_PARTY_REPORT={report_path}", flush=True)
        print(f"{CONTRACT}=PASS", flush=True)
    finally:
        for remote in (reference_remote, output_remote):
            try:
                model_volume.remove_file(remote)
            except Exception:
                pass
