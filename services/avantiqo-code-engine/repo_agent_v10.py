"""Repo Agent V10: final general contract/recovery hardening.

V10 keeps V9's paid-proven behavior and adds two visible-task reasoning rules:

* comparator-driven hot paths must reduce avoidable work without silently
  replacing caller-supplied equality semantics;
* producer/consumer version skew must use an existing shared contract as the
  source of truth instead of duplicating stale field names across files.

Reviewer output is also instructed to stay concise so structured JSON finishes
comfortably inside the bounded token budget. No case IDs, hidden assertions,
expected patches, fixture values, or benchmark-specific source rewrites are
encoded here.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable

import repo_agent_v9 as v9

CONTRACT = "AVANTIQO_CODE_REPO_AGENT_V10"
MAX_CASE_MODEL_SEQUENCES = v9.MAX_CASE_MODEL_SEQUENCES
AgentContractError = v9.AgentContractError
AgentPolicy = v9.AgentPolicy
snapshot_workspace = v9.snapshot_workspace
run_public_tests = v9.run_public_tests
parse_actor_result = v9.parse_actor_result
parse_review = v9.parse_review
apply_edits = v9.apply_edits

_SHARED_CONTRACT_STRONG_TERMS = (
    "shared contract",
    "single field authority",
    "single source of truth",
    "version skew",
    "field authority",
    "schema authority",
)


def needs_financial_guidance(task: str) -> bool:
    return v9.needs_financial_guidance(task)


def needs_performance_guidance(task: str) -> bool:
    return v9.needs_performance_guidance(task)


def needs_security_guidance(task: str) -> bool:
    return v9.needs_security_guidance(task)


def needs_shared_contract_guidance(task: str) -> bool:
    text = str(task or "").lower()
    if any(term in text for term in _SHARED_CONTRACT_STRONG_TERMS):
        return True
    return "producer" in text and "consumer" in text and "contract" in text


def _comparator_performance_guidance() -> str:
    return (
        "When the visible hot-path API accepts a caller-supplied comparator/callback, that callback remains the semantic authority; do not replace it with bare native membership/equality. "
        "A safe acceleration may use a native hash/index only to propose an obvious candidate, must confirm that candidate through the supplied comparator, and must fall back to the original comparator scan when indexing is unavailable, the value is unhashable, no native candidate exists, or the comparator rejects the candidate. "
        "Preserve left-side output order, duplicate behavior, selected values, and error behavior while materially reducing repeated comparisons on the common indexed path."
    )


def _shared_contract_guidance() -> str:
    return (
        "When the visible repository already exposes a shared contract/schema/field registry and the task names it as the authority, treat that contract as the single source of truth. "
        "Producer output must conform to the contract-defined field names/shape, and consumers must read the same contract-defined fields rather than preserving or introducing duplicated stale literals. "
        "Do not silently redefine the shared contract unless the visible task explicitly requires a contract migration; instead align producer and consumer to it while preserving the stated external behavior."
    )


def _execution_guidance(task: str) -> str:
    parts: list[str] = []
    if needs_performance_guidance(task):
        parts.append("COMPARATOR-SAFE PERFORMANCE CONTRACT:\n" + _comparator_performance_guidance())
    if needs_shared_contract_guidance(task):
        parts.append("SHARED CONTRACT AUTHORITY:\n" + _shared_contract_guidance())
    return "\n\n".join(parts)


def _review_guidance(task: str) -> str:
    parts: list[str] = []
    if needs_performance_guidance(task):
        parts.append(
            "PERFORMANCE REVIEW: verify that work is materially reduced while any visible caller-supplied comparator remains authoritative, with a safe fallback for cases the fast path cannot prove. Preserve order and duplicates."
        )
    if needs_shared_contract_guidance(task):
        parts.append(
            "SHARED-CONTRACT REVIEW: verify producer and consumer agree through the visible shared contract and do not leave stale duplicated field names that can drift from that authority."
        )
    parts.append(
        "OUTPUT DISCIPLINE: keep criteria_checked to at most four short concrete strings and findings to at most three short concrete gaps. Avoid essays, repeated reasoning, or restating the full source."
    )
    return "\n\n".join(parts)


def _append(base: str, extra: str) -> str:
    return base if not extra else base + "\n\n" + extra


def build_actor_prompt(*, root: str | Path, task: str, policy: AgentPolicy) -> str:
    return _append(v9.build_actor_prompt(root=root, task=task, policy=policy), _execution_guidance(task))


def build_review_prompt(
    *,
    root: str | Path,
    task: str,
    criteria: Iterable[str],
    changed_files: Iterable[str],
    public_tests: dict[str, Any],
) -> str:
    return _append(
        v9.build_review_prompt(
            root=root,
            task=task,
            criteria=criteria,
            changed_files=changed_files,
            public_tests=public_tests,
        ),
        _review_guidance(task),
    )


def build_repair_prompt(
    *,
    root: str | Path,
    task: str,
    policy: AgentPolicy,
    criteria: Iterable[str],
    findings: Iterable[dict[str, str]],
    public_tests: dict[str, Any],
) -> str:
    return _append(
        v9.build_repair_prompt(
            root=root,
            task=task,
            policy=policy,
            criteria=criteria,
            findings=findings,
            public_tests=public_tests,
        ),
        _execution_guidance(task),
    )


def build_edit_recovery_prompt(
    *,
    root: str | Path,
    task: str,
    policy: AgentPolicy,
    criteria: Iterable[str],
    error: str,
    previous_output: str = "",
) -> str:
    return _append(
        v9.build_edit_recovery_prompt(
            root=root,
            task=task,
            policy=policy,
            criteria=criteria,
            error=error,
            previous_output=previous_output,
        ),
        _execution_guidance(task),
    )
