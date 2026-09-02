from __future__ import annotations

import json
import time

import modal

APP_NAME = "avantiqo-code-inprocess-snapshot-canary-v1"
CLS_NAME = "CodeInprocessSnapshotCanary"
CONTRACT = "AVANTIQO_CODE_INPROCESS_SNAPSHOT_LATENCY_V1"


def request() -> dict:
    return {
        "contract": "AVANTIQO_CODE_ENGINE_V1",
        "capability": "ai.code.debug",
        "model": "avantiqo-code-v1",
        "organization_id": "benchmark-only",
        "usage_id": "inprocess-snapshot-latency",
        "instruction": (
            'Return ONLY strict JSON: {"path":"probe.mjs","content":"<source>"}. '
            'Fix: export function add(a,b){ return a-b; } so add(2,3) is 5.'
        ),
        "structured_specification": {
            "benchmark_contract": CONTRACT,
            "raw_reasoning_must_not_persist": True,
        },
    }


def invoke(label: str) -> dict:
    cls = modal.Cls.from_name(APP_NAME, CLS_NAME)
    obj = cls()
    started = time.perf_counter()
    result = obj.invoke.remote(request())
    client = round(time.perf_counter() - started, 3)
    if not isinstance(result, dict) or result.get("status") != "completed":
        raise RuntimeError(f"{CONTRACT}_{label}_FAILED:{result}")
    evidence = {
        "label": label,
        "client_seconds": client,
        "wake_seconds": result.get("snapshot_wake_seconds"),
        "method_seconds": result.get("method_elapsed_seconds"),
        "generation_seconds": result.get("generation_seconds"),
        "snapshot_init": result.get("snapshot_init"),
        "output_tokens": (result.get("usage") or {}).get("output_tokens"),
    }
    print(
        "AVANTIQO_CODE_INPROCESS_SNAPSHOT_PROBE="
        + json.dumps(evidence, separators=(",", ":")),
        flush=True,
    )
    return evidence


def main() -> None:
    first = invoke("first")
    time.sleep(20)
    restored = invoke("restored")
    summary = {
        "contract": CONTRACT,
        "first": first,
        "restored": restored,
        "restored_under_30s": restored["client_seconds"] < 30.0,
        "restored_under_15s": restored["client_seconds"] < 15.0,
    }
    print(
        "AVANTIQO_CODE_INPROCESS_SNAPSHOT_SUMMARY="
        + json.dumps(summary, separators=(",", ":")),
        flush=True,
    )
    if not summary["restored_under_30s"]:
        raise RuntimeError(
            f"{CONTRACT}_SLA_FAILED:{restored['client_seconds']}s"
        )


if __name__ == "__main__":
    main()
