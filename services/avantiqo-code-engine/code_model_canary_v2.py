"""Zero-cost admission contract for the next Avantiqo Code model canary.

This contract deliberately models Modal Volume semantics instead of a fixed
network disk. Modal Volumes are distributed persistent storage; transient local
working space is controlled separately with Function.ephemeral_disk.

No model is downloaded and no GPU is started by this module.
"""

from __future__ import annotations

from typing import Any

CONTRACT = "AVANTIQO_CODE_MODEL_CANARY_V3"
CURRENT_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8"
CANDIDATE_MODEL = "Qwen/Qwen3.8-27B-FP8"
CANDIDATE_REVISION = "017b9c7af6b5689d5dd426a76e0bc077eb5ca20a"
CODE_VOLUME = "avantiqo-code-models"
QUANTIZATION = "fp8"
MIN_NATIVE_CONTEXT = 262_144
# Literal byte budgets make the safety contract statically auditable without
# evaluating arbitrary Python expressions in the verifier.
MAX_CANDIDATE_BYTES = 34359738368
MIN_BOOTSTRAP_EPHEMERAL_DISK_BYTES = 68719476736
PLANNED_BOOTSTRAP_EPHEMERAL_DISK_BYTES = 103079215104


def admit(snapshot: dict[str, Any]) -> dict[str, Any]:
    candidate_bytes = int(snapshot.get("candidate_bytes") or 0)
    bootstrap_ephemeral_bytes = int(snapshot.get("bootstrap_ephemeral_disk_bytes") or 0)
    storage_volumes = tuple(snapshot.get("code_storage_volumes") or ())
    current_ready = snapshot.get("current_model_ready") is True
    observed_revision = str(snapshot.get("candidate_revision") or "").strip()
    inference_requested = snapshot.get("inference_requested") is True
    distributed_volume_storage = snapshot.get("distributed_volume_storage") is True
    fixed_capacity_assumption_used = snapshot.get("fixed_capacity_assumption_used") is True

    report = {
        "contract": CONTRACT,
        "current_model": CURRENT_MODEL,
        "candidate_model": CANDIDATE_MODEL,
        "candidate_revision": CANDIDATE_REVISION,
        "code_volume": CODE_VOLUME,
        "quantization": QUANTIZATION,
        "candidate_bytes": candidate_bytes,
        "bootstrap_ephemeral_disk_bytes": bootstrap_ephemeral_bytes,
        "single_code_storage": storage_volumes == (CODE_VOLUME,),
        "current_model_ready": current_ready,
        "candidate_revision_pinned": observed_revision == CANDIDATE_REVISION,
        "candidate_size_bounded": 0 < candidate_bytes <= MAX_CANDIDATE_BYTES,
        "bootstrap_ephemeral_disk_safe": (
            bootstrap_ephemeral_bytes >= MIN_BOOTSTRAP_EPHEMERAL_DISK_BYTES
        ),
        "distributed_volume_storage": distributed_volume_storage,
        "fixed_capacity_assumption_used": fixed_capacity_assumption_used,
        "candidate_is_not_current": CANDIDATE_MODEL != CURRENT_MODEL,
        "inference_requested": inference_requested,
        "production_routing_change": snapshot.get("production_routing_change") is True,
        "production_deploy_performed": snapshot.get("production_deploy_performed") is True,
        "volume_created": snapshot.get("volume_created") is True,
    }
    report["admitted"] = all(
        (
            report["single_code_storage"],
            report["current_model_ready"],
            report["candidate_revision_pinned"],
            report["candidate_size_bounded"],
            report["bootstrap_ephemeral_disk_safe"],
            report["distributed_volume_storage"],
            not report["fixed_capacity_assumption_used"],
            report["candidate_is_not_current"],
            not report["inference_requested"],
            not report["production_routing_change"],
            not report["production_deploy_performed"],
            not report["volume_created"],
        )
    )
    return report


def assert_admitted(snapshot: dict[str, Any]) -> dict[str, Any]:
    report = admit(snapshot)
    if report["admitted"] is not True:
        raise RuntimeError(f"{CONTRACT}_NOT_ADMITTED:{report}")
    return report
