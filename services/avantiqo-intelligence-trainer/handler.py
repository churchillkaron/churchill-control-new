import json
import math
import os
import re
from pathlib import Path
from typing import Any

import runpod
import torch
from peft import LoraConfig, get_peft_model
from torch.nn.utils.rnn import pad_sequence
from torch.utils.data import DataLoader
from transformers import AutoModelForCausalLM, AutoTokenizer

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
MIN_BF16_GPU_MEMORY_BYTES = 78 * 1024 * 1024 * 1024
DENSE_LORA_TARGET_MODULES = [
    "q_proj",
    "k_proj",
    "v_proj",
    "o_proj",
    "gate_proj",
    "up_proj",
    "down_proj",
]
MOE_LORA_TARGET_PARAMETERS = [
    "mlp.experts.gate_up_proj",
    "mlp.experts.down_proj",
]
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
    requested_lora_dropout = bounded_float(
        settings.get("lora_dropout"), 0.0, 0.0, 0.3
    )
    if requested_lora_dropout != 0.0:
        raise ValueError("TRAINING_QWEN3_MOE_LORA_DROPOUT_MUST_BE_ZERO")
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
            "lora_dropout": 0.0,
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


def gpu_memory_preflight() -> dict:
    if not torch.cuda.is_available():
        raise RuntimeError("TRAINING_CUDA_REQUIRED")
    if not torch.cuda.is_bf16_supported():
        raise RuntimeError("TRAINING_BF16_GPU_REQUIRED")
    properties = torch.cuda.get_device_properties(0)
    total_memory = int(properties.total_memory)
    if total_memory < MIN_BF16_GPU_MEMORY_BYTES:
        gib = total_memory / (1024 ** 3)
        raise RuntimeError(
            f"TRAINING_QWEN3_MOE_BF16_80GB_GPU_REQUIRED:{gib:.1f}GiB"
        )
    return {
        "device_name": text(properties.name, 240),
        "total_memory_bytes": total_memory,
        "minimum_memory_bytes": MIN_BF16_GPU_MEMORY_BYTES,
        "bf16_supported": True,
    }


def qwen3_moe_expert_count(model) -> int:
    model_type = text(getattr(model.config, "model_type", ""), 80)
    if model_type != "qwen3_moe":
        raise RuntimeError(f"TRAINING_QWEN3_MOE_MODEL_TYPE_REQUIRED:{model_type or 'unknown'}")
    raw_count = (
        getattr(model.config, "num_local_experts", None)
        or getattr(model.config, "num_experts", None)
        or 0
    )
    try:
        count = int(raw_count)
    except (TypeError, ValueError):
        count = 0
    if count < 2:
        raise RuntimeError("TRAINING_QWEN3_MOE_EXPERT_COUNT_REQUIRED")
    return count


def assert_bf16_fused_expert_weights(model) -> dict:
    expert_parameters = {
        name: parameter
        for name, parameter in model.named_parameters()
        if name.endswith("mlp.experts.gate_up_proj")
        or name.endswith("mlp.experts.down_proj")
    }
    if not expert_parameters:
        raise RuntimeError("TRAINING_QWEN3_MOE_FUSED_EXPERT_PARAMETERS_REQUIRED")
    if any(parameter.ndim != 3 for parameter in expert_parameters.values()):
        raise RuntimeError("TRAINING_QWEN3_MOE_FUSED_EXPERT_LAYOUT_REQUIRED")
    if any(parameter.dtype != torch.bfloat16 for parameter in expert_parameters.values()):
        raise RuntimeError("TRAINING_QWEN3_MOE_BF16_EXPERT_WEIGHTS_REQUIRED")
    return {
        "fused_expert_parameter_tensor_count": len(expert_parameters),
        "fused_expert_parameter_count": sum(
            int(parameter.numel()) for parameter in expert_parameters.values()
        ),
    }


