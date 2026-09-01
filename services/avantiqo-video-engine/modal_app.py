"""Scale-to-zero Modal runtime for the owned Avantiqo Cinema engine.

The existing certified Wan 2.2 route remains available for general generated
video. A native LTX-2.5 full-dev BF16 lane shares the exact same Video Modal
Volume for premium image-to-video masters such as Scene 1. No second Video
storage is created and every GPU function scales to zero.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
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
LTX_QUALITY_CONTRACT = "AVANTIQO_VIDEO_LTX25_NATIVE_MASTER_3840X2176_V1"
LTX_RUNTIME_CONTRACT = "AVANTIQO_VIDEO_LTX25_MODAL_NATIVE_MASTER_V1"

app = modal.App(APP_NAME)
model_volume = modal.Volume.from_name(MODEL_VOLUME_NAME, create_if_missing=True)
seed_image = modal.Image.debian_slim(python_version="3.12").pip_install("huggingface_hub")
prepare_image = modal.Image.debian_slim(python_version="3.12").pip_install("pillow")


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
    candidate = LTX_SNAPSHOT_ROOT / LTX_SOURCE_REVISION
    if candidate.is_dir() and all(
        (candidate / relative).is_file() and (candidate / relative).stat().st_size > 0
        for relative in LTX_REQUIRED
    ):
        return candidate
    if LTX_SNAPSHOT_ROOT.is_dir():
        for snapshot in sorted(
            (path for path in LTX_SNAPSHOT_ROOT.iterdir() if path.is_dir()),
            key=lambda path: path.stat().st_mtime_ns,
            reverse=True,
        ):
            if all(
                (snapshot / relative).is_file() and (snapshot / relative).stat().st_size > 0
                for relative in LTX_REQUIRED
            ):
                return snapshot
    raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_CACHE_INCOMPLETE")


@app.function(
    image=seed_image,
    volumes={"/models": model_volume},
    secrets=[modal.Secret.from_name(MODEL_SECRET_NAME)],
    timeout=2 * 60 * 60,
)
def seed_ltx_cache() -> dict[str, Any]:
    """One-time exact-revision LTX-2.5 cache seed; no GPU is allocated."""
    from huggingface_hub import snapshot_download

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
    print(
        f"AVANTIQO_VIDEO_LTX25_MODAL_CACHE_READY={resolved.name}",
        flush=True,
    )
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
        "Preserve skyline geometry and architecture. Premium photographic realism, natural dawn exposure, "
        "physically plausible cloud, water and traffic motion, stabilized aerial camera, no morphing or frame collapse."
    )


def _ltx_negative_prompt() -> str:
    return (
        "text, typography, captions, numbers, logos, watermarks, black bars, frame collapse, shrinking image, "
        "warped horizon, duplicate buildings, melting architecture, sudden zoom, camera roll, yaw drift, time lapse, "
        "flicker, severe blur, low resolution, overprocessed sharpening, artificial neon"
    )


@app.function(
    image=prepare_image,
    volumes={"/models": model_volume},
    timeout=5 * 60,
    min_containers=0,
    max_containers=1,
    scaledown_window=5,
)
def prepare_scene1_reference(source_relative: str, target_relative: str) -> dict[str, Any]:
    """Prepare the approved Scene 1 frame on CPU, never on paid GPU."""
    from PIL import Image, ImageFilter

    model_volume.reload()
    source = Path("/models") / source_relative.lstrip("/")
    target = Path("/models") / target_relative.lstrip("/")
    if not source.is_file() or source.stat().st_size < 20_000:
        raise RuntimeError("AVANTIQO_VIDEO_SCENE1_MODAL_SOURCE_FRAME_INVALID")
    with Image.open(source) as original:
        image = original.convert("RGB")
    x0 = int(image.width * 0.05)
    x1 = int(image.width * 0.58)
    y0 = int(image.height * 0.03)
    y1 = int(image.height * 0.24)
    region = image.crop((x0, y0, x1, y1)).filter(
        ImageFilter.GaussianBlur(max(14, image.width // 90))
    )
    image.paste(region, (x0, y0))
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, format="PNG", optimize=True)
    if target.stat().st_size < 20_000:
        raise RuntimeError("AVANTIQO_VIDEO_SCENE1_MODAL_PREPARED_FRAME_INVALID")
    model_volume.commit()
    return {
        "success": True,
        "width": image.width,
        "height": image.height,
        "bytes": target.stat().st_size,
        "preprocessing_inside_paid_worker": False,
    }


@app.function(
    image=ltx_worker_image,
    gpu="H200",
    volumes={"/models": model_volume},
    timeout=30 * 60,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=5,
)
def generate_native_master(
    reference_relative: str,
    output_relative: str,
    instruction: str,
    duration_seconds: int = 5,
    seed: int = 4747,
) -> dict[str, Any]:
    """Generate one exact 3840x2176 LTX-2.5 full-dev BF16 master."""
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
    started = time.perf_counter()
    completed = subprocess.run(
        command,
        cwd=str(LTX_PIPELINE_ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=30 * 60,
        check=False,
    )
    elapsed = round(time.perf_counter() - started, 3)
    if completed.returncode != 0:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_LTX25_MODAL_COMMAND_FAILED:{completed.returncode}:"
            f"{_sanitize(completed.stdout)}"
        )
    if not output.is_file() or output.stat().st_size <= 1_000_000:
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_MODAL_OUTPUT_INVALID")
    model_volume.commit()
    return {
        "success": True,
        "status": "completed",
        "contract": LTX_RUNTIME_CONTRACT,
        "quality_contract": LTX_QUALITY_CONTRACT,
        "engine_contract": NATIVE_ENGINE_CONTRACT,
        "provider": "avantiqo-video",
        "model": "avantiqo-ltx-2.5",
        "foundation_model": LTX_SOURCE_REPO,
        "foundation_revision": LTX_SOURCE_REVISION,
        "pipeline": "TI2VID_ONE_STAGE_FULL_DEV_BF16",
        "precision": "BF16",
        "modal_gpu": "H200",
        "width": LTX_MASTER_WIDTH,
        "height": LTX_MASTER_HEIGHT,
        "fps": LTX_FPS,
        "frame_count": frames,
        "duration_seconds_requested": int(duration_seconds),
        "seed": int(seed),
        "output_relative": output_relative,
        "output_size_bytes": output.stat().st_size,
        "generation_seconds": elapsed,
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
        "raw_reasoning_persisted": False,
        "pipeline_stdout_tail": _sanitize(completed.stdout, 1200),
    }


SCENE1_PROMPT = (
    "A premium stabilized aerial push toward the dawn city skyline with a subtle controlled descent. "
    "Keep the architecture, skyline geometry and perspective coherent with the supplied opening frame. "
    "Natural pre-sunrise light slowly develops, with restrained realistic cloud movement, subtle water and traffic motion, "
    "physically plausible atmospheric depth, no artificial timelapse, no sudden camera movement, no morphing, no fantasy elements. "
    "The shot should feel like the opening of a world-class New York commercial film."
)


@app.local_entrypoint()
def scene1(
    output_path: str = "local-audit-output/avantiqo-video-scene1-modal/scene1-native-master-3840x2176.mp4",
) -> None:
    """Run exactly one premium Scene 1 from the approved opening frame."""
    repository_root = Path.cwd().resolve()
    source = repository_root / "assets/video/proofs/avantiqo_first_shot_frame_transport.jpg"
    if not source.is_file() or source.stat().st_size < 20_000:
        raise RuntimeError("AVANTIQO_VIDEO_SCENE1_APPROVED_OPENING_FRAME_MISSING")

    run_id = uuid.uuid4().hex[:16]
    source_remote = f"scene1-proof/{run_id}/opening-frame.jpg"
    prepared_remote = f"scene1-proof/{run_id}/prepared-reference.png"
    output_remote = f"scene1-proof/{run_id}/native-master-3840x2176.mp4"
    local_output = (repository_root / output_path).resolve()
    local_output.parent.mkdir(parents=True, exist_ok=True)
    report_path = local_output.with_suffix(".json")

    with model_volume.batch_upload(force=True) as upload:
        upload.put_file(str(source), source_remote)

    try:
        prepared = prepare_scene1_reference.remote(source_remote, prepared_remote)
        if prepared.get("success") is not True:
            raise RuntimeError("AVANTIQO_VIDEO_SCENE1_MODAL_PREPARE_FAILED")

        cache = seed_ltx_cache.remote()
        if cache.get("success") is not True:
            raise RuntimeError("AVANTIQO_VIDEO_SCENE1_MODAL_CACHE_FAILED")

        print(json.dumps({
            "event": "AVANTIQO_VIDEO_SCENE1_MODAL_GENERATION_START",
            "model": LTX_SOURCE_REPO,
            "revision": LTX_SOURCE_REVISION,
            "pipeline": "TI2VID_ONE_STAGE_FULL_DEV_BF16",
            "resolution": f"{LTX_MASTER_WIDTH}x{LTX_MASTER_HEIGHT}",
            "fps": LTX_FPS,
            "duration_seconds": 5,
            "gpu": "H200",
            "max_gpu_containers": 1,
            "scale_to_zero": True,
            "runpod_used": False,
            "production_deploy_performed": False,
        }, separators=(",", ":")), flush=True)

        result = generate_native_master.remote(
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

        ffprobe = shutil.which("ffprobe")
        probe = None
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

        report = {
            **result,
            "prepared_reference": prepared,
            "cache": cache,
            "local_output": str(local_output),
            "post_gpu_probe": probe,
            "production_deploy_performed": False,
        }
        report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"AVANTIQO_VIDEO_SCENE1_MODAL_OUTPUT={local_output}")
        print(f"AVANTIQO_VIDEO_SCENE1_MODAL_REPORT={report_path}")
        print("AVANTIQO_VIDEO_SCENE1_MODAL_NATIVE_MASTER=PASS")
    finally:
        for remote in (source_remote, prepared_remote, output_remote):
            try:
                model_volume.remove_file(remote)
            except Exception:
                pass
