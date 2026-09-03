"""One-shot paid latency smoke for the isolated Qwen3.8 V5 Code runtime."""

from __future__ import annotations

import json

from modal_code_qwen38_canary_runtime_v5 import CONTRACT as RUNTIME_CONTRACT
from modal_code_qwen38_canary_runtime_v5 import app, generate_v5

CONTRACT = "AVANTIQO_CODE_QWEN38_V5_SMOKE"
TARGET_MS = 4_000

PREFIX = (
    "You are Avantiqo Repo Agent V4. Inspect the repository contract carefully. "
    "Public tests are necessary but incomplete evidence. Preserve every stated "
    "behavioral qualifier and return only a compact JSON action.\n\n"
)


def _request(role: str, suffix: str, max_tokens: int) -> dict[str, object]:
    return {
        "contract": RUNTIME_CONTRACT,
        "organization_id": "benchmark-only",
        "instruction": PREFIX + suffix,
        "role": role,
        "max_tokens": max_tokens,
    }


@app.local_entrypoint(name="qwen38_v5_paid_smoke")
def qwen38_v5_paid_smoke(approved: bool = False) -> None:
    if approved is not True:
        raise RuntimeError(f"{CONTRACT}_EXPLICIT_APPROVAL_REQUIRED")

    samples: list[dict[str, object]] = []
    plan = [
        ("actor", "Task: identify the smallest safe edit for a ledger helper and respond with a plan action.", 256),
        ("actor", "Task: identify the smallest safe edit for a ledger helper and respond with a plan action.", 256),
        ("reviewer", "Review: verify the proposed ledger helper edit satisfies every stated contract clause.", 256),
        ("reviewer", "Review: verify the proposed ledger helper edit satisfies every stated contract clause.", 256),
    ]

    for index, (role, suffix, max_tokens) in enumerate(plan, start=1):
        response = generate_v5.remote([_request(role, suffix, max_tokens)], approved=True)
        if not isinstance(response, dict) or response.get("status") != "completed":
            raise RuntimeError(f"{CONTRACT}_RESPONSE_INVALID:{index}")
        samples.append(
            {
                "index": index,
                "role": role,
                "batch_wall_ms": int(response.get("batch_wall_ms") or 0),
                "prompt_tokens": int((response.get("prompt_token_counts") or [0])[0]),
                "output_tokens": int((response.get("output_token_counts") or [0])[0]),
                "prefix_caching_enabled": response.get("prefix_caching_enabled") is True,
                "fast_boot_enforce_eager": response.get("fast_boot_enforce_eager") is True,
            }
        )

    warm = [int(item["batch_wall_ms"]) for item in samples[1:]]
    warm_max = max(warm) if warm else 0
    result = {
        "contract": CONTRACT,
        "runtime_contract": RUNTIME_CONTRACT,
        "samples": samples,
        "warm_max_ms": warm_max,
        "target_ms": TARGET_MS,
        "target_met": warm_max <= TARGET_MS,
        "prefix_caching_enabled": all(bool(item["prefix_caching_enabled"]) for item in samples),
        "production_routing_change": False,
        "production_deploy_performed": False,
        "model_download_performed": False,
        "volume_created": False,
    }
    print(
        "AVANTIQO_CODE_QWEN38_V5_SMOKE_RESULT="
        + json.dumps(result, sort_keys=True, separators=(",", ":")),
        flush=True,
    )
    if not result["prefix_caching_enabled"]:
        raise RuntimeError(f"{CONTRACT}_PREFIX_CACHE_NOT_ENABLED")
    print(f"{CONTRACT}=PASS", flush=True)
