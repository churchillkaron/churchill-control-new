from typing import Any

import handler_v8 as v8
from still_blueprint_compiler import COMPILER_CONTRACT, compile_still_blueprint_job

v7 = v8.v7
v6 = v8.v6
v4 = v8.v4
v3 = v8.v3

RUNTIME_ENTRYPOINT_REVISION = "AVANTIQO_IMAGE_HANDLER_V9_STILL_BLUEPRINT_COMPILER_V2"
RUNTIME_REVISION = "AVANTIQO_IMAGE_MULTI_FOUNDATION_STILL_BLUEPRINT_QUALITY_V5"
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
        "still_blueprint_compiler_contract": COMPILER_CONTRACT,
        "still_blueprint_compiler_enabled": True,
        "still_blueprint_compiler_zero_generation_probe": True,
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

    compiled_job, still_blueprint_compiler = compile_still_blueprint_job(job)
    routed_job, default_routed = _route_default_generation(compiled_job)
    output = v8.handler(routed_job)
    if not isinstance(output, dict):
        return output
    if still_blueprint_compiler is not None:
        output = {
            **output,
            "still_blueprint_compiler": still_blueprint_compiler,
        }
    if not default_routed:
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
    pass  # Modal invokes the handler directly.