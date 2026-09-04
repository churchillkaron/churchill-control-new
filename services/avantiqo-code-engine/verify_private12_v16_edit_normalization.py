"""Zero-cost admission verifier for Private12 V16."""

from __future__ import annotations

import inspect
import json

import modal_code_qwen38_canary_runtime_v7 as runtime_v7
import modal_code_qwen38_canary_runtime_v9 as runtime
import modal_code_qwen38_private12_v16_cert as cert
import repo_agent_v13 as agent_v13
import repo_agent_v15 as agent


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def main() -> None:
    require(cert.ACTOR_MAX_TOKENS == 640, "LATENCY_ACTOR_BUDGET_CHANGED")
    require(cert.QUALITY_ACTOR_MAX_TOKENS == 768, "QUALITY_ACTOR_HEADROOM_CHANGED")
    require(cert.REVIEWER_MAX_TOKENS == 256, "REVIEWER_BUDGET_CHANGED")
    require(cert.REPAIR_MAX_TOKENS == 1024, "REPAIR_BUDGET_CHANGED")
    require(cert.MAX_MODAL_QUALITY_BATCH_CALLS == 4, "QUALITY_CALL_CEILING_CHANGED")
    require(cert.MAX_MODAL_SINGLE_LATENCY_CALLS == 3, "LATENCY_CALL_CEILING_CHANGED")
    require(cert.MAX_MODAL_TOTAL_CALLS == 7, "TOTAL_CALL_CEILING_CHANGED")
    require(cert.MAX_CASE_MODEL_SEQUENCES <= 4, "CASE_SEQUENCE_CEILING_CHANGED")
    require(cert._effective_max_tokens("quality_actor", 640) == 768, "QUALITY_ACTOR_BUDGET_WRONG")
    require(cert._effective_max_tokens("quality_repair", 640) == 1024, "REPAIR_BUDGET_WRONG")
    require(cert._effective_max_tokens("latency_1_actor", 640) == 640, "LATENCY_ACTOR_BUDGET_CHANGED")
    require(cert._effective_max_tokens("latency_3_actor", 640) == 640, "LATENCY_ACTOR_2_BUDGET_CHANGED")

    require(runtime.ACTOR_SCHEMA is runtime_v7.ACTOR_SCHEMA, "ACTOR_SCHEMA_CHANGED")
    require(agent.apply_edits is agent_v13.apply_edits, "TRANSACTIONAL_EDIT_APPLICATION_CHANGED")
    require(agent.run_public_tests is agent_v13.run_public_tests, "PUBLIC_TEST_RUNTIME_CHANGED")
    require(agent.build_review_prompt is agent_v13.build_review_prompt, "COMPACT_REVIEW_PROMPT_CHANGED")
    require(agent.parse_review is agent_v13.parse_review, "COMPACT_REVIEW_PARSER_CHANGED")

    # Grammar-valid optional placeholders must no longer kill a usable multi-edit repair.
    parsed = agent.parse_actor_result(
        json.dumps(
            {
                "criteria": ["use shared field authority"],
                "edits": [
                    {"path": "src/producer/order.py", "old": "x", "new": "y", "content": ""},
                    {"path": "src/consumer/order.py", "old": "", "new": "", "content": "updated"},
                    {"path": "src/consumer/order.py"},
                ],
            },
            separators=(",", ":"),
        )
    )
    require(len(parsed["edits"]) == 2, "USABLE_EDITS_NOT_PRESERVED")
    require(parsed["edits"][0] == {"path": "src/producer/order.py", "old": "x", "new": "y"}, "PATCH_NORMALIZATION_WRONG")
    require(parsed["edits"][1] == {"path": "src/consumer/order.py", "content": "updated"}, "CONTENT_NORMALIZATION_WRONG")

    try:
        agent.parse_actor_result('{"criteria":["x"],"edits":[{"path":"a.py"}]}')
    except agent.AgentContractError as exc:
        require(str(exc) == "ACTOR_NO_EFFECTIVE_EDITS", "PATH_ONLY_ERROR_CHANGED")
    else:
        raise RuntimeError("PATH_ONLY_EDIT_ACCEPTED")

    performance = agent._performance_contract().lower()
    for phrase in (
        "materialize the right side once",
        "same-hash candidates",
        "supplied comparator",
        "fall back",
        "unhashable",
        "preserve left output order and duplicates",
        "one compact function-body edit",
    ):
        require(phrase in performance, f"PERFORMANCE_CONTRACT_MISSING:{phrase}")

    require(
        runtime.COMPACT_REVIEWER_SCHEMA.get("required")
        == ["verdict", "all_material_criteria_checked", "clause", "gap"],
        "COMPACT_REVIEW_SCHEMA_CHANGED",
    )

    source = inspect.getsource(agent)
    for marker in ("hot_path-", "api_version_skew-", "ledger_rounding-", "hidden assertion"):
        require(marker not in source, f"BENCHMARK_SPECIFIC_MARKER:{marker}")

    print("AVANTIQO_CODE_PRIVATE12_V16_EDIT_NORMALIZATION_ZERO_COST=PASS", flush=True)


if __name__ == "__main__":
    main()
