import json
import os
import time
import traceback

# RTX PRO 6000 Blackwell + vLLM 0.27.1 can select DeepGEMM for block-scaled
# FP8 linear/MoE weights and fail during scale-factor layout conversion with
# `Unknown SF transformation` before the handler is registered. Source-lock the
# supported vLLM fallback before importing handler/vLLM so stale endpoint env
# cannot re-enable the incompatible kernel path.
os.environ["VLLM_USE_DEEP_GEMM"] = "0"
os.environ["VLLM_MOE_USE_DEEP_GEMM"] = "0"

import runpod

import handler as code_engine

CONTRACT = "AVANTIQO_CODE_SERVERLESS_BOOT_PRELOAD_V1"
SAFETENSORS_LOAD_STRATEGY = "prefetch"

_original_llm = code_engine.LLM


def _serverless_llm(*args, **kwargs):
    kwargs.setdefault("safetensors_load_strategy", SAFETENSORS_LOAD_STRATEGY)
    return _original_llm(*args, **kwargs)


code_engine.LLM = _serverless_llm


def _event(name, **details):
    print(
        json.dumps(
            {
                "event": f"AVANTIQO_CODE_SERVERLESS_{name}",
                "contract": CONTRACT,
                **details,
                "secrets_printed": False,
            },
            separators=(",", ":"),
        ),
        flush=True,
    )


def main():
    started = time.perf_counter()
    cached_model_found = bool(code_engine._cached_model_path(code_engine.RUNTIME_MODEL))
    _event(
        "BOOT_PRELOAD_START",
        runtime_model=code_engine.RUNTIME_MODEL,
        foundation_model=code_engine.FOUNDATION_MODEL,
        quantization=code_engine.QUANTIZATION,
        cached_model_found=cached_model_found,
        safetensors_load_strategy=SAFETENSORS_LOAD_STRATEGY,
        deep_gemm_disabled=os.environ.get("VLLM_USE_DEEP_GEMM") == "0",
        moe_deep_gemm_disabled=os.environ.get("VLLM_MOE_USE_DEEP_GEMM") == "0",
        model_load_before_serverless_start=True,
        flashboot_snapshot_model_resident_candidate=True,
        inference_performed=False,
        generation_performed=False,
        reasoning_call_consumed=False,
        wallet_mutation_performed=False,
    )
    try:
        code_engine._load_engine()
    except Exception as error:
        traceback.print_exc()
        _event(
            "BOOT_PRELOAD_FAILED",
            error_type=type(error).__name__,
            error_message=str(error)[:500],
            safetensors_load_strategy=SAFETENSORS_LOAD_STRATEGY,
            deep_gemm_disabled=os.environ.get("VLLM_USE_DEEP_GEMM") == "0",
            moe_deep_gemm_disabled=os.environ.get("VLLM_MOE_USE_DEEP_GEMM") == "0",
            model_load_before_serverless_start=True,
            inference_performed=False,
            generation_performed=False,
            reasoning_call_consumed=False,
            wallet_mutation_performed=False,
        )
        raise

    if code_engine._ENGINE is None or code_engine._TOKENIZER is None:
        raise RuntimeError("AVANTIQO_CODE_SERVERLESS_BOOT_PRELOAD_ENGINE_REQUIRED")

    _event(
        "BOOT_PRELOAD_COMPLETE",
        runtime_model=code_engine.RUNTIME_MODEL,
        engine_loaded=True,
        tokenizer_loaded=True,
        elapsed_seconds=round(time.perf_counter() - started, 3),
        safetensors_load_strategy=SAFETENSORS_LOAD_STRATEGY,
        deep_gemm_disabled=os.environ.get("VLLM_USE_DEEP_GEMM") == "0",
        moe_deep_gemm_disabled=os.environ.get("VLLM_MOE_USE_DEEP_GEMM") == "0",
        model_load_before_serverless_start=True,
        flashboot_snapshot_model_resident_candidate=True,
        inference_performed=False,
        generation_performed=False,
        reasoning_call_consumed=False,
        wallet_mutation_performed=False,
    )

    _event(
        "HANDLER_START",
        engine_loaded=True,
        serverless_start_after_model_load=True,
        deep_gemm_disabled=os.environ.get("VLLM_USE_DEEP_GEMM") == "0",
        moe_deep_gemm_disabled=os.environ.get("VLLM_MOE_USE_DEEP_GEMM") == "0",
        inference_performed=False,
        generation_performed=False,
        reasoning_call_consumed=False,
        wallet_mutation_performed=False,
    )
    runpod.serverless.start({"handler": code_engine.handler})


if __name__ == "__main__":
    main()
