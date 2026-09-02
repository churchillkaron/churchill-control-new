from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any

import modal

APP_NAME = "avantiqo-code-warm-reuse-canary-v1"
CONTRACT = "AVANTIQO_CODE_PROVEN_FLOW_WARM_REUSE_V1"
BASE_IMAGE_ID = "im-jAkmG5niafDQsnuSUxak9c"
ENGINE_CONTRACT = "AVANTIQO_CODE_ENGINE_V1"
PRODUCT_MODEL = "avantiqo-code-v1"
RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8"

app = modal.App(APP_NAME)
image = modal.Image.from_id(BASE_IMAGE_ID)
_INVOCATION_SEQUENCE = 0


@app.function(
    image=image,
    gpu="H100",
    timeout=10 * 60,
    scaledown_window=10 * 60,
    min_containers=0,
    max_containers=1,
)
def generate(data: dict[str, Any]) -> dict[str, Any]:
    """Exact proven handler flow with one startup-only optimization."""
    global _INVOCATION_SEQUENCE

    # vLLM 0.27.1 officially supports the offline LLM engine in-process.
    # The proven Code path uses one H100 and one LLM instance, so the separate
    # EngineCore process adds cold-start latency without providing useful
    # parallelism for this bounded worker.
    os.environ["VLLM_ENABLE_V1_MULTIPROCESSING"] = "0"
    os.chdir("/app")

    import handler as code_engine

    code_engine.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
    _INVOCATION_SEQUENCE += 1
    engine_loaded_before = code_engine._ENGINE is not None
    started = time.perf_counter()
    output = code_engine.handler(
        {
            "id": f"warm-reuse-{uuid.uuid4()}",
            "input": data,
        }
    )
    elapsed = time.perf_counter() - started
    if not isinstance(output, dict):
        raise RuntimeError(f"{CONTRACT}_OUTPUT_OBJECT_REQUIRED")

    result = dict(output)
    result.update(
        {
            "canary_contract": CONTRACT,
            "engine_loaded_before": engine_loaded_before,
            "invocation_sequence": _INVOCATION_SEQUENCE,
            "container_pid": os.getpid(),
            "client_function_elapsed_seconds": round(elapsed, 3),
            "vllm_v1_multiprocessing": os.environ.get(
                "VLLM_ENABLE_V1_MULTIPROCESSING", ""
            ),
            "scaledown_window_seconds": 10 * 60,
            "max_containers": 1,
            "production_deploy_performed": False,
        }
    )
    return result


def _request() -> dict[str, Any]:
    return {
        "contract": ENGINE_CONTRACT,
        "capability": "ai.code.debug",
        "model": PRODUCT_MODEL,
        "organization_id": "benchmark-only",
        "usage_id": f"warm-reuse-{uuid.uuid4()}",
        "instruction": (
            "Fix the JavaScript function below. Return only the complete corrected "
            "function and nothing else. The function must calculate subtotal plus "
            "percentage tax. Current source: function invoiceTotal(subtotal, taxRate) "
            "{ return subtotal + taxRate; }"
        ),
        "structured_specification": {
            "benchmark_probe": True,
            "expected_behavior": "invoiceTotal(100, 0.07) returns 107",
            "raw_reasoning_must_not_persist": True,
        },
    }


def _validate(label: str, output: dict[str, Any]) -> None:
    if output.get("status") != "completed":
        raise RuntimeError(f"{CONTRACT}_{label}_STATUS_INVALID:{output.get('status')}")
    if output.get("provider") != "avantiqo-code":
        raise RuntimeError(f"{CONTRACT}_{label}_PROVIDER_INVALID")
    if output.get("model") != PRODUCT_MODEL:
        raise RuntimeError(f"{CONTRACT}_{label}_MODEL_INVALID")
    if output.get("runtime_model") != RUNTIME_MODEL:
        raise RuntimeError(f"{CONTRACT}_{label}_RUNTIME_MODEL_INVALID")
    if output.get("raw_reasoning_persisted") is not False:
        raise RuntimeError(f"{CONTRACT}_{label}_REASONING_BOUNDARY_INVALID")
    if output.get("vllm_v1_multiprocessing") != "0":
        raise RuntimeError(f"{CONTRACT}_{label}_V1_MULTIPROCESSING_NOT_DISABLED")


@app.local_entrypoint()
def main() -> None:
    request = _request()

    first_started = time.perf_counter()
    first = generate.remote(request)
    first_client_seconds = time.perf_counter() - first_started
    _validate("FIRST", first)

    warm_started = time.perf_counter()
    warm = generate.remote(request)
    warm_client_seconds = time.perf_counter() - warm_started
    _validate("WARM", warm)

    same_container = (
        first.get("container_pid") == warm.get("container_pid")
        and int(first.get("invocation_sequence") or 0) == 1
        and int(warm.get("invocation_sequence") or 0) == 2
        and first.get("engine_loaded_before") is False
        and warm.get("engine_loaded_before") is True
    )

    summary = {
        "contract": CONTRACT,
        "first_client_seconds": round(first_client_seconds, 3),
        "first_generation_seconds": float(first.get("generation_seconds") or 0),
        "warm_client_seconds": round(warm_client_seconds, 3),
        "warm_generation_seconds": float(warm.get("generation_seconds") or 0),
        "same_container": same_container,
        "first_engine_loaded_before": first.get("engine_loaded_before"),
        "warm_engine_loaded_before": warm.get("engine_loaded_before"),
        "first_invocation_sequence": first.get("invocation_sequence"),
        "warm_invocation_sequence": warm.get("invocation_sequence"),
        "vllm_v1_multiprocessing": warm.get("vllm_v1_multiprocessing"),
        "scaledown_window_seconds": warm.get("scaledown_window_seconds"),
        "max_containers": warm.get("max_containers"),
        "output_tokens_first": int((first.get("usage") or {}).get("output_tokens") or 0),
        "output_tokens_warm": int((warm.get("usage") or {}).get("output_tokens") or 0),
        "production_deploy_performed": False,
    }
    print(
        "AVANTIQO_CODE_PROVEN_FLOW_WARM_REUSE_SUMMARY="
        + json.dumps(summary, separators=(",", ":")),
        flush=True,
    )

    if not same_container:
        raise RuntimeError(f"{CONTRACT}_WARM_CONTAINER_REUSE_REQUIRED")
    if summary["warm_client_seconds"] > 10.0:
        raise RuntimeError(
            f"{CONTRACT}_WARM_CLIENT_LATENCY_FAILED:{summary['warm_client_seconds']}s"
        )
    if summary["warm_generation_seconds"] > 5.0:
        raise RuntimeError(
            f"{CONTRACT}_WARM_GENERATION_LATENCY_FAILED:{summary['warm_generation_seconds']}s"
        )

    print(f"{CONTRACT}=PASS", flush=True)
