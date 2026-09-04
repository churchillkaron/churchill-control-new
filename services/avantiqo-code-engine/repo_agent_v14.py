"""Repo Agent V14: V13 compact review with a shorter general hot-path contract.

V14 preserves Repo Agent V13 everywhere except performance implementation and
repair prompts. The previous comparator guidance was correct in spirit but too
verbose/complex for the bounded actor output. This version states the same
general optimization as an indexed algorithm: materialize the right side once,
index hashable values to their original indices, confirm candidate matches with
the caller comparator, and fall back over only the remaining indices when a
candidate does not match. Unhashable inputs use the comparator scan.

This is a general algorithmic contract, not a benchmark-specific rewrite. The
compact reviewer, security/path behavior, public tests, transactional edits and
all non-performance prompts remain unchanged.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable

import repo_agent_v11 as v11
import repo_agent_v13 as v13

CONTRACT = "AVANTIQO_CODE_REPO_AGENT_V14"
MAX_CASE_MODEL_SEQUENCES = v13.MAX_CASE_MODEL_SEQUENCES
AgentContractError = v13.AgentContractError
AgentPolicy = v13.AgentPolicy
snapshot_workspace = v13.snapshot_workspace
run_public_tests = v13.run_public_tests
parse_actor_result = v13.parse_actor_result
parse_review = v13.parse_review
apply_edits = v13.apply_edits
build_review_prompt = v13.build_review_prompt
build_edit_recovery_prompt = v13.build_edit_recovery_prompt
needs_financial_guidance = v13.needs_financial_guidance
needs_performance_guidance = v13.needs_performance_guidance
needs_security_guidance = v13.needs_security_guidance
needs_shared_contract_guidance = v13.needs_shared_contract_guidance


def _performance_contract() -> str:
    return (
        "COMPARATOR HOT PATH: materialize the right side once and index each hashable right value as "
        "hash(value) -> original indices. For each left value, call the supplied comparator on same-hash "
        "candidate indices first. If none matches, scan only the remaining right indices in original order. "
        "If a value is unhashable, use the normal comparator scan. A hash/native equality is never itself a "
        "match: confirm every match with the supplied comparator. Preserve left output order and duplicates."
    )


def _actor_base(*, root: str | Path, task: str, policy: AgentPolicy) -> str:
    if needs_performance_guidance(task):
        # V11 intentionally starts performance tasks from the paid-proven V6
        # base so its broader V8 performance guidance is not stacked.
        return v11._base_actor(root=root, task=task, policy=policy)
    return v11.build_actor_prompt(root=root, task=task, policy=policy)


def build_actor_prompt(*, root: str | Path, task: str, policy: AgentPolicy) -> str:
    if not needs_performance_guidance(task):
        return v11.build_actor_prompt(root=root, task=task, policy=policy)
    return v11._append(
        _actor_base(root=root, task=task, policy=policy),
        v11._finance_contract() if needs_financial_guidance(task) else "",
        _performance_contract(),
        v11._shared_contract() if needs_shared_contract_guidance(task) else "",
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
    if not needs_performance_guidance(task):
        return v11.build_repair_prompt(
            root=root,
            task=task,
            policy=policy,
            criteria=criteria,
            findings=findings,
            public_tests=public_tests,
        )
    return v11._append(
        v11._base_repair(
            root=root,
            task=task,
            policy=policy,
            criteria=criteria,
            findings=findings,
            public_tests=public_tests,
        ),
        v11._finance_contract() if needs_financial_guidance(task) else "",
        _performance_contract(),
        v11._shared_contract() if needs_shared_contract_guidance(task) else "",
    )
