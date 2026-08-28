import os
from typing import Any

import runpod
import torch
from diffusers import AutoencoderKLWan, DiffusionPipeline

import handler as legacy
import handler_v3 as v3
import handler_v4 as v4

RUNTIME_ENTRYPOINT = "handler_v5.py"
RUNTIME_ENTRYPOINT_REVISION = "AVANTIQO_VIDEO_HANDLER_V5_WAN22_32GB_GROUP_OFFLOAD_V1"
RUNTIME_REVISION = "AVANTIQO_VIDEO_WAN22_A14B_32GB_GROUP_OFFLOAD_V1"
MEMORY_CONTRACT = "AVANTIQO_VIDEO_WAN22_A14B_32GB_MEMORY_PROFILE_V1"
TARGET_MINIMUM_VRAM_GB = 32
GROUP_OFFLOAD_TYPE = "leaf_level"
GROUP_OFFLOAD_STREAM = True
QUANTIZATION_ENABLED = False
LAYERWISE_CASTING_ENABLED = False

_V4_PIPELINE = v4._quality_pipeline


def _system_memory_gb() -> float | None:
    try:
        with open("/proc/meminfo", "r", encoding="utf-8") as handle:
            for line in handle:
                if line.startswith("MemTotal:"):
                    kib = int(line.split()[1])
                    return round(kib / 1024 / 1024, 2)
    except (OSError, ValueError, IndexError):
        return None
    return None


def _cuda_runtime() -> dict[str, Any]:
    if not torch.cuda.is_available():
        return {
            "cuda_available": False,
            "device_name": None,
            "device_total_memory_gb": None,
            "bfloat16_supported": False,
        }
    props = torch.cuda.get_device_properties(0)
    return {
        "cuda_available": True,
        "device_name": props.name,
        "device_total_memory_gb": round(props.total_memory / 1024**3, 2),
        "bfloat16_supported": bool(torch.cuda.is_bf16_supported()),
    }


def _low_memory_pipeline(model_id: str):
    if model_id not in v4.QUALITY_MODELS:
        return _V4_PIPELINE(model_id)
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
        low_cpu_mem_usage=True,
    )
    pipe = DiffusionPipeline.from_pretrained(
        model_source,
        vae=vae,
        torch_dtype=legacy.DTYPE,
        local_files_only=bool(cached_path),
        low_cpu_mem_usage=True,
    )
    pipe = legacy._configure_scheduler(pipe, model_id)

    if legacy.DEVICE.startswith("cuda"):
        if not torch.cuda.is_available():
            raise RuntimeError("AVANTIQO_VIDEO_32GB_CUDA_REQUIRED")
        if not hasattr(pipe, "enable_group_offload"):
            raise RuntimeError("AVANTIQO_VIDEO_32GB_GROUP_OFFLOAD_UNAVAILABLE")
        pipe.enable_group_offload(
            onload_device=torch.device("cuda"),
            offload_device=torch.device("cpu"),
            offload_type=GROUP_OFFLOAD_TYPE,
            use_stream=GROUP_OFFLOAD_STREAM,
        )
    else:
        pipe.to(legacy.DEVICE)

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

    wrapped = v4._CinemaQualityPipeline(pipe, model_id)
    legacy._PIPELINES[model_id] = wrapped
    return wrapped


legacy._pipeline = _low_memory_pipeline


def _annotate(output: dict[str, Any]) -> dict[str, Any]:
    cuda = _cuda_runtime()
    output["entrypoint"] = RUNTIME_ENTRYPOINT
    output["entrypoint_revision"] = RUNTIME_ENTRYPOINT_REVISION
    output["runtime_revision"] = RUNTIME_REVISION
    output["quality_contract"] = v4.QUALITY_CONTRACT
    output["memory_contract"] = MEMORY_CONTRACT
    output["memory_profile"] = {
        "target_minimum_vram_gb": TARGET_MINIMUM_VRAM_GB,
        "system_memory_gb": _system_memory_gb(),
        "cuda_available": cuda["cuda_available"],
        "device_name": cuda["device_name"],
        "device_total_memory_gb": cuda["device_total_memory_gb"],
        "bfloat16_supported": cuda["bfloat16_supported"],
        "group_offload_enabled": True,
        "group_offload_type": GROUP_OFFLOAD_TYPE,
        "group_offload_stream": GROUP_OFFLOAD_STREAM,
        "quantization_enabled": QUANTIZATION_ENABLED,
        "layerwise_casting_enabled": LAYERWISE_CASTING_ENABLED,
        "diffusion_dtype": str(legacy.DTYPE).replace("torch.", ""),
        "vae_decode_dtype": "float32",
        "quality_profile_changed": False,
    }
    return output


def handler(job: dict[str, Any]) -> dict[str, Any]:
    output = v4.handler(job)
    if not isinstance(output, dict):
        return output
    return _annotate(output)


@runpod.serverless.register_fitness_check
def check_32gb_runtime():
    if TARGET_MINIMUM_VRAM_GB != 32:
        raise RuntimeError("AVANTIQO_VIDEO_32GB_TARGET_INVALID")
    if GROUP_OFFLOAD_TYPE != "leaf_level":
        raise RuntimeError("AVANTIQO_VIDEO_32GB_GROUP_OFFLOAD_TYPE_INVALID")
    if not hasattr(DiffusionPipeline, "enable_group_offload"):
        raise RuntimeError("AVANTIQO_VIDEO_32GB_GROUP_OFFLOAD_API_REQUIRED")
    if QUANTIZATION_ENABLED or LAYERWISE_CASTING_ENABLED:
        raise RuntimeError("AVANTIQO_VIDEO_32GB_QUALITY_PRESERVING_PROFILE_REQUIRED")
    if legacy.DTYPE != torch.bfloat16:
        raise RuntimeError("AVANTIQO_VIDEO_32GB_BFLOAT16_DIFFUSION_REQUIRED")


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
