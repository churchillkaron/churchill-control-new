"""Governed Scene 1 certification for the canonical Avantiqo Video Modal lane.

There is deliberately no certification-specific GPU function here. The only
premium paid GPU path is modal_app.generate_native_master. This module performs
zero-GPU governance/preflight, uploads the already Studio-approved reference,
seeds/verifies the single Video model Volume on CPU, invokes exactly one native
B200 generation, downloads the untouched model output, and validates it locally.

No crop, resize, spatial/latent upscaling, interpolation, grading, assembly or
other delivery work is allowed inside the paid generation boundary.
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
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from modal_app import (
    APP_NAME,
    LTX_FPS,
    LTX_GPU,
    LTX_GPU_USD_PER_SECOND,
    LTX_HARD_TIMEOUT_SECONDS,
    LTX_MASTER_HEIGHT,
    LTX_MASTER_WIDTH,
    LTX_NUM_INFERENCE_STEPS,
    LTX_QUALITY_CONTRACT,
    LTX_RUNTIME_CONTRACT,
    LTX_SOURCE_REPO,
    LTX_SOURCE_REVISION,
    NATIVE_ENGINE_CONTRACT,
    _sanitize,
    generate_native_master,
    model_volume,
    seed_ltx_cache,
)

CONTRACT = "AVANTIQO_VIDEO_SCENE1_MODAL_CERTIFICATION_V2"
DEFAULT_MAX_SUPPLIER_GPU_COST_USD = 3.25
APPROVAL_ENV = "AVANTIQO_VIDEO_SCENE1_REAL_INFERENCE_APPROVED"
SOURCE_ENV = "AVANTIQO_VIDEO_SCENE1_SOURCE_FRAME"
ENV_FILE_ENV = "AVANTIQO_VIDEO_SCENE1_ENV_FILE"
CANONICAL_SOURCE_RELATIVE = "assets/video/proofs/avantiqo_first_shot_frame_transport.jpg"
CANONICAL_SOURCE_BYTES = 31376
CANONICAL_SOURCE_SHA256 = "cbf4437d77f74b2fd0193f9039ef64c511b597712fe08c466c30d4c231aeb0c5"
SUPABASE_DEFAULT_URL = "https://vfsjqabpkcbiuerhzugk.supabase.co"

SCENE1_PROMPT = (
    "A premium stabilized aerial push toward the dawn city skyline with a subtle controlled descent. "
    "Keep the architecture, skyline geometry and perspective coherent with the supplied opening frame. "
    "Natural pre-sunrise light slowly develops, with restrained realistic cloud movement, subtle water and traffic motion, "
    "physically plausible atmospheric depth, no artificial timelapse, no sudden camera movement, no morphing, no fantasy elements. "
    "The shot should feel like the opening of a world-class New York commercial film."
)


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
    return {**_load_dotenv(path), **{key: value for key, value in os.environ.items() if value}}


def _rest_rows(table: str, params: dict[str, str], env: dict[str, str]) -> list[dict[str, Any]]:
    service_key = _text(env.get("SUPABASE_SERVICE_ROLE_KEY"))
    if not service_key:
        raise RuntimeError(f"{CONTRACT}_SUPABASE_SERVICE_ROLE_KEY_REQUIRED")
    base_url = _text(env.get("NEXT_PUBLIC_SUPABASE_URL")) or SUPABASE_DEFAULT_URL
    request = Request(
        f"{base_url.rstrip('/')}/rest/v1/{table}?{urlencode(params)}",
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
    return {
        "bytes": len(raw),
        "sha256": digest,
        "studio_reference_accepted_without_modal_preprocessing": True,
    }


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
            "production_routing_allowed": metadata.get("production_routing_allowed"),
        },
        "customer_charge_planned": False,
        "customer_wallet_mutation_planned": False,
        "pricing_activation_planned": False,
    }


def _modal_stats() -> dict[str, int]:
    stats = generate_native_master.get_current_stats()
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
    ceiling = LTX_GPU_USD_PER_SECOND * LTX_HARD_TIMEOUT_SECONDS
    if ceiling > maximum:
        raise RuntimeError(
            f"{CONTRACT}_SUPPLIER_COST_CEILING_EXCEEDED:{ceiling:.6f}:{maximum:.6f}"
        )
    return {
        "gpu": LTX_GPU,
        "supplier_gpu_rate_usd_per_second": LTX_GPU_USD_PER_SECOND,
        "hard_timeout_seconds": LTX_HARD_TIMEOUT_SECONDS,
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
            "function": "generate_native_master",
            "single_premium_gpu_function": True,
            "scale_to_zero": True,
            "min_gpu_containers": 0,
            "max_gpu_containers": 1,
            "scaledown_window_seconds": 5,
            **modal_stats,
        },
        "model": {
            "foundation": LTX_SOURCE_REPO,
            "revision": LTX_SOURCE_REVISION,
            "pipeline": "TI2VID_ONE_STAGE_FULL_DEV_BF16",
            "precision": "BF16",
            "quantization": "NONE",
            "width": LTX_MASTER_WIDTH,
            "height": LTX_MASTER_HEIGHT,
            "fps": LTX_FPS,
            "num_inference_steps": LTX_NUM_INFERENCE_STEPS,
            "duration_seconds": 5,
        },
        "gpu_boundary": {
            "generation_only": True,
            "reference_preprocessing": False,
            "crop": False,
            "resize": False,
            "spatial_upscale": False,
            "latent_upscale": False,
            "temporal_interpolation": False,
            "grading": False,
            "assembly": False,
            "delivery_transform": False,
        },
        "cost": cost,
        "runpod_used": False,
        "external_provider_fallback_allowed": False,
        "gpu_requested": False,
        "gpu_inference_performed": False,
        "production_vercel_deploy_performed": False,
        "secrets_printed": False,
    }


def _validate_native_result(result: dict[str, Any]) -> None:
    required_equal = {
        "success": True,
        "contract": LTX_RUNTIME_CONTRACT,
        "quality_contract": LTX_QUALITY_CONTRACT,
        "engine_contract": NATIVE_ENGINE_CONTRACT,
        "foundation_revision": LTX_SOURCE_REVISION,
        "pipeline": "TI2VID_ONE_STAGE_FULL_DEV_BF16",
        "precision": "BF16",
        "quantization": "NONE",
        "modal_gpu": LTX_GPU,
        "width": LTX_MASTER_WIDTH,
        "height": LTX_MASTER_HEIGHT,
        "fps": LTX_FPS,
        "num_inference_steps": LTX_NUM_INFERENCE_STEPS,
        "native_master_generated": True,
        "master_is_exact_model_output": True,
        "model_cpu_offload_used": False,
        "studio_reference_required": True,
    }
    for key, expected in required_equal.items():
        if result.get(key) != expected:
            raise RuntimeError(
                f"{CONTRACT}_NATIVE_RESULT_INVALID:{key}:{result.get(key)!r}:{expected!r}"
            )

    forbidden_true = (
        "pixel_upscale_used",
        "learned_latent_upsampler_used",
        "learned_spatial_upscaler_used",
        "temporal_interpolation_used",
        "distilled_transformer_used",
        "distilled_lora_used",
        "resize_used",
        "crop_used",
        "grading_used",
        "assembly_used",
        "delivery_transform_used",
        "reference_preprocessing_inside_paid_worker",
        "ffprobe_inside_paid_worker",
        "runpod_inference_performed",
        "external_provider_contacted",
        "automatic_paid_retry",
    )
    for key in forbidden_true:
        if result.get(key) is not False:
            raise RuntimeError(f"{CONTRACT}_FORBIDDEN_GPU_OPERATION:{key}")


@app.local_entrypoint()
def scene1_preflight() -> None:
    report = _local_preflight()
    print(json.dumps(report, indent=2), flush=True)
    print(f"{CONTRACT}_PREFLIGHT=PASS", flush=True)


@app.local_entrypoint()
def scene1_certify(
    output_path: str = "local-audit-output/avantiqo-video-scene1-modal/scene1-native-master-3840x2176.mp4",
) -> None:
    """Run exactly one canonical paid B200 native-master generation."""
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
    reference_remote = f"scene1-proof/{run_id}/studio-approved-reference.jpg"
    output_remote = f"scene1-proof/{run_id}/native-master-3840x2176.mp4"

    with model_volume.batch_upload(force=True) as upload:
        upload.put_file(str(source), reference_remote)

    try:
        cache = seed_ltx_cache.remote()
        if cache.get("success") is not True:
            raise RuntimeError(f"{CONTRACT}_CACHE_FAILED")
        if cache.get("revision") != LTX_SOURCE_REVISION:
            raise RuntimeError(f"{CONTRACT}_PINNED_CACHE_REVISION_INVALID")

        # CPU cache work may take time; repeat the duplicate guard immediately
        # before the one paid B200 request.
        paid_stats = _modal_stats()
        print(json.dumps({
            "event": "AVANTIQO_VIDEO_SCENE1_PAID_GENERATION_START",
            "contract": CONTRACT,
            "function": "generate_native_master",
            "gpu": LTX_GPU,
            "hard_timeout_seconds": LTX_HARD_TIMEOUT_SECONDS,
            "hard_gpu_cost_ceiling_usd": round(
                LTX_GPU_USD_PER_SECOND * LTX_HARD_TIMEOUT_SECONDS, 6
            ),
            "maximum_paid_gpu_jobs": 1,
            "automatic_paid_retry": False,
            "generation_only_gpu_boundary": True,
            "backlog": paid_stats["backlog"],
            "runners": paid_stats["num_total_runners"],
            "runpod_used": False,
            "production_deploy_performed": False,
        }, separators=(",", ":")), flush=True)

        result = generate_native_master.remote(
            reference_remote,
            output_remote,
            SCENE1_PROMPT,
            5,
            4747,
        )
        if not isinstance(result, dict):
            raise RuntimeError(f"{CONTRACT}_RESULT_OBJECT_REQUIRED")
        _validate_native_result(result)

        with local_output.open("wb") as handle:
            for chunk in model_volume.read_file(output_remote):
                handle.write(chunk)
        if not local_output.is_file() or local_output.stat().st_size <= 1_000_000:
            raise RuntimeError(f"{CONTRACT}_LOCAL_OUTPUT_INVALID")

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
                    f"{CONTRACT}_LOCAL_FFPROBE_FAILED:{_sanitize(completed.stderr)}"
                )
            probe = json.loads(completed.stdout)
            stream = (probe.get("streams") or [{}])[0]
            if int(stream.get("width") or 0) != LTX_MASTER_WIDTH:
                raise RuntimeError(f"{CONTRACT}_LOCAL_WIDTH_INVALID")
            if int(stream.get("height") or 0) != LTX_MASTER_HEIGHT:
                raise RuntimeError(f"{CONTRACT}_LOCAL_HEIGHT_INVALID")
            if _text(stream.get("r_frame_rate")) != f"{LTX_FPS}/1":
                raise RuntimeError(f"{CONTRACT}_LOCAL_FPS_INVALID")

        final_report = {
            **report,
            "phase": "COMPLETED",
            "paid_approval_observed": True,
            "cache": cache,
            "generation": result,
            "local_output": str(local_output),
            "post_gpu_local_probe": probe,
            "customer_charge_performed": False,
            "pricing_activation_performed": False,
            "provider_routing_activation_performed": False,
            "production_vercel_deploy_performed": False,
        }
        report_path.write_text(json.dumps(final_report, indent=2), encoding="utf-8")
        print(f"AVANTIQO_VIDEO_SCENE1_MODAL_OUTPUT={local_output}", flush=True)
        print(f"AVANTIQO_VIDEO_SCENE1_MODAL_REPORT={report_path}", flush=True)
        print(
            "AVANTIQO_VIDEO_SCENE1_ESTIMATED_SUPPLIER_GPU_COST_USD="
            f"{result['estimated_supplier_gpu_cost_usd']}",
            flush=True,
        )
        print(f"{CONTRACT}=PASS", flush=True)
    finally:
        for remote in (reference_remote, output_remote):
            try:
                model_volume.remove_file(remote)
            except Exception:
                pass
