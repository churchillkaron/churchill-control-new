"""Zero-cost admission checks for Private12 V11 repair-budget isolation."""

from __future__ import annotations

import modal_code_qwen38_private12_v11_cert as cert


def main() -> None:
    assert cert.ACTOR_MAX_TOKENS == 640
    assert cert.REPAIR_MAX_TOKENS == 1024
    assert cert.REVIEWER_MAX_TOKENS == 320
    assert cert.MAX_MODAL_QUALITY_BATCH_CALLS == 4
    assert cert.MAX_MODAL_SINGLE_LATENCY_CALLS == 3
    assert cert.MAX_MODAL_TOTAL_CALLS == 7

    assert cert._effective_max_tokens("quality_actor", cert.ACTOR_MAX_TOKENS) == 640
    assert cert._effective_max_tokens("quality_review", cert.REVIEWER_MAX_TOKENS) == 320
    assert cert._effective_max_tokens("quality_repair", cert.ACTOR_MAX_TOKENS) == 1024
    assert cert._effective_max_tokens("quality_final_review", cert.REVIEWER_MAX_TOKENS) == 320
    assert cert._effective_max_tokens("latency_1_actor", cert.ACTOR_MAX_TOKENS) == 640
    assert cert._effective_max_tokens("latency_2_reviewer", cert.REVIEWER_MAX_TOKENS) == 320
    assert cert._effective_max_tokens("latency_3_actor", cert.ACTOR_MAX_TOKENS) == 640

    assert cert.runtime.MAX_MAX_TOKENS >= cert.REPAIR_MAX_TOKENS
    assert cert.RUNTIME_CONTRACT == cert.runtime.CONTRACT
    print("AVANTIQO_CODE_PRIVATE12_V11_REPAIR_BUDGET_ZERO_COST=PASS")


if __name__ == "__main__":
    main()
