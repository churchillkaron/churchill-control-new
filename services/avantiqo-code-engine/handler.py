import json
import os
import re
import time
import traceback
from importlib.metadata import version
from pathlib import Path
from typing import Any

import runpod
from vllm import LLM, SamplingParams

ENGINE_CONTRACT = "AVANTIQO_CODE_ENGINE_V1"
PRODUCT_MODEL = "avantiqo-code-v1"
FOUNDATION_MODEL = os.getenv("AVANTIQO_CODE_FOUNDATION_MODEL", "").strip()
OFFICIAL_FP8_RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8"
RUNTIME_MODEL = os.getenv("AVANTIQO_CODE_RUNTIME_MODEL", OFFICIAL_FP8_RUNTIME_MODEL).strip()
QUANTIZATION = os.getenv("AVANTIQO_CODE_QUANTIZATION", "fp8").strip().lower()
MAX_NEW_TOKENS = int(os.getenv("AVANTIQO_CODE_MAX_NEW_TOKENS", "4096"))
MAX_MODEL_LEN = int(os.getenv("AVANTIQO_CODE_MAX_MODEL_LEN", "32768"))
GPU_MEMORY_UTILIZATION = float(os.getenv("AVANTIQO_CODE_GPU_MEMORY_UTILIZATION", "0.90"))
HF_CACHE_ROOT = Path(
    os.getenv(
        "AVANTIQO_CODE_HF_CACHE_ROOT",
        "/runpod-volume/huggingface-cache/hub",
    )
)
REQUIRE_CACHED_MODEL = os.getenv(
    "AVANTIQO_CODE_REQUIRE_CACHED_MODEL",
    "1",
).strip().lower() not in {"0", "false", "no", "off"}
CERTIFIED_CAPABILITIES = {
    "ai.code.generate",
    "ai.code.edit",
    "ai.code.refactor",
    "ai.code.review",
    "ai.code.debug",
}
_TOKENIZER: Any | None = None
_ENGINE: LLM | None = None


def _text(value: Any) -> str:
    return str(value or "").strip()


def _cached_model_path(model_id: str) -> str | None:
    if "/" not in model_id:
        return None
    model_root = HF_CACHE_ROOT / f"models--{model_id.replace('/', '--')}"
    snapshots_root = model_root / "snapshots"
    ref_main = model_root / "refs" / "main"
    if ref_main.is_file():
        revision = ref_main.read_text(encoding="utf-8").strip()
        candidate = snapshots_root / revision
        if candidate.is_dir():
            return str(candidate)
    if snapshots_root.is_dir():
        candidates = [candidate for candidate in snapshots_root.iterdir() if candidate.is_dir()]
        if candidates:
            candidates.sort(key=lambda candidate: candidate.stat().st_mtime, reverse=True)
            return str(candidates[0])
    return None


def _validate_runtime_contract() -> None:
    if not FOUNDATION_MODEL:
        raise RuntimeError("AVANTIQO_CODE_FOUNDATION_MODEL_REQUIRED")
    if RUNTIME_MODEL != OFFICIAL_FP8_RUNTIME_MODEL:
        raise RuntimeError(f"AVANTIQO_CODE_FP8_RUNTIME_MODEL_INVALID:{RUNTIME_MODEL}")
    if QUANTIZATION != "fp8":
        raise RuntimeError(f"AVANTIQO_CODE_QUANTIZATION_REQUIRED:fp8:{QUANTIZATION}")
    if MAX_MODEL_LEN < 4096 or MAX_MODEL_LEN > 262144:
        raise RuntimeError(f"AVANTIQO_CODE_MAX_MODEL_LEN_INVALID:{MAX_MODEL_LEN}")
    if not 0.5 <= GPU_MEMORY_UTILIZATION <= 0.98:
        raise RuntimeError(
            f"AVANTIQO_CODE_GPU_MEMORY_UTILIZATION_INVALID:{GPU_MEMORY_UTILIZATION}"
        )


