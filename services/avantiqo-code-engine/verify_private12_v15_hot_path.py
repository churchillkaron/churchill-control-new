"""Zero-cost admission verifier for Private12 V15 hot-path fix."""

from __future__ import annotations

import inspect
import json

import modal_code_qwen38_canary_runtime_v7 as runtime_v7
import modal_code_qwen38_canary_runtime_v9 as runtime
import modal_code_qwen38_private12_v15_cert as cert
import repo_agent_v13 as agent_v13
import repo_agent_v14 as agent


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def main() -> None:
    require(cert.ACTOR_MAX_TOKENS == 640, "LATENCY_ACTOR_BUDGET_CHANGED")
    require(cert.QUALITY_ACTOR_MAX_TOKENS == 768, "QUALITY_ACTOR_HEADROOM_WRONG")
    require(cert.REVIEWER_MAX_TOKENS == 256, "REVIEWER_BUDGET_CHANGED")
    require(cert.REPAIR_MAX_TOKENS == 1024, "REPAIR_BUDGET_CHANGED")
    require(cert.MAX_MODAL_QUALITY_BATCH_CALLS == 4, "QUALITY_CALL_CEILING_CHANGED")
    require(cert.MAX_MODAL_SINGLE_LATENCY_CALLS == 3, "LATENCY_CALL_CEILING_CHANGED")
    require(cert.MAX_MODAL_TOTAL_CALLS == 7, "TOTAL_CALL_CEILING_CHANGED")
    require(cert.MAX_CASE_MODEL_SEQUENCES <= 4, "CASE_SEQUENCE_CEILING_CHANGED")

    require(cert._effective_max_tokens("quality_actor", 640) == 768, "QUALITY_ACTOR_HEADROOM_NOT_PHASE_LOCAL")
    require(cert._effective_max_tokens("quality_review", 256) == 256, "REVIEW_BUDGET_CHANGED")
    require(cert._effective_max_tokens("quality_repair", 640) == 1024, "REPAIR_HEADROOM_WRONG")
    require(cert._effective_max_tokens("quality_final_review", 256) == 256, "FINAL_REVIEW_BUDGET_CHANGED")
    require(cert._effective_max_tokens("latency_1_actor", 640) == 640, "LATENCY_ACTOR_HEADROOM_CHANGED")
    require(cert._effective_max_tokens("latency_3_actor", 640) == 640, "SECOND_LATENCY_ACTOR_HEADROOM_CHANGED")

    require(runtime.ACTOR_SCHEMA is runtime_v7.ACTOR_SCHEMA, "ACTOR_SCHEMA_NOT_V7_EXACT")
    require(runtime.ACTOR_SCHEMA["properties"]["criteria"].get("maxItems") == 16, "ACTOR_CRITERIA_CAP_CHANGED")

    # Non-performance implementation behavior must remain V13/V11-derived.
    require(agent.parse_actor_result is agent_v13.parse_actor_result, "ACTOR_PARSER_CHANGED")
    require(agent.apply_edits is agent_v13.apply_edits, "EDIT_APPLICATION_CHANGED")
    require(agent.run_public_tests is agent_v13.run_public_tests, "PUBLIC_TEST_RUNTIME_CHANGED")
    require(agent.build_review_prompt is agent_v13.build_review_prompt, "COMPACT_REVIEW_PROMPT_CHANGED")
    require(agent.parse_review is agent_v13.parse_review, "COMPACT_REVIEW_PARSER_CHANGED")
    require(agent.build_edit_recovery_prompt is agent_v13.build_edit_recovery_prompt, "EDIT_RECOVERY_CHANGED")

    contract = agent._performance_contract().lower()
    for phrase in (
        "materialize the right side once",
        "hash(value) -> original indices",
        "same-hash candidate indices first",
        "remaining right indices in original order",
        "unhashable",
        "confirm every match with the supplied comparator",
        "preserve left output order and duplicates",
    ):
        require(phrase in contract, f"PERFORMANCE_CONTRACT_MISSING:{phrase}")

    # The compact reviewer schema remains strict.
    require(
        runtime.COMPACT_REVIEWER_SCHEMA.get("required")
        == ["verdict", "all_material_criteria_checked", "clause", "gap"],
        "COMPACT_REVIEW_SCHEMA_CHANGED",
    )
    request = runtime._validated_request(
        {
            "contract": runtime.CONTRACT,
            "organization_id": "benchmark-only",
            "instruction": "review visible source",
            "role": "reviewer",
            "max_tokens": 256,
        }
    )
    require(request["output_schema"] == "reviewer_compact", "COMPACT_REVIEWER_NOT_DEFAULT")

    passed = agent.parse_review(
        json.dumps({"verdict":"pass","all_material_criteria_checked":True,"clause":"","gap":""}),
        public_tests_passed=True,
    )
    require(passed["verdict"] == "pass", "COMPACT_PASS_REJECTED")

    source = inspect.getsource(agent)
    for marker in ("hot_path-", "api_version_skew-", "ledger_rounding-", "hidden assertion"):
        require(marker not in source, f"BENCHMARK_SPECIFIC_MARKER:{marker}")

    print("AVANTIQO_CODE_PRIVATE12_V15_HOT_PATH_ZERO_COST=PASS", flush=True)


if __name__ == "__main__":
    main()
