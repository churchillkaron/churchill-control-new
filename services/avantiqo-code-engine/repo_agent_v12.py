"""Repo Agent V12: compact semantic-review contract.

V12 preserves Repo Agent V11 implementation, repair, security, path and test
behavior. It changes only model-output discipline:

* actor criteria are concise acceptance labels (1-4), because the original task
  remains authoritative to the independent reviewer;
* semantic review returns a compact four-field decision instead of re-emitting
  long criteria_checked arrays and finding lists.

The compact review is not a weaker gate. The reviewer must explicitly confirm
that all material criteria were checked. A pass is legal only when public tests
pass and both failure fields are empty. A repair requires one concrete task
clause and one concrete implementation gap. The parser converts that compact
shape back into the existing review structure consumed by the repair runner.

No hidden tests, case identifiers, fixture values, expected patches, or
benchmark-specific source rewrites are encoded here.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable

import repo_agent_v5 as v5
import repo_agent_v11 as v11

CONTRACT = "AVANTIQO_CODE_REPO_AGENT_V12"
MAX_CASE_MODEL_SEQUENCES = v11.MAX_CASE_MODEL_SEQUENCES
AgentContractError = v11.AgentContractError
AgentPolicy = v11.AgentPolicy
snapshot_workspace = v11.snapshot_workspace
run_public_tests = v11.run_public_tests
parse_actor_result = v11.parse_actor_result
apply_edits = v11.apply_edits
build_repair_prompt = v11.build_repair_prompt
build_edit_recovery_prompt = v11.build_edit_recovery_prompt
needs_financial_guidance = v11.needs_financial_guidance
needs_performance_guidance = v11.needs_performance_guidance
needs_security_guidance = v11.needs_security_guidance
needs_shared_contract_guidance = v11.needs_shared_contract_guidance


def build_actor_prompt(*, root: str | Path, task: str, policy: AgentPolicy) -> str:
    return v11.build_actor_prompt(root=root, task=task, policy=policy) + (
        "\n\nOUTPUT DISCIPLINE: criteria must contain 1-4 concise acceptance labels, "
        "each a short phrase rather than a task/source restatement. The ORIGINAL TASK remains authoritative."
    )


def _review_contract(task: str) -> str:
    extras: list[str] = []
    if needs_financial_guidance(task):
        extras.append(v11._finance_contract())
    if needs_performance_guidance(task):
        extras.append(v11._performance_contract())
    if needs_shared_contract_guidance(task):
        extras.append(v11._shared_contract())
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
        "AVANTIQO INDEPENDENT SEMANTIC REVIEWER V12.",
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
            "For pass, clause and gap MUST both be empty strings. For repair, give only the first material failing "
            "clause and one short concrete implementation gap."
        ),
        "ORIGINAL TASK:\n" + task.strip(),
        "IMPLEMENTER CRITERIA:\n" + v5._json(material),
        "PUBLIC TEST EVIDENCE:\n" + v5._json(public_tests),
        "CURRENT CHANGED SOURCES:\n" + v5._json(v5._changed_sources(root, changed_files)),
    ]
    extra = _review_contract(task)
    if extra:
        parts.append(extra)
    parts.append(
        "Return exactly one compact JSON object and no prose: "
        '{"verdict":"pass|repair","all_material_criteria_checked":true,"clause":"","gap":""}. '
        "Do not enumerate criteria or explain a passing decision."
    )
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
