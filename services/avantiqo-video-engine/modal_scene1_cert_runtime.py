"""Symlink-safe Scene 1 certification for Avantiqo Video on Modal.

Hugging Face cache snapshot entries retain the canonical `.safetensors`
filenames as symlinks into hash-named blob files. LTX-2's CLI path type calls
`Path.resolve()`, which follows those symlinks and strips the filename suffix.
The Gemma single-file loader then rejects the hash-named resolved blob.

This lane fixes only that normalization boundary. It leaves the exact cached
model files untouched and runs the official LTX pipeline through a tiny wrapper
that preserves absolute paths without resolving symlinks. A CPU-only gate first
opens all four safetensors files and exercises the Gemma single-file loader on
the exact preserved text-encoder path. No hardlinks, copies, second Volume,
second app, RunPod fallback, customer charge, pricing activation, or automatic
paid retry are allowed.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

from modal_scene1_cert import (
    APP_NAME,
    APPROVAL_ENV,
    CERT_LTX_WORKER_IMAGE,
    CONTRACT,
    GPU,
    HARD_TIMEOUT_SECONDS,
    H200_USD_PER_SECOND,
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
    SUBPROCESS_TIMEOUT_SECONDS,
    _local_preflight,
    _ltx_frame_count,
    _ltx_negative_prompt,
    _ltx_prompt,
    _ltx_snapshot,
    _sanitize,
    _source_path,
    _text,
    _yes,
    app,
    generate_scene1_native_master as previous_generate_scene1_native_master,
    model_volume,
    prepare_scene1_reference,
    seed_ltx_cache,
)

RUNTIME_CONTRACT = "AVANTIQO_VIDEO_LTX25_MODAL_SYMLINK_SAFE_PATHS_V2"

# The remote module imports modal_scene1_cert.py, which imports modal_app.py.
# Package that source dependency only; this does not create another app/Volume.
RUNTIME_WORKER_IMAGE = CERT_LTX_WORKER_IMAGE.add_local_file(
    Path(__file__).with_name("modal_scene1_cert.py"),
    "/root/modal_scene1_cert.py",
)


def _component_key(relative: str) -> str:
    if relative.startswith("diffusion_models/"):
        return "transformer"
    if relative.startswith("text_encoders/"):
        return "text_encoder"
    if relative.startswith("vae/ltx-2.5-video"):
        return "video_vae"
    if relative.startswith("vae/ltx-2.5-audio"):
        return "audio_vae"
    raise RuntimeError(f"{RUNTIME_CONTRACT}_UNKNOWN_COMPONENT:{relative}")


def _preserve_existing_path(path: str | Path) -> str:
    """Make a path absolute without resolving symlinks, then require existence."""
    expanded = Path(path).expanduser()
    absolute = Path(os.path.abspath(str(expanded)))
    if not absolute.exists():
        raise argparse.ArgumentError(None, f"Path not found: {absolute}")
    return absolute.as_posix()


def _snapshot_component_paths() -> dict[str, Any]:
    snapshot = _ltx_snapshot()
    paths: dict[str, str] = {}
    components: dict[str, Any] = {}
    for relative in LTX_REQUIRED:
        source = snapshot / relative
        if not source.is_file() or source.stat().st_size <= 0:
            raise RuntimeError(f"{RUNTIME_CONTRACT}_SOURCE_INVALID:{relative}")
        preserved = _preserve_existing_path(source)
        key = _component_key(relative)
        if Path(preserved).suffix != ".safetensors":
            raise RuntimeError(f"{RUNTIME_CONTRACT}_PRESERVED_SUFFIX_INVALID:{key}:{preserved}")
        paths[key] = preserved
        resolved = source.resolve()
        components[key] = {
            "filename": source.name,
            "bytes": source.stat().st_size,
            "snapshot_entry_is_symlink": source.is_symlink(),
            "preserved_suffix": Path(preserved).suffix,
            "resolved_blob_filename": resolved.name,
            "resolved_blob_suffix": resolved.suffix,
            "same_underlying_file": os.path.samefile(source, resolved),
        }
    return {
        "success": True,
        "contract": RUNTIME_CONTRACT,
        "revision": LTX_SOURCE_REVISION,
        "modal_volume": "avantiqo-video-models",
        "paths": paths,
        "components": components,
        "hardlinks_created": False,
        "model_bytes_copied": False,
        "duplicate_model_storage_created": False,
        "second_volume_created": False,
        "snapshot_mutated": False,
    }


def _install_ltx_python_paths() -> None:
    for path in (
        LTX_PIPELINE_ROOT / "packages/ltx-core/src",
        LTX_PIPELINE_ROOT / "packages/ltx-pipelines/src",
    ):
        value = str(path)
        if value not in sys.path:
            sys.path.insert(0, value)


def _validate_preserved_paths(runtime: dict[str, Any]) -> dict[str, Any]:
    """CPU-only: validate exact files and Gemma loading without GPU allocation."""
    _install_ltx_python_paths()
    from ltx_core.text_encoders.gemma.encoders.encoder_configurator import gemma_model_type
    from ltx_core.text_encoders.gemma.gemma_assets import GemmaAssets
    from safetensors import safe_open

    headers: dict[str, Any] = {}
    for key, supplied in runtime["paths"].items():
        preserved = _preserve_existing_path(supplied)
        if preserved != supplied:
            raise RuntimeError(f"{RUNTIME_CONTRACT}_PRESERVED_PATH_CHANGED:{key}")
        path = Path(preserved)
        if path.suffix != ".safetensors" or not path.is_file():
            raise RuntimeError(f"{RUNTIME_CONTRACT}_PRESERVED_FILE_INVALID:{key}:{preserved}")
        with safe_open(preserved, framework="pt", device="cpu") as handle:
            keys = handle.keys()
            headers[key] = {
                "key_count": len(keys),
                "metadata_present": bool(handle.metadata()),
            }

    text_encoder = runtime["paths"]["text_encoder"]
    # This is the exact loader that failed after the old CLI resolved the symlink.
    assets = GemmaAssets.load(text_encoder)
    gemma_type = _text(gemma_model_type(text_encoder))
    if not gemma_type:
        raise RuntimeError(f"{RUNTIME_CONTRACT}_GEMMA_MODEL_TYPE_EMPTY")
    if not assets.weight_paths:
        raise RuntimeError(f"{RUNTIME_CONTRACT}_GEMMA_WEIGHT_PATHS_EMPTY")

    return {
        "success": True,
        "symlink_resolution_bypassed": True,
        "preserved_paths_keep_safetensors_suffix": True,
        "gemma_loader_preflight": "PASS",
        "gemma_model_type": gemma_type,
        "gemma_weight_path_count": len(assets.weight_paths),
        "safetensor_headers": headers,
        "hardlinks_created": False,
        "model_bytes_copied": False,
        "gpu_requested": False,
        "gpu_inference_performed": False,
    }


def _ltx_cli_wrapper_source() -> str:
    """Patch only LTX CLI path normalization; keep the official pipeline main()."""
    return r'''from __future__ import annotations
import argparse
import os
from pathlib import Path
import ltx_pipelines.utils.args as ltx_args


def preserve_existing_path(path: str) -> str:
    expanded = Path(path).expanduser()
    absolute = Path(os.path.abspath(str(expanded)))
    if not absolute.exists():
        raise argparse.ArgumentError(None, f"Path not found: {absolute}")
    return absolute.as_posix()


def preserve_path(path: str) -> str:
    expanded = Path(path).expanduser()
    return Path(os.path.abspath(str(expanded))).as_posix()

# default_1_stage_arg_parser resolves these globals when it constructs argparse
# actions. Replacing them before importing the pipeline preserves HF snapshot
# symlink filenames while leaving all other official LTX behavior unchanged.
ltx_args.resolve_path = preserve_path
ltx_args.resolve_existing_path = preserve_existing_path

from ltx_pipelines import ti2vid_one_stage

ti2vid_one_stage.main()
'''


@app.function(
    image=RUNTIME_WORKER_IMAGE,
    volumes={"/models": model_volume},
    timeout=5 * 60,
    min_containers=0,
    max_containers=1,
    scaledown_window=5,
)
def prepare_and_validate_ltx_runtime_paths() -> dict[str, Any]:
    """CPU-only exact-runtime file-format gate. No H200 is allocated."""
    model_volume.reload()
    runtime = _snapshot_component_paths()
    validation = _validate_preserved_paths(runtime)
    return {
        **runtime,
        "validation": validation,
        "gpu_requested": False,
        "gpu_inference_performed": False,
        "runpod_used": False,
    }


def _function_stats(function: Any) -> dict[str, int]:
    stats = function.get_current_stats()
    return {
        "backlog": int(getattr(stats, "backlog", 0) or 0),
        "runners": int(getattr(stats, "num_total_runners", 0) or 0),
        "running_inputs": int(getattr(stats, "num_running_inputs", 0) or 0),
    }


def _require_all_gpu_idle() -> dict[str, Any]:
    previous = _function_stats(previous_generate_scene1_native_master)
    current = _function_stats(generate_scene1_native_master_resolved)
    for name, stats in (("previous", previous), ("symlink_safe", current)):
        if stats["backlog"] != 0 or stats["runners"] != 0 or stats["running_inputs"] != 0:
            raise RuntimeError(
                f"{CONTRACT}_DUPLICATE_GPU_GUARD_ACTIVE:{name}:"
                f"{stats['backlog']}:{stats['runners']}:{stats['running_inputs']}"
            )
    return {"previous_lane": previous, "symlink_safe_lane": current}


def _runtime_preflight() -> dict[str, Any]:
    base = _local_preflight()
    idle = _require_all_gpu_idle()
    runtime = prepare_and_validate_ltx_runtime_paths.remote()
    validation = runtime.get("validation", {})
    if runtime.get("success") is not True or validation.get("gemma_loader_preflight") != "PASS":
        raise RuntimeError(f"{RUNTIME_CONTRACT}_CPU_PREFLIGHT_FAILED")
    idle_after = _require_all_gpu_idle()
    return {
        **base,
        "runtime_path_contract": runtime,
        "gpu_idle_before_runtime_check": idle,
        "gpu_idle_after_runtime_check": idle_after,
        "gpu_requested": False,
        "gpu_inference_performed": False,
    }


@app.function(
    image=RUNTIME_WORKER_IMAGE,
    gpu=GPU,
    volumes={"/models": model_volume},
    timeout=HARD_TIMEOUT_SECONDS,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=5,
    retries=0,
)
def generate_scene1_native_master_resolved(
    reference_relative: str,
    output_relative: str,
    instruction: str,
    duration_seconds: int = 5,
    seed: int = 4747,
) -> dict[str, Any]:
    """One H200 job using the untouched HF snapshot symlink filenames."""
    function_started = time.perf_counter()
    model_volume.reload()
    runtime = _snapshot_component_paths()
    paths = runtime["paths"]

    reference = Path("/models") / reference_relative.lstrip("/")
    output = Path("/models") / output_relative.lstrip("/")
    if not reference.is_file() or reference.stat().st_size < 20_000:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_REFERENCE_INVALID")
    output.parent.mkdir(parents=True, exist_ok=True)

    frames = _ltx_frame_count(int(duration_seconds))
    wrapper_path = Path(tempfile.gettempdir()) / f"avantiqo-ltx-cli-{uuid.uuid4().hex}.py"
    wrapper_path.write_text(_ltx_cli_wrapper_source(), encoding="utf-8")
    command = [
        "python", str(wrapper_path),
        "--transformer-path", paths["transformer"],
        "--text-encoder-path", paths["text_encoder"],
        "--video-vae-path", paths["video_vae"],
        "--audio-vae-path", paths["audio_vae"],
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
    finally:
        wrapper_path.unlink(missing_ok=True)

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
        "runtime_path_contract": RUNTIME_CONTRACT,
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
        "checkpoint_symlink_resolution_bypassed": True,
        "hardlinks_created": False,
        "model_bytes_copied": False,
        "duplicate_model_storage_created": False,
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
def scene1_runtime_preflight() -> None:
    report = _runtime_preflight()
    print(json.dumps(report, indent=2), flush=True)
    print(f"{RUNTIME_CONTRACT}_PREFLIGHT=PASS", flush=True)


@app.local_entrypoint()
def scene1_certify_resolved(
    output_path: str = "local-audit-output/avantiqo-video-scene1-modal/scene1-native-master-3840x2176.mp4",
) -> None:
    """Run exactly one H200 only after the symlink-safe CPU gate passes."""
    report = _runtime_preflight()
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
        runtime = prepare_and_validate_ltx_runtime_paths.remote()
        validation = runtime.get("validation", {})
        if validation.get("gemma_loader_preflight") != "PASS":
            raise RuntimeError(f"{RUNTIME_CONTRACT}_FINAL_CPU_GATE_FAILED")

        idle = _require_all_gpu_idle()
        print(json.dumps({
            "event": "AVANTIQO_VIDEO_SCENE1_PAID_GENERATION_START",
            "contract": CONTRACT,
            "runtime_path_contract": RUNTIME_CONTRACT,
            "gpu": GPU,
            "hard_timeout_seconds": HARD_TIMEOUT_SECONDS,
            "hard_gpu_cost_ceiling_usd": round(H200_USD_PER_SECOND * HARD_TIMEOUT_SECONDS, 6),
            "maximum_paid_gpu_jobs": 1,
            "automatic_paid_retry": False,
            "gpu_idle": idle,
            "checkpoint_paths_cpu_validated": True,
            "symlink_resolution_bypassed": True,
            "hardlinks_created": False,
            "model_bytes_copied": False,
            "runpod_used": False,
            "production_deploy_performed": False,
        }, separators=(",", ":")), flush=True)

        result = generate_scene1_native_master_resolved.remote(
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
            "hardlinks_created",
            "model_bytes_copied",
            "duplicate_model_storage_created",
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
            "runtime_path_final_gate": runtime,
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
        print(f"{RUNTIME_CONTRACT}=PASS", flush=True)
        print(f"{CONTRACT}=PASS", flush=True)
    finally:
        for remote in (source_remote, prepared_remote, output_remote):
            try:
                model_volume.remove_file(remote)
            except Exception:
                pass
