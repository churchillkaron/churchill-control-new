"""Governed Scene 1 certification lane for Avantiqo Video on Modal.

This module imports the canonical avantiqo-video-owned app and adds one premium
LTX-2.5 certification function with a strict ten-minute H200 ceiling. It shares
the canonical avantiqo-video-models Volume and never creates a second Video
storage surface.

The local preflight is intentionally zero-GPU. It verifies the approved source
frame, the Avantiqo Platform prepaid wallet, the inactive/pending Video pricing
record, current Modal function backlog/runners, and the supplier-cost ceiling
before paid inference can be approved.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from modal_app import (
    APP_NAME,
    LTX_FPS,
    LTX_MASTER_HEIGHT,
    LTX_MASTER_WIDTH,
    LTX_PIPELINE_ROOT,
    LTX_QUALITY_CONTRACT,
    LTX_REQUIRED,
    LTX_RUNTIME_CONTRACT,
    LTX_SOURCE_REPO,
    LTX_SOURCE_REVISION,
    NATIVE_ENGINE_CONTRACT,
    SCENE1_PROMPT,
    _ltx_frame_count,
    _ltx_negative_prompt,
    _ltx_prompt,
    _ltx_snapshot,
    _sanitize,
    app,
    ltx_worker_image,
    model_volume,
    prepare_scene1_reference,
    seed_ltx_cache,
)

CONTRACT = "AVANTIQO_VIDEO_SCENE1_MODAL_CERTIFICATION_V1"
GPU = "H200"
H200_USD_PER_SECOND = 0.001261
HARD_TIMEOUT_SECONDS = 10 * 60
SUBPROCESS_TIMEOUT_SECONDS = HARD_TIMEOUT_SECONDS - 20
DEFAULT_MAX_SUPPLIER_GPU_COST_USD = 1.00
APPROVAL_ENV = "AVANTIQO_VIDEO_SCENE1_REAL_INFERENCE_APPROVED"
SOURCE_ENV = "AVANTIQO_VIDEO_SCENE1_SOURCE_FRAME"
ENV_FILE_ENV = "AVANTIQO_VIDEO_SCENE1_ENV_FILE"
CANONICAL_SOURCE_RELATIVE = "assets/video/proofs/avantiqo_first_shot_frame_transport.jpg"
CANONICAL_SOURCE_BYTES = 31376
CANONICAL_SOURCE_SHA256 = "cbf4437d77f74b2fd0193f9039ef64c511b597712fe08c466c30d4c231aeb0c5"
SUPABASE_DEFAULT_URL = "https://vfsjqabpkcbiuerhzugk.supabase.co"


def _text(value: Any) -> str:
    return str(value or "").strip()


def _yes(value: Any) -> bool:
    return _text(value).upper() in {"YES", "TRUE", "1", "APPROVED", "ON"}


def _finite(value: Any, fallback: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return number if number == number and abs(number) != float("inf") else fallback


def _load_dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        if key:
            values[key] = value
    return values


def _local_env() -> dict[str, str]:
    explicit = _text(os.environ.get(ENV_FILE_ENV))
    path = Path(explicit).expanduser().resolve() if explicit else (Path.cwd() / ".env.local").resolve()
    values = _load_dotenv(path)
    merged = {**values, **{key: value for key, value in os.environ.items() if value}}
    return merged


def _rest_rows(table: str, params: dict[str, str], env: dict[str, str]) -> list[dict[str, Any]]:
    service_key = _text(env.get("SUPABASE_SERVICE_ROLE_KEY"))
    if not service_key:
        raise RuntimeError(f"{CONTRACT}_SUPABASE_SERVICE_ROLE_KEY_REQUIRED")
    base_url = _text(env.get("NEXT_PUBLIC_SUPABASE_URL")) or SUPABASE_DEFAULT_URL
    query = urlencode(params)
    request = Request(
        f"{base_url.rstrip('/')}/rest/v1/{table}?{query}",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Accept": "application/json",
        },
        method="GET",
    )
    with urlopen(request, timeout=30) as response:  # noqa: S310 - fixed/owned Supabase host
        body = json.loads(response.read().decode("utf-8"))
    if not isinstance(body, list):
        raise RuntimeError(f"{CONTRACT}_SUPABASE_ROWS_REQUIRED:{table}")
    return [row for row in body if isinstance(row, dict)]


def _source_path() -> Path:
    explicit = _text(os.environ.get(SOURCE_ENV))
    if explicit:
        return Path(explicit).expanduser().resolve()
    return (Path.cwd() / CANONICAL_SOURCE_RELATIVE).resolve()


def _verify_source(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise RuntimeError(f"{CONTRACT}_APPROVED_SOURCE_MISSING")
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if len(raw) != CANONICAL_SOURCE_BYTES:
        raise RuntimeError(f"{CONTRACT}_APPROVED_SOURCE_SIZE_INVALID:{len(raw)}")
    if digest != CANONICAL_SOURCE_SHA256:
        raise RuntimeError(f"{CONTRACT}_APPROVED_SOURCE_DIGEST_INVALID:{digest}")
    return {"bytes": len(raw), "sha256": digest}


def _pricing_and_wallet_preflight() -> dict[str, Any]:
    env = _local_env()
    organizations = _rest_rows(
        "organizations",
        {
            "select": "id,name,organization_type,status,organization_status",
            "name": "eq.Avantiqo Platform",
            "organization_type": "eq.enterprise_group",
            "limit": "3",
        },
        env,
    )
    if len(organizations) != 1:
        raise RuntimeError(f"{CONTRACT}_PLATFORM_ORGANIZATION_RESOLUTION_FAILED:{len(organizations)}")
    organization_id = _text(organizations[0].get("id"))
    if not organization_id:
        raise RuntimeError(f"{CONTRACT}_PLATFORM_ORGANIZATION_ID_REQUIRED")

    wallets = _rest_rows(
        "organization_wallets",
        {
            "select": "id,status,billing_policy,available_balance,currency",
            "organization_id": f"eq.{organization_id}",
            "limit": "2",
        },
        env,
    )
    if len(wallets) != 1:
        raise RuntimeError(f"{CONTRACT}_PREPAID_WALLET_RESOLUTION_FAILED:{len(wallets)}")
    wallet = wallets[0]
    if _text(wallet.get("status")).upper() != "ACTIVE":
        raise RuntimeError(f"{CONTRACT}_ACTIVE_WALLET_REQUIRED")
    if _text(wallet.get("billing_policy")).upper() != "PREPAID":
        raise RuntimeError(f"{CONTRACT}_PREPAID_POLICY_REQUIRED")

    pricing_rows = _rest_rows(
        "provider_pricing",
        {
            "select": "id,provider,capability,model,active,unit,cost_per_unit,currency,markup_percent,metadata",
            "provider": "eq.avantiqo-video",
            "capability": "eq.ai.video.image_to_video",
            "limit": "5",
        },
        env,
    )
    if len(pricing_rows) != 1:
        raise RuntimeError(f"{CONTRACT}_VIDEO_PRICING_RECORD_RESOLUTION_FAILED:{len(pricing_rows)}")
    pricing = pricing_rows[0]
    metadata = pricing.get("metadata") if isinstance(pricing.get("metadata"), dict) else {}
    if pricing.get("active") is not False:
        raise RuntimeError(f"{CONTRACT}_UNMEASURED_VIDEO_PRICING_MUST_REMAIN_INACTIVE")
    if metadata.get("production_routing_allowed") is not False:
        raise RuntimeError(f"{CONTRACT}_UNMEASURED_VIDEO_PRODUCTION_ROUTING_FORBIDDEN")
    if metadata.get("economics_certified") is not False:
        raise RuntimeError(f"{CONTRACT}_VIDEO_ECONOMICS_MUST_BE_PENDING_BEFORE_FIRST_MEASUREMENT")

    organization_services = _rest_rows(
        "organization_services",
        {
            "select": "id,service_id,status,usage_enabled",
            "organization_id": f"eq.{organization_id}",
            "service_id": "eq.ai.video.image_to_video",
            "limit": "2",
        },
        env,
    )

    return {
        "organization_id_printed": False,
        "wallet": {
            "status": _text(wallet.get("status")),
            "billing_policy": _text(wallet.get("billing_policy")),
            "available_balance_thb": round(_finite(wallet.get("available_balance")), 6),
            "currency": _text(wallet.get("currency")),
        },
        "pricing": {
            "provider": _text(pricing.get("provider")),
            "capability": _text(pricing.get("capability")),
            "model": _text(pricing.get("model")),
            "active": pricing.get("active"),
            "economics_certified": metadata.get("economics_certified"),
            "internal_gpu_cost_status": metadata.get("internal_gpu_cost_status"),
            "production_routing_allowed": metadata.get("production_routing_allowed"),
        },
        "organization_service_provisioned": len(organization_services) == 1,
        "customer_charge_planned": False,
        "customer_wallet_mutation_planned": False,
        "pricing_activation_planned": False,
    }


def _modal_stats() -> dict[str, int]:
    stats = generate_scene1_native_master.get_current_stats()
    backlog = int(getattr(stats, "backlog", 0) or 0)
    total = int(getattr(stats, "num_total_runners", 0) or 0)
    running = int(getattr(stats, "num_running_inputs", 0) or 0)
    if backlog != 0 or total != 0 or running != 0:
        raise RuntimeError(
            f"{CONTRACT}_DUPLICATE_GPU_GUARD_ACTIVE:backlog={backlog}:runners={total}:running={running}"
        )
    return {"backlog": backlog, "num_total_runners": total, "num_running_inputs": running}


def _cost_preflight() -> dict[str, Any]:
    maximum = _finite(
        os.environ.get("AVANTIQO_VIDEO_SCENE1_MAX_SUPPLIER_GPU_COST_USD"),
        DEFAULT_MAX_SUPPLIER_GPU_COST_USD,
    )
    ceiling = H200_USD_PER_SECOND * HARD_TIMEOUT_SECONDS
    if ceiling > maximum:
        raise RuntimeError(
            f"{CONTRACT}_SUPPLIER_COST_CEILING_EXCEEDED:{ceiling:.6f}:{maximum:.6f}"
        )
    return {
        "gpu": GPU,
        "supplier_gpu_rate_usd_per_second": H200_USD_PER_SECOND,
        "hard_timeout_seconds": HARD_TIMEOUT_SECONDS,
        "hard_gpu_cost_ceiling_usd": round(ceiling, 6),
        "approved_supplier_gpu_cost_budget_usd": round(maximum, 6),
        "maximum_paid_gpu_jobs": 1,
        "automatic_paid_retry": False,
    }


def _local_preflight() -> dict[str, Any]:
    source = _verify_source(_source_path())
    governance = _pricing_and_wallet_preflight()
    modal_stats = _modal_stats()
    cost = _cost_preflight()
    return {
        "success": True,
        "contract": CONTRACT,
        "phase": "PREFLIGHT",
        "approved_source": source,
        "governance": governance,
        "modal": {
            "app": APP_NAME,
            "function": "generate_scene1_native_master",
            "scale_to_zero": True,
            "min_gpu_containers": 0,
            "max_gpu_containers": 1,
            "scaledown_window_seconds": 5,
            **modal_stats,
        },
        "cost": cost,
        "model": {
            "foundation": LTX_SOURCE_REPO,
            "revision": LTX_SOURCE_REVISION,
            "pipeline": "TI2VID_ONE_STAGE_FULL_DEV_BF16",
            "precision": "BF16",
            "width": LTX_MASTER_WIDTH,
            "height": LTX_MASTER_HEIGHT,
            "fps": LTX_FPS,
            "duration_seconds": 5,
        },
        "runpod_used": False,
        "external_provider_fallback_allowed": False,
        "gpu_requested": False,
        "gpu_inference_performed": False,
        "production_vercel_deploy_performed": False,
        "secrets_printed": False,
    }


@app.function(
    image=ltx_worker_image,
    gpu=GPU,
    volumes={"/models": model_volume},
    timeout=HARD_TIMEOUT_SECONDS,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=5,
    retries=0,
)
def generate_scene1_native_master(
    reference_relative: str,
    output_relative: str,
    instruction: str,
    duration_seconds: int = 5,
    seed: int = 4747,
) -> dict[str, Any]:
    """Single paid H200 stage with a strict ten-minute kill boundary."""
    function_started = time.perf_counter()
    model_volume.reload()
    root = _ltx_snapshot()
    reference = Path("/models") / reference_relative.lstrip("/")
    output = Path("/models") / output_relative.lstrip("/")
    if not reference.is_file() or reference.stat().st_size < 20_000:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_REFERENCE_INVALID")
    output.parent.mkdir(parents=True, exist_ok=True)

    transformer = root / LTX_REQUIRED[0]
    text_encoder = root / LTX_REQUIRED[1]
    video_vae = root / LTX_REQUIRED[2]
    audio_vae = root / LTX_REQUIRED[3]
    frames = _ltx_frame_count(int(duration_seconds))
    command = [
        "python", "-m", "ltx_pipelines.ti2vid_one_stage",
        "--transformer-path", str(transformer),
        "--text-encoder-path", str(text_encoder),
        "--video-vae-path", str(video_vae),
        "--audio-vae-path", str(audio_vae),
        "--num-frames", str(frames),
        "--width", str(LTX_MASTER_WIDTH),
        "--height", str(LTX_MASTER_HEIGHT),
        "--frame-rate", str(LTX_FPS),
        "--seed", str(int(seed)),
        "--offload", "cpu",
        "--max-batch-size", "1",
        "--output-path", str(output),
        "--prompt", _ltx_prompt(instruction),
        "--negative-prompt", _ltx_negative_prompt(),
        "--image", str(reference), "0", "1.0", "0",
    ]
    env = os.environ.copy()
    env["PYTHONPATH"] = ":".join([
        str(LTX_PIPELINE_ROOT / "packages/ltx-core/src"),
        str(LTX_PIPELINE_ROOT / "packages/ltx-pipelines/src"),
        env.get("PYTHONPATH", ""),
    ])
    generation_started = time.perf_counter()
    try:
        completed = subprocess.run(
            command,
            cwd=str(LTX_PIPELINE_ROOT),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=SUBPROCESS_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        detail = _sanitize(getattr(exc, "stdout", "") or getattr(exc, "output", ""), 1200)
        raise RuntimeError(
            f"AVANTIQO_VIDEO_SCENE1_HARD_TIMEOUT:{SUBPROCESS_TIMEOUT_SECONDS}:{detail}"
        ) from exc
    generation_seconds = round(time.perf_counter() - generation_started, 3)
    if completed.returncode != 0:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_LTX25_MODAL_COMMAND_FAILED:{completed.returncode}:"
            f"{_sanitize(completed.stdout)}"
        )
    if not output.is_file() or output.stat().st_size <= 1_000_000:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_OUTPUT_INVALID")
    model_volume.commit()
    function_seconds = round(time.perf_counter() - function_started, 3)
    estimated_gpu_cost = round(function_seconds * H200_USD_PER_SECOND, 8)
    return {
        "success": True,
        "status": "completed",
        "contract": CONTRACT,
        "runtime_contract": LTX_RUNTIME_CONTRACT,
        "quality_contract": LTX_QUALITY_CONTRACT,
        "engine_contract": NATIVE_ENGINE_CONTRACT,
        "provider": "avantiqo-video",
        "model": "avantiqo-ltx-2.5",
        "foundation_model": LTX_SOURCE_REPO,
        "foundation_revision": LTX_SOURCE_REVISION,
        "pipeline": "TI2VID_ONE_STAGE_FULL_DEV_BF16",
        "precision": "BF16",
        "modal_gpu": GPU,
        "width": LTX_MASTER_WIDTH,
        "height": LTX_MASTER_HEIGHT,
        "fps": LTX_FPS,
        "frame_count": frames,
        "duration_seconds_requested": int(duration_seconds),
        "seed": int(seed),
        "output_relative": output_relative,
        "output_size_bytes": output.stat().st_size,
        "generation_seconds": generation_seconds,
        "modal_function_seconds": function_seconds,
        "supplier_gpu_rate_usd_per_second": H200_USD_PER_SECOND,
        "estimated_supplier_gpu_cost_usd": estimated_gpu_cost,
        "hard_timeout_seconds": HARD_TIMEOUT_SECONDS,
        "hard_gpu_cost_ceiling_usd": round(H200_USD_PER_SECOND * HARD_TIMEOUT_SECONDS, 6),
        "cost_measurement_basis": "MODAL_H200_RATE_X_FUNCTION_SECONDS_PRE_BILLING_RECONCILIATION",
        "native_master_generated": True,
        "master_is_exact_model_output": True,
        "pixel_upscale_used": False,
        "learned_latent_upsampler_used": False,
        "learned_spatial_upscaler_used": False,
        "distilled_lora_used": False,
        "resize_used": False,
        "crop_used": False,
        "preprocessing_inside_paid_worker": False,
        "ffprobe_inside_paid_worker": False,
        "runpod_inference_performed": False,
        "external_provider_contacted": False,
        "automatic_paid_retry": False,
        "raw_reasoning_persisted": False,
        "pipeline_stdout_tail": _sanitize(completed.stdout, 1200),
    }


@app.local_entrypoint()
def scene1_preflight() -> None:
    report = _local_preflight()
    print(json.dumps(report, indent=2), flush=True)
    print(f"{CONTRACT}_PREFLIGHT=PASS", flush=True)


@app.local_entrypoint()
def scene1_certify(
    output_path: str = "local-audit-output/avantiqo-video-scene1-modal/scene1-native-master-3840x2176.mp4",
) -> None:
    """Run exactly one paid Scene 1 after repeating the full zero-GPU gate."""
    report = _local_preflight()
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
    source_remote = f"scene1-proof/{run_id}/opening-frame.jpg"
    prepared_remote = f"scene1-proof/{run_id}/prepared-reference.png"
    output_remote = f"scene1-proof/{run_id}/native-master-3840x2176.mp4"

    with model_volume.batch_upload(force=True) as upload:
        upload.put_file(str(source), source_remote)

    try:
        prepared = prepare_scene1_reference.remote(source_remote, prepared_remote)
        if prepared.get("success") is not True:
            raise RuntimeError("AVANTIQO_VIDEO_SCENE1_MODAL_PREPARE_FAILED")

        cache = seed_ltx_cache.remote()
        if cache.get("success") is not True:
            raise RuntimeError("AVANTIQO_VIDEO_SCENE1_MODAL_CACHE_FAILED")

        # Re-check immediately before the one H200 request. CPU preparation/cache
        # work cannot excuse a duplicate or already-running paid generation.
        paid_stats = _modal_stats()
        print(json.dumps({
            "event": "AVANTIQO_VIDEO_SCENE1_PAID_GENERATION_START",
            "contract": CONTRACT,
            "gpu": GPU,
            "hard_timeout_seconds": HARD_TIMEOUT_SECONDS,
            "hard_gpu_cost_ceiling_usd": round(H200_USD_PER_SECOND * HARD_TIMEOUT_SECONDS, 6),
            "maximum_paid_gpu_jobs": 1,
            "automatic_paid_retry": False,
            "backlog": paid_stats["backlog"],
            "runners": paid_stats["num_total_runners"],
            "runpod_used": False,
            "production_deploy_performed": False,
        }, separators=(",", ":")), flush=True)

        result = generate_scene1_native_master.remote(
            prepared_remote,
            output_remote,
            SCENE1_PROMPT,
            5,
            4747,
        )
        if result.get("success") is not True:
            raise RuntimeError("AVANTIQO_VIDEO_SCENE1_MODAL_GENERATION_FAILED")
        if result.get("width") != 3840 or result.get("height") != 2176:
            raise RuntimeError("AVANTIQO_VIDEO_SCENE1_MODAL_DIMENSIONS_INVALID")
        if result.get("fps") != 24:
            raise RuntimeError("AVANTIQO_VIDEO_SCENE1_MODAL_FPS_INVALID")
        if result.get("pipeline") != "TI2VID_ONE_STAGE_FULL_DEV_BF16":
            raise RuntimeError("AVANTIQO_VIDEO_SCENE1_MODAL_PIPELINE_INVALID")
        for key in (
            "pixel_upscale_used",
            "learned_spatial_upscaler_used",
            "distilled_lora_used",
            "resize_used",
            "crop_used",
            "runpod_inference_performed",
            "external_provider_contacted",
        ):
            if result.get(key) is not False:
                raise RuntimeError(f"AVANTIQO_VIDEO_SCENE1_MODAL_NATIVE_CONTRACT_INVALID:{key}")

        with local_output.open("wb") as handle:
            for chunk in model_volume.read_file(output_remote):
                handle.write(chunk)
        if not local_output.is_file() or local_output.stat().st_size <= 1_000_000:
            raise RuntimeError("AVANTIQO_VIDEO_SCENE1_MODAL_LOCAL_OUTPUT_INVALID")

        probe = None
        ffprobe = shutil.which("ffprobe")
        if ffprobe:
            completed = subprocess.run(
                [
                    ffprobe,
                    "-v", "error",
                    "-select_streams", "v:0",
                    "-show_entries", "stream=width,height,r_frame_rate,codec_name,bit_rate",
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
                raise RuntimeError(
                    f"AVANTIQO_VIDEO_SCENE1_MODAL_FFPROBE_FAILED:{_sanitize(completed.stderr)}"
                )
            probe = json.loads(completed.stdout)
            stream = (probe.get("streams") or [{}])[0]
            if int(stream.get("width") or 0) != 3840 or int(stream.get("height") or 0) != 2176:
                raise RuntimeError("AVANTIQO_VIDEO_SCENE1_MODAL_FFPROBE_DIMENSIONS_INVALID")
            if _text(stream.get("r_frame_rate")) != "24/1":
                raise RuntimeError("AVANTIQO_VIDEO_SCENE1_MODAL_FFPROBE_FPS_INVALID")

        final_report = {
            **report,
            "phase": "COMPLETED",
            "paid_approval_observed": True,
            "cache": cache,
            "prepared_reference": prepared,
            "generation": result,
            "local_output": str(local_output),
            "post_gpu_probe": probe,
            "customer_charge_performed": False,
            "pricing_activation_performed": False,
            "provider_routing_activation_performed": False,
            "production_vercel_deploy_performed": False,
        }
        report_path.write_text(json.dumps(final_report, indent=2), encoding="utf-8")
        print(f"AVANTIQO_VIDEO_SCENE1_MODAL_OUTPUT={local_output}", flush=True)
        print(f"AVANTIQO_VIDEO_SCENE1_MODAL_REPORT={report_path}", flush=True)
        print(f"AVANTIQO_VIDEO_SCENE1_ESTIMATED_SUPPLIER_GPU_COST_USD={result['estimated_supplier_gpu_cost_usd']}", flush=True)
        print(f"{CONTRACT}=PASS", flush=True)
    finally:
        for remote in (source_remote, prepared_remote, output_remote):
            try:
                model_volume.remove_file(remote)
            except Exception:
                pass
