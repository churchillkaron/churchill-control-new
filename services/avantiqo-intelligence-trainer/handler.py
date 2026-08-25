import json
import math
import os
import re
from pathlib import Path
from typing import Any

import runpod
import torch
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from torch.nn.utils.rnn import pad_sequence
from torch.utils.data import DataLoader
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

CONTRACT = "AVANTIQO_INTELLIGENCE_TRAINER_V1"
FOUNDATION_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507"
OUTPUT_ROOT = Path(os.getenv(
    "AVANTIQO_INTELLIGENCE_TRAINER_OUTPUT_ROOT",
    "/runpod-volume/avantiqo-intelligence-training",
))
MAX_TRAIN_EXAMPLES = 512
MAX_HOLDOUT_EXAMPLES = 128
MAX_SEQUENCE_LENGTH = 4096
MAX_STEPS = 300
MAX_EPOCHS = 3
MAX_LORA_RANK = 64
JOB_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{8,160}$")
LEAKAGE_PATTERNS = [
    re.compile(r"https?://", re.I),
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


def bounded_int(value: Any, fallback: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = fallback
    return max(minimum, min(maximum, parsed))


def bounded_float(value: Any, fallback: float, minimum: float, maximum: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        parsed = fallback
    return max(minimum, min(maximum, parsed))


def leakage_detected(value: str) -> bool:
    return any(pattern.search(value) for pattern in LEAKAGE_PATTERNS)


def validate_example(value: Any) -> dict:
    item = obj(value)
    user_task = text(item.get("user_task"), 3000)
    assistant_target = text(item.get("assistant_target"), 5000)
    capability_key = text(item.get("capability_key"), 300)
    if not user_task or not assistant_target or not capability_key:
        raise ValueError("TRAINING_EXAMPLE_FIELDS_REQUIRED")
    serialized = json.dumps(
        {"user_task": user_task, "assistant_target": assistant_target},
        ensure_ascii=False,
    )
    if leakage_detected(serialized):
        raise ValueError("TRAINING_EXAMPLE_POTENTIAL_PRIVATE_DATA_REJECTED")
    return {
        "user_task": user_task,
        "assistant_target": assistant_target,
        "capability_key": capability_key,
    }


def validate_examples(values: Any, maximum: int, minimum: int = 1) -> list:
    source = arr(values)[:maximum]
    validated = [validate_example(item) for item in source]
    if len(validated) < minimum:
        raise ValueError("TRAINING_EXAMPLES_INSUFFICIENT")
    return validated


def training_plan(payload: dict) -> dict:
    job_id = text(payload.get("job_id"), 160)
    if not JOB_ID_PATTERN.fullmatch(job_id):
        raise ValueError("TRAINING_JOB_ID_INVALID")
    model = text(payload.get("foundation_model"), 300) or FOUNDATION_MODEL
    if model != FOUNDATION_MODEL:
        raise ValueError("TRAINING_FOUNDATION_MODEL_NOT_ALLOWED")

    train_examples = validate_examples(payload.get("train_examples"), MAX_TRAIN_EXAMPLES)
    holdout_examples = validate_examples(payload.get("holdout_examples"), MAX_HOLDOUT_EXAMPLES)
    settings = obj(payload.get("settings"))
    return {
        "job_id": job_id,
        "foundation_model": model,
        "train_examples": train_examples,
        "holdout_examples": holdout_examples,
        "settings": {
            "max_sequence_length": bounded_int(
                settings.get("max_sequence_length"), 2048, 256, MAX_SEQUENCE_LENGTH
            ),
            "epochs": bounded_int(settings.get("epochs"), 1, 1, MAX_EPOCHS),
            "max_steps": bounded_int(settings.get("max_steps"), 120, 1, MAX_STEPS),
            "learning_rate": bounded_float(
                settings.get("learning_rate"), 2e-4, 1e-6, 1e-3
            ),
            "gradient_accumulation_steps": bounded_int(
                settings.get("gradient_accumulation_steps"), 8, 1, 64
            ),
            "lora_rank": bounded_int(settings.get("lora_rank"), 16, 4, MAX_LORA_RANK),
            "lora_alpha": bounded_int(settings.get("lora_alpha"), 32, 8, 256),
            "lora_dropout": bounded_float(
                settings.get("lora_dropout"), 0.05, 0.0, 0.3
            ),
        },
    }


def encode_example(tokenizer, example: dict, max_length: int) -> dict:
    user_messages = [{"role": "user", "content": example["user_task"]}]
    full_messages = [
        *user_messages,
        {"role": "assistant", "content": example["assistant_target"]},
    ]
    prompt_text = tokenizer.apply_chat_template(
        user_messages,
        tokenize=False,
        add_generation_prompt=True,
    )
    full_text = tokenizer.apply_chat_template(
        full_messages,
        tokenize=False,
        add_generation_prompt=False,
    )
    full = tokenizer(
        full_text,
        truncation=True,
        max_length=max_length,
        return_tensors="pt",
    )["input_ids"][0]
    prompt = tokenizer(
        prompt_text,
        truncation=True,
        max_length=max_length,
        return_tensors="pt",
    )["input_ids"][0]
    labels = full.clone()
    labels[: min(len(prompt), len(labels))] = -100
    return {"input_ids": full, "labels": labels}


def collate(batch: list, pad_token_id: int) -> dict:
    input_ids = pad_sequence(
        [item["input_ids"] for item in batch],
        batch_first=True,
        padding_value=pad_token_id,
    )
    labels = pad_sequence(
        [item["labels"] for item in batch],
        batch_first=True,
        padding_value=-100,
    )
    attention_mask = input_ids.ne(pad_token_id).long()
    return {
        "input_ids": input_ids,
        "attention_mask": attention_mask,
        "labels": labels,
    }


def evaluate_loss(model, loader, device) -> float:
    model.eval()
    total = 0.0
    count = 0
    with torch.no_grad():
        for batch in loader:
            batch = {key: value.to(device) for key, value in batch.items()}
            with torch.autocast(device_type="cuda", dtype=torch.bfloat16):
                loss = model(**batch).loss
            total += float(loss.detach().cpu())
            count += 1
    model.train()
    return total / max(1, count)


def execute_training(plan: dict) -> dict:
    if not torch.cuda.is_available():
        raise RuntimeError("TRAINING_CUDA_REQUIRED")
    if not torch.cuda.is_bf16_supported():
        raise RuntimeError("TRAINING_BF16_GPU_REQUIRED")

    settings = plan["settings"]
    tokenizer = AutoTokenizer.from_pretrained(plan["foundation_model"], use_fast=True)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token

    quantization = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_use_double_quant=True,
    )
    model = AutoModelForCausalLM.from_pretrained(
        plan["foundation_model"],
        quantization_config=quantization,
        torch_dtype=torch.bfloat16,
        device_map={"": 0},
        low_cpu_mem_usage=True,
    )
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(
        model,
        use_gradient_checkpointing=True,
    )
    lora = LoraConfig(
        task_type="CAUSAL_LM",
        r=settings["lora_rank"],
        lora_alpha=settings["lora_alpha"],
        lora_dropout=settings["lora_dropout"],
        bias="none",
        target_modules=[
            "q_proj",
            "k_proj",
            "v_proj",
            "o_proj",
            "gate_proj",
            "up_proj",
            "down_proj",
        ],
    )
    model = get_peft_model(model, lora)
    device = torch.device("cuda:0")

    train_data = [
        encode_example(tokenizer, item, settings["max_sequence_length"])
        for item in plan["train_examples"]
    ]
    holdout_data = [
        encode_example(tokenizer, item, settings["max_sequence_length"])
        for item in plan["holdout_examples"]
    ]
    collator = lambda batch: collate(batch, tokenizer.pad_token_id)
    train_loader = DataLoader(train_data, batch_size=1, shuffle=True, collate_fn=collator)
    holdout_loader = DataLoader(holdout_data, batch_size=1, shuffle=False, collate_fn=collator)

    optimizer = torch.optim.AdamW(
        [parameter for parameter in model.parameters() if parameter.requires_grad],
        lr=settings["learning_rate"],
    )
    gradient_accumulation = settings["gradient_accumulation_steps"]
    max_steps = settings["max_steps"]
    model.train()
    optimizer.zero_grad(set_to_none=True)
    optimizer_steps = 0
    micro_steps = 0
    cumulative_loss = 0.0

    for _epoch in range(settings["epochs"]):
        for batch in train_loader:
            batch = {key: value.to(device) for key, value in batch.items()}
            with torch.autocast(device_type="cuda", dtype=torch.bfloat16):
                loss = model(**batch).loss / gradient_accumulation
            loss.backward()
            cumulative_loss += float(loss.detach().cpu()) * gradient_accumulation
            micro_steps += 1
            if micro_steps % gradient_accumulation == 0:
                torch.nn.utils.clip_grad_norm_(
                    [parameter for parameter in model.parameters() if parameter.requires_grad],
                    max_norm=1.0,
                )
                optimizer.step()
                optimizer.zero_grad(set_to_none=True)
                optimizer_steps += 1
                if optimizer_steps >= max_steps:
                    break
        if optimizer_steps >= max_steps:
            break

    holdout_loss = evaluate_loss(model, holdout_loader, device)
    output_dir = OUTPUT_ROOT / plan["job_id"] / "adapter"
    output_dir.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(output_dir, safe_serialization=True)
    tokenizer.save_pretrained(output_dir)

    return {
        "status": "TRAINING_COMPLETED",
        "job_id": plan["job_id"],
        "foundation_model": plan["foundation_model"],
        "adapter_artifact_reference": str(output_dir),
        "train_example_count": len(train_data),
        "holdout_example_count": len(holdout_data),
        "optimizer_steps": optimizer_steps,
        "mean_training_loss": cumulative_loss / max(1, micro_steps),
        "holdout_loss": holdout_loss,
        "holdout_perplexity": math.exp(min(20.0, holdout_loss)),
        "method": "QLORA_NF4_PEFT",
        "foundation_weights_mutated": False,
        "production_model_promoted": False,
        "raw_reasoning_persisted": False,
    }


def handler(event):
    payload = obj(event.get("input"))
    if text(payload.get("contract"), 120) != CONTRACT:
        raise ValueError("TRAINER_CONTRACT_INVALID")
    plan = training_plan(payload)
    action = text(payload.get("action"), 40).lower() or "preview"
    if action == "preview":
        return {
            "status": "TRAINING_PLAN_VALIDATED",
            "job_id": plan["job_id"],
            "foundation_model": plan["foundation_model"],
            "train_example_count": len(plan["train_examples"]),
            "holdout_example_count": len(plan["holdout_examples"]),
            "settings": plan["settings"],
            "training_started": False,
            "production_model_promoted": False,
        }
    if action != "train":
        raise ValueError("TRAINER_ACTION_UNSUPPORTED")
    if not enabled(os.getenv("AVANTIQO_INTELLIGENCE_TRAINER_ENABLED")):
        raise RuntimeError("TRAINER_DISABLED")
    if payload.get("execute_training") is not True:
        raise RuntimeError("TRAINER_EXPLICIT_EXECUTION_APPROVAL_REQUIRED")
    return execute_training(plan)


if __name__ == "__main__":
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    runpod.serverless.start({"handler": handler})
