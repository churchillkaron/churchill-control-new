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


def _sample(role: str, wall_ms: int, *, single: bool = True, representative: bool = True) -> dict[str, object]:
    return {
        "role": role,
        "wall_ms": wall_ms,
        "warm": True,
        "single_request": single,
        "representative": representative,
    }


def main() -> None:
    green = cert.certify(
        _evidence(
            [
                _sample("actor", 2400),
                _sample("reviewer", 1700),
                _sample("actor", 2500),
            ]
        )
    )
    assert green["certified"] is True
    assert green["warm_p95_ms"] == 2500
    assert green["latency_measurement"] == "warm_single_request_representative"

    slow = cert.certify(
        _evidence(
            [
                _sample("actor", 2400),
                _sample("reviewer", 1700),
                _sample("actor", 4100),
            ]
        )
    )
    assert slow["certified"] is False
    assert slow["warm_p95_ms"] == 4100

    batched_only = cert.certify(
        _evidence(
            [
                _sample("actor", 2000, single=False),
                _sample("reviewer", 1800, single=False),
                _sample("actor", 1900, single=False),
            ]
        )
    )
    assert batched_only["certified"] is False
    assert batched_only["latency_samples"] == 0

    synthetic_only = cert.certify(
        _evidence(
            [
                _sample("actor", 900, representative=False),
                _sample("reviewer", 800, representative=False),
                _sample("actor", 850, representative=False),
            ]
        )
    )
    assert synthetic_only["certified"] is False
    assert synthetic_only["latency_samples"] == 0

    missing_role = cert.certify(
        _evidence(
            [
                _sample("actor", 2000),
                _sample("actor", 2100),
                _sample("actor", 2200),
            ]
        )
    )
    assert missing_role["certified"] is False

    print("AVANTIQO_CODE_WORLDCLASS_V3_ZERO_COST=PASS")


if __name__ == "__main__":
    main()
