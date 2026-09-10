import json
import os
from pathlib import Path
from typing import Any

import torch
from diffusers import AutoencoderKLWan, DiffusionPipeline
from PIL import Image

ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1"
QUALITY_CONTRACT = "AVANTIQO_VIDEO_WAN22_A14B_CINEMA_QUALITY_V1"
MEMORY_CONTRACT = "AVANTIQO_VIDEO_WAN22_A14B_32GB_MEMORY_PROFILE_V1"
T2V_MODEL = os.getenv("AVANTIQO_VIDEO_T2V_MODEL", "Wan-AI/Wan2.2-T2V-A14B-Diffusers").strip()
I2V_MODEL = os.getenv("AVANTIQO_VIDEO_I2V_MODEL", "Wan-AI/Wan2.2-I2V-A14B-Diffusers").strip()
HF_CACHE_ROOT = Path(os.getenv("AVANTIQO_VIDEO_HF_CACHE_ROOT", "/runpod-volume/huggingface-cache/hub"))
REQUIRE_CACHED_MODEL = os.getenv("AVANTIQO_VIDEO_REQUIRE_CACHED_MODEL", "1").strip().lower() not in {"0", "false", "no", "off"}
DEVICE = os.getenv("AVANTIQO_VIDEO_DEVICE", "cuda")
DTYPE = torch.bfloat16
T2V_INFERENCE_STEPS = max(40, int(os.getenv("AVANTIQO_VIDEO_T2V_CINEMA_INFERENCE_STEPS", "40")))
T2V_GUIDANCE_HIGH = float(os.getenv("AVANTIQO_VIDEO_T2V_CINEMA_GUIDANCE_HIGH", "4.0"))
T2V_GUIDANCE_LOW = float(os.getenv("AVANTIQO_VIDEO_T2V_CINEMA_GUIDANCE_LOW", "3.0"))
I2V_INFERENCE_STEPS = max(40, int(os.getenv("AVANTIQO_VIDEO_I2V_CINEMA_INFERENCE_STEPS", "40")))
I2V_GUIDANCE_HIGH = float(os.getenv("AVANTIQO_VIDEO_I2V_CINEMA_GUIDANCE_HIGH", "3.5"))
I2V_GUIDANCE_LOW = float(os.getenv("AVANTIQO_VIDEO_I2V_CINEMA_GUIDANCE_LOW", "3.5"))
GROUP_OFFLOAD_TYPE = "leaf_level"
GROUP_OFFLOAD_STREAM = True
QUANTIZATION_ENABLED = False
LAYERWISE_CASTING_ENABLED = False
_PIPELINES: dict[str, Any] = {}


def text(value: Any) -> str:
    return str(value or "").strip()


def object_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def native_720_dimensions(aspect_ratio: str) -> tuple[int, int]:
    if aspect_ratio == "9:16":
        return 720, 1280
    if aspect_ratio == "1:1":
        return 720, 720
    return 1280, 720


