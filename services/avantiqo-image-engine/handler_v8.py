import inspect
from typing import Any

import runpod

import handler_v7 as v7

v6 = v7.v6
v4 = v7.v4
v3 = v7.v3

RUNTIME_ENTRYPOINT_REVISION = "AVANTIQO_IMAGE_HANDLER_V8_Z_IMAGE_ANTITEXT_COMPILER_V1"
RUNTIME_REVISION = "AVANTIQO_IMAGE_MULTI_FOUNDATION_PHYSICAL_VOLUME_USAGE_QUALITY_V3"
PHOTOREAL_PROFILE = "AVANTIQO_IMAGE_COMMERCIAL_PHOTOREAL_CANDIDATE_V3"
PHOTOREAL_POLICY = "Z_IMAGE_RESTRAINED_PHOTOGRAPHIC_V3"
QUALITY_COMPILER_CONTRACT = "AVANTIQO_IMAGE_Z_IMAGE_QUALITY_COMPILER_V2"
ANTITEXT_POLICY_CONTRACT = "AVANTIQO_IMAGE_Z_IMAGE_ANTITEXT_POLICY_V1"
DEFAULT_INFERENCE_STEPS = 28
DEFAULT_GUIDANCE_SCALE = 4.0

ANTITEXT_NEGATIVE = (
    "text, letters, words, characters, numbers, typography, caption, subtitle, headline, label, "
    "logo, brand mark, emblem, badge, seal, stamp, watermark, signature, restaurant name, menu text, "
    "signage, storefront sign, wall sign, printed sign, poster, advertising copy, packaging text, table card, "
    "Chinese characters, Japanese characters, Korean characters, Latin letters, calligraphy, pseudo-text, "
    "gibberish text, fake lettering, decorative lettering, unreadable lettering, AI-generated text, "
    "corner watermark, corner logo, overlay graphic"
)

QUALITY_BASE_NEGATIVE = f"{v7.QUALITY_BASE_NEGATIVE}, {ANTITEXT_NEGATIVE}"


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
        "antitext_policy_contract": ANTITEXT_POLICY_CONTRACT,
        "negative_policy_applied": True,
        "antitext_policy_applied": True,
        "user_negative_prompt_preserved": user_negative_preserved,
        "default_inference_steps": DEFAULT_INFERENCE_STEPS,
        "default_guidance_scale": DEFAULT_GUIDANCE_SCALE,
        "prompt_rewrite_applied": False,
        "positive_constraint_suffix_applied": False,
        "compiled_prompt_persisted": False,
    }


# V8 preserves the V7 realism compiler and V6 physical-volume accounting,
# while baking in the anti-text/logo policy proven by the controlled V7 A/B.
v4.DEFAULT_INFERENCE_STEPS = DEFAULT_INFERENCE_STEPS
v4.DEFAULT_GUIDANCE_SCALE = DEFAULT_GUIDANCE_SCALE
v4.PHOTOREAL_PROFILE = PHOTOREAL_PROFILE
v4.PHOTOREAL_POLICY = PHOTOREAL_POLICY
v4.PHOTOREAL_NEGATIVE_PROMPT = QUALITY_BASE_NEGATIVE
v4._photoreal_guidance = _photoreal_guidance
v4.RUNTIME_ENTRYPOINT_REVISION = RUNTIME_ENTRYPOINT_REVISION
v4.RUNTIME_REVISION = RUNTIME_REVISION


def _runtime_probe(job: dict[str, Any]) -> dict[str, Any]:
    output = v7._runtime_probe(job)
    if not isinstance(output, dict):
        raise RuntimeError("AVANTIQO_IMAGE_V8_BASE_PROBE_INVALID")
    candidate = dict(output.get("photoreal_candidate") or {})
    candidate.update(
        {
            "quality_profile": PHOTOREAL_PROFILE,
            "quality_policy": PHOTOREAL_POLICY,
            "quality_compiler_contract": QUALITY_COMPILER_CONTRACT,
            "antitext_policy_contract": ANTITEXT_POLICY_CONTRACT,
            "negative_policy_applied": True,
            "antitext_policy_applied": True,
            "default_inference_steps": DEFAULT_INFERENCE_STEPS,
            "default_guidance_scale": DEFAULT_GUIDANCE_SCALE,
            "prompt_rewrite_applied": False,
            "positive_constraint_suffix_applied": False,
            "automatic_production_routing_enabled": False,
        }
    )
    return {
        **output,
        "entrypoint": "handler_v8.py",
        "entrypoint_revision": RUNTIME_ENTRYPOINT_REVISION,
        "runtime_revision": RUNTIME_REVISION,
        "photoreal_candidate": candidate,
    }


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data = job.get("input") or {}
    operation = str(data.get("operation") or "").strip()
    if operation == v3.RUNTIME_PROBE_OPERATION:
        return _runtime_probe(job)
    return v7.handler(job)


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
