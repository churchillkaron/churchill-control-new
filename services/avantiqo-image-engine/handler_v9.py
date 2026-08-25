from typing import Any

import runpod

import handler_v8 as v8

v7 = v8.v7
v6 = v8.v6
v4 = v8.v4
v3 = v8.v3

RUNTIME_ENTRYPOINT_REVISION = "AVANTIQO_IMAGE_HANDLER_V9_Z_IMAGE_DEFAULT_ROUTING_V1"
RUNTIME_REVISION = "AVANTIQO_IMAGE_MULTI_FOUNDATION_PHYSICAL_VOLUME_USAGE_QUALITY_V4"
DEFAULT_GENERATION_FOUNDATION = v4.PHOTOREAL_FOUNDATION_MODEL
DEFAULT_ROUTING_CONTRACT = "AVANTIQO_IMAGE_Z_IMAGE_DEFAULT_GENERATION_ROUTING_V1"


def _text(value: Any) -> str:
    return str(value or "").strip()


def _runtime_probe(job: dict[str, Any]) -> dict[str, Any]:
    output = v8._runtime_probe(job)
    if not isinstance(output, dict):
        raise RuntimeError("AVANTIQO_IMAGE_V9_BASE_PROBE_INVALID")

    candidate = dict(output.get("photoreal_candidate") or {})
    candidate.update(
        {
            "default_generation_foundation": True,
            "default_generation_routing_contract": DEFAULT_ROUTING_CONTRACT,
            "default_generation_routing_enabled": True,
            "automatic_production_routing_enabled": False,
        }
    )

    return {
        **output,
        "entrypoint": "handler_v9.py",
        "entrypoint_revision": RUNTIME_ENTRYPOINT_REVISION,
        "runtime_revision": RUNTIME_REVISION,
        "configured_generation_foundation": DEFAULT_GENERATION_FOUNDATION,
        "default_generation_routing_contract": DEFAULT_ROUTING_CONTRACT,
        "default_generation_routing_enabled": True,
        "automatic_production_routing_enabled": False,
        "photoreal_candidate": candidate,
    }


def _route_default_generation(job: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    raw = job.get("input") or {}
    if not isinstance(raw, dict):
        return job, False

    capability = _text(raw.get("capability"))
    explicit_foundation = _text(raw.get("foundation_model"))
    if capability != "ai.image.generate" or explicit_foundation:
        return job, False

    routed_input = {
        **raw,
        "foundation_model": DEFAULT_GENERATION_FOUNDATION,
    }
    return {
        **job,
        "input": routed_input,
    }, True


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data = job.get("input") or {}
    operation = _text(data.get("operation"))
    if operation == v3.RUNTIME_PROBE_OPERATION:
        return _runtime_probe(job)

    routed_job, default_routed = _route_default_generation(job)
    output = v8.handler(routed_job)
    if not default_routed or not isinstance(output, dict):
        return output

    selection = dict(output.get("foundation_selection") or {})
    selection.update(
        {
            "selected_foundation": DEFAULT_GENERATION_FOUNDATION,
            "selection_status": "OWNED_DEFAULT_GENERATION_FOUNDATION",
            "default_generation_routing_contract": DEFAULT_ROUTING_CONTRACT,
            "default_generation_routing_enabled": True,
            "automatic_production_routing_enabled": False,
            "qwen_replaced_for_generate_default": True,
        }
    )
    return {
        **output,
        "runtime_revision": RUNTIME_REVISION,
        "foundation_selection": selection,
        "default_generation_routing_contract": DEFAULT_ROUTING_CONTRACT,
        "default_generation_routing_applied": True,
    }


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
