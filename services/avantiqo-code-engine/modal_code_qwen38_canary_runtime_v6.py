"""Isolated Qwen3.8 runtime V6 for low-latency repository editing.

V6 keeps the same pinned model, H100, volume, prefix cache and production-isolation
contract as V5, but removes eager-only execution and enables model-free n-gram
speculative decoding. Repository edits frequently reproduce code already present
in the prompt, so prompt lookup can accelerate decode without a second model or
new storage.

This file is candidate-only until an explicitly approved paid smoke proves the
runtime on the pinned Qwen3.8 revision.
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

CONTRACT = "AVANTIQO_CODE_QWEN38_CANARY_RUNTIME_V6"
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
    max_tokens = int(request.get("max_tokens") or DEFAULT_MAX_TOKENS)
    if max_tokens < MIN_MAX_TOKENS or max_tokens > MAX_MAX_TOKENS:
        raise ValueError(f"{CONTRACT}_MAX_TOKENS_INVALID")
    return {**request, "instruction": instruction, "role": role, "max_tokens": max_tokens}


def _token_count(value: Any) -> int:
    try:
        return len(value or [])
    except TypeError:
        return 0


@app.function(**_FUNCTION_OPTIONS)
def generate_v6(requests: list[dict[str, Any]], approved: bool = False) -> dict[str, Any]:
    if approved is not True:
        raise RuntimeError(f"{CONTRACT}_EXPLICIT_APPROVAL_REQUIRED")
    if not isinstance(requests, list) or not requests or len(requests) > 16:
        raise ValueError(f"{CONTRACT}_REQUEST_BATCH_INVALID")
    validated = [_validated_request(item) for item in requests if isinstance(item, dict)]
    if len(validated) != len(requests):
        raise ValueError(f"{CONTRACT}_REQUEST_OBJECT_REQUIRED")
    max_token_values = {int(item["max_tokens"]) for item in validated}
    if len(max_token_values) != 1:
        raise ValueError(f"{CONTRACT}_MIXED_MAX_TOKENS_FORBIDDEN")
    max_tokens = next(iter(max_token_values))

    identity = base._runtime_identity()
    tokenizer, engine = _load()
    from vllm import SamplingParams

    rendered = [base._render(tokenizer, item["instruction"]) for item in validated]
    started = time.perf_counter()
    outputs = engine.generate(
        rendered,
        SamplingParams(temperature=0.0, max_tokens=max_tokens, skip_special_tokens=True),
        use_tqdm=False,
    )
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
