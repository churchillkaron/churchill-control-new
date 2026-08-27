import contextvars
import os
from typing import Any

import runpod
import torch
from diffusers import AutoencoderKLWan, DiffusionPipeline

import handler as legacy
import handler_v3 as v3

RUNTIME_ENTRYPOINT = "handler_v4.py"
RUNTIME_ENTRYPOINT_REVISION = "AVANTIQO_VIDEO_HANDLER_V4_WAN22_CINEMA_QUALITY_V1"
RUNTIME_REVISION = "AVANTIQO_VIDEO_WAN22_A14B_CINEMA_QUALITY_V1"
QUALITY_CONTRACT = "AVANTIQO_VIDEO_WAN22_A14B_CINEMA_QUALITY_V1"
QUALITY_CAPABILITIES = {"ai.video.generate", "ai.video.image_to_video"}
QUALITY_MODELS = {v3.DEFAULT_T2V_MODEL, v3.DEFAULT_I2V_MODEL}
MIN_CINEMA_FPS = max(16, int(os.getenv("AVANTIQO_VIDEO_CINEMA_MIN_FPS", "16")))
T2V_INFERENCE_STEPS = max(40, int(os.getenv("AVANTIQO_VIDEO_T2V_CINEMA_INFERENCE_STEPS", "40")))
T2V_GUIDANCE_HIGH = float(os.getenv("AVANTIQO_VIDEO_T2V_CINEMA_GUIDANCE_HIGH", "4.0"))
T2V_GUIDANCE_LOW = float(os.getenv("AVANTIQO_VIDEO_T2V_CINEMA_GUIDANCE_LOW", "3.0"))
I2V_INFERENCE_STEPS = max(40, int(os.getenv("AVANTIQO_VIDEO_I2V_CINEMA_INFERENCE_STEPS", "40")))
I2V_GUIDANCE_HIGH = float(os.getenv("AVANTIQO_VIDEO_I2V_CINEMA_GUIDANCE_HIGH", "3.5"))
I2V_GUIDANCE_LOW = float(os.getenv("AVANTIQO_VIDEO_I2V_CINEMA_GUIDANCE_LOW", "3.5"))
CINEMA_EXPORT_QUALITY = max(9.0, min(10.0, float(os.getenv("AVANTIQO_VIDEO_CINEMA_EXPORT_QUALITY", "10.0"))))

_ORIGINAL_PIPELINE = legacy._pipeline
_ACTIVE_NEGATIVE_PROMPT = contextvars.ContextVar("avantiqo_video_negative_prompt", default="")
_ACTIVE_CAPABILITY = contextvars.ContextVar("avantiqo_video_quality_capability", default="")


def _text(value: Any) -> str:
    return str(value or "").strip()


def _object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _native_720_dimensions(aspect_ratio: str) -> tuple[int, int]:
    if aspect_ratio == "9:16":
        return 720, 1280
    if aspect_ratio == "1:1":
        return 720, 720
    return 1280, 720


def _negative_prompt(data: dict[str, Any]) -> str:
    explicit = _text(data.get("negative_instruction"))
    if explicit:
        return explicit
    control = _object(data.get("cinematic_control"))
    values = control.get("negative_constraints")
    if not isinstance(values, list):
        return ""
    return ", ".join(_text(value) for value in values if _text(value))[:6000]


def _quality_settings(model_id: str) -> dict[str, Any]:
    if model_id == v3.DEFAULT_I2V_MODEL:
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


class _CinemaQualityPipeline:
    def __init__(self, pipe: Any, model_id: str):
        self._pipe = pipe
        self._model_id = model_id

    def __getattr__(self, name: str) -> Any:
        return getattr(self._pipe, name)

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        settings = _quality_settings(self._model_id)
        kwargs["num_inference_steps"] = settings["inference_steps"]
        kwargs["guidance_scale"] = settings["guidance_scale"]
        kwargs["guidance_scale_2"] = settings["guidance_scale_2"]
        negative = _ACTIVE_NEGATIVE_PROMPT.get()
        if negative and not _text(kwargs.get("negative_prompt")):
            kwargs["negative_prompt"] = negative
        return self._pipe(*args, **kwargs)


