"""Zero-cost verifier for Avantiqo Code World-Class V3 scoring."""

from __future__ import annotations

import worldclass_cert_v3_contract as cert


def _cases() -> list[dict[str, object]]:
    items = []
    for index, dimension in enumerate(sorted(cert.REQUIRED_DIMENSIONS), start=1):
        items.append(
            {
                "case_id": f"case-{index}",
                "dimension": dimension,
                "hidden_tests_passed": True,
                "regression_tests_passed": True,
                "security_gate_passed": True,
                "instruction_gate_passed": True,
                "changed_file_scope_passed": True,
                "raw_agent_passed": True,
                "deterministic_source_rewrite_used": False,
                "hidden_material_model_visible": False,
                "repairs": 0,
                "model_calls": 2,
                # Deliberately large throughput wall time. V3 must not mistake
                # this multi-task batch duration for one user's latency.
                "wall_ms": 32000,
                "agent_phases": ["inspect", "plan", "edit", "execute_tests", "final_verify", "semantic_review"],
            }
        )
    return items


def _evidence(latency: list[dict[str, object]]) -> dict[str, object]:
    return {
        "cases": _cases(),
        "latency_samples": latency,
        "single_storage_per_engine": True,
        "persistent_storage_reused": True,
        "production_deploy_performed": False,
        "candidate_isolated_from_production": True,
        "benchmark_task_specific_rewriters": 0,
        "changed_file_overreach": 0,
    }


def main() -> None:
    green = cert.certify(
        _evidence(
            [
                {"role": "actor", "wall_ms": 2400, "warm": True, "single_request": True},
                {"role": "reviewer", "wall_ms": 1700, "warm": True, "single_request": True},
                {"role": "actor", "wall_ms": 2500, "warm": True, "single_request": True},
            ]
        )
    )
    assert green["certified"] is True
    assert green["warm_p95_ms"] == 2500
    assert green["latency_measurement"] == "warm_single_request"

    slow = cert.certify(
        _evidence(
            [
                {"role": "actor", "wall_ms": 2400, "warm": True, "single_request": True},
                {"role": "reviewer", "wall_ms": 1700, "warm": True, "single_request": True},
                {"role": "actor", "wall_ms": 4100, "warm": True, "single_request": True},
            ]
        )
    )
    assert slow["certified"] is False
    assert slow["warm_p95_ms"] == 4100

    batched_only = cert.certify(
        _evidence(
            [
                {"role": "actor", "wall_ms": 2000, "warm": True, "single_request": False},
                {"role": "reviewer", "wall_ms": 1800, "warm": True, "single_request": False},
                {"role": "actor", "wall_ms": 1900, "warm": True, "single_request": False},
            ]
        )
    )
    assert batched_only["certified"] is False
    assert batched_only["latency_samples"] == 0

    missing_role = cert.certify(
        _evidence(
            [
                {"role": "actor", "wall_ms": 2000, "warm": True, "single_request": True},
                {"role": "actor", "wall_ms": 2100, "warm": True, "single_request": True},
                {"role": "actor", "wall_ms": 2200, "warm": True, "single_request": True},
            ]
        )
    )
    assert missing_role["certified"] is False

    print("AVANTIQO_CODE_WORLDCLASS_V3_ZERO_COST=PASS")


if __name__ == "__main__":
    main()
