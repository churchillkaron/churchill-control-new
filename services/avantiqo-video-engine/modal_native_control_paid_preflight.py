from __future__ import annotations

import json
import os
from typing import Any

import modal

from modal_app import LTX_GPU, LTX_GPU_USD_PER_SECOND, LTX_HARD_TIMEOUT_SECONDS

CONTRACT = "AVANTIQO_VIDEO_NATIVE_CONTROL_PAID_PROOF_PREFLIGHT_V2"
DEPLOYED_APP = "avantiqo-video-owned"
MAX_COST_ENV = "AVANTIQO_VIDEO_NATIVE_CONTROL_MAX_SUPPLIER_GPU_COST_USD"
DEFAULT_MAX_COST_USD = 3.25

preflight_app = modal.App("avantiqo-video-native-control-paid-preflight")


def _finite(value: Any, fallback: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return number if number == number and abs(number) != float("inf") else fallback


def _stats(name: str) -> dict[str, int | str]:
    fn = modal.Function.from_name(DEPLOYED_APP, name)
    current = fn.get_current_stats()
    data = {
        "app": DEPLOYED_APP,
        "function": name,
        "stats_source": "named_deployed_app",
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


@preflight_app.local_entrypoint()
def preflight() -> None:
    maximum = _finite(os.environ.get(MAX_COST_ENV), DEFAULT_MAX_COST_USD)
    hard_ceiling = float(LTX_GPU_USD_PER_SECOND) * float(LTX_HARD_TIMEOUT_SECONDS)
    if hard_ceiling > maximum:
        raise RuntimeError(f"{CONTRACT}_SUPPLIER_COST_CEILING_EXCEEDED:{hard_ceiling:.6f}:{maximum:.6f}")

    report = {
        "success": True,
        "contract": CONTRACT,
        "modal_app": DEPLOYED_APP,
        "stats_source": "named_deployed_app",
        "gpu": LTX_GPU,
        "hard_timeout_seconds": LTX_HARD_TIMEOUT_SECONDS,
        "hard_gpu_cost_ceiling_usd": round(hard_ceiling, 6),
        "approved_supplier_gpu_cost_budget_usd": round(maximum, 6),
        "maximum_paid_gpu_jobs": 1,
        "automatic_paid_retry": False,
        "gpu_requested": False,
        "transport": _stats("generate_native_job"),
        "controlled_master": _stats("generate_native_controlled_master"),
        "legacy_master": _stats("generate_native_master"),
    }
    print(json.dumps(report, indent=2), flush=True)
    print(f"{CONTRACT}=PASS", flush=True)
    print("AVANTIQO_VIDEO_NAMED_DEPLOYED_IDLE_GATE=PASS", flush=True)
    print("GPU_INFERENCE_PERFORMED=false", flush=True)
