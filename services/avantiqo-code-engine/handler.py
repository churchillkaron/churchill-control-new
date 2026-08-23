import json
import os
import re
import time
from pathlib import Path
from typing import Any

import runpod
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

ENGINE_CONTRACT = "AVANTIQO_CODE_ENGINE_V1"
PRODUCT_MODEL = "avantiqo-code-v1"
FOUNDATION_MODEL = os.getenv("AVANTIQO_CODE_FOUNDATION_MODEL", "").strip()
DEVICE = os.getenv("AVANTIQO_CODE_DEVICE", "cuda")
DTYPE = torch.bfloat16 if os.getenv("AVANTIQO_CODE_DTYPE", "bfloat16").lower() == "bfloat16" else torch.float16
QUANTIZATION = os.getenv("AVANTIQO_CODE_QUANTIZATION", "none").strip().lower()
MAX_NEW_TOKENS = int(os.getenv("AVANTIQO_CODE_MAX_NEW_TOKENS", "4096"))
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
SUPPORTED_QUANTIZATION = {"none", "int8"}
_TOKENIZER: Any | None = None
_MODEL: Any | None = None


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


def _quantization_config() -> BitsAndBytesConfig | None:
    if QUANTIZATION not in SUPPORTED_QUANTIZATION:
        raise RuntimeError(f"AVANTIQO_CODE_QUANTIZATION_NOT_SUPPORTED:{QUANTIZATION}")
    if QUANTIZATION == "int8":
        if not DEVICE.startswith("cuda"):
            raise RuntimeError("AVANTIQO_CODE_INT8_REQUIRES_CUDA")
        return BitsAndBytesConfig(load_in_8bit=True)
    return None


def _load_model():
    global _TOKENIZER, _MODEL
    if _TOKENIZER is not None and _MODEL is not None:
        return _TOKENIZER, _MODEL
    if not FOUNDATION_MODEL:
        raise RuntimeError("AVANTIQO_CODE_FOUNDATION_MODEL_REQUIRED")

    cached_path = _cached_model_path(FOUNDATION_MODEL)
    if REQUIRE_CACHED_MODEL and not cached_path:
        raise RuntimeError(f"AVANTIQO_CODE_CACHED_MODEL_REQUIRED:{FOUNDATION_MODEL}")
    model_source = cached_path or FOUNDATION_MODEL

    _TOKENIZER = AutoTokenizer.from_pretrained(
        model_source,
        trust_remote_code=False,
        local_files_only=bool(cached_path),
    )
    load_kwargs: dict[str, Any] = {
        "torch_dtype": DTYPE,
        "device_map": "auto" if DEVICE.startswith("cuda") else None,
        "trust_remote_code": False,
        "local_files_only": bool(cached_path),
    }
    quantization_config = _quantization_config()
    if quantization_config is not None:
        load_kwargs["quantization_config"] = quantization_config

    _MODEL = AutoModelForCausalLM.from_pretrained(
        model_source,
        **load_kwargs,
    )
    if not DEVICE.startswith("cuda"):
        _MODEL.to(DEVICE)
    _MODEL.eval()
    return _TOKENIZER, _MODEL


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
    # Customer billing must reflect customer-controlled task content, not Avantiqo's
    # private runtime wrapper, policy text, chat-template tokens, or generation marker.
    customer_content = "\n\n".join([
        _text(data.get("instruction")),
        _serialized_specification(data),
    ])
    encoded = tokenizer(customer_content, add_special_tokens=False)
    input_ids = encoded.get("input_ids") or []
    return int(len(input_ids))


def handler(job: dict[str, Any]) -> dict[str, Any]:
    data = _validated_input(job)
    started = time.perf_counter()
    runpod.serverless.progress_update(job, "loading Avantiqo Code")
    tokenizer, model = _load_model()
    prompt = _prompt(data)
    messages = [{"role": "user", "content": prompt}]
    if hasattr(tokenizer, "apply_chat_template"):
        rendered = tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )
    else:
        rendered = prompt
    inputs = tokenizer(rendered, return_tensors="pt")
    if DEVICE.startswith("cuda"):
        inputs = {key: value.to(model.device) for key, value in inputs.items()}

    runpod.serverless.progress_update(job, "executing bounded code task")
    with torch.inference_mode():
        generated = model.generate(
            **inputs,
            max_new_tokens=max(64, min(MAX_NEW_TOKENS, 8192)),
            do_sample=False,
            pad_token_id=tokenizer.eos_token_id,
        )
    runtime_prompt_tokens = int(inputs["input_ids"].shape[-1])
    billable_input_tokens = _billable_input_tokens(tokenizer, data)
    completion_tokens = int(generated.shape[-1] - runtime_prompt_tokens)
    decoded = tokenizer.decode(
        generated[0][runtime_prompt_tokens:],
        skip_special_tokens=True,
    )
    result = _strip_reasoning(decoded)
    if not result:
        raise RuntimeError("AVANTIQO_CODE_OUTPUT_REQUIRED")

    return {
        "status": "completed",
        "provider": "avantiqo-code",
        "model": PRODUCT_MODEL,
        "engine_contract": ENGINE_CONTRACT,
        "capability": data["capability"],
        "foundation_model": FOUNDATION_MODEL,
        "foundation_model_source": "runpod-cache" if _cached_model_path(FOUNDATION_MODEL) else "huggingface",
        "quantization": QUANTIZATION,
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
    if not FOUNDATION_MODEL:
        raise RuntimeError("AVANTIQO_CODE_FOUNDATION_MODEL_REQUIRED")
    if DEVICE.startswith("cuda") and not torch.cuda.is_available():
        raise RuntimeError("AVANTIQO_CODE_CUDA_REQUIRED")
    if QUANTIZATION not in SUPPORTED_QUANTIZATION:
        raise RuntimeError(f"AVANTIQO_CODE_QUANTIZATION_NOT_SUPPORTED:{QUANTIZATION}")
    if QUANTIZATION == "int8" and not DEVICE.startswith("cuda"):
        raise RuntimeError("AVANTIQO_CODE_INT8_REQUIRES_CUDA")
    # Keep the readiness probe limited to container/runtime health. Cached-model
    # presence remains mandatory in _load_model(), where a controlled request can
    # return the precise AVANTIQO_CODE_CACHED_MODEL_REQUIRED failure instead of
    # trapping the worker indefinitely in RunPod's initializing state.


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