def _quality_pipeline(model_id: str):
    if model_id not in QUALITY_MODELS:
        return _ORIGINAL_PIPELINE(model_id)
    if model_id in legacy._PIPELINES:
        return legacy._PIPELINES[model_id]

    cached_path = legacy._cached_model_path(model_id)
    if legacy.REQUIRE_CACHED_MODEL and not cached_path:
        raise RuntimeError(f"AVANTIQO_VIDEO_CACHED_MODEL_REQUIRED:{model_id}")
    model_source = cached_path or model_id
    vae = AutoencoderKLWan.from_pretrained(
        model_source,
        subfolder="vae",
        torch_dtype=torch.float32,
        local_files_only=bool(cached_path),
    )
    pipe = DiffusionPipeline.from_pretrained(
        model_source,
        vae=vae,
        torch_dtype=legacy.DTYPE,
        device_map="balanced" if legacy.DEVICE.startswith("cuda") else None,
        local_files_only=bool(cached_path),
    )
    pipe = legacy._configure_scheduler(pipe, model_id)
    if not legacy.DEVICE.startswith("cuda"):
        pipe.to(legacy.DEVICE)
    if hasattr(pipe, "enable_attention_slicing"):
        pipe.enable_attention_slicing()
    if hasattr(pipe, "enable_vae_slicing"):
        pipe.enable_vae_slicing()

    try:
        vae_dtype = next(pipe.vae.parameters()).dtype
    except (AttributeError, StopIteration):
        vae_dtype = None
    if vae_dtype != torch.float32:
        raise RuntimeError(f"AVANTIQO_VIDEO_CINEMA_VAE_FP32_REQUIRED:{vae_dtype}")
    if getattr(pipe, "transformer_2", None) is None:
        raise RuntimeError("AVANTIQO_VIDEO_CINEMA_SECOND_EXPERT_REQUIRED")

    wrapped = _CinemaQualityPipeline(pipe, model_id)
    legacy._PIPELINES[model_id] = wrapped
    return wrapped


legacy._dimensions = _native_720_dimensions
legacy._pipeline = _quality_pipeline
legacy.EXPORT_QUALITY = CINEMA_EXPORT_QUALITY


