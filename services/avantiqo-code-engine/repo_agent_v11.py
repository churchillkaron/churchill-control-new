"""Repo Agent V11: compact, contract-grounded repair reasoning.

V11 returns to V9's paid-proven behavior and replaces (rather than stacks)
extra guidance for the two remaining visible contract classes. It also makes
financial aggregation guidance explicit enough to avoid intermediate rounding.

Design goals:
* keep the actor prompt near the V8/V9 latency envelope;
* preserve V9 transactional/path/security behavior;
* give comparator hot paths a semantics-preserving indexed fast path;
* treat an existing shared field registry as producer/consumer authority;
* prevent speculative reviewer rewrites of already-correct implementations.

No case IDs, hidden assertions, fixture values, expected patches, or benchmark
source rewrites are encoded here.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable

import repo_agent_v9 as v9

CONTRACT = "AVANTIQO_CODE_REPO_AGENT_V11"
MAX_CASE_MODEL_SEQUENCES = v9.MAX_CASE_MODEL_SEQUENCES
AgentContractError = v9.AgentContractError
AgentPolicy = v9.AgentPolicy
snapshot_workspace = v9.snapshot_workspace
run_public_tests = v9.run_public_tests
parse_actor_result = v9.parse_actor_result
parse_review = v9.parse_review
apply_edits = v9.apply_edits

_SHARED_TERMS = (
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
    return any(term in text for term in _SHARED_TERMS) or (
        "producer" in text and "consumer" in text and "contract" in text
    )


def _finance_contract() -> str:
    return (
        "FINANCIAL AGGREGATION: convert monetary inputs to Decimal without per-item quantization; "
        "reduce with a Decimal zero identity; quantize the aggregate exactly once at the requested "
        "currency scale/rounding boundary."
    )


def _performance_contract() -> str:
    return (
        "COMPARATOR HOT PATH: never replace a caller comparator with native equality. When values are "
        "hashable, bucket the right side by hash; for each left value test same-hash candidates with "
        "the comparator, then scan remaining right values only if no candidate matched. Unhashable "
        "values fall back to the comparator scan. Preserve left order and duplicates."
    )


def _shared_contract() -> str:
    return (
        "SHARED FIELD AUTHORITY: if the workspace exposes an ordered field/schema registry, import and "
        "use that registry when producers create keys and consumers read them. Preserve existing value "
        "order/format; do not duplicate stale field literals or redefine the registry unless requested."
    )


def _review_discipline() -> str:
    return (
        "REVIEW DISCIPLINE: request repair only for a concrete visible task, test, or semantic contract "
        "violation in the current code; do not rewrite a correct implementation for style or speculation."
    )


def _append(base: str, *extras: str) -> str:
    selected = [item for item in extras if item]
    return base if not selected else base + "\n\n" + "\n\n".join(selected)


def _base_actor(*, root: str | Path, task: str, policy: AgentPolicy) -> str:
    # For finance/performance we intentionally start from V6 so V8's broader
    # guidance is replaced by the compact V11 contract instead of duplicated.
    if needs_financial_guidance(task) or needs_performance_guidance(task):
        return v9.v8.v6.build_actor_prompt(root=root, task=task, policy=policy)
    return v9.build_actor_prompt(root=root, task=task, policy=policy)


def build_actor_prompt(*, root: str | Path, task: str, policy: AgentPolicy) -> str:
    return _append(
        _base_actor(root=root, task=task, policy=policy),
        _finance_contract() if needs_financial_guidance(task) else "",
        _performance_contract() if needs_performance_guidance(task) else "",
        _shared_contract() if needs_shared_contract_guidance(task) else "",
    )


def _base_review(
    *,
    root: str | Path,
    task: str,
    criteria: Iterable[str],
    changed_files: Iterable[str],
    public_tests: dict[str, Any],
) -> str:
    if needs_financial_guidance(task) or needs_performance_guidance(task) or needs_shared_contract_guidance(task):
        return v9.v8.v6.build_review_prompt(
            root=root,
            task=task,
            criteria=criteria,
            changed_files=changed_files,
            public_tests=public_tests,
        )
    return v9.build_review_prompt(
        root=root,
        task=task,
        criteria=criteria,
        changed_files=changed_files,
        public_tests=public_tests,
    )


def build_review_prompt(
    *,
    root: str | Path,
    task: str,
    criteria: Iterable[str],
    changed_files: Iterable[str],
    public_tests: dict[str, Any],
) -> str:
    return _append(
        _base_review(
            root=root,
            task=task,
            criteria=criteria,
            changed_files=changed_files,
            public_tests=public_tests,
        ),
        _finance_contract() if needs_financial_guidance(task) else "",
        _performance_contract() if needs_performance_guidance(task) else "",
        _shared_contract() if needs_shared_contract_guidance(task) else "",
        _review_discipline(),
    )


def _base_repair(
    *,
    root: str | Path,
    task: str,
    policy: AgentPolicy,
    criteria: Iterable[str],
    findings: Iterable[dict[str, str]],
    public_tests: dict[str, Any],
) -> str:
    if needs_financial_guidance(task) or needs_performance_guidance(task) or needs_shared_contract_guidance(task):
        return v9.v8.v6.build_repair_prompt(
            root=root,
            task=task,
            policy=policy,
            criteria=criteria,
            findings=findings,
            public_tests=public_tests,
        )
    return v9.build_repair_prompt(
        root=root,
        task=task,
        policy=policy,
        criteria=criteria,
        findings=findings,
        public_tests=public_tests,
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
        _base_repair(
            root=root,
            task=task,
            policy=policy,
            criteria=criteria,
            findings=findings,
            public_tests=public_tests,
        ),
        _finance_contract() if needs_financial_guidance(task) else "",
        _performance_contract() if needs_performance_guidance(task) else "",
        _shared_contract() if needs_shared_contract_guidance(task) else "",
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
        _finance_contract() if needs_financial_guidance(task) else "",
        _performance_contract() if needs_performance_guidance(task) else "",
        _shared_contract() if needs_shared_contract_guidance(task) else "",
    )
