"""Isolated Qwen3.8 runtime V8: V7 speed with compact reviewer JSON.

V8 preserves Runtime V7 execution (CUDA graphs, prefix caching, n-gram
speculation, pinned Qwen3.8 snapshot) and changes only the structured-output
schema for repository reviews. The compact schema avoids forcing reviewers to
re-emit long criteria arrays and finding lists after they have already inspected
the original task, current source and public tests.

No model, storage, deployment, production routing or call-count behavior changes.
"""

from __future__ import annotations

import time
from typing import Any

import modal_code_qwen38_canary_runtime_v7 as v7

CONTRACT = "AVANTIQO_CODE_QWEN38_CANARY_RUNTIME_V8"
ENABLE_PREFIX_CACHING = v7.ENABLE_PREFIX_CACHING
FAST_BOOT_ENFORCE_EAGER = v7.FAST_BOOT_ENFORCE_EAGER
DEFAULT_MAX_TOKENS = v7.DEFAULT_MAX_TOKENS
MIN_MAX_TOKENS = v7.MIN_MAX_TOKENS
MAX_MAX_TOKENS = v7.MAX_MAX_TOKENS
SPECULATIVE_CONFIG = v7.SPECULATIVE_CONFIG

ACTOR_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "criteria": {
            "type": "array",
            "minItems": 1,
            "maxItems": 4,
            "items": {"type": "string"},
        },
        "edits": v7.ACTOR_SCHEMA["properties"]["edits"],
    },
    "required": ["criteria", "edits"],
    "additionalProperties": False,
}

COMPACT_REVIEWER_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "verdict": {"type": "string", "enum": ["pass", "repair"]},
        "all_material_criteria_checked": {"type": "boolean"},
        "clause": {"type": "string"},
        "gap": {"type": "string"},
    },
    "required": ["verdict", "all_material_criteria_checked", "clause", "gap"],
    "additionalProperties": False,
}

app = v7.app
_RUNTIME_IMAGE = v7._RUNTIME_IMAGE.add_local_python_source("modal_code_qwen38_canary_runtime_v7")
_FUNCTION_OPTIONS = {**v7._FUNCTION_OPTIONS, "image": _RUNTIME_IMAGE}


def _validated_request(request: dict[str, Any]) -> dict[str, Any]:
    if request.get("contract") != CONTRACT:
        raise ValueError(f"{CONTRACT}_REQUEST_CONTRACT_INVALID")
    if request.get("organization_id") != "benchmark-only":
        raise ValueError(f"{CONTRACT}_BENCHMARK_ONLY")
    instruction = str(request.get("instruction") or "").strip()
    if not instruction or len(instruction) > 120_000:
        raise ValueError(f"{CONTRACT}_INSTRUCTION_INVALID")
    role = str(request.get("role") or "actor").strip().lower()
    if role not in {"actor", "reviewer", "smoke"}:
        raise ValueError(f"{CONTRACT}_ROLE_INVALID")
    output_schema = str(
        request.get("output_schema")
        or ("actor" if role == "actor" else "reviewer_compact" if role == "reviewer" else "none")
    ).strip().lower()
    if output_schema not in {"actor", "reviewer_compact", "none"}:
        raise ValueError(f"{CONTRACT}_OUTPUT_SCHEMA_INVALID")
    if role == "actor" and output_schema != "actor":
        raise ValueError(f"{CONTRACT}_ACTOR_SCHEMA_REQUIRED")
    if role == "reviewer" and output_schema != "reviewer_compact":
        raise ValueError(f"{CONTRACT}_COMPACT_REVIEWER_SCHEMA_REQUIRED")
    max_tokens = int(request.get("max_tokens") or DEFAULT_MAX_TOKENS)
    if max_tokens < MIN_MAX_TOKENS or max_tokens > MAX_MAX_TOKENS:
        raise ValueError(f"{CONTRACT}_MAX_TOKENS_INVALID")
    return {
        **request,
        "instruction": instruction,
        "role": role,
        "output_schema": output_schema,
        "max_tokens": max_tokens,
    }


