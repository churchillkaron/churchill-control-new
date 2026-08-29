import os
import struct
import tempfile
import time
from pathlib import Path
from typing import Any

import numpy as np
import requests
import runpod
import torch
from diffusers.utils import load_image

import gpu_core as core

RUNTIME_ENTRYPOINT = "handler_v6.py"
RUNTIME_ENTRYPOINT_REVISION = "AVANTIQO_VIDEO_HANDLER_V6_GPU_ONLY_FRAME_EGRESS_V1"
RUNTIME_REVISION = "AVANTIQO_VIDEO_WAN22_A14B_GPU_ONLY_FRAME_EGRESS_V1"
COMPUTE_BOUNDARY_CONTRACT = "AVANTIQO_STUDIO_FIRST_COMPUTE_BOUNDARY_V1"
GPU_RESULT_CONTRACT = "AVANTIQO_VIDEO_GPU_FRAME_TENSOR_V1"
PAID_WORKER_INTERMEDIATE_EGRESS_ONLY = True
SUPPORTED_CAPABILITIES = {"ai.video.generate", "ai.video.image_to_video"}
MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024


def _text(value: Any) -> str:
    return str(value or "").strip()


def _object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _validate(job: dict[str, Any]) -> dict[str, Any]:
    data = _object(job.get("input"))
    if data.get("contract") != core.ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_VIDEO_ENGINE_CONTRACT_INVALID")
    capability = _text(data.get("capability"))
    if capability not in SUPPORTED_CAPABILITIES:
        raise ValueError(f"AVANTIQO_VIDEO_GPU_ONLY_CAPABILITY_UNSUPPORTED:{capability or 'MISSING'}")
    instruction = _text(data.get("instruction"))
    if not instruction or len(instruction) > 12000:
        raise ValueError("AVANTIQO_VIDEO_INSTRUCTION_INVALID")
    duration_seconds = int(data.get("duration_seconds") or 5)
    if duration_seconds < 2 or duration_seconds > 10:
        raise ValueError("AVANTIQO_VIDEO_DURATION_INVALID")
    fps = int(data.get("fps") or 24)
    if fps < 16 or fps > 30:
        raise ValueError("AVANTIQO_VIDEO_FPS_INVALID")
    aspect_ratio = _text(data.get("aspect_ratio") or "16:9")
    if aspect_ratio not in {"16:9", "9:16", "1:1"}:
        raise ValueError("AVANTIQO_VIDEO_ASPECT_RATIO_INVALID")
    if _text(data.get("resolution") or "720p").lower() != "720p":
        raise ValueError("AVANTIQO_VIDEO_RESOLUTION_UNSUPPORTED")
    upload = _object(data.get("intermediate_upload"))
    signed_url = _text(upload.get("signed_url"))
    storage_reference = _text(upload.get("storage_reference"))
    if not signed_url.startswith("https://"):
        raise ValueError("AVANTIQO_VIDEO_GPU_INTERMEDIATE_SIGNED_URL_REQUIRED")
    if not storage_reference.startswith("storage://creative-assets/"):
        raise ValueError("AVANTIQO_VIDEO_GPU_INTERMEDIATE_STORAGE_REFERENCE_INVALID")
    references = data.get("reference_images") or []
    if not isinstance(references, list) or len(references) > 4:
        raise ValueError("AVANTIQO_VIDEO_REFERENCE_LIMIT_EXCEEDED")
    if capability == "ai.video.image_to_video" and not references:
        raise ValueError("AVANTIQO_VIDEO_IMAGE_TO_VIDEO_REFERENCE_REQUIRED")
    return {
        **data,
        "capability": capability,
        "instruction": instruction,
        "duration_seconds": duration_seconds,
        "fps": fps,
        "aspect_ratio": aspect_ratio,
        "intermediate_upload": {
            "signed_url": signed_url,
            "storage_reference": storage_reference,
        },
    }


def _npy_header(shape: tuple[int, int, int, int]) -> bytes:
    header = str({"descr": "|u1", "fortran_order": False, "shape": shape})
    prefix = b"\x93NUMPY" + bytes([1, 0])
    raw = header.encode("latin1")
    padding = (16 - ((len(prefix) + 2 + len(raw) + 1) % 16)) % 16
    payload = raw + (b" " * padding) + b"\n"
    if len(payload) >= 65536:
        raise RuntimeError("AVANTIQO_VIDEO_GPU_NPY_HEADER_TOO_LARGE")
    return prefix + struct.pack("<H", len(payload)) + payload


def _as_rgb_array(frame: Any) -> np.ndarray:
    if hasattr(frame, "convert"):
        array = np.asarray(frame.convert("RGB"))
    elif torch.is_tensor(frame):
        array = frame.detach().float().cpu().numpy()
        if array.ndim == 3 and array.shape[0] in {1, 3, 4}:
            array = np.transpose(array, (1, 2, 0))
    else:
        array = np.asarray(frame)
    if np.issubdtype(array.dtype, np.floating):
        array = np.clip(array, 0.0, 1.0) * 255.0
    array = np.clip(array, 0, 255).astype(np.uint8, copy=False)
    if array.ndim == 2:
        array = np.repeat(array[..., None], 3, axis=2)
    if array.ndim != 3 or array.shape[2] < 3:
        raise RuntimeError("AVANTIQO_VIDEO_GPU_FRAME_SHAPE_INVALID")
    return np.ascontiguousarray(array[..., :3])


