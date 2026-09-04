"""Isolated Qwen3.8 runtime V7: V6 speed with grammar-constrained JSON.

V7 preserves the paid-proven V6 execution path (non-eager CUDA graph/compile,
prefix caching and model-free n-gram speculation) and adds vLLM structured JSON
constraints for repository actor/reviewer requests. This removes malformed JSON
as an agent failure class without adding another model call, provider, model,
volume, deployment or production routing change.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path
from typing import Any

_MODULE_DIR = str(Path(__file__).resolve().parent)
if _MODULE_DIR not in sys.path:
    sys.path.insert(0, _MODULE_DIR)

import modal_code_qwen38_canary_runtime as base

CONTRACT = "AVANTIQO_CODE_QWEN38_CANARY_RUNTIME_V7"
ENABLE_PREFIX_CACHING = True
FAST_BOOT_ENFORCE_EAGER = False
DEFAULT_MAX_TOKENS = 640
MIN_MAX_TOKENS = 64
MAX_MAX_TOKENS = 1024
SPECULATIVE_CONFIG = {
    "method": "ngram",
    "num_speculative_tokens": 5,
    "prompt_lookup_min": 2,
    "prompt_lookup_max": 5,
}

ACTOR_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "criteria": {
            "type": "array",
            "minItems": 1,
            "maxItems": 16,
            "items": {"type": "string"},
        },
        "edits": {
            "type": "array",
            "minItems": 1,
            "maxItems": 12,
            "items": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "minLength": 1},
                    "old": {"type": "string"},
                    "new": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["path"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["criteria", "edits"],
    "additionalProperties": False,
}

REVIEWER_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "verdict": {"type": "string", "enum": ["pass", "repair"]},
        "criteria_checked": {
            "type": "array",
            "minItems": 1,
            "maxItems": 16,
            "items": {"type": "string"},
        },
        "findings": {
            "type": "array",
            "maxItems": 8,
            "items": {
                "type": "object",
                "properties": {
                    "clause": {"type": "string", "minLength": 1},
                    "gap": {"type": "string", "minLength": 1},
                },
                "required": ["clause", "gap"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["verdict", "criteria_checked", "findings"],
    "additionalProperties": False,
}

app = base.app
_RUNTIME_IMAGE = base.image.add_local_python_source("modal_code_qwen38_canary_runtime")
_FUNCTION_OPTIONS = {**base._FUNCTION_OPTIONS, "image": _RUNTIME_IMAGE}
_ENGINE: Any | None = None
_TOKENIZER: Any | None = None


def _load() -> tuple[Any, Any]:
    global _ENGINE, _TOKENIZER
    if _ENGINE is not None and _TOKENIZER is not None:
        return _TOKENIZER, _ENGINE
    base._runtime_identity()
    base._validate_snapshot()
    from vllm import LLM

    _ENGINE = LLM(
        model=str(base.CANDIDATE_SNAPSHOT),
        tokenizer=str(base.CANDIDATE_SNAPSHOT),
        dtype="auto",
        trust_remote_code=False,
        tensor_parallel_size=1,
        max_model_len=base.MAX_MODEL_LEN,
        max_num_seqs=base.MAX_NUM_SEQS,
        gpu_memory_utilization=base.GPU_MEMORY_UTILIZATION,
        language_model_only=True,
        enforce_eager=FAST_BOOT_ENFORCE_EAGER,
        enable_prefix_caching=ENABLE_PREFIX_CACHING,
        speculative_config=SPECULATIVE_CONFIG,
        disable_log_stats=True,
        load_format=base.LOAD_FORMAT,
        gdn_prefill_backend=base.GDN_PREFILL_BACKEND,
    )
    _TOKENIZER = _ENGINE.get_tokenizer()
    return _TOKENIZER, _ENGINE


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
    output_schema = str(request.get("output_schema") or (role if role in {"actor", "reviewer"} else "none")).strip().lower()
    if output_schema not in {"actor", "reviewer", "none"}:
        raise ValueError(f"{CONTRACT}_OUTPUT_SCHEMA_INVALID")
    if role == "actor" and output_schema != "actor":
        raise ValueError(f"{CONTRACT}_ACTOR_SCHEMA_REQUIRED")
    if role == "reviewer" and output_schema != "reviewer":
        raise ValueError(f"{CONTRACT}_REVIEWER_SCHEMA_REQUIRED")
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


def _token_count(value: Any) -> int:
    try:
        return len(value or [])
    except TypeError:
        return 0


def _schema_for(name: str) -> dict[str, Any] | None:
    if name == "actor":
        return ACTOR_SCHEMA
    if name == "reviewer":
        return REVIEWER_SCHEMA
    return None


@app.function(**_FUNCTION_OPTIONS)
def generate_v7(requests: list[dict[str, Any]], approved: bool = False) -> dict[str, Any]:
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

    identity = base._runtime_identity()
    tokenizer, engine = _load()
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
    rendered = [base._render(tokenizer, item["instruction"]) for item in validated]
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
        prompt_token_counts.append(_token_count(getattr(output, "prompt_token_ids", None)))
        output_token_counts.append(_token_count(getattr(output.outputs[0], "token_ids", None)))

    base.model_volume.commit()
    return {
        "contract": CONTRACT,
        "status": "completed",
        "runtime_model": base.policy.CANDIDATE_MODEL,
        "revision": base.policy.CANDIDATE_REVISION,
        **identity,
        "outputs": texts,
        "batch_wall_ms": elapsed_ms,
        "request_roles": [item["role"] for item in validated],
        "output_schema": output_schema,
        "structured_outputs_enabled": schema is not None,
        "max_tokens": max_tokens,
        "prompt_token_counts": prompt_token_counts,
        "output_token_counts": output_token_counts,
        "max_num_seqs": base.MAX_NUM_SEQS,
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
