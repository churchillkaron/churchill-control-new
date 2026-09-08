"""Owned Modal H100 execution plane for the Avantiqo Intelligence trainer.

Training logic remains in handler.py. This module only supplies governed Modal
GPU execution and durable private adapter storage. No public HTTP endpoint.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

import modal

APP_NAME = "avantiqo-intelligence-trainer-owned"
FUNCTION_NAME = "train"
VOLUME_NAME = "avantiqo-intelligence-training-v1"
MOUNT_ROOT = "/mnt/training"
OUTPUT_ROOT = f"{MOUNT_ROOT}/artifacts"
HF_HOME = f"{MOUNT_ROOT}/huggingface-cache"
GPU = "H100"
CONTRACT = "AVANTIQO_INTELLIGENCE_TRAINER_MODAL_V1"

app = modal.App(APP_NAME)
training_volume = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)

VENV = "/opt/avantiqo-intelligence-trainer-venv"

trainer_image = (
    modal.Image.from_registry(
        "pytorch/pytorch:2.11.0-cuda12.8-cudnn9-runtime",
        add_python=None,
    )
    .entrypoint([])
    .run_commands(
        "apt-get update && apt-get install -y --no-install-recommends python3-venv && rm -rf /var/lib/apt/lists/*",
        f"python -m venv --system-site-packages {VENV}",
        f"{VENV}/bin/python -m pip install --upgrade pip",
        f"{VENV}/bin/python -m pip install transformers==5.15.0 peft==0.20.0 accelerate==1.14.0 safetensors==0.8.0",
        f"{VENV}/bin/python -c \"import torch; assert torch.__version__.startswith('2.11.0'); assert torch.version.cuda == '12.8'; print('AVANTIQO_MODAL_TRAINER_TORCH_INHERITANCE=PASS')\"",
    )
    .env({
        "VIRTUAL_ENV": VENV,
        "PATH": f"{VENV}/bin:/usr/local/bin:/usr/bin:/bin",
    })
    .env({
        "AVANTIQO_INTELLIGENCE_TRAINER_ENABLED": "true",
        "AVANTIQO_INTELLIGENCE_TRAINER_OUTPUT_ROOT": OUTPUT_ROOT,
        "HF_HOME": HF_HOME,
        "TRANSFORMERS_CACHE": HF_HOME,
        "TOKENIZERS_PARALLELISM": "false",
    })
    .add_local_file(
        "services/avantiqo-intelligence-trainer/handler.py",
        "/root/avantiqo_intelligence_trainer_handler.py",
        copy=False,
    )
)


@app.function(
    name=FUNCTION_NAME,
    image=trainer_image,
    gpu=GPU,
    timeout=24 * 60 * 60,
    scaledown_window=60,
    max_containers=1,
    volumes={MOUNT_ROOT: training_volume},
)
def train(payload: dict[str, Any]) -> dict[str, Any]:
    sys.path.insert(0, "/root")
    import avantiqo_intelligence_trainer_handler as trainer

    result = trainer.handler({"input": payload})
    if not isinstance(result, dict):
        raise RuntimeError("AVANTIQO_INTELLIGENCE_TRAINER_MODAL_OUTPUT_INVALID")
    training_volume.commit()
    local_reference = str(result.get("adapter_artifact_reference") or "")
    if local_reference and not local_reference.startswith(OUTPUT_ROOT + "/"):
        raise RuntimeError("AVANTIQO_INTELLIGENCE_TRAINER_MODAL_ARTIFACT_SCOPE_INVALID")
    relative = local_reference[len(MOUNT_ROOT):].lstrip("/") if local_reference else ""
    return {
        **result,
        "contract": CONTRACT,
        "infrastructure_provider": "MODAL_H100_OWNED_TRAINER_V1",
        "modal_gpu": GPU,
        "modal_volume": VOLUME_NAME,
        "adapter_artifact_local_reference": local_reference or None,
        "adapter_artifact_reference": (
            f"modal-volume://{VOLUME_NAME}/{relative}" if relative else None
        ),
        "foundation_weights_mutated": False,
        "production_model_promoted": False,
        "raw_reasoning_persisted": False,
    }
