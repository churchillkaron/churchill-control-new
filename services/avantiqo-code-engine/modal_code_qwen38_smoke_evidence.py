"""Machine-readable evidence entrypoint for the isolated Qwen3.8 smoke."""

from __future__ import annotations

import json

from modal_code_qwen38_canary_runtime import app, generation_smoke

RUNNER_CONTRACT = "AVANTIQO_CODE_QWEN38_SMOKE_EVIDENCE_V1"
RESULT_PREFIX = "AVANTIQO_CODE_QWEN38_SMOKE_RESULT="


@app.local_entrypoint()
def smoke_evidence(approved: bool = False) -> None:
    if not approved:
        raise RuntimeError(f"{RUNNER_CONTRACT}_EXPLICIT_APPROVAL_REQUIRED")

    result = generation_smoke.remote(approved=approved)
    if not isinstance(result, dict):
        raise RuntimeError(f"{RUNNER_CONTRACT}_RESULT_OBJECT_REQUIRED")

    print(
        RESULT_PREFIX + json.dumps(result, sort_keys=True, separators=(",", ":")),
        flush=True,
    )
