"""
Modal deployment of the Avantiqo LTX-2.5 native master video generation worker.

This ports services/avantiqo-video-engine/ltx25_native_master_serverless.py
(your existing RunPod serverless handler) onto Modal, which pools GPU capacity
across many customers instead of pinning you to one RunPod data center via a
network volume. It reuses your existing GHCR image byte-for-byte, so none of
the LTX-2 pipeline install / CUDA setup is redone -- only the entrypoint
(runpod.serverless.start -> a Modal function) and the cache mount
(/runpod-volume -> a Modal Volume) changed.

ONE-TIME SETUP (run from your own terminal -- this needs your Modal account
and real network access, neither of which this session has):

  pip install modal
  modal setup                                   # opens a browser, links this machine to your Modal account
  modal volume create avantiqo-ltx25-cache
  modal secret create huggingface-secret HF_TOKEN=<your HF token from .env.local>

  # Seed the volume with the LTX-2.5 weights (one-time, ~tens of GB download,
  # only needs to happen once -- after this every cold start reads from the
  # volume instead of re-downloading):
  modal run services/avantiqo-video-engine/modal_app.py::seed_cache

  # Deploy the actual worker:
  modal deploy services/avantiqo-video-engine/modal_app.py

DEPLOY OUTPUT gives you a URL like:
  https://<your-workspace>--avantiqo-video-ltx25-native-master-generate-endpoint.modal.run

That's your new generation endpoint -- same request/response shape as the
RunPod handler (same CONTRACT, same required fields), so the app-side caller
in this repo needs only its base URL swapped, not its payload shape.
"""

import os
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

import modal

app = modal.App("avantiqo-video-ltx25-native-master")

# Reuse the exact image you already build and push to GHCR -- Modal can pull
# any Docker registry image as a base, same as RunPod does. This is the same
# digest referenced in services/avantiqo-video-engine/Dockerfile.ltx25.native-master-serverless.
image = modal.Image.from_registry(
    "ghcr.io/churchillkaron/avantiqo-video-ltx25-fast-runtime@sha256:8bbfb6a41849d2ce6f22b4d023859f08fb4a6de652a173a82682e3a3132f1ee6",
    add_python=None,  # image already has Python installed; don't let Modal inject another one
).pip_install("requests", "huggingface_hub")

# Equivalent of your RunPod network volume mounted at /runpod-volume --
# persists across cold starts, shared across every worker Modal spins up.
cache_volume = modal.Volume.from_name("avantiqo-ltx25-cache", create_if_missing=True)
CACHE_ROOT = Path("/cache/huggingface-cache/hub/models--Lightricks--LTX-2.5/snapshots")

CONTRACT = "AVANTIQO_VIDEO_LTX25_NATIVE_MASTER_SERVERLESS_V2"
ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V2"
PIPELINE_ROOT = Path("/opt/LTX-2")
MASTER_WIDTH = 3840
MASTER_HEIGHT = 2176
FPS = 24
REQUIRED = (
    "diffusion_models/ltx-2.5-22b-dev-transformer-bf16.safetensors",
    "text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors",
    "vae/ltx-2.5-video-vae-bf16.safetensors",
    "vae/ltx-2.5-audio-vae-bf16.safetensors",
)


def text(value: Any) -> str:
    return str(value or "").strip()


