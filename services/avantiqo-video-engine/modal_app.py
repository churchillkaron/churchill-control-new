"""Scale-to-zero Modal runtime for the owned Avantiqo Cinema engine.

The existing certified Wan 2.2 route remains available for general generated
video. The premium LTX-2.5 lane shares the same single Video Modal Volume and
has one canonical native-master GPU function.

The premium paid GPU boundary is intentionally narrow: LTX-2.5 full-dev BF16
inference at the native master resolution and serialization of that untouched
model output. Reference cleanup and all delivery transforms (crop, resize,
interpolation, assembly, grading, titles and final export) belong to Avantiqo
Studio and are intentionally absent from this runtime.
"""
from __future__ import annotations

import json
import os
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any

import modal

APP_NAME = "avantiqo-video-owned"
ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1"
NATIVE_ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V2"
PRODUCT_MODEL = "avantiqo-cinema-v1"
T2V_MODEL = "Wan-AI/Wan2.2-T2V-A14B-Diffusers"
I2V_MODEL = "Wan-AI/Wan2.2-I2V-A14B-Diffusers"
WORKER_IMAGE = (
    "ghcr.io/churchillkaron/avantiqo-video-worker@"
    "sha256:aa2d31c7d7ea6603f747b27edacc742874e56e62fe71bc09365a64dc1b9362e5"
)
HF_CACHE_ROOT = "/models/huggingface-cache/hub"
MODEL_VOLUME_NAME = "avantiqo-video-models"
MODEL_SECRET_NAME = "huggingface-secret"
CACHE_MARKER = ".avantiqo-video-cache-complete.json"
CACHE_CONTRACT = "AVANTIQO_VIDEO_WAN22_CACHE_COMPLETION_V1"

LTX_SOURCE_REPO = "Lightricks/LTX-2.5"
LTX_SOURCE_REVISION = "e8dc69fd26150afbfa20351f6bc9ac384257f9fd"
LTX_RUNTIME_IMAGE = (
    "ghcr.io/churchillkaron/avantiqo-video-ltx25-fast-runtime@"
    "sha256:8bbfb6a41849d2ce6f22b4d023859f08fb4a6de652a173a82682e3a3132f1ee6"
)
LTX_PIPELINE_ROOT = Path("/opt/LTX-2")
LTX_SNAPSHOT_ROOT = Path(
    f"{HF_CACHE_ROOT}/models--Lightricks--LTX-2.5/snapshots"
)
LTX_REQUIRED = (
    "diffusion_models/ltx-2.5-22b-dev-transformer-bf16.safetensors",
    "text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors",
    "vae/ltx-2.5-video-vae-bf16.safetensors",
    "vae/ltx-2.5-audio-vae-bf16.safetensors",
)
LTX_MASTER_WIDTH = 3840
LTX_MASTER_HEIGHT = 2176
LTX_FPS = 24
LTX_NUM_INFERENCE_STEPS = 30
LTX_GPU = "B200"
LTX_GPU_USD_PER_SECOND = 0.001736
LTX_HARD_TIMEOUT_SECONDS = 30 * 60
LTX_SUBPROCESS_TIMEOUT_SECONDS = LTX_HARD_TIMEOUT_SECONDS - 20
LTX_QUALITY_CONTRACT = "AVANTIQO_VIDEO_LTX25_NATIVE_MASTER_3840X2176_V2"
LTX_RUNTIME_CONTRACT = "AVANTIQO_VIDEO_LTX25_MODAL_NATIVE_MASTER_V2"
LTX_GEMMA_REALPATH_ENV = "AVANTIQO_LTX25_GEMMA_REALPATH"
LTX_GEMMA_SUFFIX_COMPAT_ENTRYPOINT = r"""
import os
from pathlib import Path

import ltx_core.text_encoders.gemma as gemma_package
from ltx_core.text_encoders.gemma import gemma_assets
from ltx_core.text_encoders.gemma.gemma_assets import GemmaAssets

_expected = Path(os.environ["AVANTIQO_LTX25_GEMMA_REALPATH"]).resolve(strict=True)
_original_load = GemmaAssets.load.__func__
_original_resolve = gemma_assets.resolve_gemma_weight_paths

def _avantiqo_exact_path(path):
    candidate = Path(path)
    try:
        resolved = candidate.resolve(strict=True)
    except FileNotFoundError:
        return None
    if resolved == _expected and resolved.is_file():
        return resolved
    return None

def _avantiqo_exact_gemma_load(cls, path):
    resolved = _avantiqo_exact_path(path)
    if resolved is not None:
        return cls.from_single_file(resolved)
    return _original_load(cls, path)

def _avantiqo_exact_gemma_weight_paths(path):
    resolved = _avantiqo_exact_path(path)
    if resolved is not None:
        return (str(resolved),)
    return _original_resolve(path)

GemmaAssets.load = classmethod(_avantiqo_exact_gemma_load)
gemma_assets.resolve_gemma_weight_paths = _avantiqo_exact_gemma_weight_paths
gemma_package.resolve_gemma_weight_paths = _avantiqo_exact_gemma_weight_paths

from ltx_core.text_encoders.gemma.encoders import encoder_configurator
encoder_configurator.resolve_gemma_weight_paths = _avantiqo_exact_gemma_weight_paths

from ltx_pipelines.utils import blocks
blocks.resolve_gemma_weight_paths = _avantiqo_exact_gemma_weight_paths

from ltx_pipelines.ti2vid_one_stage import main
main()
"""

