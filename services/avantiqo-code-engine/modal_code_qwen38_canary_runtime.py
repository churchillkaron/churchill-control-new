"""Isolated Qwen3.8 candidate runtime for Avantiqo Code.

This is a benchmark/canary runtime only. It does not replace handler.py, does
not alter production routing, does not create storage, and never downloads
weights during GPU execution. It mounts the existing Code Modal Volume and
requires the exactly pinned Qwen3.8 FP8 snapshot prepared by the CPU bootstrap.

The first compatibility probe deliberately favors correctness over peak speed:
stable vLLM 0.28.0, text/language-model-only mode, no prefix caching, no
speculative decoding, 32k context, one H100, offline exact snapshot.
Optimizations are admitted only after this baseline proves loadability and
deterministic generation.
"""

from __future__ import annotations

import json
import os
import time
from importlib.metadata import version
from pathlib import Path
from typing import Any

import modal

import code_model_canary_v2 as policy

APP_NAME = "avantiqo-code-qwen38-canary-runtime"
CONTRACT = "AVANTIQO_CODE_QWEN38_CANARY_RUNTIME_V2"
VLLM_VERSION = "0.28.0"
VLLM_BUILD_COMMIT = "2cf0a6915ce544dc493a0990f2ea38d81601128a"
VLLM_IMAGE = f"vllm/vllm-openai:v{VLLM_VERSION}"
MODEL_MOUNT_ROOT = "/models"
HF_CACHE_ROOT = Path(MODEL_MOUNT_ROOT) / "huggingface" / "hub"
CANDIDATE_MARKER = Path(MODEL_MOUNT_ROOT) / "avantiqo-code-qwen38-canary-ready.json"
CANDIDATE_SNAPSHOT = (
    HF_CACHE_ROOT
    / f"models--{policy.CANDIDATE_MODEL.replace('/', '--')}"
    / "snapshots"
    / policy.CANDIDATE_REVISION
)
MAX_MODEL_LEN = 32_768
GPU_MEMORY_UTILIZATION = 0.90

os.environ["VLLM_WORKER_MULTIPROC_METHOD"] = "spawn"
os.environ["VLLM_USE_FLASHINFER_SAMPLER"] = "0"
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"

app = modal.App(APP_NAME)
model_volume = modal.Volume.from_name(policy.CODE_VOLUME, create_if_missing=False)
image = (
    modal.Image.from_registry(
        VLLM_IMAGE,
        add_python=None,
        setup_dockerfile_commands=[
            "RUN command -v python >/dev/null 2>&1 || ln -s \"$(command -v python3)\" /usr/local/bin/python",
            "RUN command -v pip >/dev/null 2>&1 || ln -s \"$(command -v pip3)\" /usr/local/bin/pip",
            "RUN python --version && pip --version",
        ],
    )
    .entrypoint([])
    .env(
        {
            "HF_HUB_OFFLINE": "1",
            "TRANSFORMERS_OFFLINE": "1",
            "HF_HUB_DISABLE_TELEMETRY": "1",
            "VLLM_WORKER_MULTIPROC_METHOD": "spawn",
            "VLLM_USE_FLASHINFER_SAMPLER": "0",
        }
    )
    .add_local_python_source("code_model_canary_v2")
)

_ENGINE: Any | None = None
_TOKENIZER: Any | None = None


def _runtime_identity() -> dict[str, str]:
    observed_version = version("vllm")
    observed_build_commit = str(os.environ.get("VLLM_BUILD_COMMIT") or "").strip()
    if observed_version != VLLM_VERSION:
        raise RuntimeError(
            f"{CONTRACT}_VLLM_VERSION_INVALID:expected={VLLM_VERSION}:actual={observed_version}"
        )
    if observed_build_commit != VLLM_BUILD_COMMIT:
        raise RuntimeError(
            f"{CONTRACT}_VLLM_BUILD_COMMIT_INVALID:"
            f"expected={VLLM_BUILD_COMMIT}:actual={observed_build_commit or 'missing'}"
        )
    return {
        "vllm_version": observed_version,
        "vllm_build_commit": observed_build_commit,
        "vllm_image": VLLM_IMAGE,
    }


def _marker() -> dict[str, Any]:
    try:
        value = json.loads(CANDIDATE_MARKER.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"{CONTRACT}_CANDIDATE_MARKER_REQUIRED") from exc
    if not isinstance(value, dict):
        raise RuntimeError(f"{CONTRACT}_CANDIDATE_MARKER_INVALID")
    if value.get("runtime_model") != policy.CANDIDATE_MODEL:
        raise RuntimeError(f"{CONTRACT}_MODEL_IDENTITY_INVALID")
    if value.get("revision") != policy.CANDIDATE_REVISION:
        raise RuntimeError(f"{CONTRACT}_REVISION_INVALID")
    return value


def _validate_snapshot() -> dict[str, Any]:
    marker = _marker()
    if not CANDIDATE_SNAPSHOT.is_dir():
        raise RuntimeError(f"{CONTRACT}_SNAPSHOT_REQUIRED")
    if not (CANDIDATE_SNAPSHOT / "config.json").is_file():
        raise RuntimeError(f"{CONTRACT}_CONFIG_REQUIRED")
    if not any(CANDIDATE_SNAPSHOT.glob("*.safetensors")):
        raise RuntimeError(f"{CONTRACT}_SAFETENSORS_REQUIRED")
    return marker