def _runtime_probe(data: dict[str, Any]) -> dict[str, Any] | None:
    specification = data.get("structured_specification") or {}
    if specification.get("runtime_probe") is not True:
        return None
    if _text(data.get("organization_id")) != "benchmark-only":
        raise ValueError("AVANTIQO_CODE_RUNTIME_PROBE_BENCHMARK_ONLY")

    _validate_runtime_contract()
    cached_path = _cached_model_path(RUNTIME_MODEL)
    return {
        "status": "runtime_probe",
        "provider": "avantiqo-code",
        "model": PRODUCT_MODEL,
        "engine_contract": ENGINE_CONTRACT,
        "capability": data["capability"],
        "foundation_model": FOUNDATION_MODEL,
        "runtime_model": RUNTIME_MODEL,
        "serving_runtime": "vllm",
        "serving_runtime_version": version("vllm"),
        "quantization": QUANTIZATION,
        "max_model_len": MAX_MODEL_LEN,
        "gpu_memory_utilization": GPU_MEMORY_UTILIZATION,
        "cached_model_found": bool(cached_path),
        "engine_loaded": _ENGINE is not None,
        "vllm_worker_multiproc_method": os.getenv("VLLM_WORKER_MULTIPROC_METHOD", ""),
        "raw_reasoning_persisted": False,
    }


def _load_engine() -> tuple[Any, LLM]:
    global _TOKENIZER, _ENGINE
    if _TOKENIZER is not None and _ENGINE is not None:
        return _TOKENIZER, _ENGINE

    _validate_runtime_contract()
    cached_path = _cached_model_path(RUNTIME_MODEL)
    if REQUIRE_CACHED_MODEL and not cached_path:
        raise RuntimeError(f"AVANTIQO_CODE_CACHED_MODEL_REQUIRED:{RUNTIME_MODEL}")
    model_source = cached_path or RUNTIME_MODEL

    print(
        json.dumps(
            {
                "event": "AVANTIQO_CODE_ENGINE_LOAD_START",
                "runtime_model": RUNTIME_MODEL,
                "cached_model": bool(cached_path),
                "quantization": QUANTIZATION,
                "max_model_len": MAX_MODEL_LEN,
                "multiproc_method": os.getenv("VLLM_WORKER_MULTIPROC_METHOD", ""),
            },
            separators=(",", ":"),
        ),
        flush=True,
    )

    # vLLM owns CUDA initialization. Do not touch torch.cuda before this call:
    # library-mode vLLM historically defaults to fork, which is unsafe after CUDA
    # initialization. Docker also forces VLLM_WORKER_MULTIPROC_METHOD=spawn.
    _ENGINE = LLM(
        model=model_source,
        tokenizer=model_source,
        dtype="auto",
        trust_remote_code=False,
        tensor_parallel_size=1,
        max_model_len=MAX_MODEL_LEN,
        gpu_memory_utilization=GPU_MEMORY_UTILIZATION,
        enforce_eager=True,
        enable_prefix_caching=True,
        disable_log_stats=True,
    )
    _TOKENIZER = _ENGINE.get_tokenizer()
    print(
        json.dumps(
            {
                "event": "AVANTIQO_CODE_ENGINE_LOAD_COMPLETE",
                "runtime_model": RUNTIME_MODEL,
                "quantization": QUANTIZATION,
            },
            separators=(",", ":"),
        ),
        flush=True,
    )
    return _TOKENIZER, _ENGINE


def _strip_reasoning(value: str) -> str:
    output = value
    if "<think>" in output and "</think>" not in output:
        raise RuntimeError("AVANTIQO_CODE_REASONING_OUTPUT_TRUNCATED")
    output = re.sub(r"<think>[\s\S]*?</think>", "", output, flags=re.IGNORECASE)
    output = re.sub(r"<reasoning>[\s\S]*?</reasoning>", "", output, flags=re.IGNORECASE)
    return output.strip()


def _validated_input(job: dict[str, Any]) -> dict[str, Any]:
    data = job.get("input") or {}
    if data.get("contract") != ENGINE_CONTRACT:
        raise ValueError("AVANTIQO_CODE_ENGINE_CONTRACT_INVALID")
    capability = _text(data.get("capability"))
    if capability not in CERTIFIED_CAPABILITIES:
        raise ValueError("AVANTIQO_CODE_CAPABILITY_NOT_CERTIFIED")
    instruction = _text(data.get("instruction"))
    if not instruction:
        raise ValueError("AVANTIQO_CODE_INSTRUCTION_REQUIRED")
    if len(instruction) > 30000:
        raise ValueError("AVANTIQO_CODE_INSTRUCTION_TOO_LONG")
    return data


def _serialized_specification(data: dict[str, Any]) -> str:
    specification = data.get("structured_specification") or {}
    return json.dumps(specification, ensure_ascii=False, separators=(",", ":"))


def _prompt(data: dict[str, Any]) -> str:
    return "\n\n".join([
        "You are an Avantiqo Code worker. Execute the bounded capability request below.",
        "Do not expose chain-of-thought, hidden reasoning, scratchpads, or internal deliberation.",
        "Return only the useful work product or concise review/debug result required by the capability.",
        f"Capability: {data['capability']}",
        f"Instruction: {data['instruction']}",
        f"Structured specification: {_serialized_specification(data)}",
    ])