def build_qwen3_moe_lora(model, settings: dict):
    expert_count = qwen3_moe_expert_count(model)
    effective_expert_rank = max(1, settings["lora_rank"] // expert_count)
    config = LoraConfig(
        task_type="CAUSAL_LM",
        r=settings["lora_rank"],
        lora_alpha=settings["lora_alpha"],
        lora_dropout=0.0,
        bias="none",
        target_modules=DENSE_LORA_TARGET_MODULES,
        target_parameters=MOE_LORA_TARGET_PARAMETERS,
        rank_pattern={
            "experts.gate_up_proj": effective_expert_rank,
            "experts.down_proj": effective_expert_rank,
        },
    )
    return config, expert_count, effective_expert_rank


def assert_moe_lora_attached(model) -> dict:
    peft_configs = getattr(model, "peft_config", {})
    peft_config = peft_configs.get("default") if isinstance(peft_configs, dict) else None
    configured_targets = set(
        getattr(peft_config, "target_parameters", None) or []
    )
    expected_targets = set(MOE_LORA_TARGET_PARAMETERS)
    if configured_targets != expected_targets:
        raise RuntimeError("TRAINING_QWEN3_MOE_TARGET_PARAMETERS_NOT_BOUND")

    wrapped_parameter_names = set()
    wrapper_count = 0
    for name, module in model.named_modules():
        if module.__class__.__name__ != "ParamWrapper":
            continue
        if "experts" not in name:
            continue
        parameter_name = text(getattr(module, "parameter_name", ""), 120)
        if parameter_name in {"gate_up_proj", "down_proj"}:
            wrapper_count += 1
            wrapped_parameter_names.add(parameter_name)

    if wrapped_parameter_names != {"gate_up_proj", "down_proj"}:
        raise RuntimeError("TRAINING_QWEN3_MOE_EXPERT_PARAM_WRAPPERS_REQUIRED")

    expert_trainable_parameter_count = 0
    total_trainable_parameter_count = 0
    expert_trainable_names = []
    for name, parameter in model.named_parameters():
        if not parameter.requires_grad:
            continue
        parameter_count = int(parameter.numel())
        total_trainable_parameter_count += parameter_count
        lowered = name.lower()
        if "experts" in lowered and "lora_" in lowered:
            expert_trainable_parameter_count += parameter_count
            expert_trainable_names.append(name)

    if expert_trainable_parameter_count <= 0 or not expert_trainable_names:
        raise RuntimeError("TRAINING_QWEN3_MOE_EXPERT_LORA_NOT_TRAINABLE")

    return {
        "expert_wrapper_count": wrapper_count,
        "expert_parameter_names": sorted(wrapped_parameter_names),
        "expert_trainable_parameter_count": expert_trainable_parameter_count,
        "total_trainable_parameter_count": total_trainable_parameter_count,
    }


def prepare_gradient_checkpointing(model) -> None:
    model.config.use_cache = False
    model.gradient_checkpointing_enable()
    if hasattr(model, "enable_input_require_grads"):
        model.enable_input_require_grads()


def execute_training(plan: dict) -> dict:
    gpu = gpu_memory_preflight()
    settings = plan["settings"]
    tokenizer = AutoTokenizer.from_pretrained(plan["foundation_model"], use_fast=True)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        plan["foundation_model"],
        torch_dtype=torch.bfloat16,
        device_map={"": 0},
        low_cpu_mem_usage=True,
    )
    fused_experts = assert_bf16_fused_expert_weights(model)
    prepare_gradient_checkpointing(model)
    lora, expert_count, effective_expert_rank = build_qwen3_moe_lora(
        model,
        settings,
    )
    model = get_peft_model(model, lora)
    attachment = assert_moe_lora_attached(model)
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

    trainable_parameters = [
        parameter for parameter in model.parameters() if parameter.requires_grad
    ]
    if not trainable_parameters:
        raise RuntimeError("TRAINING_LORA_PARAMETERS_REQUIRED")
    optimizer = torch.optim.AdamW(
        trainable_parameters,
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
                torch.nn.utils.clip_grad_norm_(trainable_parameters, max_norm=1.0)
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
        "method": "LORA_BF16_PEFT_QWEN3_MOE",
        "base_precision": "BF16",
        "base_quantized": False,
        "bf16_gpu_preflight_verified": True,
        "gpu_device_name": gpu["device_name"],
        "gpu_total_memory_bytes": gpu["total_memory_bytes"],
        "moe_fused_expert_layout_verified": True,
        "moe_fused_expert_parameter_tensor_count": fused_experts[
            "fused_expert_parameter_tensor_count"
        ],
        "moe_fused_expert_parameter_count": fused_experts[
            "fused_expert_parameter_count"
        ],
        "moe_adapter_attachment_verified": True,
        "moe_expert_count": expert_count,
        "moe_effective_rank": effective_expert_rank,
        "moe_target_parameters": MOE_LORA_TARGET_PARAMETERS,
        "moe_expert_wrapper_count": attachment["expert_wrapper_count"],
        "moe_expert_trainable_parameter_count": attachment[
            "expert_trainable_parameter_count"
        ],
        "total_trainable_parameter_count": attachment[
            "total_trainable_parameter_count"
        ],
        "lora_dropout": 0.0,
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
            "method": "LORA_BF16_PEFT_QWEN3_MOE",
            "minimum_gpu_memory_bytes": MIN_BF16_GPU_MEMORY_BYTES,
            "moe_target_parameters": MOE_LORA_TARGET_PARAMETERS,
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