app = modal.App(APP_NAME)
# The single Video model Volume is provisioned deliberately. Never create storage
# as a side effect of importing or deploying the Video runtime.
model_volume = modal.Volume.from_name(MODEL_VOLUME_NAME, create_if_missing=False)
seed_image = modal.Image.debian_slim(python_version="3.12").pip_install("huggingface_hub")


def _text(value: Any) -> str:
    return str(value or "").strip()


def _sanitize(value: Any, limit: int = 2200) -> str:
    return _text(value).replace("\n", " ")[-limit:]


def _write_marker(snapshot: Path, model_id: str) -> None:
    (snapshot / CACHE_MARKER).write_text(json.dumps({
        "contract": CACHE_CONTRACT,
        "target_model": model_id,
        "snapshot_revision": snapshot.name,
        "snapshot_download_completed": True,
        "modal_volume": MODEL_VOLUME_NAME,
    }, separators=(",", ":"), sort_keys=True), encoding="utf-8")


@app.function(
    image=seed_image,
    volumes={"/models": model_volume},
    secrets=[modal.Secret.from_name(MODEL_SECRET_NAME)],
    timeout=2 * 60 * 60,
)
def seed_cache() -> None:
    """Seed the certified Wan 2.2 models into the one Video model Volume."""
    from huggingface_hub import snapshot_download

    for model_id in (T2V_MODEL, I2V_MODEL):
        resolved = Path(snapshot_download(
            repo_id=model_id,
            cache_dir=HF_CACHE_ROOT,
            token=os.environ.get("HF_TOKEN") or None,
            max_workers=8,
        ))
        if not resolved.is_dir() or not (resolved / "model_index.json").is_file():
            raise RuntimeError(f"AVANTIQO_VIDEO_MODAL_MODEL_SNAPSHOT_INVALID:{model_id}")
        _write_marker(resolved, model_id)
        print(f"AVANTIQO_VIDEO_MODAL_CACHE_READY={model_id}:{resolved.name}", flush=True)
    model_volume.commit()


def _ltx_snapshot() -> Path:
    """Resolve only the exact pinned LTX-2.5 revision."""
    candidate = LTX_SNAPSHOT_ROOT / LTX_SOURCE_REVISION
    if not candidate.is_dir():
        raise RuntimeError(
            f"AVANTIQO_VIDEO_LTX25_MODAL_PINNED_CACHE_MISSING:{LTX_SOURCE_REVISION}"
        )
    missing = [
        relative
        for relative in LTX_REQUIRED
        if not (candidate / relative).is_file()
        or (candidate / relative).stat().st_size <= 0
    ]
    if missing:
        raise RuntimeError(
            "AVANTIQO_VIDEO_LTX25_MODAL_PINNED_CACHE_INCOMPLETE:"
            + ",".join(missing)
        )
    return candidate


