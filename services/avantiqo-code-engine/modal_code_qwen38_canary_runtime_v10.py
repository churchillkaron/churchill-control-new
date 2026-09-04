"""Isolated Qwen3.8 runtime V10: V9 contracts with native MTP decoding.

V10 changes only the speculative decoding mechanism. The paid-proven V9 actor
schema, compact reviewer schema, rendering, sampling, model snapshot, storage,
CUDA-graph execution, prefix caching, call limits and production isolation stay
unchanged.

Qwen3.8 resolves to the Qwen3.5 text architecture and the pinned checkpoint
contains a native MTP prediction layer. vLLM 0.28.0 supports that family through
its generic ``mtp`` speculative method. A single speculative token is the
conservative native-head setting: no second model, no extra download and no
separate draft storage.
"""

from __future__ import annotations

import time
from typing import Any

import modal_code_qwen38_canary_runtime_v9 as v9

CONTRACT = "AVANTIQO_CODE_QWEN38_CANARY_RUNTIME_V10"
ENABLE_PREFIX_CACHING = v9.ENABLE_PREFIX_CACHING
FAST_BOOT_ENFORCE_EAGER = v9.FAST_BOOT_ENFORCE_EAGER
DEFAULT_MAX_TOKENS = v9.DEFAULT_MAX_TOKENS
MIN_MAX_TOKENS = v9.MIN_MAX_TOKENS
MAX_MAX_TOKENS = v9.MAX_MAX_TOKENS
ACTOR_SCHEMA = v9.ACTOR_SCHEMA
COMPACT_REVIEWER_SCHEMA = v9.COMPACT_REVIEWER_SCHEMA
MTP_SPECULATIVE_CONFIG = {
    "method": "mtp",
    "num_speculative_tokens": 1,
}

app = v9.app
_RUNTIME_IMAGE = v9._RUNTIME_IMAGE.add_local_python_source("modal_code_qwen38_canary_runtime_v9")
_FUNCTION_OPTIONS = {**v9._FUNCTION_OPTIONS, "image": _RUNTIME_IMAGE}
_ENGINE: Any | None = None
_TOKENIZER: Any | None = None


def _load() -> tuple[Any, Any]:
    global _ENGINE, _TOKENIZER
    if _ENGINE is not None and _TOKENIZER is not None:
        return _TOKENIZER, _ENGINE

    base = v9.v7.base
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
        speculative_config=MTP_SPECULATIVE_CONFIG,
        disable_log_stats=True,
        load_format=base.LOAD_FORMAT,
        gdn_prefill_backend=base.GDN_PREFILL_BACKEND,
    )
    _TOKENIZER = _ENGINE.get_tokenizer()
    return _TOKENIZER, _ENGINE


def _validated_request(request: dict[str, Any]) -> dict[str, Any]:
    if request.get("contract") != CONTRACT:
        raise ValueError(f"{CONTRACT}_REQUEST_CONTRACT_INVALID")
    adapted = {**request, "contract": v9.CONTRACT}
    validated = v9._validated_request(adapted)
    return {**validated, "contract": CONTRACT}


def _schema_for(name: str) -> dict[str, Any] | None:
    return v9._schema_for(name)


@app.function(**_FUNCTION_OPTIONS)
def generate_v10(requests: list[dict[str, Any]], approved: bool = False) -> dict[str, Any]:
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

    base = v9.v7.base
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
        prompt_token_counts.append(v9.v7._token_count(getattr(output, "prompt_token_ids", None)))
        output_token_counts.append(v9.v7._token_count(getattr(output.outputs[0], "token_ids", None)))

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
        "speculative_method": "mtp",
        "speculative_tokens": MTP_SPECULATIVE_CONFIG["num_speculative_tokens"],
        "native_mtp": True,
        "second_model_used": False,
        "production_routing_change": False,
        "production_deploy_performed": False,
        "model_download_performed": False,
        "volume_created": False,
    }