def frame_count(duration_seconds: int, fps: int) -> int:
    desired = max(17, duration_seconds * fps)
    return max(17, ((desired - 1) // 4) * 4 + 1)


def cached_model_path(model_id: str) -> str | None:
    if "/" not in model_id:
        return None
    model_root = HF_CACHE_ROOT / f"models--{model_id.replace('/', '--')}"
    snapshots_root = model_root / "snapshots"
    ref_main = model_root / "refs" / "main"
    if ref_main.is_file():
        revision = ref_main.read_text(encoding="utf-8").strip()
        candidate = snapshots_root / revision
        if candidate.is_dir():
            return str(candidate)
    if snapshots_root.is_dir():
        candidates = [entry for entry in snapshots_root.iterdir() if entry.is_dir()]
        if candidates:
            candidates.sort(key=lambda entry: entry.stat().st_mtime, reverse=True)
            return str(candidates[0])
    return None


def quality_settings(model_id: str) -> dict[str, Any]:
    if model_id == I2V_MODEL:
        return {
            "inference_steps": I2V_INFERENCE_STEPS,
            "guidance_scale": I2V_GUIDANCE_HIGH,
            "guidance_scale_2": I2V_GUIDANCE_LOW,
            "boundary_ratio": 0.900,
        }
    return {
        "inference_steps": T2V_INFERENCE_STEPS,
        "guidance_scale": T2V_GUIDANCE_HIGH,
        "guidance_scale_2": T2V_GUIDANCE_LOW,
        "boundary_ratio": 0.875,
    }


def pipeline(model_id: str):
    if model_id in _PIPELINES:
        return _PIPELINES[model_id]
    cached = cached_model_path(model_id)
    if REQUIRE_CACHED_MODEL and not cached:
        raise RuntimeError(f"AVANTIQO_VIDEO_CACHED_MODEL_REQUIRED:{model_id}")
    source = cached or model_id
    vae = AutoencoderKLWan.from_pretrained(
        source,
        subfolder="vae",
        torch_dtype=torch.float32,
        local_files_only=bool(cached),
        low_cpu_mem_usage=True,
    )
    pipe = DiffusionPipeline.from_pretrained(
        source,
        vae=vae,
        torch_dtype=DTYPE,
        local_files_only=bool(cached),
        low_cpu_mem_usage=True,
    )
    if not DEVICE.startswith("cuda") or not torch.cuda.is_available():
        raise RuntimeError("AVANTIQO_VIDEO_GPU_ONLY_CUDA_REQUIRED")
    if not hasattr(pipe, "enable_group_offload"):
        raise RuntimeError("AVANTIQO_VIDEO_GPU_ONLY_GROUP_OFFLOAD_REQUIRED")
    pipe.enable_group_offload(
        onload_device=torch.device("cuda"),
        offload_device=torch.device("cpu"),
        offload_type=GROUP_OFFLOAD_TYPE,
        use_stream=GROUP_OFFLOAD_STREAM,
    )
    if hasattr(pipe, "enable_attention_slicing"):
        pipe.enable_attention_slicing()
    if hasattr(pipe, "enable_vae_slicing"):
        pipe.enable_vae_slicing()
    if hasattr(pipe, "enable_vae_tiling"):
        pipe.enable_vae_tiling()
    try:
        vae_dtype = next(pipe.vae.parameters()).dtype
    except (AttributeError, StopIteration):
        vae_dtype = None
    if vae_dtype != torch.float32:
        raise RuntimeError(f"AVANTIQO_VIDEO_CINEMA_VAE_FP32_REQUIRED:{vae_dtype}")
    if getattr(pipe, "transformer", None) is None:
        raise RuntimeError("AVANTIQO_VIDEO_CINEMA_HIGH_NOISE_EXPERT_REQUIRED")
    if getattr(pipe, "transformer_2", None) is None:
        raise RuntimeError("AVANTIQO_VIDEO_CINEMA_SECOND_EXPERT_REQUIRED")
    _PIPELINES[model_id] = pipe
    return pipe


def negative_prompt(data: dict[str, Any]) -> str:
    explicit = text(data.get("negative_instruction"))
    if explicit:
        return explicit[:6000]
    control = object_value(data.get("cinematic_control"))
    values = control.get("negative_constraints")
    if not isinstance(values, list):
        return ""
    return ", ".join(text(value) for value in values if text(value))[:6000]


def _clean_visual_phrase(value: Any) -> str:
    phrase = text(value)
    if not phrase:
        return ""
    forbidden = (
        "previous_", "previous ", "purpose:", "camera:", "continuity:",
        "shot_specification", "identity_lock", "negative_constraints",
        "reject", "rejection", "json", "uuid", "metadata", "no text",
        "no typography", "no captions",
    )
    lowered = phrase.lower()
    if any(token in lowered for token in forbidden):
        return ""
    if any(ch in phrase for ch in "{}[]"):
        return ""
    if len(phrase) > 420:
        phrase = phrase[:420].rsplit(" ", 1)[0]
    return " ".join(phrase.split())


def cinematic_instruction(data: dict[str, Any]) -> str:
    base = _clean_visual_phrase(data.get("instruction"))
    control = object_value(data.get("cinematic_control"))
    if not control:
        return base

    camera = object_value(control.get("camera"))
    frame = object_value(control.get("frame_contract"))
    shot = object_value(control.get("shot_specification"))
    visual_candidates = [
        camera.get("movement"), camera.get("move"), camera.get("motion"),
        camera.get("framing"), camera.get("composition"), camera.get("lens"),
        shot.get("visual_direction"), shot.get("description"), shot.get("action"),
        shot.get("lighting"), shot.get("production_design"),
        frame.get("opening"), frame.get("opening_frame"),
        frame.get("closing"), frame.get("closing_frame"),
        control.get("beauty_intent"), control.get("focal_path"), control.get("depth_layers"),
        control.get("reveal_stage"), control.get("mystery_function"),
    ]
    phrases = []
    for candidate in visual_candidates:
        if isinstance(candidate, dict):
            for child in candidate.values():
                cleaned = _clean_visual_phrase(child)
                if cleaned and cleaned not in phrases:
                    phrases.append(cleaned)
        else:
            cleaned = _clean_visual_phrase(candidate)
            if cleaned and cleaned not in phrases:
                phrases.append(cleaned)
        if len(phrases) >= 8:
            break

    parts = [part for part in [base, *phrases] if part]
    return ". ".join(parts)[:2200].strip(" .") + ("." if parts else "")


def as_rgb_image(frame: Any) -> Image.Image:
    if isinstance(frame, Image.Image):
        return frame.convert("RGB")
    raise RuntimeError("AVANTIQO_VIDEO_GPU_FRAME_IMAGE_REQUIRED")