def _normalize_job(job: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    source = job.get("input") or {}
    capability = _text(source.get("capability"))
    if capability not in QUALITY_CAPABILITIES:
        return job, {
            "applied": False,
            "requested_fps": None,
            "effective_fps": None,
            "negative_prompt_applied": False,
        }

    data = dict(source)
    requested_fps = int(data.get("fps") or 24)
    effective_fps = max(MIN_CINEMA_FPS, requested_fps)
    data["fps"] = effective_fps
    data["quality_profile"] = _text(data.get("quality_profile")) or "cinema"
    negative = _negative_prompt(data)
    return {**job, "input": data}, {
        "applied": True,
        "requested_fps": requested_fps,
        "effective_fps": effective_fps,
        "negative_prompt": negative,
        "negative_prompt_applied": bool(negative),
    }


def _annotate_runtime(output: dict[str, Any]) -> dict[str, Any]:
    output["entrypoint"] = RUNTIME_ENTRYPOINT
    output["entrypoint_revision"] = RUNTIME_ENTRYPOINT_REVISION
    output["runtime_revision"] = RUNTIME_REVISION
    output["quality_contract"] = QUALITY_CONTRACT
    output["quality_defaults"] = {
        "native_720p_landscape": [1280, 720],
        "native_720p_portrait": [720, 1280],
        "minimum_cinema_fps": MIN_CINEMA_FPS,
        "t2v": {
            "inference_steps": T2V_INFERENCE_STEPS,
            "guidance_scale_high_noise": T2V_GUIDANCE_HIGH,
            "guidance_scale_low_noise": T2V_GUIDANCE_LOW,
            "boundary_ratio": 0.875,
        },
        "i2v": {
            "inference_steps": I2V_INFERENCE_STEPS,
            "guidance_scale_high_noise": I2V_GUIDANCE_HIGH,
            "guidance_scale_low_noise": I2V_GUIDANCE_LOW,
            "boundary_ratio": 0.900,
        },
        "vae_decode_dtype": "float32",
        "diffusion_dtype": str(legacy.DTYPE).replace("torch.", ""),
        "export_quality": CINEMA_EXPORT_QUALITY,
        "negative_prompt_source": "REQUEST_OR_STRUCTURED_NEGATIVE_CONSTRAINTS_ONLY",
    }
    return output


def _annotate_generation(output: dict[str, Any], quality: dict[str, Any], capability: str) -> dict[str, Any]:
    if capability not in QUALITY_CAPABILITIES:
        return output
    model_id = v3.DEFAULT_I2V_MODEL if capability == "ai.video.image_to_video" else v3.DEFAULT_T2V_MODEL
    settings = _quality_settings(model_id)
    output["entrypoint"] = RUNTIME_ENTRYPOINT
    output["entrypoint_revision"] = RUNTIME_ENTRYPOINT_REVISION
    output["runtime_revision"] = RUNTIME_REVISION
    output["quality_contract"] = QUALITY_CONTRACT
    output["quality_profile_applied"] = True
    output["native_wan22_720p_dimensions_applied"] = True
    output["requested_fps"] = quality.get("requested_fps")
    output["effective_fps"] = quality.get("effective_fps")
    output["minimum_cinema_fps"] = MIN_CINEMA_FPS
    output["inference_steps"] = settings["inference_steps"]
    output["guidance_scale_high_noise"] = settings["guidance_scale"]
    output["guidance_scale_low_noise"] = settings["guidance_scale_2"]
    output["moe_two_stage_guidance_applied"] = True
    output["boundary_ratio"] = settings["boundary_ratio"]
    output["vae_decode_dtype"] = "float32"
    output["diffusion_dtype"] = str(legacy.DTYPE).replace("torch.", "")
    output["negative_prompt_applied"] = quality.get("negative_prompt_applied") is True
    output["export_quality"] = CINEMA_EXPORT_QUALITY
    return output


def handler(job: dict[str, Any]) -> dict[str, Any]:
    normalized, quality = _normalize_job(job)
    data = normalized.get("input") or {}
    capability = _text(data.get("capability"))
    negative_token = _ACTIVE_NEGATIVE_PROMPT.set(_text(quality.get("negative_prompt")))
    capability_token = _ACTIVE_CAPABILITY.set(capability)
    try:
        output = v3.handler(normalized)
    finally:
        _ACTIVE_NEGATIVE_PROMPT.reset(negative_token)
        _ACTIVE_CAPABILITY.reset(capability_token)
    if not isinstance(output, dict):
        return output
    operation = _text(data.get("operation"))
    if operation in {"runtime_probe", "inspect_foundation_capacity", v3.CACHE_OPERATION}:
        return _annotate_runtime(output)
    return _annotate_generation(output, quality, capability)


@runpod.serverless.register_fitness_check
def check_quality_runtime():
    if MIN_CINEMA_FPS < 16:
        raise RuntimeError("AVANTIQO_VIDEO_CINEMA_MIN_FPS_INVALID")
    if T2V_INFERENCE_STEPS < 40 or I2V_INFERENCE_STEPS < 40:
        raise RuntimeError("AVANTIQO_VIDEO_CINEMA_INFERENCE_STEPS_INVALID")
    if not (1.0 < T2V_GUIDANCE_LOW <= T2V_GUIDANCE_HIGH <= 8.0):
        raise RuntimeError("AVANTIQO_VIDEO_T2V_CINEMA_GUIDANCE_INVALID")
    if not (1.0 < I2V_GUIDANCE_LOW <= 8.0 and 1.0 < I2V_GUIDANCE_HIGH <= 8.0):
        raise RuntimeError("AVANTIQO_VIDEO_I2V_CINEMA_GUIDANCE_INVALID")
    if not 9.0 <= CINEMA_EXPORT_QUALITY <= 10.0:
        raise RuntimeError("AVANTIQO_VIDEO_CINEMA_EXPORT_QUALITY_INVALID")
    if legacy.T2V_MODEL != v3.DEFAULT_T2V_MODEL or legacy.I2V_MODEL != v3.DEFAULT_I2V_MODEL:
        raise RuntimeError("AVANTIQO_VIDEO_CINEMA_DEFAULT_FOUNDATION_REQUIRED")


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
