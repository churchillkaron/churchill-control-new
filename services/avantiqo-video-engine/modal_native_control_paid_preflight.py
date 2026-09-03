from __future__ import annotations

import json
import os
from typing import Any

from modal_app import LTX_GPU, LTX_GPU_USD_PER_SECOND, LTX_HARD_TIMEOUT_SECONDS, app, generate_native_master
from modal_native_controlled_master import generate_native_controlled_master
from modal_native_job import generate_native_job

CONTRACT = "AVANTIQO_VIDEO_NATIVE_CONTROL_PAID_PROOF_PREFLIGHT_V1"
MAX_COST_ENV = "AVANTIQO_VIDEO_NATIVE_CONTROL_MAX_SUPPLIER_GPU_COST_USD"
DEFAULT_MAX_COST_USD = 3.25


def _finite(value: Any, fallback: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return number if number == number and abs(number) != float("inf") else fallback


def _stats(name: str, fn: Any) -> dict[str, int | str]:
    current = fn.get_current_stats()
    data = {
        "function": name,
        "backlog": int(getattr(current, "backlog", 0) or 0),
        "num_total_runners": int(getattr(current, "num_total_runners", 0) or 0),
        "num_running_inputs": int(getattr(current, "num_running_inputs", 0) or 0),
    }
    if data["backlog"] or data["num_total_runners"] or data["num_running_inputs"]:
        raise RuntimeError(
            f"{CONTRACT}_VIDEO_ALREADY_ACTIVE:{name}:"
            f"backlog={data['backlog']}:runners={data['num_total_runners']}:running={data['num_running_inputs']}"
        )
    return data


@app.local_entrypoint()
def preflight() -> None:
    maximum = _finite(os.environ.get(MAX_COST_ENV), DEFAULT_MAX_COST_USD)
    hard_ceiling = float(LTX_GPU_USD_PER_SECOND) * float(LTX_HARD_TIMEOUT_SECONDS)
    if hard_ceiling > maximum:
        raise RuntimeError(f"{CONTRACT}_SUPPLIER_COST_CEILING_EXCEEDED:{hard_ceiling:.6f}:{maximum:.6f}")

    report = {
        "success": True,
        "contract": CONTRACT,
        "gpu": LTX_GPU,
        "hard_timeout_seconds": LTX_HARD_TIMEOUT_SECONDS,
        "hard_gpu_cost_ceiling_usd": round(hard_ceiling, 6),
        "approved_supplier_gpu_cost_budget_usd": round(maximum, 6),
        "maximum_paid_gpu_jobs": 1,
        "automatic_paid_retry": False,
        "gpu_requested": False,
        "transport": _stats("generate_native_job", generate_native_job),
        "controlled_master": _stats("generate_native_controlled_master", generate_native_controlled_master),
        "legacy_master": _stats("generate_native_master", generate_native_master),
    }
    print(json.dumps(report, indent=2), flush=True)
    print(f"{CONTRACT}=PASS", flush=True)
    print("GPU_INFERENCE_PERFORMED=false", flush=True)