def _billable_input_tokens(tokenizer: Any, data: dict[str, Any]) -> int:
    customer_content = "\n\n".join([
        _text(data.get("instruction")),
        _serialized_specification(data),
    ])
    return int(len(tokenizer.encode(customer_content, add_special_tokens=False)))


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data = _validated_input(job)
    probe = _runtime_probe(data)
    if probe is not None:
        return probe

    started = time.perf_counter()
    runpod.serverless.progress_update(job, "loading Avantiqo Code")
    try:
        tokenizer, engine = _load_engine()
    except Exception as error:
        traceback.print_exc()
        return {
            "status": "engine_load_failed",
            "provider": "avantiqo-code",
            "model": PRODUCT_MODEL,
            "engine_contract": ENGINE_CONTRACT,
            "capability": data["capability"],
            "foundation_model": FOUNDATION_MODEL,
            "runtime_model": RUNTIME_MODEL,
            "serving_runtime": "vllm",
            "serving_runtime_version": version("vllm"),
            "quantization": QUANTIZATION,
            "error_code": "AVANTIQO_CODE_ENGINE_LOAD_FAILED",
            "error_type": type(error).__name__,
            "error_message": _text(error)[:800],
            "raw_reasoning_persisted": False,
        }

    prompt = _prompt(data)
    rendered = tokenizer.apply_chat_template(
        [{"role": "user", "content": prompt}],
        tokenize=False,
        add_generation_prompt=True,
    )
    runtime_prompt_tokens = int(len(tokenizer.encode(rendered, add_special_tokens=False)))
    billable_input_tokens = _billable_input_tokens(tokenizer, data)

    runpod.serverless.progress_update(job, "executing bounded code task")
    outputs = engine.generate(
        [rendered],
        SamplingParams(
            temperature=0.0,
            max_tokens=max(64, min(MAX_NEW_TOKENS, 8192)),
            skip_special_tokens=True,
        ),
        use_tqdm=False,
    )
    if not outputs or not outputs[0].outputs:
        raise RuntimeError("AVANTIQO_CODE_OUTPUT_REQUIRED")

    candidate = outputs[0].outputs[0]
    result = _strip_reasoning(candidate.text)
    if not result:
        raise RuntimeError("AVANTIQO_CODE_OUTPUT_REQUIRED")
    completion_tokens = int(len(candidate.token_ids or []))
    runtime_cached = bool(_cached_model_path(RUNTIME_MODEL))

    return {
        "status": "completed",
        "provider": "avantiqo-code",
        "model": PRODUCT_MODEL,
        "engine_contract": ENGINE_CONTRACT,
        "capability": data["capability"],
        "foundation_model": FOUNDATION_MODEL,
        "runtime_model": RUNTIME_MODEL,
        "serving_runtime": "vllm",
        "serving_runtime_version": version("vllm"),
        "foundation_model_source": "runpod-cache" if runtime_cached else "huggingface",
        "runtime_model_source": "runpod-cache" if runtime_cached else "huggingface",
        "quantization": QUANTIZATION,
        "max_model_len": MAX_MODEL_LEN,
        "result": result,
        "usage": {
            "input_tokens": billable_input_tokens,
            "output_tokens": completion_tokens,
            "runtime_prompt_tokens": runtime_prompt_tokens,
            "internal_prompt_tokens": max(0, runtime_prompt_tokens - billable_input_tokens),
        },
        "generation_seconds": round(time.perf_counter() - started, 3),
        "raw_reasoning_persisted": False,
    }


@runpod.serverless.register_fitness_check
def check_worker():
    _validate_runtime_contract()


if __name__ == "__main__":
    # Start RunPod first. Engine loading is lazy on the first real Code request so
    # startup failures are observable as structured evidence instead of anonymous
    # container exit-code loops. A benchmark-only runtime probe can verify the
    # exact deployed FP8/vLLM environment without loading the model.
    print(
        json.dumps(
            {
                "event": "AVANTIQO_CODE_WORKER_BOOT",
                "serving_runtime": "vllm",
                "serving_runtime_version": version("vllm"),
                "runtime_model": RUNTIME_MODEL,
                "quantization": QUANTIZATION,
                "multiproc_method": os.getenv("VLLM_WORKER_MULTIPROC_METHOD", ""),
            },
            separators=(",", ":"),
        ),
        flush=True,
    )
    runpod.serverless.start({"handler": handler})
