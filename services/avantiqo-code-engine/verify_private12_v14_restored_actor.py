"""Zero-cost admission verifier for Private12 V14 restored actor + compact review."""

from __future__ import annotations

import inspect
import json

import modal_code_qwen38_canary_runtime_v7 as runtime_v7
import modal_code_qwen38_canary_runtime_v9 as runtime
import modal_code_qwen38_private12_v14_cert as cert
import repo_agent_v11 as agent_v11
import repo_agent_v13 as agent


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def expect_error(raw: str, *, public_tests_passed: bool) -> None:
    try:
        agent.parse_review(raw, public_tests_passed=public_tests_passed)
    except agent.AgentContractError:
        return
    raise RuntimeError("EXPECTED_REVIEW_CONTRACT_ERROR")


def main() -> None:
    require(cert.ACTOR_MAX_TOKENS == 640, "ACTOR_MAX_TOKENS_CHANGED")
    require(cert.REVIEWER_MAX_TOKENS == 256, "REVIEWER_MAX_TOKENS_CHANGED")
    require(cert.REPAIR_MAX_TOKENS == 1024, "REPAIR_MAX_TOKENS_CHANGED")
    require(cert.MAX_MODAL_QUALITY_BATCH_CALLS == 4, "QUALITY_CALL_CEILING_CHANGED")
    require(cert.MAX_MODAL_SINGLE_LATENCY_CALLS == 3, "LATENCY_CALL_CEILING_CHANGED")
    require(cert.MAX_MODAL_TOTAL_CALLS == 7, "TOTAL_CALL_CEILING_CHANGED")
    require(cert.MAX_CASE_MODEL_SEQUENCES <= 4, "CASE_SEQUENCE_CEILING_CHANGED")
    require(cert._effective_max_tokens("quality_actor", 640) == 640, "ACTOR_PHASE_BUDGET_CHANGED")
    require(cert._effective_max_tokens("quality_review", 256) == 256, "REVIEW_PHASE_BUDGET_CHANGED")
    require(cert._effective_max_tokens("quality_repair", 640) == 1024, "REPAIR_PHASE_BUDGET_WRONG")
    require(cert._effective_max_tokens("quality_final_review", 256) == 256, "FINAL_REVIEW_PHASE_BUDGET_CHANGED")

    # Actor implementation contract must be direct V11 delegation, not a rewritten V13 prompt.
    require(agent.build_actor_prompt is agent_v11.build_actor_prompt, "ACTOR_PROMPT_NOT_V11_EXACT")
    require(agent.parse_actor_result is agent_v11.parse_actor_result, "ACTOR_PARSER_NOT_V11_EXACT")
    require(agent.build_repair_prompt is agent_v11.build_repair_prompt, "REPAIR_PROMPT_NOT_V11_EXACT")
    require(agent.build_edit_recovery_prompt is agent_v11.build_edit_recovery_prompt, "RECOVERY_PROMPT_NOT_V11_EXACT")
    require(agent.apply_edits is agent_v11.apply_edits, "EDIT_APPLICATION_NOT_V11_EXACT")
    require(agent.run_public_tests is agent_v11.run_public_tests, "PUBLIC_TEST_RUNTIME_NOT_V11_EXACT")

    # Actor JSON grammar must be Runtime V7 exactly, including the original criteria capacity.
    require(runtime.ACTOR_SCHEMA is runtime_v7.ACTOR_SCHEMA, "ACTOR_SCHEMA_NOT_V7_EXACT")
    actor_criteria = runtime.ACTOR_SCHEMA["properties"]["criteria"]
    require(actor_criteria.get("minItems") == 1, "ACTOR_CRITERIA_MIN_CHANGED")
    require(actor_criteria.get("maxItems") == 16, "ACTOR_CRITERIA_MAX_CHANGED")

    compact = runtime.COMPACT_REVIEWER_SCHEMA
    require(
        compact.get("required") == ["verdict", "all_material_criteria_checked", "clause", "gap"],
        "COMPACT_REVIEW_REQUIRED_FIELDS_CHANGED",
    )
    require(compact.get("additionalProperties") is False, "COMPACT_REVIEW_EXTRA_FIELDS_ALLOWED")

    actor_request = runtime._validated_request(
        {
            "contract": runtime.CONTRACT,
            "organization_id": "benchmark-only",
            "instruction": "implement visible task",
            "role": "actor",
            "max_tokens": 640,
        }
    )
    require(actor_request["output_schema"] == "actor", "ACTOR_SCHEMA_NOT_DEFAULT")

    reviewer_request = runtime._validated_request(
        {
            "contract": runtime.CONTRACT,
            "organization_id": "benchmark-only",
            "instruction": "review visible source",
            "role": "reviewer",
            "max_tokens": 256,
        }
    )
    require(reviewer_request["output_schema"] == "reviewer_compact", "COMPACT_REVIEWER_NOT_DEFAULT")

    passed = agent.parse_review(
        json.dumps(
            {
                "verdict": "pass",
                "all_material_criteria_checked": True,
                "clause": "",
                "gap": "",
            },
            separators=(",", ":"),
        ),
        public_tests_passed=True,
    )
    require(passed["verdict"] == "pass", "COMPACT_PASS_REJECTED")
    require(not passed["findings"], "COMPACT_PASS_HAS_FINDINGS")

    repair = agent.parse_review(
        json.dumps(
            {
                "verdict": "repair",
                "all_material_criteria_checked": True,
                "clause": "visible task clause",
                "gap": "concrete current-source gap",
            },
            separators=(",", ":"),
        ),
        public_tests_passed=True,
    )
    require(repair["verdict"] == "repair", "COMPACT_REPAIR_REJECTED")
    require(len(repair["findings"]) == 1, "COMPACT_REPAIR_FINDING_COUNT")

    expect_error(
        '{"verdict":"pass","all_material_criteria_checked":true,"clause":"","gap":""}',
        public_tests_passed=False,
    )
    expect_error(
        '{"verdict":"pass","all_material_criteria_checked":false,"clause":"","gap":""}',
        public_tests_passed=True,
    )
    expect_error(
        '{"verdict":"repair","all_material_criteria_checked":true,"clause":"","gap":""}',
        public_tests_passed=True,
    )

    source = inspect.getsource(agent)
    forbidden = ("hot_path-", "api_version_skew-", "ledger_rounding-", "hidden assertion")
    for marker in forbidden:
        require(marker not in source, f"BENCHMARK_SPECIFIC_MARKER:{marker}")

    print("AVANTIQO_CODE_PRIVATE12_V14_RESTORED_ACTOR_ZERO_COST=PASS", flush=True)


if __name__ == "__main__":
    main()