@app.function(
    image=seed_image,
    volumes={"/models": model_volume},
    secrets=[modal.Secret.from_name(MODEL_SECRET_NAME)],
    timeout=2 * 60 * 60,
)
def seed_ltx_cache() -> dict[str, Any]:
    """Seed only the pinned full-dev BF16 LTX-2.5 pack; no GPU is allocated."""
    from huggingface_hub import snapshot_download

    model_volume.reload()
    try:
        existing = _ltx_snapshot()
        return {
            "success": True,
            "already_cached": True,
            "revision": existing.name,
            "modal_volume": MODEL_VOLUME_NAME,
            "gpu_inference_performed": False,
        }
    except RuntimeError:
        pass

    resolved = Path(snapshot_download(
        repo_id=LTX_SOURCE_REPO,
        revision=LTX_SOURCE_REVISION,
        cache_dir=HF_CACHE_ROOT,
        token=os.environ.get("HF_TOKEN") or None,
        allow_patterns=list(LTX_REQUIRED),
        max_workers=8,
    ))
    if resolved.name != LTX_SOURCE_REVISION:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_LTX25_MODAL_REVISION_INVALID:{resolved.name}"
        )
    missing = [
        relative for relative in LTX_REQUIRED
        if not (resolved / relative).is_file() or (resolved / relative).stat().st_size <= 0
    ]
    if missing:
        raise RuntimeError(
            "AVANTIQO_VIDEO_LTX25_MODAL_REQUIRED_FILES_MISSING:"
            + ",".join(missing)
        )
    model_volume.commit()
    print(f"AVANTIQO_VIDEO_LTX25_MODAL_CACHE_READY={resolved.name}", flush=True)
    return {
        "success": True,
        "already_cached": False,
        "revision": resolved.name,
        "modal_volume": MODEL_VOLUME_NAME,
        "gpu_inference_performed": False,
    }


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
        "AVANTIQO_VIDEO_HF_CACHE_ROOT": HF_CACHE_ROOT,
        "AVANTIQO_VIDEO_T2V_MODEL": T2V_MODEL,
        "AVANTIQO_VIDEO_I2V_MODEL": I2V_MODEL,
        "AVANTIQO_VIDEO_REQUIRE_CACHED_MODEL": "1",
        "AVANTIQO_VIDEO_NETWORK_VOLUME_QUOTA_GB": "400",
        "AVANTIQO_VIDEO_DEVICE": "cuda",
        "AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES": "ai.video.generate,ai.video.image_to_video",
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
    })
)


@app.function(
    image=worker_image,
    gpu="A100-80GB",
    volumes={"/models": model_volume},
    timeout=30 * 60,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=5,
)
def generate(data: dict[str, Any]) -> dict[str, Any]:
    """Existing certified Wan 2.2 Modal route."""
    os.chdir("/app")
    import handler_v4 as video_engine

    video_engine.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
    video_engine.v3.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
    video_engine.v3.legacy.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
    started = time.perf_counter()
    output = video_engine.handler({
        "id": f"modal-{uuid.uuid4()}",
        "input": data,
    })
    if not isinstance(output, dict):
        raise RuntimeError("AVANTIQO_VIDEO_MODAL_OUTPUT_OBJECT_REQUIRED")
    result = dict(output)
    result["infrastructure_provider"] = "MODAL"
    result["modal_gpu"] = "A100-80GB"
    result["modal_elapsed_seconds"] = round(time.perf_counter() - started, 3)
    result["runpod_inference_performed"] = False
    result["raw_reasoning_persisted"] = False
    return result


ltx_worker_image = (
    modal.Image.from_registry(
        LTX_RUNTIME_IMAGE,
        add_python=None,
        setup_dockerfile_commands=[
            "RUN command -v python >/dev/null 2>&1 || ln -s \"$(command -v python3)\" /usr/local/bin/python",
            "RUN python --version",
            "RUN python -m pip install --break-system-packages --no-cache-dir requests==2.32.4",
        ],
    )
    .entrypoint([])
    .env({
        "HF_HUB_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
        "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
        "CUDA_MODULE_LOADING": "LAZY",
    })
)