def _load() -> tuple[Any, Any]:
    global _ENGINE, _TOKENIZER
    if _ENGINE is not None and _TOKENIZER is not None:
        return _TOKENIZER, _ENGINE
    _runtime_identity()
    _validate_snapshot()
    from vllm import LLM

    _ENGINE = LLM(
        model=str(CANDIDATE_SNAPSHOT),
        tokenizer=str(CANDIDATE_SNAPSHOT),
        dtype="auto",
        trust_remote_code=False,
        tensor_parallel_size=1,
        max_model_len=MAX_MODEL_LEN,
        gpu_memory_utilization=GPU_MEMORY_UTILIZATION,
        language_model_only=True,
        enforce_eager=False,
        enable_prefix_caching=False,
        disable_log_stats=True,
        safetensors_load_strategy="prefetch",
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
    return request


@app.function(
    image=image,
    volumes={MODEL_MOUNT_ROOT: model_volume},
    gpu="H100",
    timeout=12 * 60,
    scaledown_window=10 * 60,
    min_containers=0,
    max_containers=1,
)
def runtime_probe(approved: bool = False) -> dict[str, Any]:
    """One explicit paid compatibility probe; performs no generation request."""
    if approved is not True:
        raise RuntimeError(f"{CONTRACT}_EXPLICIT_APPROVAL_REQUIRED")
    started = time.perf_counter()
    marker = _validate_snapshot()
    identity = _runtime_identity()
    tokenizer, _engine = _load()
    elapsed_ms = round((time.perf_counter() - started) * 1000)
    return {
        "contract": CONTRACT,
        "status": "runtime_ready",
        "runtime_model": policy.CANDIDATE_MODEL,
        "revision": policy.CANDIDATE_REVISION,
        **identity,
        "model_volume_name": policy.CODE_VOLUME,
        "snapshot_path": str(CANDIDATE_SNAPSHOT),
        "marker_contract": marker.get("contract"),
        "tokenizer_class": type(tokenizer).__name__,
        "engine_loaded": True,
        "engine_prepare_ms": elapsed_ms,
        "max_model_len": MAX_MODEL_LEN,
        "language_model_only": True,
        "prefix_caching_enabled": False,
        "speculative_decoding_enabled": False,
        "production_routing_change": False,
        "production_deploy_performed": False,
        "model_download_performed": False,
        "volume_created": False,
    }


@app.function(
    image=image,
    volumes={MODEL_MOUNT_ROOT: model_volume},
    gpu="H100",
    timeout=12 * 60,
    scaledown_window=10 * 60,
    min_containers=0,
    max_containers=1,
)
def generate(requests: list[dict[str, Any]], approved: bool = False) -> dict[str, Any]:
    """Bounded canary generation for private certification; never production."""
    if approved is not True:
        raise RuntimeError(f"{CONTRACT}_EXPLICIT_APPROVAL_REQUIRED")
    if not isinstance(requests, list) or not requests or len(requests) > 16:
        raise ValueError(f"{CONTRACT}_REQUEST_BATCH_INVALID")
    validated = [_validated_request(item) for item in requests if isinstance(item, dict)]
    if len(validated) != len(requests):
        raise ValueError(f"{CONTRACT}_REQUEST_OBJECT_REQUIRED")

    identity = _runtime_identity()
    tokenizer, engine = _load()
    from vllm import SamplingParams

    rendered: list[str] = []
    for item in validated:
        messages = [{"role": "user", "content": item["instruction"]}]
        rendered.append(
            tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
                enable_thinking=False,
            )
        )
    started = time.perf_counter()
    outputs = engine.generate(
        rendered,
        SamplingParams(
            temperature=0.0,
            max_tokens=2048,
            skip_special_tokens=True,
        ),
        use_tqdm=False,
    )
    elapsed_ms = round((time.perf_counter() - started) * 1000)
    if len(outputs) != len(validated):
        raise RuntimeError(f"{CONTRACT}_OUTPUT_COUNT_INVALID")
    texts: list[str] = []
    for output in outputs:
        if not output.outputs:
            raise RuntimeError(f"{CONTRACT}_OUTPUT_REQUIRED")
        text = str(output.outputs[0].text or "").strip()
        if not text:
            raise RuntimeError(f"{CONTRACT}_OUTPUT_REQUIRED")
        texts.append(text)
    return {
        "contract": CONTRACT,
        "status": "completed",
        "runtime_model": policy.CANDIDATE_MODEL,
        "revision": policy.CANDIDATE_REVISION,
        **identity,
        "model_volume_name": policy.CODE_VOLUME,
        "outputs": texts,
        "batch_wall_ms": elapsed_ms,
        "language_model_only": True,
        "prefix_caching_enabled": False,
        "speculative_decoding_enabled": False,
        "production_routing_change": False,
        "production_deploy_performed": False,
        "model_download_performed": False,
        "volume_created": False,
    }


@app.local_entrypoint()
def main() -> None:
    raise RuntimeError(
        f"{CONTRACT}_NO_DEFAULT_PAID_ENTRYPOINT:invoke runtime_probe or generate explicitly"
    )