def obj(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def snapshot() -> Path:
    if not CACHE_ROOT.is_dir():
        raise RuntimeError("AVANTIQO_VIDEO_LTX25_CACHE_ROOT_MISSING")
    candidates = [p for p in CACHE_ROOT.iterdir() if p.is_dir()]
    candidates.sort(key=lambda p: p.stat().st_mtime_ns, reverse=True)
    for candidate in candidates:
        if all((candidate / rel).is_file() and (candidate / rel).stat().st_size > 0 for rel in REQUIRED):
            return candidate
    raise RuntimeError("AVANTIQO_VIDEO_LTX25_FULL_DEV_CACHE_INCOMPLETE")


def frame_count(duration_seconds: int) -> int:
    desired = max(33, duration_seconds * FPS + 1)
    return max(33, ((desired - 1) // 8) * 8 + 1)


def sanitize(value: Any, limit: int = 2200) -> str:
    return text(value).replace("\n", " ")[-limit:]


def cinematic_prompt(data: dict[str, Any]) -> str:
    instruction = text(data.get("instruction"))
    if not instruction:
        raise ValueError("AVANTIQO_VIDEO_INSTRUCTION_REQUIRED")
    return instruction + (
        " Full-bleed cinematic image only. No typography, captions, numbers, logos or letterbox bars. "
        "Preserve skyline geometry and architecture. Premium photographic realism, natural dawn exposure, "
        "physically plausible cloud, water and traffic motion, stabilized aerial camera, no morphing or frame collapse."
    )


def negative_prompt() -> str:
    return (
        "text, typography, captions, numbers, logos, watermarks, black bars, frame collapse, shrinking image, "
        "warped horizon, duplicate buildings, melting architecture, sudden zoom, camera roll, yaw drift, time lapse, "
        "flicker, severe blur, low resolution, overprocessed sharpening, artificial neon"
    )


@app.function(
    image=modal.Image.debian_slim().pip_install("huggingface_hub"),
    volumes={"/cache": cache_volume},
    secrets=[modal.Secret.from_name("huggingface-secret")],
    timeout=3600,
)
def seed_cache() -> None:
    """One-time cache warm: downloads the LTX-2.5 weights into the Modal Volume
    so every future cold start reads from fast local storage instead of
    hitting Hugging Face. Run this once via `modal run modal_app.py::seed_cache`
    before your first real generation."""
    from huggingface_hub import snapshot_download

    target = snapshot_download(
        repo_id="Lightricks/LTX-2.5",
        local_dir=str(CACHE_ROOT.parent.parent / "temp-download"),
        token=os.environ["HF_TOKEN"],
        allow_patterns=[f"{req.split('/')[0]}/*" for req in REQUIRED],
    )
    revision_dir = CACHE_ROOT / "main"
    revision_dir.parent.mkdir(parents=True, exist_ok=True)
    if revision_dir.exists():
        import shutil
        shutil.rmtree(revision_dir)
    Path(target).rename(revision_dir)
    cache_volume.commit()
    print(f"AVANTIQO_VIDEO_LTX25_CACHE_SEEDED={revision_dir}")


@app.function(
    image=image,
    gpu="A100-80GB",  # matches the VRAM class your native 4K pipeline needs; bump to "H100" if you hit OOM
    volumes={"/cache": cache_volume},
    timeout=1800,          # same 30-minute hard ceiling as the RunPod handler
    scaledown_window=300,  # keep a worker warm 5 min after its last job so back-to-back
                            # requests skip the cold start -- cheap middle ground vs. always-on
)
def generate(data: dict[str, Any]) -> dict[str, Any]:
    import requests

    if text(data.get("contract")) != ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_VIDEO_ENGINE_CONTRACT_INVALID")
    if text(data.get("capability")) != "ai.video.image_to_video":
        raise ValueError("AVANTIQO_VIDEO_NATIVE_MASTER_I2V_REQUIRED")
    if int(data.get("fps") or FPS) != FPS:
        raise ValueError("AVANTIQO_VIDEO_NATIVE_MASTER_FPS_24_REQUIRED")
    references = data.get("reference_images") or []
    if not isinstance(references, list) or not references:
        raise ValueError("AVANTIQO_VIDEO_NATIVE_MASTER_REFERENCE_REQUIRED")
    if text(data.get("reference_prepared")) != "true":
        raise ValueError("AVANTIQO_VIDEO_PREPARED_REFERENCE_REQUIRED")
    output_upload = obj(data.get("output_upload"))
    signed_url = text(output_upload.get("signed_url"))
    storage_reference = text(output_upload.get("storage_reference"))
    if not signed_url.startswith("https://") or not storage_reference.startswith("storage://creative-assets/"):
        raise ValueError("AVANTIQO_VIDEO_NATIVE_MASTER_OUTPUT_UPLOAD_INVALID")

    root = snapshot()
    transformer = root / REQUIRED[0]
    text_encoder = root / REQUIRED[1]
    video_vae = root / REQUIRED[2]
    audio_vae = root / REQUIRED[3]
    duration_seconds = int(data.get("duration_seconds") or 5)
    frames = frame_count(duration_seconds)
    seed = int(data.get("seed") if data.get("seed") is not None else 4747)

    with tempfile.TemporaryDirectory(prefix="avantiqo-ltx25-modal-") as temp_dir:
        temp = Path(temp_dir)
        reference = temp / "prepared-reference.png"
        master = temp / "scene-native-master-3840x2176.mp4"

        response = requests.get(text(references[0]), timeout=120, allow_redirects=True)
        response.raise_for_status()
        if not response.content or len(response.content) > 64 * 1024 * 1024:
            raise RuntimeError("AVANTIQO_VIDEO_PREPARED_REFERENCE_INVALID")
        reference.write_bytes(response.content)

        command = [
            "python", "-m", "ltx_pipelines.ti2vid_one_stage",
            "--transformer-path", str(transformer),
            "--text-encoder-path", str(text_encoder),
            "--video-vae-path", str(video_vae),
            "--audio-vae-path", str(audio_vae),
            "--num-frames", str(frames),
            "--width", str(MASTER_WIDTH),
            "--height", str(MASTER_HEIGHT),
            "--frame-rate", str(FPS),
            "--seed", str(seed),
            "--offload", "cpu",
            "--max-batch-size", "1",
            "--output-path", str(master),
            "--prompt", cinematic_prompt(data),
            "--negative-prompt", negative_prompt(),
            "--image", str(reference), "0", "1.0", "0",
        ]
        env = os.environ.copy()
        env["PYTHONPATH"] = ":".join([
            str(PIPELINE_ROOT / "packages/ltx-core/src"),
            str(PIPELINE_ROOT / "packages/ltx-pipelines/src"),
            env.get("PYTHONPATH", ""),
        ])
        env["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
        env["CUDA_MODULE_LOADING"] = "LAZY"

        started = time.perf_counter()
        completed = subprocess.run(
            command, cwd=str(PIPELINE_ROOT), env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
            timeout=1800, check=False,
        )
        generation_seconds = round(time.perf_counter() - started, 3)
        if completed.returncode != 0:
            raise RuntimeError(f"AVANTIQO_VIDEO_LTX25_COMMAND_FAILED:{completed.returncode}:{sanitize(completed.stdout)}")
        if not master.is_file() or master.stat().st_size <= 1_000_000:
            raise RuntimeError("AVANTIQO_VIDEO_NATIVE_MASTER_OUTPUT_INVALID")

        with master.open("rb") as handle:
            put_response = requests.put(
                signed_url, data=handle,
                headers={"content-type": "video/mp4", "cache-control": "max-age=3600", "x-upsert": "false"},
                timeout=300,
            )
        if not put_response.ok:
            raise RuntimeError(f"AVANTIQO_VIDEO_MASTER_UPLOAD_FAILED:{put_response.status_code}")

        return {
            "success": True,
            "status": "completed",
            "provider": "avantiqo-video-modal",
            "model": "avantiqo-ltx-2.5",
            "foundation_model": "Lightricks/LTX-2.5",
            "contract": CONTRACT,
            "pipeline": "TI2VID_ONE_STAGE_FULL_DEV_BF16",
            "precision": "BF16",
            "width": MASTER_WIDTH,
            "height": MASTER_HEIGHT,
            "fps": FPS,
            "frame_count": frames,
            "seed": seed,
            "storage_reference": storage_reference,
            "output_size_bytes": master.stat().st_size,
            "generation_seconds": generation_seconds,
            "cache_revision": root.name,
        }


@app.function(image=image, volumes={"/cache": cache_volume})
@modal.fastapi_endpoint(method="POST")
def generate_endpoint(data: dict[str, Any]) -> dict[str, Any]:
    """HTTP entrypoint -- mirrors calling RunPod's /run endpoint with a job
    body. Same CONTRACT and required fields as the RunPod handler, so the
    calling code in this repo only needs its base URL updated."""
    try:
        return generate.remote(data)
    except Exception as exc:  # noqa: BLE001 -- match the RunPod handler's error shape
        return {
            "success": False,
            "contract": CONTRACT,
            "error_code": text(exc).split(":", 1)[0][:180],
            "error_detail": sanitize(exc),
        }
