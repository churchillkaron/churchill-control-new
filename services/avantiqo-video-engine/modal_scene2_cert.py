"""Governed HQ Scene 2 certification for the canonical Avantiqo Video Modal lane.

Scene 2 is the founder-origin continuation after the approved HQ opening. This
wrapper deliberately leaves the proven B200 native renderer untouched. CPU-side
work resolves the already-approved founder-origin source clip, extracts one
reference frame without resizing/cropping, verifies the premium GPU function is
idle, then invokes exactly one native 3840x2176 LTX-2.5 full-dev BF16 render.

No production deployment, pricing activation, wallet mutation, provider routing,
RunPod inference, pixel upscale, latent/spatial upscale, interpolation, grading or
assembly is performed here.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import urllib.request
import uuid
from pathlib import Path
from typing import Any

from modal_app import (
    LTX_FPS,
    LTX_GPU,
    LTX_GPU_USD_PER_SECOND,
    LTX_HARD_TIMEOUT_SECONDS,
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

CONTRACT = "AVANTIQO_VIDEO_SCENE2_MODAL_CERTIFICATION_V1"
APPROVAL_ENV = "AVANTIQO_VIDEO_SCENE2_REAL_INFERENCE_APPROVED"
SOURCE_URL_ENV = "AVANTIQO_VIDEO_SCENE2_SOURCE_URL"
SOURCE_SHA256_ENV = "AVANTIQO_VIDEO_SCENE2_SOURCE_SHA256"
REFERENCE_TIME_ENV = "AVANTIQO_VIDEO_SCENE2_REFERENCE_TIME_SECONDS"
MAX_GPU_COST_ENV = "AVANTIQO_VIDEO_SCENE2_MAX_SUPPLIER_GPU_COST_USD"
DEFAULT_MAX_SUPPLIER_GPU_COST_USD = 3.25
DURATION_SECONDS = 5
SEED = 7202

SCENE2_PROMPT = (
    "Premium cinematic founder-origin shot immediately following the approved dawn opening. "
    "Preserve the exact founder identity, facial structure, age, hair, wardrobe, skin tone, lens perspective, room geometry and lighting from the supplied approved reference frame. "
    "The founder is calm and credible, with restrained natural breathing, subtle eye movement and small physically plausible head and shoulder motion. "
    "Use a slow stabilized cinematic push-in with gentle parallax and shallow natural depth, maintaining face consistency throughout. "
    "Lighting remains premium, realistic and understated; no artificial beauty filter, no plastic skin, no morphing, no duplicated features, no warped hands, no sudden camera movement, no added text, logos or subtitles. "
    "The result must feel like a world-class New York commercial portrait and continue seamlessly from Scene 1 in visual seriousness and finish."
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


def _cost_preflight() -> dict[str, Any]:
    maximum = _finite(os.environ.get(MAX_GPU_COST_ENV), DEFAULT_MAX_SUPPLIER_GPU_COST_USD)
    ceiling = LTX_GPU_USD_PER_SECOND * LTX_HARD_TIMEOUT_SECONDS
    if ceiling > maximum:
        raise RuntimeError(f"{CONTRACT}_SUPPLIER_COST_CEILING_EXCEEDED:{ceiling:.6f}:{maximum:.6f}")
    return {
        "gpu": LTX_GPU,
        "supplier_gpu_rate_usd_per_second": LTX_GPU_USD_PER_SECOND,
        "hard_timeout_seconds": LTX_HARD_TIMEOUT_SECONDS,
        "hard_gpu_cost_ceiling_usd": round(ceiling, 6),
        "approved_supplier_gpu_cost_budget_usd": round(maximum, 6),
        "maximum_paid_gpu_jobs": 1,
        "automatic_paid_retry": False,
    }


def _download_source(url: str, target: Path) -> dict[str, Any]:
    if not url.startswith("https://"):
        raise RuntimeError(f"{CONTRACT}_HTTPS_SOURCE_URL_REQUIRED")
    request = urllib.request.Request(url, headers={"User-Agent": "avantiqo-video-scene2-cert/1"})
    with urllib.request.urlopen(request, timeout=300) as response, target.open("wb") as handle:  # noqa: S310
        digest = hashlib.sha256()
        total = 0
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > 500 * 1024 * 1024:
                raise RuntimeError(f"{CONTRACT}_SOURCE_TOO_LARGE")
            digest.update(chunk)
            handle.write(chunk)
    if total < 1_000_000:
        raise RuntimeError(f"{CONTRACT}_SOURCE_TOO_SMALL:{total}")
    actual = digest.hexdigest()
    expected = _text(os.environ.get(SOURCE_SHA256_ENV)).lower()
    if expected and actual != expected:
        raise RuntimeError(f"{CONTRACT}_SOURCE_DIGEST_INVALID:{actual}:{expected}")
    return {"bytes": total, "sha256": actual, "digest_pinned": bool(expected)}


def _extract_reference(source: Path, target: Path) -> dict[str, Any]:
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise RuntimeError(f"{CONTRACT}_FFMPEG_REQUIRED")
    timestamp = _finite(os.environ.get(REFERENCE_TIME_ENV), 0.25)
    if timestamp < 0 or timestamp > 60:
        raise RuntimeError(f"{CONTRACT}_REFERENCE_TIME_INVALID:{timestamp}")
    command = [
        ffmpeg, "-y", "-ss", f"{timestamp:.3f}", "-i", str(source),
        "-frames:v", "1", "-q:v", "1", str(target),
    ]
    completed = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120, check=False)
    if completed.returncode != 0 or not target.is_file() or target.stat().st_size < 20_000:
        raise RuntimeError(f"{CONTRACT}_REFERENCE_EXTRACTION_FAILED:{completed.stderr[-500:]}")
    probe = subprocess.run(
        [ffprobe, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", str(target)],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=30, check=False,
    )
    if probe.returncode != 0:
        raise RuntimeError(f"{CONTRACT}_REFERENCE_PROBE_FAILED:{probe.stderr[-500:]}")
    data = json.loads(probe.stdout)
    stream = (data.get("streams") or [{}])[0]
    width = int(stream.get("width") or 0)
    height = int(stream.get("height") or 0)
    if width <= 0 or height <= 0:
        raise RuntimeError(f"{CONTRACT}_REFERENCE_DIMENSIONS_INVALID")
    return {
        "bytes": target.stat().st_size,
        "width": width,
        "height": height,
        "timestamp_seconds": timestamp,
        "crop": False,
        "resize": False,
    }


def _validate_native_result(result: dict[str, Any]) -> None:
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
        "automatic_paid_retry": False,
        "runpod_inference_performed": False,
        "external_provider_contacted": False,
    }
    for key, expected in required.items():
        if result.get(key) != expected:
            raise RuntimeError(f"{CONTRACT}_NATIVE_RESULT_INVALID:{key}:{result.get(key)!r}:{expected!r}")


@app.local_entrypoint()
def scene2_preflight() -> None:
    source_url = _text(os.environ.get(SOURCE_URL_ENV))
    if not source_url.startswith("https://"):
        raise RuntimeError(f"{SOURCE_URL_ENV}=HTTPS_URL_REQUIRED")
    print(json.dumps({
        "success": True,
        "contract": CONTRACT,
        "scene": 2,
        "story_beat": "founder-origin",
        "source_url_present": True,
        "source_digest_pinned": bool(_text(os.environ.get(SOURCE_SHA256_ENV))),
        "idle": _require_idle(),
        "cost": _cost_preflight(),
        "generation": {
            "foundation_revision": LTX_SOURCE_REVISION,
            "pipeline": "TI2VID_ONE_STAGE_FULL_DEV_BF16",
            "precision": "BF16",
            "quantization": "NONE",
            "width": LTX_MASTER_WIDTH,
            "height": LTX_MASTER_HEIGHT,
            "fps": LTX_FPS,
            "num_inference_steps": LTX_NUM_INFERENCE_STEPS,
            "duration_seconds": DURATION_SECONDS,
            "seed": SEED,
            "pixel_upscale": False,
            "temporal_interpolation": False,
        },
        "maximum_paid_gpu_jobs": 1,
        "automatic_paid_retry": False,
        "production_vercel_deploy_performed": False,
        "provider_routing_activation_performed": False,
        "pricing_activation_performed": False,
        "customer_wallet_mutation_performed": False,
        "gpu_requested": False,
    }, indent=2), flush=True)
    print(f"{CONTRACT}_PREFLIGHT=PASS", flush=True)


@app.local_entrypoint()
def scene2_certify(output_path: str = "local-audit-output/avantiqo-video-scene2-modal/scene2-native-master-3840x2176.mp4") -> None:
    if not _yes(os.environ.get(APPROVAL_ENV)):
        raise RuntimeError(f"{APPROVAL_ENV}=YES_REQUIRED")
    source_url = _text(os.environ.get(SOURCE_URL_ENV))
    if not source_url.startswith("https://"):
        raise RuntimeError(f"{SOURCE_URL_ENV}=HTTPS_URL_REQUIRED")
    _cost_preflight()
    idle_before_staging = _require_idle()
    cache = seed_ltx_cache.remote()
    if cache.get("success") is not True or cache.get("revision") != LTX_SOURCE_REVISION:
        raise RuntimeError(f"{CONTRACT}_PINNED_CACHE_INVALID")

    output = Path(output_path).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="avantiqo-scene2-") as temp_dir:
        temp = Path(temp_dir)
        source = temp / "founder-origin.mp4"
        reference = temp / "scene2-reference.jpg"
        source_evidence = _download_source(source_url, source)
        reference_evidence = _extract_reference(source, reference)
        idle_immediately_before_paid_call = _require_idle()

        run_id = uuid.uuid4().hex[:16]
        reference_remote = f"scene2-cert/{run_id}/reference.jpg"
        output_remote = f"scene2-cert/{run_id}/native-master-3840x2176.mp4"
        with model_volume.batch_upload(force=True) as upload:
            upload.put_file(str(reference), reference_remote)
        try:
            print(json.dumps({
                "event": "AVANTIQO_VIDEO_SCENE2_PAID_GENERATION_START",
                "contract": CONTRACT,
                "gpu": LTX_GPU,
                "duration_seconds": DURATION_SECONDS,
                "maximum_paid_gpu_jobs": 1,
                "automatic_paid_retry": False,
                "idle_before_staging": idle_before_staging,
                "idle_immediately_before_paid_call": idle_immediately_before_paid_call,
            }, separators=(",", ":")), flush=True)
            result = generate_native_master.remote(
                reference_remote,
                output_remote,
                SCENE2_PROMPT,
                DURATION_SECONDS,
                SEED,
            )
            if not isinstance(result, dict):
                raise RuntimeError(f"{CONTRACT}_RESULT_OBJECT_REQUIRED")
            _validate_native_result(result)
            with output.open("wb") as handle:
                for chunk in model_volume.read_file(output_remote):
                    handle.write(chunk)
            if not output.is_file() or output.stat().st_size <= 1_000_000:
                raise RuntimeError(f"{CONTRACT}_LOCAL_OUTPUT_INVALID")
            report = {
                "success": True,
                "contract": CONTRACT,
                "scene": 2,
                "story_beat": "founder-origin",
                "source": source_evidence,
                "reference": reference_evidence,
                "generation": result,
                "output": str(output),
                "production_vercel_deploy_performed": False,
                "provider_routing_activation_performed": False,
                "pricing_activation_performed": False,
                "customer_wallet_mutation_performed": False,
            }
            output.with_suffix(".json").write_text(json.dumps(report, indent=2), encoding="utf-8")
            print(f"AVANTIQO_VIDEO_SCENE2_OUTPUT={output}", flush=True)
            print(f"{CONTRACT}=PASS", flush=True)
        finally:
            for remote in (reference_remote, output_remote):
                try:
                    model_volume.remove_file(remote)
                except Exception:
                    pass