def _write_frame_tensor(frames: list[Any], path: Path) -> tuple[int, int, int, int]:
    if not frames:
        raise RuntimeError("AVANTIQO_VIDEO_GPU_FRAMES_REQUIRED")
    first = _as_rgb_array(frames[0])
    height, width, channels = first.shape
    shape = (len(frames), height, width, channels)
    expected_bytes = len(frames) * height * width * channels
    if expected_bytes > MAX_UPLOAD_BYTES:
        raise RuntimeError("AVANTIQO_VIDEO_GPU_INTERMEDIATE_TOO_LARGE")
    with path.open("wb") as handle:
        handle.write(_npy_header(shape))
        handle.write(first.tobytes(order="C"))
        for frame in frames[1:]:
            array = _as_rgb_array(frame)
            if array.shape != first.shape:
                raise RuntimeError("AVANTIQO_VIDEO_GPU_FRAME_DIMENSION_DRIFT")
            handle.write(array.tobytes(order="C"))
    return shape


def _upload_intermediate(path: Path, signed_url: str) -> None:
    with path.open("rb") as handle:
        response = requests.put(
            signed_url,
            data=handle,
            headers={
                "content-type": "application/octet-stream",
                "cache-control": "max-age=3600",
                "x-upsert": "false",
            },
            timeout=300,
        )
    if not response.ok:
        raise RuntimeError(f"AVANTIQO_VIDEO_GPU_INTERMEDIATE_UPLOAD_FAILED:{response.status_code}")


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data = _validate(job)
    started_at = time.perf_counter()
    capability = data["capability"]
    model_id = core.I2V_MODEL if capability == "ai.video.image_to_video" else core.T2V_MODEL
    pipe = core.pipeline(model_id)
    width, height = core.native_720_dimensions(data["aspect_ratio"])
    fps = int(data["fps"])
    frames = core.frame_count(int(data["duration_seconds"]), fps)
    seed = data.get("seed")
    if seed is None:
        seed = int.from_bytes(os.urandom(4), "big")
    seed = int(seed)
    if seed < 0 or seed > 4294967295:
        raise ValueError("AVANTIQO_VIDEO_SEED_INVALID")
    generator = torch.Generator(device="cuda").manual_seed(seed)
    settings = core.quality_settings(model_id)
    kwargs: dict[str, Any] = {
        "prompt": core.cinematic_instruction(data),
        "width": width,
        "height": height,
        "num_frames": frames,
        "num_inference_steps": settings["inference_steps"],
        "guidance_scale": settings["guidance_scale"],
        "guidance_scale_2": settings["guidance_scale_2"],
        "generator": generator,
    }
    negative = core.negative_prompt(data)
    if negative:
        kwargs["negative_prompt"] = negative
    if capability == "ai.video.image_to_video":
        kwargs["image"] = load_image(data["reference_images"][0])

    runpod.serverless.progress_update(job, "gpu inference")
    result = pipe(**kwargs)
    video_frames = result.frames[0]
    if not isinstance(video_frames, list):
        video_frames = list(video_frames)

    with tempfile.TemporaryDirectory(prefix="avantiqo-video-gpu-result-") as root:
        path = Path(root) / "frames.npy"
        shape = _write_frame_tensor(video_frames, path)
        runpod.serverless.progress_update(job, "minimal gpu result egress")
        _upload_intermediate(path, data["intermediate_upload"]["signed_url"])
        size_bytes = path.stat().st_size

    return {
        "status": "completed",
        "provider": "avantiqo-video",
        "model": "avantiqo-cinema-v1",
        "engine_contract": core.ENGINE_CONTRACT,
        "compute_boundary_contract": COMPUTE_BOUNDARY_CONTRACT,
        "gpu_result_contract": GPU_RESULT_CONTRACT,
        "entrypoint": RUNTIME_ENTRYPOINT,
        "entrypoint_revision": RUNTIME_ENTRYPOINT_REVISION,
        "runtime_revision": RUNTIME_REVISION,
        "quality_contract": core.QUALITY_CONTRACT,
        "memory_contract": core.MEMORY_CONTRACT,
        "capability": capability,
        "foundation_model": model_id,
        "seed": seed,
        "fps": fps,
        "frame_count": shape[0],
        "height": shape[1],
        "width": shape[2],
        "channels": shape[3],
        "tensor_dtype": "uint8",
        "tensor_layout": "NHWC_RGB",
        "intermediate_storage_reference": data["intermediate_upload"]["storage_reference"],
        "intermediate_size_bytes": size_bytes,
        "gpu_inference_seconds": round(time.perf_counter() - started_at, 3),
        "studio_postprocessing_required": True,
        "paid_worker_intermediate_egress_only": True,
        "ffmpeg_used": False,
        "video_encoded_on_paid_worker": False,
        "final_artifact_persisted_on_paid_worker": False,
        "prompt_persisted": False,
    }


@runpod.serverless.register_fitness_check
def check_gpu_only_runtime():
    if not torch.cuda.is_available():
        raise RuntimeError("AVANTIQO_VIDEO_GPU_ONLY_CUDA_REQUIRED")
    if core.QUANTIZATION_ENABLED or core.LAYERWISE_CASTING_ENABLED:
        raise RuntimeError("AVANTIQO_VIDEO_GPU_ONLY_QUALITY_PROFILE_REQUIRED")
    if core.DTYPE != torch.bfloat16:
        raise RuntimeError("AVANTIQO_VIDEO_GPU_ONLY_BFLOAT16_REQUIRED")


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
