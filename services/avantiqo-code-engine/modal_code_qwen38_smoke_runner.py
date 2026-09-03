"""Explicit evidence transport for the isolated Qwen3.8 warm smoke.

The remote GPU implementation remains in modal_code_qwen38_canary_runtime.py.
This local entrypoint exists only because `modal run app.function` does not emit
the function return value to stdout. It invokes exactly one approved remote
smoke and prints one stable machine-readable result line for CI.
"""

from __future__ import annotations

import json

from modal_code_qwen38_canary_runtime import app, generation_smoke

RUNNER_CONTRACT = "AVANTIQO_CODE_QWEN38_SMOKE_RUNNER_V1"
RESULT_PREFIX = "AVANTIQO_CODE_QWEN38_SMOKE_RESULT="


@app.local_entrypoint()
def main(approved: bool = False) -> None:
    if approved is not True:
        raise RuntimeError(f"{RUNNER_CONTRACT}_EXPLICIT_APPROVAL_REQUIRED")

    result = generation_smoke.remote(approved=True)
    if not isinstance(result, dict):
        raise RuntimeError(f"{RUNNER_CONTRACT}_RESULT_OBJECT_REQUIRED")

    print(
        RESULT_PREFIX + json.dumps(result, sort_keys=True, separators=(",", ":")),
        flush=True,
    )