def _schema_for(name: str) -> dict[str, Any] | None:
    if name == "actor":
        return ACTOR_SCHEMA
    if name == "reviewer_compact":
        return COMPACT_REVIEWER_SCHEMA
    return None


@app.function(**_FUNCTION_OPTIONS)
def generate_v8(requests: list[dict[str, Any]], approved: bool = False) -> dict[str, Any]:
    if approved is not True:
        raise RuntimeError(f"{CONTRACT}_EXPLICIT_APPROVAL_REQUIRED")
    if not isinstance(requests, list) or not requests or len(requests) > 16:
        raise ValueError(f"{CONTRACT}_REQUEST_BATCH_INVALID")
    validated = [_validated_request(item) for item in requests if isinstance(item, dict)]
    if len(validated) != len(requests):
        raise ValueError(f"{CONTRACT}_REQUEST_OBJECT_REQUIRED")

    max_token_values = {int(item["max_tokens"]) for item in validated}
    schema_values = {str(item["output_schema"]) for item in validated}
    if len(max_token_values) != 1:
        raise ValueError(f"{CONTRACT}_MIXED_MAX_TOKENS_FORBIDDEN")
    if len(schema_values) != 1:
        raise ValueError(f"{CONTRACT}_MIXED_OUTPUT_SCHEMAS_FORBIDDEN")
    max_tokens = next(iter(max_token_values))
    output_schema = next(iter(schema_values))

    identity = v7.base._runtime_identity()
    tokenizer, engine = v7._load()
    from vllm import SamplingParams
    from vllm.sampling_params import StructuredOutputsParams

    schema = _schema_for(output_schema)
    structured = StructuredOutputsParams(json=schema) if schema is not None else None
    params = SamplingParams(
        temperature=0.0,
        max_tokens=max_tokens,
        skip_special_tokens=True,
        structured_outputs=structured,
    )
    rendered = [v7.base._render(tokenizer, item["instruction"]) for item in validated]
    started = time.perf_counter()
    outputs = engine.generate(rendered, params, use_tqdm=False)
    elapsed_ms = round((time.perf_counter() - started) * 1000)
    if len(outputs) != len(validated):
        raise RuntimeError(f"{CONTRACT}_OUTPUT_COUNT_INVALID")

    texts: list[str] = []
    prompt_token_counts: list[int] = []
    output_token_counts: list[int] = []
    for output in outputs:
        if not output.outputs:
            raise RuntimeError(f"{CONTRACT}_OUTPUT_REQUIRED")
        text = str(output.outputs[0].text or "").strip()
        if not text:
            raise RuntimeError(f"{CONTRACT}_OUTPUT_REQUIRED")
        texts.append(text)
        prompt_token_counts.append(v7._token_count(getattr(output, "prompt_token_ids", None)))
        output_token_counts.append(v7._token_count(getattr(output.outputs[0], "token_ids", None)))

    v7.base.model_volume.commit()
    return {
        "contract": CONTRACT,
        "status": "completed",
        "runtime_model": v7.base.policy.CANDIDATE_MODEL,
        "revision": v7.base.policy.CANDIDATE_REVISION,
        **identity,
        "outputs": texts,
        "batch_wall_ms": elapsed_ms,
        "request_roles": [item["role"] for item in validated],
        "output_schema": output_schema,
        "structured_outputs_enabled": schema is not None,
        "max_tokens": max_tokens,
        "prompt_token_counts": prompt_token_counts,
        "output_token_counts": output_token_counts,
        "max_num_seqs": v7.base.MAX_NUM_SEQS,
        "fast_boot_enforce_eager": FAST_BOOT_ENFORCE_EAGER,
        "prefix_caching_enabled": ENABLE_PREFIX_CACHING,
        "speculative_decoding_enabled": True,
        "speculative_method": "ngram",
        "speculative_tokens": SPECULATIVE_CONFIG["num_speculative_tokens"],
        "production_routing_change": False,
        "production_deploy_performed": False,
        "model_download_performed": False,
        "volume_created": False,
    }
