from __future__ import annotations

import json
import time

import modal

APP_NAME = "avantiqo-code-snapshot-canary-v1"
CLS_NAME = "CodeSnapshotCanary"
CONTRACT = "AVANTIQO_CODE_MODAL_SNAPSHOT_LATENCY_PROBE_V1"
ENGINE_CONTRACT = "AVANTIQO_CODE_ENGINE_V1"
PRODUCT_MODEL = "avantiqo-code-v1"


def request() -> dict:
    return {
        "contract": ENGINE_CONTRACT,
        "capability": "ai.code.debug",
        "model": PRODUCT_MODEL,
        "organization_id": "benchmark-only",
        "usage_id": "snapshot-latency-probe",
        "instruction": (
            'Return ONLY strict JSON with exactly this shape: '
            '{"path":"probe.mjs","content":"<complete UTF-8 source file>"}. '
            'Fix this module: export function add(a,b){ return a-b; } '
            'so add(2,3) returns 5. No markdown or commentary.'
        ),
        "structured_specification": {
            "benchmark_contract": CONTRACT,
            "output_contract": {
                "format": "strict-json",
                "path": "probe.mjs",
                "complete_file_content_required": True,
            },
            "raw_reasoning_must_not_persist": True,
        },
    }


def invoke(label: str) -> dict:
    Model = modal.Cls.from_name(APP_NAME, CLS_NAME)
    obj = Model()
    started = time.perf_counter()
    result = obj.invoke.remote(request())
    client_seconds = round(time.perf_counter() - started, 3)
    if not isinstance(result, dict):
        raise RuntimeError(f"{CONTRACT}_OBJECT_REQUIRED:{label}")
    evidence = {
        "label": label,
        "client_seconds": client_seconds,
        "snapshot_wake_seconds": result.get("snapshot_wake_seconds"),
        "method_elapsed_seconds": result.get("method_elapsed_seconds"),
        "status": result.get("status"),
        "provider": result.get("provider"),
        "model": result.get("model"),
        "runtime_model": result.get("runtime_model"),
        "generation_seconds": result.get("generation_seconds"),
        "output_tokens": (result.get("usage") or {}).get("output_tokens"),
        "snapshot_init": result.get("snapshot_init"),
    }
    print(
        "AVANTIQO_CODE_MODAL_SNAPSHOT_PROBE="
        + json.dumps(evidence, separators=(",", ":")),
        flush=True,
    )
    if result.get("status") != "completed":
        raise RuntimeError(f"{CONTRACT}_INFERENCE_FAILED:{label}:{result.get('error_message')}")
    return evidence


def main() -> None:
    first = invoke("first-deployed-invocation")
    # Autoscaler is configured to zero and 10-second scaledown. Give Modal enough
    # time to terminate this container so the next request must restore a snapshot.
    time.sleep(20)
    restored = invoke("restored-cold-invocation")
    report = {
        "contract": CONTRACT,
        "first": first,
        "restored": restored,
        "restored_under_30s": float(restored["client_seconds"]) < 30.0,
        "restored_under_15s": float(restored["client_seconds"]) < 15.0,
    }
    print(
        "AVANTIQO_CODE_MODAL_SNAPSHOT_SUMMARY="
        + json.dumps(report, separators=(",", ":")),
        flush=True,
    )
    if not report["restored_under_30s"]:
        raise RuntimeError(
            f"{CONTRACT}_RESTORED_LATENCY_SLA_FAILED:{restored['client_seconds']}s"
        )


if __name__ == "__main__":
    main()
