from __future__ import annotations

import json
import time

import modal

APP_NAME = "avantiqo-intelligence-fast-snapshot-canary-v1"
CLASS_NAME = "FastSnapshotCanary"
CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_GPU_SNAPSHOT_PROBE_V1"
MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507"


def payload(label: str) -> dict:
    return {
        "engine_contract": "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V2",
        "execution_lane": "fast",
        "capability": "ai.text.generate",
        "model": MODEL,
        "organization_id": "benchmark-only",
        "usage_id": f"fast-snapshot-{label}",
        "messages": [
            {"role": "system", "content": "You are Avantiqo Business Partner. Reply naturally and concisely."},
            {"role": "user", "content": "Say in one short sentence why a business should reconcile bank transactions daily."},
        ],
        "temperature": 0.1,
        "max_output_tokens": 80,
    }


def invoke(label: str) -> dict:
    cls = modal.Cls.from_name(APP_NAME, CLASS_NAME)
    worker = cls()
    started = time.perf_counter()
    result = worker.invoke.remote(payload(label))
    client_seconds = round(time.perf_counter() - started, 3)
    if not isinstance(result, dict):
        raise RuntimeError(f"{CONTRACT}_OUTPUT_OBJECT_REQUIRED")
    evidence = {
        "label": label,
        "client_seconds": client_seconds,
        "snapshot_wake_seconds": result.get("snapshot_wake_seconds"),
        "snapshot_method_seconds": result.get("snapshot_method_seconds"),
        "modal_elapsed_seconds": result.get("modal_elapsed_seconds"),
        "status": result.get("status"),
        "provider": result.get("provider"),
        "model": result.get("model"),
        "execution_lane": result.get("execution_lane"),
        "output_tokens": (result.get("usage") or {}).get("output_tokens"),
        "warm_engine_reused": result.get("warm_engine_reused"),
        "snapshot_init": result.get("snapshot_init"),
    }
    print("AVANTIQO_INTELLIGENCE_FAST_SNAPSHOT_PROBE=" + json.dumps(evidence, separators=(",", ":")), flush=True)
    if result.get("status") != "completed" or result.get("provider") != "avantiqo-intelligence":
        raise RuntimeError(f"{CONTRACT}_PROVIDER_OUTPUT_INVALID")
    if result.get("execution_lane") != "fast" or result.get("model") != MODEL:
        raise RuntimeError(f"{CONTRACT}_FAST_IDENTITY_INVALID")
    return evidence


def main() -> None:
    first = invoke("first")
    time.sleep(20)
    restored = invoke("restored")
    report = {
        "contract": CONTRACT,
        "first": first,
        "restored": restored,
        "restored_under_10s": float(restored["client_seconds"]) < 10.0,
        "restored_under_5s": float(restored["client_seconds"]) < 5.0,
        "production_routing_changed": False,
    }
    print("AVANTIQO_INTELLIGENCE_FAST_SNAPSHOT_SUMMARY=" + json.dumps(report, separators=(",", ":")), flush=True)
    if not report["restored_under_10s"]:
        raise RuntimeError(f"{CONTRACT}_RESTORE_SLA_FAILED:{restored['client_seconds']}")


if __name__ == "__main__":
    main()
