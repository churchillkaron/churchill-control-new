"""Fast-start isolated Qwen3.8 candidate runtime for Avantiqo Code.

Benchmark/canary only: no production routing, deployment, model download, or
storage creation. The exact candidate snapshot is already present on the single
Code Modal Volume. This runtime intentionally optimizes the cold compatibility
path while preserving the warm-batch architecture that made the prior Code
certification fast.
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
CONTRACT = "AVANTIQO_CODE_QWEN38_CANARY_RUNTIME_V4"
VLLM_VERSION = "0.28.0"
VLLM_BUILD_COMMIT = "2cf0a6915ce544dc493a0990f2ea38d81601128a"
VLLM_IMAGE = f"vllm/vllm-openai:v{VLLM_VERSION}"
INSTANTTENSOR_VERSION = "0.1.9"
MODEL_MOUNT_ROOT = "/models"
HF_CACHE_ROOT = Path(MODEL_MOUNT_ROOT) / "huggingface" / "hub"
VLLM_CACHE_ROOT = Path(MODEL_MOUNT_ROOT) / "vllm-cache" / "qwen38-v028"
CANDIDATE_MARKER = Path(MODEL_MOUNT_ROOT) / "avantiqo-code-qwen38-canary-ready.json"
CANDIDATE_SNAPSHOT = (
    HF_CACHE_ROOT
    / f"models--{policy.CANDIDATE_MODEL.replace('/', '--')}"
    / "snapshots"
    / policy.CANDIDATE_REVISION
)
MAX_MODEL_LEN = 32_768
# The canary accepts at most 16 requests per batch. Matching engine concurrency
# to that real contract avoids warming/cache-sizing hundreds of unused slots.
MAX_NUM_SEQS = 16
GPU_MEMORY_UTILIZATION = 0.90
LOAD_FORMAT = "instanttensor"
GDN_PREFILL_BACKEND = "triton"
FAST_BOOT_ENFORCE_EAGER = True
SMOKE_WARM_LATENCY_TARGET_MS = 4_000
SMOKE_EXPECTED_TYPESCRIPT = (
    'export function canonicalCurrency(value: unknown): string { '
    'return String(value ?? "").trim().toUpperCase(); }'
)

# These are deliberately set both in the local definition process and in the
# Modal image environment. Qwen3.8 FP8 otherwise auto-selects DeepGEMM on H100
# and vLLM attempts thousands of JIT warmups before the first useful token.
os.environ["VLLM_WORKER_MULTIPROC_METHOD"] = "spawn"
os.environ["VLLM_USE_FLASHINFER_SAMPLER"] = "0"
os.environ["VLLM_USE_DEEP_GEMM"] = "0"
os.environ["VLLM_MOE_USE_DEEP_GEMM"] = "0"
os.environ["VLLM_DEEP_GEMM_WARMUP"] = "skip"
os.environ["VLLM_CACHE_ROOT"] = str(VLLM_CACHE_ROOT)
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
            # Keep the vLLM image's tested CUDA/NCCL stack intact. Plain pip
            # install changed NCCL 2.30.7 -> 2.29.7 in the first smoke.
            f"RUN python -m pip install --no-deps instanttensor=={INSTANTTENSOR_VERSION}",
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
            "VLLM_USE_DEEP_GEMM": "0",
            "VLLM_MOE_USE_DEEP_GEMM": "0",
            "VLLM_DEEP_GEMM_WARMUP": "skip",
            "VLLM_CACHE_ROOT": str(VLLM_CACHE_ROOT),
        }
    )
    .add_local_python_source("code_model_canary_v2")
)

_ENGINE: Any | None = None
_TOKENIZER: Any | None = None


def _runtime_identity() -> dict[str, str]:
    observed_version = version("vllm")
    observed_build_commit = str(os.environ.get("VLLM_BUILD_COMMIT") or "").strip()
    observed_instanttensor = version("instanttensor")
    if observed_version != VLLM_VERSION:
        raise RuntimeError(
            f"{CONTRACT}_VLLM_VERSION_INVALID:expected={VLLM_VERSION}:actual={observed_version}"
        )
    if observed_build_commit != VLLM_BUILD_COMMIT:
        raise RuntimeError(
            f"{CONTRACT}_VLLM_BUILD_COMMIT_INVALID:expected={VLLM_BUILD_COMMIT}:"
            f"actual={observed_build_commit or 'missing'}"
        )
    if observed_instanttensor != INSTANTTENSOR_VERSION:
        raise RuntimeError(
            f"{CONTRACT}_INSTANTTENSOR_VERSION_INVALID:"
            f"expected={INSTANTTENSOR_VERSION}:actual={observed_instanttensor}"
        )
    return {
        "vllm_version": observed_version,
        "vllm_build_commit": observed_build_commit,
        "vllm_image": VLLM_IMAGE,
        "instanttensor_version": observed_instanttensor,
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
    VLLM_CACHE_ROOT.mkdir(parents=True, exist_ok=True)
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
        max_num_seqs=MAX_NUM_SEQS,
        gpu_memory_utilization=GPU_MEMORY_UTILIZATION,
        language_model_only=True,
        enforce_eager=FAST_BOOT_ENFORCE_EAGER,
        enable_prefix_caching=False,
        disable_log_stats=True,
        load_format=LOAD_FORMAT,
        gdn_prefill_backend=GDN_PREFILL_BACKEND,
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


def _render(tokenizer: Any, instruction: str) -> str:
    return tokenizer.apply_chat_template(
        [{"role": "user", "content": instruction}],
        tokenize=False,
        add_generation_prompt=True,
        enable_thinking=False,
    )


def _first_text(outputs: Any) -> str:
    if not outputs or not outputs[0].outputs:
        raise RuntimeError(f"{CONTRACT}_OUTPUT_REQUIRED")
    text = str(outputs[0].outputs[0].text or "").strip()
    if not text:
        raise RuntimeError(f"{CONTRACT}_OUTPUT_REQUIRED")
    return text


_FUNCTION_OPTIONS = dict(
    image=image,
    volumes={MODEL_MOUNT_ROOT: model_volume},
    gpu="H100",
    timeout=6 * 60,
    startup_timeout=3 * 60,
    retries=0,
    scaledown_window=10 * 60,
    min_containers=0,
    max_containers=1,
)


@app.function(**_FUNCTION_OPTIONS)
def runtime_probe(approved: bool = False) -> dict[str, Any]:
    """One explicit paid compatibility probe; performs no generation request."""
    if approved is not True:
        raise RuntimeError(f"{CONTRACT}_EXPLICIT_APPROVAL_REQUIRED")
    started = time.perf_counter()
    marker = _validate_snapshot()
    identity = _runtime_identity()
    tokenizer, _engine = _load()
    elapsed_ms = round((time.perf_counter() - started) * 1000)
    model_volume.commit()
    return {
        "contract": CONTRACT,
        "status": "runtime_ready",
        "runtime_model": policy.CANDIDATE_MODEL,
        "revision": policy.CANDIDATE_REVISION,
        **identity,
        "model_volume_name": policy.CODE_VOLUME,
        "snapshot_path": str(CANDIDATE_SNAPSHOT),
        "vllm_cache_root": str(VLLM_CACHE_ROOT),
        "marker_contract": marker.get("contract"),
        "tokenizer_class": type(tokenizer).__name__,
        "engine_loaded": True,
        "engine_prepare_ms": elapsed_ms,
        "max_model_len": MAX_MODEL_LEN,
        "max_num_seqs": MAX_NUM_SEQS,
        "load_format": LOAD_FORMAT,
        "gdn_prefill_backend": GDN_PREFILL_BACKEND,
        "deep_gemm_enabled": False,
        "fast_boot_enforce_eager": FAST_BOOT_ENFORCE_EAGER,
        "language_model_only": True,
        "prefix_caching_enabled": False,
        "speculative_decoding_enabled": False,
        "production_routing_change": False,
        "production_deploy_performed": False,
        "model_download_performed": False,
        "volume_created": False,
    }


@app.function(**_FUNCTION_OPTIONS)
def generation_smoke(approved: bool = False) -> dict[str, Any]:
    """Load once, warm once, then score one tiny deterministic Code generation."""
    if approved is not True:
        raise RuntimeError(f"{CONTRACT}_EXPLICIT_APPROVAL_REQUIRED")

    marker = _validate_snapshot()
    identity = _runtime_identity()
    prepare_started = time.perf_counter()
    tokenizer, engine = _load()
    engine_prepare_ms = round((time.perf_counter() - prepare_started) * 1000)

    from vllm import SamplingParams

    warm_started = time.perf_counter()
    warm_outputs = engine.generate(
        [_render(tokenizer, "Return only OK.")],
        SamplingParams(temperature=0.0, max_tokens=8, skip_special_tokens=True),
        use_tqdm=False,
    )
    warm_generation_ms = round((time.perf_counter() - warm_started) * 1000)
    warm_text = _first_text(warm_outputs)

    scored_instruction = (
        "Return exactly the following TypeScript source and nothing else. "
        "Do not use markdown fences or add an explanation.\n"
        + SMOKE_EXPECTED_TYPESCRIPT
    )
    scored_started = time.perf_counter()
    scored_outputs = engine.generate(
        [_render(tokenizer, scored_instruction)],
        SamplingParams(temperature=0.0, max_tokens=96, skip_special_tokens=True),
        use_tqdm=False,
    )
    warm_scored_ms = round((time.perf_counter() - scored_started) * 1000)
    scored_text = _first_text(scored_outputs)

    warmup_pass = warm_text == "OK"
    correctness_pass = scored_text == SMOKE_EXPECTED_TYPESCRIPT
    latency_pass = warm_scored_ms <= SMOKE_WARM_LATENCY_TARGET_MS
    smoke_pass = warmup_pass and correctness_pass and latency_pass
    model_volume.commit()

    return {
        "contract": CONTRACT,
        "status": "passed" if smoke_pass else "failed",
        "smoke_pass": smoke_pass,
        "warmup_pass": warmup_pass,
        "correctness_pass": correctness_pass,
        "latency_pass": latency_pass,
        "runtime_model": policy.CANDIDATE_MODEL,
        "revision": policy.CANDIDATE_REVISION,
        **identity,
        "model_volume_name": policy.CODE_VOLUME,
        "snapshot_path": str(CANDIDATE_SNAPSHOT),
        "vllm_cache_root": str(VLLM_CACHE_ROOT),
        "marker_contract": marker.get("contract"),
        "engine_prepare_ms": engine_prepare_ms,
        "warm_generation_ms": warm_generation_ms,
        "warm_scored_ms": warm_scored_ms,
        "warm_latency_target_ms": SMOKE_WARM_LATENCY_TARGET_MS,
        "warmup_output": warm_text,
        "scored_output": scored_text,
        "expected_output": SMOKE_EXPECTED_TYPESCRIPT,
        "max_num_seqs": MAX_NUM_SEQS,
        "load_format": LOAD_FORMAT,
        "gdn_prefill_backend": GDN_PREFILL_BACKEND,
        "deep_gemm_enabled": False,
        "fast_boot_enforce_eager": FAST_BOOT_ENFORCE_EAGER,
        "language_model_only": True,
        "prefix_caching_enabled": False,
        "speculative_decoding_enabled": False,
        "production_routing_change": False,
        "production_deploy_performed": False,
        "model_download_performed": False,
        "volume_created": False,
    }


@app.function(**_FUNCTION_OPTIONS)
def generate(requests: list[dict[str, Any]], approved: bool = False) -> dict[str, Any]:
    """Bounded warm-batch canary generation for private certification."""
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

    rendered = [_render(tokenizer, item["instruction"]) for item in validated]
    started = time.perf_counter()
    outputs = engine.generate(
        rendered,
        SamplingParams(temperature=0.0, max_tokens=2048, skip_special_tokens=True),
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
    model_volume.commit()
    return {
        "contract": CONTRACT,
        "status": "completed",
        "runtime_model": policy.CANDIDATE_MODEL,
        "revision": policy.CANDIDATE_REVISION,
        **identity,
        "model_volume_name": policy.CODE_VOLUME,
        "vllm_cache_root": str(VLLM_CACHE_ROOT),
        "outputs": texts,
        "batch_wall_ms": elapsed_ms,
        "max_num_seqs": MAX_NUM_SEQS,
        "load_format": LOAD_FORMAT,
        "gdn_prefill_backend": GDN_PREFILL_BACKEND,
        "deep_gemm_enabled": False,
        "fast_boot_enforce_eager": FAST_BOOT_ENFORCE_EAGER,
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
        f"{CONTRACT}_NO_DEFAULT_PAID_ENTRYPOINT:invoke runtime_probe, generation_smoke or generate explicitly"
    )
