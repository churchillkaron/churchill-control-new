"""Zero-cost executable proof for adaptive Avantiqo Code reasoning policy."""

from __future__ import annotations

import code_reasoning_policy_v2 as policy


def main() -> None:
    fast = policy.choose(
        {
            "capability": "ai.code.review",
            "instruction": "Review this small pure helper for an off-by-one bug.",
            "structured_specification": {"file_count": 1},
        }
    )
    assert fast == policy.FAST, fast

    standard = policy.choose(
        {
            "capability": "ai.code.debug",
            "instruction": "Fix the failing TypeScript API contract and execute tests.",
            "structured_specification": {"repository_task": True, "file_count": 2, "execute_tests": True},
        }
    )
    assert standard == policy.STANDARD, standard

    deep = policy.choose(
        {
            "capability": "ai.code.edit",
            "instruction": "Repair cross-file idempotency and at-most-once external action semantics.",
            "structured_specification": {"repository_task": True, "file_count": 4, "execute_tests": True},
        }
    )
    assert deep == policy.DEEP, deep

    explicit = policy.choose(
        {
            "capability": "ai.code.generate",
            "instruction": "Generate a tiny helper.",
            "structured_specification": {"reasoning_effort": "medium"},
        }
    )
    assert explicit == policy.STANDARD, explicit

    for plan in (fast, standard, deep, explicit):
        ev = policy.evidence(plan)
        assert ev["raw_reasoning_persisted"] is False
        assert ev["chain_of_thought_returned"] is False
        assert plan.max_repairs <= 2
        assert plan.max_model_calls <= 12

    print("AVANTIQO_CODE_REASONING_FAST_ROUTE=PASS")
    print("AVANTIQO_CODE_REASONING_STANDARD_ROUTE=PASS")
    print("AVANTIQO_CODE_REASONING_DEEP_ROUTE=PASS")
    print("AVANTIQO_CODE_REASONING_PRIVACY=PASS")
    print("AVANTIQO_CODE_REASONING_POLICY_V2=PASS")


if __name__ == "__main__":
    main()
