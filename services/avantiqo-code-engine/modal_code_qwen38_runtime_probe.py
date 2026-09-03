"""Explicit one-shot runner for the isolated Qwen3.8 H100 compatibility probe.

No generation is performed. The runner is locally approval-gated and then
passes a second explicit approval boolean to the remote runtime_probe function.
It cannot bootstrap/download weights or change production routing/storage.
"""

from __future__ import annotations

import json
import os

import modal

import modal_code_qwen38_canary_runtime as runtime

APPROVAL_ENV = "AVANTIQO_CODE_QWEN38_H100_PROBE_APPROVED"
CONTRACT = "AVANTIQO_CODE_QWEN38_H100_PROBE_V1"
app = runtime.app


@app.local_entrypoint()
def main() -> None:
    if os.environ.get(APPROVAL_ENV) != "YES":
        raise RuntimeError(f"{CONTRACT}_EXPLICIT_APPROVAL_REQUIRED")
    report = runtime.runtime_probe.remote(approved=True)
    if not isinstance(report, dict):
        raise RuntimeError(f"{CONTRACT}_REPORT_OBJECT_REQUIRED")
    print(
        "AVANTIQO_CODE_QWEN38_H100_PROBE_RESULT="
        + json.dumps(report, separators=(",", ":"), sort_keys=True),
        flush=True,
    )
    required_false = (
        "prefix_caching_enabled",
        "speculative_decoding_enabled",
        "production_routing_change",
        "production_deploy_performed",
        "model_download_performed",
        "volume_created",
    )
    if report.get("status") != "runtime_ready" or report.get("engine_loaded") is not True:
        raise RuntimeError(f"{CONTRACT}_ENGINE_NOT_READY:{report}")
    if report.get("language_model_only") is not True:
        raise RuntimeError(f"{CONTRACT}_LANGUAGE_MODEL_ONLY_REQUIRED")
    for field in required_false:
        if report.get(field) is not False:
            raise RuntimeError(f"{CONTRACT}_{field.upper()}_INVALID:{report.get(field)}")
    if report.get("vllm_version") != runtime.VLLM_VERSION:
        raise RuntimeError(f"{CONTRACT}_VLLM_VERSION_INVALID")
    if report.get("vllm_build_commit") != runtime.VLLM_BUILD_COMMIT:
        raise RuntimeError(f"{CONTRACT}_VLLM_BUILD_COMMIT_INVALID")
    if report.get("runtime_model") != runtime.policy.CANDIDATE_MODEL:
        raise RuntimeError(f"{CONTRACT}_MODEL_INVALID")
    if report.get("revision") != runtime.policy.CANDIDATE_REVISION:
        raise RuntimeError(f"{CONTRACT}_REVISION_INVALID")
    if report.get("model_volume_name") != runtime.policy.CODE_VOLUME:
        raise RuntimeError(f"{CONTRACT}_VOLUME_INVALID")
    print(f"{CONTRACT}=PASS", flush=True)
