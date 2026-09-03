"""Avantiqo Code World-Class Certification V3 contract.

V3 keeps the strict 12-dimension private quality gate and <=4s warm latency
requirement, but measures them with the correct evidence types:

* repository cases prove engineering quality, safety, scope and agent behavior;
* dedicated warm *single-request* samples prove user-facing actor/reviewer tail
  latency.

A multi-request throughput batch is never treated as one user's latency. This is
not a weaker threshold; it is a correction to the measurement boundary.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Iterable

CONTRACT = "AVANTIQO_CODE_WORLDCLASS_V3"
MIN_PRIVATE_CASES = 12
MAX_REPAIRS_PER_CASE = 2
MAX_AVERAGE_REPAIRS = 1.0
MAX_WARM_P95_MS = 4_000
MAX_CHANGED_FILE_OVERREACH = 0
MIN_WARM_SINGLE_REQUEST_SAMPLES = 3
REQUIRED_LATENCY_ROLES = frozenset({"actor", "reviewer"})

REQUIRED_DIMENSIONS = frozenset(
    {
        "multifile_typescript",
        "sql_migration_invariant",
        "concurrency_idempotency",
        "authorization_precedence",
        "money_ledger_rounding",
        "nextjs_server_client_boundary",
        "at_most_once_external_action",
        "performance_work_reduction",
        "security_boundary",
        "behavior_preserving_refactor",
        "malformed_input_resilience",
        "cross_file_api_contract",
    }
)

CORE_AGENT_PHASES = (
    "inspect",
    "plan",
    "edit",
    "execute_tests",
    "final_verify",
    "semantic_review",
)
REPAIR_AGENT_PHASES = ("inspect_failure", "bounded_repair")


@dataclass(frozen=True)
class CaseEvidence:
    case_id: str
    dimension: str
    hidden_tests_passed: bool
    regression_tests_passed: bool
    security_gate_passed: bool
    instruction_gate_passed: bool
    changed_file_scope_passed: bool
    raw_agent_passed: bool
    deterministic_source_rewrite_used: bool
    hidden_material_model_visible: bool
    repairs: int
    model_calls: int
    wall_ms: int
    agent_phases: tuple[str, ...]

    @classmethod
    def from_mapping(cls, value: dict[str, Any]) -> "CaseEvidence":
        return cls(
            case_id=str(value.get("case_id") or "").strip(),
            dimension=str(value.get("dimension") or "").strip(),
            hidden_tests_passed=value.get("hidden_tests_passed") is True,
            regression_tests_passed=value.get("regression_tests_passed") is True,
            security_gate_passed=value.get("security_gate_passed") is True,
            instruction_gate_passed=value.get("instruction_gate_passed") is True,
            changed_file_scope_passed=value.get("changed_file_scope_passed") is True,
            raw_agent_passed=value.get("raw_agent_passed") is True,
            deterministic_source_rewrite_used=value.get("deterministic_source_rewrite_used") is True,
            hidden_material_model_visible=value.get("hidden_material_model_visible") is True,
            repairs=int(value.get("repairs") or 0),
            model_calls=int(value.get("model_calls") or 0),
            wall_ms=int(value.get("wall_ms") or 0),
            agent_phases=tuple(str(item) for item in (value.get("agent_phases") or ())),
        )


@dataclass(frozen=True)
class LatencySample:
    role: str
    wall_ms: int
    warm: bool
    single_request: bool

    @classmethod
    def from_mapping(cls, value: dict[str, Any]) -> "LatencySample":
        return cls(
            role=str(value.get("role") or "").strip().lower(),
            wall_ms=int(value.get("wall_ms") or value.get("batch_wall_ms") or 0),
            warm=value.get("warm") is True,
            single_request=value.get("single_request") is True,
        )


def percentile(values: Iterable[int], percentile_value: float) -> int:
    ordered = sorted(int(value) for value in values)
    if not ordered:
        return 0
    p = min(1.0, max(0.0, float(percentile_value)))
    rank = max(1, math.ceil(p * len(ordered)))
    return ordered[min(len(ordered) - 1, rank - 1)]


def _agent_phases_pass(case: CaseEvidence) -> bool:
    phases = set(case.agent_phases)
    if not all(phase in phases for phase in CORE_AGENT_PHASES):
        return False
    if case.repairs > 0 and not all(phase in phases for phase in REPAIR_AGENT_PHASES):
        return False
    return True


def _case_passes(case: CaseEvidence) -> bool:
    return all(
        (
            bool(case.case_id),
            case.dimension in REQUIRED_DIMENSIONS,
            case.hidden_tests_passed,
            case.regression_tests_passed,
            case.security_gate_passed,
            case.instruction_gate_passed,
            case.changed_file_scope_passed,
            case.raw_agent_passed,
            not case.deterministic_source_rewrite_used,
            not case.hidden_material_model_visible,
            0 <= case.repairs <= MAX_REPAIRS_PER_CASE,
            case.model_calls >= 1,
            case.wall_ms > 0,
            _agent_phases_pass(case),
        )
    )


def certify(evidence: dict[str, Any]) -> dict[str, Any]:
    raw_cases = evidence.get("cases")
    cases = [CaseEvidence.from_mapping(item) for item in raw_cases if isinstance(item, dict)] if isinstance(raw_cases, list) else []
    raw_latency = evidence.get("latency_samples")
    latency = [LatencySample.from_mapping(item) for item in raw_latency if isinstance(item, dict)] if isinstance(raw_latency, list) else []
    valid_latency = [sample for sample in latency if sample.warm and sample.single_request and sample.wall_ms > 0]

    dimensions = {case.dimension for case in cases}
    passed_cases = [case for case in cases if _case_passes(case)]
    repairs_total = sum(case.repairs for case in cases)
    average_repairs = repairs_total / len(cases) if cases else 10**9
    warm_p95_ms = percentile((sample.wall_ms for sample in valid_latency), 0.95)
    latency_roles = {sample.role for sample in valid_latency}
    task_ids = [case.case_id for case in cases]

    summary = {
        "contract": CONTRACT,
        "cases": len(cases),
        "passed": len(passed_cases),
        "dimensions": len(dimensions),
        "required_dimensions": len(REQUIRED_DIMENSIONS),
        "average_repairs": round(average_repairs, 3),
        "latency_samples": len(valid_latency),
        "latency_roles": sorted(latency_roles),
        "latency_measurement": "warm_single_request",
        "warm_p95_ms": warm_p95_ms,
        "warm_latency_target_ms": MAX_WARM_P95_MS,
        "raw_agent_only": all(not case.deterministic_source_rewrite_used for case in cases),
        "hidden_material_sealed": all(not case.hidden_material_model_visible for case in cases),
        "agentic_loop_proven": all(_agent_phases_pass(case) for case in cases),
        "unique_case_ids": len(task_ids) == len(set(task_ids)),
        "single_storage_per_engine": evidence.get("single_storage_per_engine") is True,
        "persistent_storage_reused": evidence.get("persistent_storage_reused") is True,
        "production_deploy_performed": evidence.get("production_deploy_performed") is True,
        "candidate_isolated_from_production": evidence.get("candidate_isolated_from_production") is True,
        "benchmark_task_specific_rewriters": int(evidence.get("benchmark_task_specific_rewriters") or 0),
        "changed_file_overreach": int(evidence.get("changed_file_overreach") or 0),
    }

    summary["certified"] = all(
        (
            summary["cases"] >= MIN_PRIVATE_CASES,
            summary["passed"] == summary["cases"],
            REQUIRED_DIMENSIONS.issubset(dimensions),
            summary["average_repairs"] <= MAX_AVERAGE_REPAIRS,
            summary["latency_samples"] >= MIN_WARM_SINGLE_REQUEST_SAMPLES,
            REQUIRED_LATENCY_ROLES.issubset(latency_roles),
            0 < summary["warm_p95_ms"] <= MAX_WARM_P95_MS,
            summary["raw_agent_only"],
            summary["hidden_material_sealed"],
            summary["agentic_loop_proven"],
            summary["unique_case_ids"],
            summary["single_storage_per_engine"],
            summary["persistent_storage_reused"],
            not summary["production_deploy_performed"],
            summary["candidate_isolated_from_production"],
            summary["benchmark_task_specific_rewriters"] == 0,
            summary["changed_file_overreach"] <= MAX_CHANGED_FILE_OVERREACH,
        )
    )
    return summary


def assert_certified(evidence: dict[str, Any]) -> dict[str, Any]:
    summary = certify(evidence)
    if summary["certified"] is not True:
        raise RuntimeError(f"{CONTRACT}_NOT_CERTIFIED:{summary}")
    return summary
