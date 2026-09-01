"""Fail-closed tombstone for the retired native 4K LTX Scene 1 certification lane.

Measured on 2026-09-01: the full-dev BF16 TI2Vid one-stage job at 3840x2176,
121 frames and 30 denoising steps reached only step 3 before the governed
580-second subprocess timeout. The lane is therefore economically infeasible
for Avantiqo production and must not be retried.

This module intentionally defines no GPU function. It remains only so stale
local instructions fail safely after users refresh main instead of silently
recreating paid H200 work. Video architecture work must move to a production-
appropriate LTX pipeline and pass a new zero-cost economics gate before any
further paid certification.
"""
from __future__ import annotations

import json

import modal

APP_NAME = "avantiqo-video-owned"
RETIRED_CONTRACT = "AVANTIQO_VIDEO_LTX25_NATIVE_4K_ONE_STAGE_RETIRED_V1"
MEASURED_FAILURE = {
    "pipeline": "TI2VID_ONE_STAGE_FULL_DEV_BF16",
    "width": 3840,
    "height": 2176,
    "frames": 121,
    "fps": 24,
    "denoising_steps": 30,
    "steps_completed_before_timeout": 3,
    "subprocess_timeout_seconds": 580,
    "paid_lane_enabled": False,
    "gpu_function_defined": False,
    "automatic_retry_allowed": False,
    "runpod_fallback_allowed": False,
    "production_deploy_performed": False,
}

app = modal.App(APP_NAME)


@app.local_entrypoint()
def scene1_runtime_preflight() -> None:
    """Report the measured retirement state without requesting any GPU."""
    report = {
        "success": True,
        "contract": RETIRED_CONTRACT,
        "phase": "RETIRED_AFTER_MEASURED_TIMEOUT",
        "measurement": MEASURED_FAILURE,
        "gpu_requested": False,
        "gpu_inference_performed": False,
        "customer_charge_planned": False,
        "pricing_activation_planned": False,
        "next_paid_test_allowed": False,
        "reason": "NATIVE_4K_ONE_STAGE_FULL_DEV_EXCEEDED_COST_TIME_ENVELOPE",
    }
    print(json.dumps(report, indent=2), flush=True)
    print(f"{RETIRED_CONTRACT}=PASS", flush=True)


@app.local_entrypoint()
def scene1_certify_resolved() -> None:
    """Fail before any remote call or GPU allocation."""
    raise RuntimeError(
        "AVANTIQO_VIDEO_SCENE1_PAID_LANE_DISABLED_AFTER_MEASURED_TIMEOUT:"
        "NO_FURTHER_H200_RETRY_ALLOWED"
    )
