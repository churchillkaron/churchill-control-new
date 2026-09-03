"""Zero-cost admission contract for the next Avantiqo Code model canary.

No model is downloaded and no GPU is started by this module. It defines the
candidate and the evidence needed before a paid head-to-head is allowed.
"""

from __future__ import annotations

from typing import Any

CONTRACT = "AVANTIQO_CODE_MODEL_CANARY_V2"
CURRENT_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8"
CANDIDATE_MODEL = "Qwen/Qwen3.8-27B-FP8"
CANDIDATE_REVISION = "017b9c7af6b5689d5dd426a76e0bc077eb5ca20a"
CODE_VOLUME = "avantiqo-code-models"
QUANTIZATION = "fp8"
MIN_NATIVE_CONTEXT = 262_144
MAX_CANDIDATE_BYTES = 32 * 1024**3
MIN_FREE_AFTER_DOWNLOAD_BYTES = 40 * 1024**3


def admit(snapshot: dict[str, Any]) -> dict[str, Any]:
    candidate_bytes = int(snapshot.get("candidate_bytes") or 0)
    free_bytes = int(snapshot.get("code_volume_free_bytes") or 0)
    storage_volumes = tuple(snapshot.get("code_storage_volumes") or ())
    current_ready = snapshot.get("current_model_ready") is True
    observed_revision = str(snapshot.get("candidate_revision") or "").strip()
    inference_requested = snapshot.get("inference_requested") is True

    report = {
        "contract": CONTRACT,
        "current_model": CURRENT_MODEL,
        "candidate_model": CANDIDATE_MODEL,
        "candidate_revision": CANDIDATE_REVISION,
        "code_volume": CODE_VOLUME,
        "quantization": QUANTIZATION,
        "candidate_bytes": candidate_bytes,
        "code_volume_free_bytes": free_bytes,
        "free_after_candidate_bytes": max(0, free_bytes - candidate_bytes),
        "single_code_storage": storage_volumes == (CODE_VOLUME,),
        "current_model_ready": current_ready,
        "candidate_revision_pinned": observed_revision == CANDIDATE_REVISION,
        "candidate_fits_single_volume": (
            0 < candidate_bytes <= MAX_CANDIDATE_BYTES
            and free_bytes - candidate_bytes >= MIN_FREE_AFTER_DOWNLOAD_BYTES
        ),
        "candidate_is_not_current": CANDIDATE_MODEL != CURRENT_MODEL,
        "inference_requested": inference_requested,
        "production_routing_change": snapshot.get("production_routing_change") is True,
        "production_deploy_performed": snapshot.get("production_deploy_performed") is True,
    }
    report["admitted"] = all(
        (
            report["single_code_storage"],
            report["current_model_ready"],
            report["candidate_revision_pinned"],
            report["candidate_fits_single_volume"],
            report["candidate_is_not_current"],
            not report["inference_requested"],
            not report["production_routing_change"],
            not report["production_deploy_performed"],
        )
    )
    return report


def assert_admitted(snapshot: dict[str, Any]) -> dict[str, Any]:
    report = admit(snapshot)
    if report["admitted"] is not True:
        raise RuntimeError(f"{CONTRACT}_NOT_ADMITTED:{report}")
    return report
