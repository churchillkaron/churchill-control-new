import gc
import json
import os
import re
from pathlib import Path
from typing import Any

import runpod
import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

CONTRACT = "AVANTIQO_INTELLIGENCE_BENCHMARK_WORKER_V1"
FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507"
TRAINING_ROOT = Path("/runpod-volume/avantiqo-intelligence-training")
MAX_CASES = 80
MAX_PROMPT_CHARS = 6000
MAX_NEW_TOKENS = 768
LEAKAGE_PATTERNS = [
    re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I),
    re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b", re.I),
    re.compile(r"\b(?:api[_ -]?key|access[_ -]?token|secret|password)\s*[:=]", re.I),
]


def text(value: Any, limit: int = 6000) -> str:
    return str(value or "").strip()[:limit]


def obj(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def arr(value: Any) -> list:
    return value if isinstance(value, list) else []


def enabled(value: Any) -> bool:
    return text(value, 20).lower() in {"1", "true", "yes", "on"}


def leakage_detected(value: str) -> bool:
    return any(pattern.search(value) for pattern in LEAKAGE_PATTERNS)


def validate_case(value: Any, index: int) -> dict:
    item = obj(value)
    case_id = text(item.get("id"), 160) or f"case-{index + 1}"
    prompt = text(item.get("prompt"), MAX_PROMPT_CHARS)
    category = text(item.get("category"), 80)
    capability_key = text(item.get("capability_key"), 300)
    if not prompt or not category:
        raise ValueError("BENCHMARK_CASE_FIELDS_REQUIRED")
    if leakage_detected(prompt):
        raise ValueError("BENCHMARK_CASE_PRIVATE_DATA_REJECTED")
    return {
        "id": case_id,
        "category": category,
        "capability_key": capability_key,
        "prompt": prompt,
    }


def validate_adapter_path(value: Any) -> Path:
    candidate = Path(text(value, 1000)).resolve()
    root = TRAINING_ROOT.resolve()
    if root not in candidate.parents:
        raise ValueError("BENCHMARK_ADAPTER_PATH_OUTSIDE_TRAINING_ROOT")
    if candidate.name != "adapter":
        raise ValueError("BENCHMARK_ADAPTER_DIRECTORY_INVALID")
    if not candidate.exists():
        raise ValueError("BENCHMARK_ADAPTER_NOT_FOUND")
    return candidate


def load_model(mode: str, adapter_path: str | None):
    quantization = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )
    model = AutoModelForCausalLM.from_pretrained(
        FOUNDATION_MODEL,
        quantization_config=quantization,
        torch_dtype=torch.bfloat16,
        device_map={"": 0},
        low_cpu_mem_usage=True,
    )
    if mode == "candidate":
        path = validate_adapter_path(adapter_path)
        model = PeftModel.from_pretrained(model, str(path), is_trainable=False)
    model.eval()
    return model


def release_model(model) -> None:
    del model
    gc.collect()
    torch.cuda.empty_cache()
    torch.cuda.synchronize()


def generate_response(model, tokenizer, prompt: str, max_new_tokens: int) -> str:
    messages = [{"role": "user", "content": prompt}]
    rendered = tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True,
    )
    inputs = tokenizer(
        rendered,
        return_tensors="pt",
        truncation=True,
        max_length=8192,
    ).to("cuda:0")
    with torch.no_grad():
        generated = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            temperature=None,
            top_p=None,
            pad_token_id=tokenizer.eos_token_id,
        )
    new_tokens = generated[0, inputs["input_ids"].shape[1]:]
    return text(tokenizer.decode(new_tokens, skip_special_tokens=True), 12000)


def generate_arm(mode: str, tokenizer, cases: list, max_new_tokens: int, adapter_path: Any) -> list:
    model = load_model(mode, adapter_path)
    try:
        outputs = []
        for case in cases:
            response = generate_response(model, tokenizer, case["prompt"], max_new_tokens)
            outputs.append({
                "id": case["id"],
                "category": case["category"],
                "capability_key": case["capability_key"],
                "response": response,
            })
        return outputs
    finally:
        release_model(model)


def handler(event):
    payload = obj(event.get("input"))
    if text(payload.get("contract"), 120) != CONTRACT:
        raise ValueError("BENCHMARK_WORKER_CONTRACT_INVALID")
    if not enabled(os.getenv("AVANTIQO_INTELLIGENCE_BENCHMARK_ENABLED")):
        raise RuntimeError("BENCHMARK_WORKER_DISABLED")
    if payload.get("execute_benchmark") is not True:
        raise RuntimeError("BENCHMARK_EXPLICIT_EXECUTION_APPROVAL_REQUIRED")
    if not torch.cuda.is_available():
        raise RuntimeError("BENCHMARK_CUDA_REQUIRED")

    mode = text(payload.get("mode"), 40).lower()
    if mode not in {"baseline", "candidate", "paired"}:
        raise ValueError("BENCHMARK_MODE_INVALID")
    model_name = text(payload.get("foundation_model"), 300) or FOUNDATION_MODEL
    if model_name != FOUNDATION_MODEL:
        raise ValueError("BENCHMARK_FOUNDATION_MODEL_NOT_ALLOWED")
    cases = [validate_case(item, index) for index, item in enumerate(arr(payload.get("cases"))[:MAX_CASES])]
    if len(cases) < 50:
        raise ValueError("BENCHMARK_MINIMUM_50_CASES_REQUIRED")
    max_new_tokens = max(64, min(MAX_NEW_TOKENS, int(payload.get("max_new_tokens") or 512)))

    tokenizer = AutoTokenizer.from_pretrained(FOUNDATION_MODEL, use_fast=True)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token

    adapter_reference = text(payload.get("adapter_artifact_reference"), 1000)
    if mode == "paired":
        if not adapter_reference:
            raise ValueError("BENCHMARK_PAIRED_ADAPTER_REQUIRED")
        baseline_outputs = generate_arm(
            "baseline", tokenizer, cases, max_new_tokens, None
        )
        candidate_outputs = generate_arm(
            "candidate", tokenizer, cases, max_new_tokens, adapter_reference
        )
        return {
            "status": "BENCHMARK_PAIRED_GENERATION_COMPLETED",
            "contract": CONTRACT,
            "mode": "paired",
            "foundation_model": FOUNDATION_MODEL,
            "adapter_artifact_reference": adapter_reference,
            "case_count": len(cases),
            "baseline_outputs": baseline_outputs,
            "candidate_outputs": candidate_outputs,
            "generation": {
                "do_sample": False,
                "max_new_tokens": max_new_tokens,
                "matched_prompt_set": True,
                "single_runpod_job": True,
                "arms_executed_sequentially": True,
            },
            "governance": {
                "customer_private_content_allowed": False,
                "raw_reasoning_required": False,
                "production_model_mutated": False,
                "production_model_promoted": False,
            },
        }

    outputs = generate_arm(
        mode, tokenizer, cases, max_new_tokens, adapter_reference
    )
    return {
        "status": "BENCHMARK_GENERATION_COMPLETED",
        "contract": CONTRACT,
        "mode": mode,
        "foundation_model": FOUNDATION_MODEL,
        "adapter_artifact_reference": adapter_reference if mode == "candidate" else None,
        "case_count": len(outputs),
        "outputs": outputs,
        "generation": {
            "do_sample": False,
            "max_new_tokens": max_new_tokens,
            "matched_prompt_set": True,
            "single_runpod_job": True,
        },
        "governance": {
            "customer_private_content_allowed": False,
            "raw_reasoning_required": False,
            "production_model_mutated": False,
            "production_model_promoted": False,
        },
    }


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})