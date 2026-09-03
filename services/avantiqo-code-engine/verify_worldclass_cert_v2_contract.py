"""Zero-cost executable proof for the Avantiqo Code World-Class V2 contract."""

from __future__ import annotations

import copy

import worldclass_cert_v2_contract as v2


def _case(index: int, dimension: str) -> dict:
    return {
        "case_id": f"private-{index:02d}",
        "dimension": dimension,
        "hidden_tests_passed": True,
        "regression_tests_passed": True,
        "security_gate_passed": True,
        "instruction_gate_passed": True,
        "changed_file_scope_passed": True,
        "raw_agent_passed": True,
        "deterministic_source_rewrite_used": False,
        "hidden_material_model_visible": False,
        "repairs": 1 if index % 3 == 0 else 0,
        "model_calls": 2 if index % 3 == 0 else 1,
        "wall_ms": 3100 + index,
        "warm_ms": 2200 + index * 10,
        "agent_phases": list(v2.REQUIRED_AGENT_PHASES),
    }


def _good() -> dict:
    dimensions = sorted(v2.REQUIRED_DIMENSIONS)
    return {
        "cases": [_case(index, dimension) for index, dimension in enumerate(dimensions)],
        "single_storage_per_engine": True,
        "persistent_storage_reused": True,
        "production_deploy_performed": False,
        "candidate_isolated_from_production": True,
        "benchmark_task_specific_rewriters": 0,
        "changed_file_overreach": 0,
    }


def _must_fail(field: str, mutate) -> None:
    evidence = copy.deepcopy(_good())
    mutate(evidence)
    summary = v2.certify(evidence)
    assert summary["certified"] is False, (field, summary)


def main() -> None:
    good = _good()
    summary = v2.assert_certified(good)
    assert summary["cases"] == 12
    assert summary["passed"] == 12
    assert summary["dimensions"] == 12
    assert summary["raw_agent_only"] is True
    assert summary["hidden_material_sealed"] is True
    assert summary["agentic_loop_proven"] is True
    assert summary["production_deploy_performed"] is False

    _must_fail(
        "deterministic_source_rewrite",
        lambda e: e["cases"][0].__setitem__("deterministic_source_rewrite_used", True),
    )
    _must_fail(
        "hidden_test_leak",
        lambda e: e["cases"][0].__setitem__("hidden_material_model_visible", True),
    )
    _must_fail(
        "raw_failure",
        lambda e: e["cases"][0].__setitem__("raw_agent_passed", False),
    )
    _must_fail(
        "missing_agent_phase",
        lambda e: e["cases"][0].__setitem__("agent_phases", ["inspect", "edit", "final_verify"]),
    )
    _must_fail(
        "scope_overreach",
        lambda e: e.__setitem__("changed_file_overreach", 1),
    )
    _must_fail(
        "duplicate_case_identity",
        lambda e: e["cases"][1].__setitem__("case_id", e["cases"][0]["case_id"]),
    )
    _must_fail(
        "production_deploy",
        lambda e: e.__setitem__("production_deploy_performed", True),
    )
    _must_fail(
        "duplicate_storage_architecture",
        lambda e: e.__setitem__("single_storage_per_engine", False),
    )
    _must_fail(
        "task_specific_rewriter",
        lambda e: e.__setitem__("benchmark_task_specific_rewriters", 1),
    )
    _must_fail(
        "latency",
        lambda e: e["cases"][6].__setitem__("warm_ms", 9000),
    )
    _must_fail(
        "too_many_repairs",
        lambda e: e["cases"][2].__setitem__("repairs", 3),
    )

    print("AVANTIQO_CODE_WORLDCLASS_V2_GOOD_EVIDENCE=PASS")
    print("AVANTIQO_CODE_WORLDCLASS_V2_RAW_ONLY_GATE=PASS")
    print("AVANTIQO_CODE_WORLDCLASS_V2_HIDDEN_SEAL_GATE=PASS")
    print("AVANTIQO_CODE_WORLDCLASS_V2_AGENT_LOOP_GATE=PASS")
    print("AVANTIQO_CODE_WORLDCLASS_V2_SCOPE_GATE=PASS")
    print("AVANTIQO_CODE_WORLDCLASS_V2_STORAGE_GATE=PASS")
    print("AVANTIQO_CODE_WORLDCLASS_V2_NO_PRODUCTION_GATE=PASS")
    print("AVANTIQO_CODE_WORLDCLASS_V2_ZERO_COST_CONTRACT=PASS")


if __name__ == "__main__":
    main()
