"""Repo Agent V13: paid-proven V11 actor/repair with compact semantic review.

V13 deliberately restores the implementation side to Repo Agent V11 exactly:
actor prompt, actor parser, repair prompt, edit recovery, path handling, public
tests and transactional edit application all come directly from V11.

Only semantic review stays compact. The compact reviewer sees the original task,
implementation criteria, changed source and public-test evidence, and returns a
strict four-field decision. A pass remains illegal when public tests fail, and a
repair still requires one concrete failing task clause plus one concrete code gap.

No hidden-test material, case-specific behavior, precomputed solution, benchmark
rewrite, extra model call, production routing change or storage change is added.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable

import repo_agent_v5 as v5
import repo_agent_v11 as v11

CONTRACT = "AVANTIQO_CODE_REPO_AGENT_V13"
MAX_CASE_MODEL_SEQUENCES = v11.MAX_CASE_MODEL_SEQUENCES
AgentContractError = v11.AgentContractError
AgentPolicy = v11.AgentPolicy
snapshot_workspace = v11.snapshot_workspace
run_public_tests = v11.run_public_tests
parse_actor_result = v11.parse_actor_result
apply_edits = v11.apply_edits
build_actor_prompt = v11.build_actor_prompt
build_repair_prompt = v11.build_repair_prompt
build_edit_recovery_prompt = v11.build_edit_recovery_prompt
needs_financial_guidance = v11.needs_financial_guidance
needs_performance_guidance = v11.needs_performance_guidance
needs_security_guidance = v11.needs_security_guidance
needs_shared_contract_guidance = v11.needs_shared_contract_guidance


def _review_contract(task: str) -> str:
    extras: list[str] = []
    if needs_financial_guidance(task):
        extras.append(v11._finance_contract())
    if needs_performance_guidance(task):
        extras.append(v11._performance_contract())
    if needs_shared_contract_guidance(task):
        extras.append(v11._shared_contract())
    extras.append(v11._review_discipline())
    return "\n\n".join(extras)


def build_review_prompt(
    *,
    root: str | Path,
    task: str,
    criteria: Iterable[str],
    changed_files: Iterable[str],
    public_tests: dict[str, Any],
) -> str:
    if not str(task or "").strip():
        raise AgentContractError("TASK_REQUIRED")
    material = [str(item).strip() for item in criteria if str(item or "").strip()]
    if not material:
        raise AgentContractError("REVIEW_CRITERIA_REQUIRED")

    parts = [
        "AVANTIQO INDEPENDENT SEMANTIC REVIEWER V13.",
        (
            "Independently judge the current patch against the ORIGINAL TASK, current changed source, "
            "implementer criteria and public-test evidence. Public tests are evidence, not the full contract."
        ),
        (
            "Check every explicit task clause and directly implied boundary semantic. Do not infer hidden tests, "
            "invent requirements, request secrets, or fail correct code for style/speculation. If public tests "
            "failed, verdict must be repair."
        ),
        (
            "Set all_material_criteria_checked=true only after checking every material task/criteria obligation. "
            "For pass, clause and gap MUST both be empty strings. For repair, return only the first material "
            "failing clause and one short concrete implementation gap."
        ),
        "ORIGINAL TASK:\n" + task.strip(),
        "IMPLEMENTER CRITERIA:\n" + v5._json(material),
        "PUBLIC TEST EVIDENCE:\n" + v5._json(public_tests),
        "CURRENT CHANGED SOURCES:\n" + v5._json(v5._changed_sources(root, changed_files)),
        _review_contract(task),
        (
            "Return exactly one compact JSON object and no prose: "
            '{"verdict":"pass|repair","all_material_criteria_checked":true,"clause":"","gap":""}. '
            "Do not enumerate criteria or explain a passing decision."
        ),
    ]
    return "\n\n".join(parts)


def parse_review(raw: str, *, public_tests_passed: bool) -> dict[str, Any]:
    value = v5._clean_json(raw)
    if not isinstance(value, dict):
        raise AgentContractError("REVIEW_OBJECT_REQUIRED")
    if set(value) != {"verdict", "all_material_criteria_checked", "clause", "gap"}:
        raise AgentContractError("REVIEW_COMPACT_SHAPE_REQUIRED")

    verdict = str(value.get("verdict") or "").strip().lower()
    if verdict not in {"pass", "repair"}:
        raise AgentContractError("REVIEW_VERDICT_INVALID")
    if value.get("all_material_criteria_checked") is not True:
        raise AgentContractError("REVIEW_ALL_MATERIAL_CRITERIA_REQUIRED")

    clause = v5._bounded(value.get("clause"), 480).strip()
    gap = v5._bounded(value.get("gap"), 720).strip()
    if verdict == "pass":
        if not public_tests_passed:
            raise AgentContractError("REVIEW_FALSE_PASS_FORBIDDEN")
        if clause or gap:
            raise AgentContractError("REVIEW_PASS_FAILURE_FIELDS_FORBIDDEN")
        findings: tuple[dict[str, str], ...] = ()
    else:
        if not clause or not gap:
            raise AgentContractError("REVIEW_REPAIR_FINDING_REQUIRED")
        findings = ({"clause": clause, "gap": gap},)

    return {
        "verdict": verdict,
        "criteria_checked": ("all_material_criteria_checked",),
        "findings": findings,
    }