def _ltx_frame_count(duration_seconds: int) -> int:
    desired = max(33, duration_seconds * LTX_FPS + 1)
    return max(33, ((desired - 1) // 8) * 8 + 1)


def _ltx_prompt(instruction: str) -> str:
    if not instruction.strip():
        raise ValueError("AVANTIQO_VIDEO_LTX25_MODAL_INSTRUCTION_REQUIRED")
    return instruction.strip() + (
        " Full-bleed cinematic image only. No typography, captions, numbers, logos or letterbox bars. "
        "Preserve supplied composition and geometry. Premium photographic realism, physically plausible motion, "
        "natural exposure, stable camera intent, no morphing or frame collapse."
    )


def _ltx_negative_prompt() -> str:
    return (
        "text, typography, captions, numbers, logos, watermarks, black bars, frame collapse, shrinking image, "
        "warped geometry, duplicate structures, melting architecture, accidental sudden zoom, camera roll, yaw drift, "
        "flicker, severe blur, low resolution, overprocessed sharpening, artificial neon"
    )


@app.function(
    image=ltx_worker_image,
    gpu=LTX_GPU,
    volumes={"/models": model_volume},
    timeout=LTX_HARD_TIMEOUT_SECONDS,
    min_containers=0,
    max_containers=4,
    buffer_containers=0,
    scaledown_window=5,
    retries=0,
)
def generate_native_master(
    reference_relative: str,
    output_relative: str,
    instruction: str,
    duration_seconds: int = 5,
    seed: int = 4747,
) -> dict[str, Any]:
    """Generate one untouched native LTX-2.5 full-dev BF16 master.

    This paid B200 function is generation-only. The input reference must already
    be approved/prepared by Studio. No crop, resize, spatial/latent upscaler,
    temporal interpolation, distilled model/LoRA, grading or delivery transform
    is performed here.
    """
    function_started = time.perf_counter()
    model_volume.reload()
    root = _ltx_snapshot()
    reference = Path("/models") / reference_relative.lstrip("/")
    output = Path("/models") / output_relative.lstrip("/")
    if not reference.is_file() or reference.stat().st_size < 20_000:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_STUDIO_REFERENCE_INVALID")
    if int(duration_seconds) <= 0 or int(duration_seconds) > 20:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_DURATION_INVALID")
    output.parent.mkdir(parents=True, exist_ok=True)

    transformer = root / LTX_REQUIRED[0]
    text_encoder = root / LTX_REQUIRED[1]
    video_vae = root / LTX_REQUIRED[2]
    audio_vae = root / LTX_REQUIRED[3]
    text_encoder_real = text_encoder.resolve(strict=True)
    if not text_encoder_real.is_file() or text_encoder_real.stat().st_size <= 0:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_GEMMA_REALPATH_INVALID")
    frames = _ltx_frame_count(int(duration_seconds))
    command = [
        "python", "-c", LTX_GEMMA_SUFFIX_COMPAT_ENTRYPOINT,
        "--transformer-path", str(transformer),
        "--text-encoder-path", str(text_encoder),
        "--video-vae-path", str(video_vae),
        "--audio-vae-path", str(audio_vae),
        "--num-frames", str(frames),
        "--width", str(LTX_MASTER_WIDTH),
        "--height", str(LTX_MASTER_HEIGHT),
        "--frame-rate", str(LTX_FPS),
        "--num-inference-steps", str(LTX_NUM_INFERENCE_STEPS),
        "--seed", str(int(seed)),
        "--max-batch-size", "1",
        "--output-path", str(output),
        "--prompt", _ltx_prompt(instruction),
        "--negative-prompt", _ltx_negative_prompt(),
        "--image", str(reference), "0", "1.0", "0",
    ]
    env = os.environ.copy()
    env[LTX_GEMMA_REALPATH_ENV] = str(text_encoder_real)
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
            timeout=LTX_SUBPROCESS_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        detail = _sanitize(getattr(exc, "stdout", "") or getattr(exc, "output", ""), 1200)
        raise RuntimeError(
            f"AVANTIQO_VIDEO_LTX25_MODAL_HARD_TIMEOUT:{LTX_SUBPROCESS_TIMEOUT_SECONDS}:{detail}"
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
    return {
        "success": True,
        "status": "completed",
        "contract": LTX_RUNTIME_CONTRACT,
        "quality_contract": LTX_QUALITY_CONTRACT,
        "engine_contract": NATIVE_ENGINE_CONTRACT,
        "provider": "avantiqo-video",
        "model": "avantiqo-ltx-2.5",
        "foundation_model": LTX_SOURCE_REPO,
        "foundation_revision": root.name,
        "pipeline": "TI2VID_ONE_STAGE_FULL_DEV_BF16",
        "precision": "BF16",
        "quantization": "NONE",
        "modal_gpu": LTX_GPU,
        "width": LTX_MASTER_WIDTH,
        "height": LTX_MASTER_HEIGHT,
        "fps": LTX_FPS,
        "num_inference_steps": LTX_NUM_INFERENCE_STEPS,
        "frame_count": frames,
        "duration_seconds_requested": int(duration_seconds),
        "seed": int(seed),
        "output_relative": output_relative,
        "output_size_bytes": output.stat().st_size,
        "generation_seconds": generation_seconds,
        "modal_function_seconds": function_seconds,
        "supplier_gpu_rate_usd_per_second": LTX_GPU_USD_PER_SECOND,
        "estimated_supplier_gpu_cost_usd": round(function_seconds * LTX_GPU_USD_PER_SECOND, 8),
        "hard_timeout_seconds": LTX_HARD_TIMEOUT_SECONDS,
        "native_master_generated": True,
        "master_is_exact_model_output": True,
        "studio_reference_required": True,
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
        "reference_preprocessing_inside_paid_worker": False,
        "ffprobe_inside_paid_worker": False,
        "runpod_inference_performed": False,
        "external_provider_contacted": False,
        "automatic_paid_retry": False,
        "raw_reasoning_persisted": False,
        "pipeline_stdout_tail": _sanitize(completed.stdout, 1200),
    }