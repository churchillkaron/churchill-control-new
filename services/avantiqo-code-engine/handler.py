import json
import os
import re
import time
from typing import Any

import runpod
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

ENGINE_CONTRACT = "AVANTIQO_CODE_ENGINE_V1"
PRODUCT_MODEL = "avantiqo-code-v1"
FOUNDATION_MODEL = os.getenv("AVANTIQO_CODE_FOUNDATION_MODEL", "").strip()
DEVICE = os.getenv("AVANTIQO_CODE_DEVICE", "cuda")
DTYPE = torch.bfloat16 if os.getenv("AVANTIQO_CODE_DTYPE", "bfloat16").lower() == "bfloat16" else torch.float16
MAX_NEW_TOKENS = int(os.getenv("AVANTIQO_CODE_MAX_NEW_TOKENS", "4096"))
CERTIFIED_CAPABILITIES = {
    "ai.code.generate",
    "ai.code.edit",
    "ai.code.refactor",
    "ai.code.review",
    "ai.code.debug",
}
_TOKENIZER: Any | None = None
_MODEL: Any | None = None


def _text(value: Any) -> str:
    return str(value or "").strip()


def _load_model():
    global _TOKENIZER, _MODEL
    if _TOKENIZER is not None and _MODEL is not None:
        return _TOKENIZER, _MODEL
    if not FOUNDATION_MODEL:
        raise RuntimeError("AVANTIQO_CODE_FOUNDATION_MODEL_REQUIRED")
    _TOKENIZER = AutoTokenizer.from_pretrained(
        FOUNDATION_MODEL,
        trust_remote_code=False,
    )
    _MODEL = AutoModelForCausalLM.from_pretrained(
        FOUNDATION_MODEL,
        torch_dtype=DTYPE,
        device_map="auto" if DEVICE.startswith("cuda") else None,
        trust_remote_code=False,
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


def _prompt(data: dict[str, Any]) -> str:
    specification = data.get("structured_specification") or {}
    return "\n\n".join([
        "You are an Avantiqo Code worker. Execute the bounded capability request below.",
        "Do not expose chain-of-thought, hidden reasoning, scratchpads, or internal deliberation.",
        "Return only the useful work product or concise review/debug result required by the capability.",
        f"Capability: {data['capability']}",
        f"Instruction: {data['instruction']}",
        f"Structured specification: {json.dumps(specification, ensure_ascii=False, separators=(',', ':'))}",
    ])


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
    prompt_tokens = inputs["input_ids"].shape[-1]
    completion_tokens = generated.shape[-1] - prompt_tokens
    decoded = tokenizer.decode(
        generated[0][prompt_tokens:],
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
        "result": result,
        "usage": {
            "input_tokens": int(prompt_tokens),
            "output_tokens": int(completion_tokens),
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


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
