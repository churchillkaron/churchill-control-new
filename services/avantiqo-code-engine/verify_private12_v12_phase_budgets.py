"""Zero-cost verifier for Private12 V12 phase-local token budgets."""

from __future__ import annotations

import importlib


def main() -> None:
    cert = importlib.import_module("modal_code_qwen38_private12_v12_cert")

    assert cert.ACTOR_MAX_TOKENS == 640
    assert cert.REVIEWER_MAX_TOKENS == 320
    assert cert.REPAIR_MAX_TOKENS == 1024
    assert cert.FINAL_REVIEW_MAX_TOKENS == 448

    assert cert._effective_max_tokens("quality_actor", 640) == 640
    assert cert._effective_max_tokens("quality_review", 320) == 320
    assert cert._effective_max_tokens("quality_repair", 640) == 1024
    assert cert._effective_max_tokens("quality_final_review", 320) == 448
    assert cert._effective_max_tokens("latency_1_actor", 640) == 640
    assert cert._effective_max_tokens("latency_2_reviewer", 320) == 320
    assert cert._effective_max_tokens("latency_3_actor", 640) == 640

    assert cert.MAX_MODAL_QUALITY_BATCH_CALLS == 4
    assert cert.MAX_MODAL_SINGLE_LATENCY_CALLS == 3
    assert cert.MAX_MODAL_TOTAL_CALLS == 7
    assert cert.WARM_TARGET_MS == 4_000
    assert cert.MAX_CASE_MODEL_SEQUENCES == 4

    print("AVANTIQO_CODE_PRIVATE12_V12_PHASE_BUDGET_ZERO_COST=PASS")


if __name__ == "__main__":
    main()
