import inspect
from typing import Any

import runpod

import handler_v6 as v6

v4 = v6.v4
v3 = v6.v3

RUNTIME_ENTRYPOINT_REVISION = "AVANTIQO_IMAGE_HANDLER_V7_Z_IMAGE_REALISM_COMPILER_V1"
RUNTIME_REVISION = "AVANTIQO_IMAGE_MULTI_FOUNDATION_PHYSICAL_VOLUME_USAGE_QUALITY_V2"
PHOTOREAL_PROFILE = "AVANTIQO_IMAGE_COMMERCIAL_PHOTOREAL_CANDIDATE_V2"
PHOTOREAL_POLICY = "Z_IMAGE_RESTRAINED_PHOTOGRAPHIC_V2"
QUALITY_COMPILER_CONTRACT = "AVANTIQO_IMAGE_Z_IMAGE_QUALITY_COMPILER_V1"
DEFAULT_INFERENCE_STEPS = 28
DEFAULT_GUIDANCE_SCALE = 4.0

QUALITY_BASE_NEGATIVE = (
    "CGI, 3D render, illustration, plastic skin, plastic food, waxy food, lacquered food, "
    "polished resin food, artificial food shine, mirror-gloss sauce, overly smooth meat, "
    "rubbery meat, wrinkled repetitive meat grain, repeated texture, perfect grill grid, "
    "geometric steak, cylindrical steak, molded meat, oversized food, perfect repeated potato shapes, "
    "identical vegetables, mathematically repeated plating, synthetic stock-photo symmetry, "
    "excessive bokeh, overly blurred subject edges, impossible reflections, malformed hands, "
    "extra fingers, duplicate people, text, watermark"
)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _merge_negative_prompt(existing: str) -> tuple[str, bool]:
    segments = [QUALITY_BASE_NEGATIVE]
    if existing:
        segments.append(existing)
    seen: set[str] = set()
    merged: list[str] = []
    for segment in segments:
        normalized = _text(segment)
        if normalized and normalized.lower() not in seen:
            seen.add(normalized.lower())
            merged.append(normalized)
    return ", ".join(merged), bool(existing)


def _photoreal_guidance(pipe: Any, params: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    scale = float(params.get("guidance_scale") or params.get("true_cfg_scale") or DEFAULT_GUIDANCE_SCALE)
    if scale < 1.0 or scale > 10.0:
        raise ValueError("AVANTIQO_IMAGE_PHOTOREAL_GUIDANCE_SCALE_INVALID")

    negative_prompt, user_negative_preserved = _merge_negative_prompt(_text(params.get("negative_prompt")))
    try:
        accepted = set(inspect.signature(pipe.__call__).parameters)
    except (TypeError, ValueError):
        accepted = set()
    if "guidance_scale" not in accepted:
        raise RuntimeError("AVANTIQO_IMAGE_PHOTOREAL_CFG_REQUIRED")
    if "negative_prompt" not in accepted:
        raise RuntimeError("AVANTIQO_IMAGE_PHOTOREAL_NEGATIVE_CONTROL_REQUIRED")

    kwargs: dict[str, Any] = {
        "guidance_scale": scale,
        "negative_prompt": negative_prompt,
    }
    if "cfg_normalization" in accepted:
        kwargs["cfg_normalization"] = False

    return kwargs, {
        "mode": "CFG",
        "scale": scale,
        "negative_prompt_supplied": True,
        "negative_prompt_has_content": bool(negative_prompt),
        "cfg_normalization": False if "cfg_normalization" in accepted else None,
        "quality_profile": PHOTOREAL_PROFILE,
        "quality_policy": PHOTOREAL_POLICY,
        "quality_compiler_contract": QUALITY_COMPILER_CONTRACT,
        "negative_policy_applied": True,
        "user_negative_prompt_preserved": user_negative_preserved,
        "default_inference_steps": DEFAULT_INFERENCE_STEPS,
        "prompt_rewrite_applied": False,
        "positive_constraint_suffix_applied": False,
        "compiled_prompt_persisted": False,
    }


# V7 preserves V6's physical network-volume accounting and changes only the
# Z-Image quality defaults/transport controls proven by the controlled A/B.
v4.DEFAULT_INFERENCE_STEPS = DEFAULT_INFERENCE_STEPS
v4.DEFAULT_GUIDANCE_SCALE = DEFAULT_GUIDANCE_SCALE
v4.PHOTOREAL_PROFILE = PHOTOREAL_PROFILE
v4.PHOTOREAL_POLICY = PHOTOREAL_POLICY
v4.PHOTOREAL_NEGATIVE_PROMPT = QUALITY_BASE_NEGATIVE
v4._photoreal_guidance = _photoreal_guidance
v4.RUNTIME_ENTRYPOINT_REVISION = RUNTIME_ENTRYPOINT_REVISION
v4.RUNTIME_REVISION = RUNTIME_REVISION


def _runtime_probe(job: dict[str, Any]) -> dict[str, Any]:
    output = v6._runtime_probe(job)
    if not isinstance(output, dict):
        raise RuntimeError("AVANTIQO_IMAGE_V7_BASE_PROBE_INVALID")
    candidate = dict(output.get("photoreal_candidate") or {})
    candidate.update(
        {
            "quality_profile": PHOTOREAL_PROFILE,
            "quality_policy": PHOTOREAL_POLICY,
            "quality_compiler_contract": QUALITY_COMPILER_CONTRACT,
            "negative_policy_applied": True,
            "default_inference_steps": DEFAULT_INFERENCE_STEPS,
            "default_guidance_scale": DEFAULT_GUIDANCE_SCALE,
            "prompt_rewrite_applied": False,
            "positive_constraint_suffix_applied": False,
            "automatic_production_routing_enabled": False,
        }
    )
    return {
        **output,
        "entrypoint": "handler_v7.py",
        "entrypoint_revision": RUNTIME_ENTRYPOINT_REVISION,
        "runtime_revision": RUNTIME_REVISION,
        "photoreal_candidate": candidate,
    }


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data = job.get("input") or {}
    operation = str(data.get("operation") or "").strip()
    if operation == v3.RUNTIME_PROBE_OPERATION:
        return _runtime_probe(job)
    return v6.handler(job)


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
