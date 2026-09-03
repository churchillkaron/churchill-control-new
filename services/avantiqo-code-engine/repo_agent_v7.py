"""Repo Agent V7: stronger general semantic boundaries and recoverable edit failures.

V7 extends V6 without benchmark-specific answers. It adds explicit financial
reduction invariants (decimal exactness, empty identity, and rounding stage) and
a bounded recovery prompt for cases where a model response parses but produces
no effective edit or another local edit-application failure.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable

import repo_agent_v6 as v6

CONTRACT = "AVANTIQO_CODE_REPO_AGENT_V7"
MAX_CASE_MODEL_SEQUENCES = v6.MAX_CASE_MODEL_SEQUENCES
AgentContractError = v6.AgentContractError
AgentPolicy = v6.AgentPolicy
snapshot_workspace = v6.snapshot_workspace
parse_actor_result = v6.parse_actor_result
apply_edits = v6.apply_edits
run_public_tests = v6.run_public_tests
parse_review = v6.parse_review


def _financial_boundary_guidance() -> str:
    return (
        "When visible code/task performs monetary arithmetic, preserve exact decimal semantics: "
        "do not introduce binary-float drift; use a correctly typed zero/identity for empty reductions; "
        "preserve required scale/currency representation; and distinguish per-item normalization from final-boundary rounding. "
        "Round each item only if the stated business contract requires line-level rounding; otherwise accumulate exact values and round at the stated result boundary."
    )


def build_actor_prompt(*, root: str | Path, task: str, policy: AgentPolicy) -> str:
    base = v6.build_actor_prompt(root=root, task=task, policy=policy)
    return base + "\n\nGENERAL NUMERIC/FINANCIAL CONTRACT:\n" + _financial_boundary_guidance()


def build_review_prompt(
    *,
    root: str | Path,
    task: str,
    criteria: Iterable[str],
    changed_files: Iterable[str],
    public_tests: dict[str, Any],
) -> str:
    base = v6.build_review_prompt(
        root=root,
        task=task,
        criteria=criteria,
        changed_files=changed_files,
        public_tests=public_tests,
    )
    return base + "\n\nGENERAL NUMERIC/FINANCIAL REVIEW:\n" + _financial_boundary_guidance()


def build_repair_prompt(
    *,
    root: str | Path,
    task: str,
    policy: AgentPolicy,
    criteria: Iterable[str],
    findings: Iterable[dict[str, str]],
    public_tests: dict[str, Any],
) -> str:
    base = v6.build_repair_prompt(
        root=root,
        task=task,
        policy=policy,
        criteria=criteria,
        findings=findings,
        public_tests=public_tests,
    )
    return base + "\n\nGENERAL NUMERIC/FINANCIAL CONTRACT:\n" + _financial_boundary_guidance()


def build_edit_recovery_prompt(
    *,
    root: str | Path,
    task: str,
    policy: AgentPolicy,
    criteria: Iterable[str],
    error: str,
) -> str:
    """Create one bounded repair after a local edit-contract/application failure.

    This exposes only the original task, model-visible workspace, editable scope,
    the actor's own criteria, and the deterministic local error. It contains no
    hidden-test evidence.
    """
    return "\n\n".join(
        [
            "AVANTIQO REPOSITORY AGENT V7 — EDIT CONTRACT RECOVERY.",
            "The previous implementation attempt did not produce a usable workspace change.",
            "Fix the original task with one minimal, effective, general edit. Do not infer hidden tests or benchmark answers.",
            "LOCAL EDIT ERROR:\n" + str(error),
            "ORIGINAL TASK:\n" + task.strip(),
            "PREVIOUS ACCEPTANCE CRITERIA:\n" + v6.v5._json(list(criteria)),
            "EDITABLE PATHS:\n" + v6.v5._json(list(policy.editable_paths)),
            "CURRENT MODEL-VISIBLE WORKSPACE:\n" + v6.v5._json(snapshot_workspace(root)),
            "GENERAL NUMERIC/FINANCIAL CONTRACT:\n" + _financial_boundary_guidance(),
            (
                "Return exactly one JSON object and nothing else with shape "
                '{"criteria":["..."],"edits":[...]}. '
                "Use either exact old/new fragment replacement or full-file content as defined by the V6 edit contract. "
                "Do not emit a no-op."
            ),
        ]
    )
