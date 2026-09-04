"""Repo Agent V15: robust structured edits plus compact hot-path guidance.

V15 preserves the V14/V13 architecture, compact semantic reviewer, transactional
edit application, security/path policy, shared-contract reasoning, and bounded
repair behavior. It fixes two issues proven by Private12 V15:

* Runtime V9's JSON grammar permits optional old/new/content properties while
  the actor parser requires one usable edit mode. Normalize harmless empty
  schema placeholders deterministically instead of rejecting the whole repair.
* The performance actor was correct but verbose enough to make the representative
  warm request exceed 4 seconds. State the same indexed-comparator fast path in
  a smaller one-function form and explicitly request a compact fragment edit.

No hidden assertions, case identifiers, fixture values, expected source output,
or deterministic benchmark rewrite is encoded here. Public tests and independent
semantic review remain authoritative after every applied model edit.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable

import repo_agent_v5 as v5
import repo_agent_v6 as v6
import repo_agent_v11 as v11
import repo_agent_v14 as v14

CONTRACT = "AVANTIQO_CODE_REPO_AGENT_V15"
MAX_CASE_MODEL_SEQUENCES = v14.MAX_CASE_MODEL_SEQUENCES
AgentContractError = v14.AgentContractError
AgentPolicy = v14.AgentPolicy
snapshot_workspace = v14.snapshot_workspace
run_public_tests = v14.run_public_tests
parse_review = v14.parse_review
apply_edits = v14.apply_edits
build_review_prompt = v14.build_review_prompt
build_edit_recovery_prompt = v14.build_edit_recovery_prompt
needs_financial_guidance = v14.needs_financial_guidance
needs_performance_guidance = v14.needs_performance_guidance
needs_security_guidance = v14.needs_security_guidance
needs_shared_contract_guidance = v14.needs_shared_contract_guidance


def parse_actor_result(raw: str) -> dict[str, Any]:
    """Normalize grammar-valid edit placeholders into one effective edit mode.

    Structured JSON generation can legally emit empty optional keys because the
    runtime schema only requires ``path``. Treat empty optional keys as absent.
    A valid fragment patch wins when old/new are usable; otherwise a string
    ``content`` value is accepted as the full-file mode. Invalid/no-op entries
    are ignored only when another effective edit remains, so the deterministic
    test/review gates still decide whether the resulting patch is sufficient.
    """

    value = v5._clean_json(raw)
    if not isinstance(value, dict):
        raise AgentContractError("ACTOR_OBJECT_REQUIRED")

    criteria_raw = value.get("criteria")
    edits_raw = value.get("edits")
    if not isinstance(criteria_raw, list) or not criteria_raw or len(criteria_raw) > v6.MAX_CRITERIA:
        raise AgentContractError("ACTOR_CRITERIA_INVALID")
    criteria = tuple(
        v5._bounded(item, 800).strip()
        for item in criteria_raw
        if str(item or "").strip()
    )
    if not criteria:
        raise AgentContractError("ACTOR_CRITERIA_REQUIRED")
    if not isinstance(edits_raw, list) or not edits_raw or len(edits_raw) > v6.MAX_EDITS:
        raise AgentContractError("ACTOR_EDITS_INVALID")

    edits: list[dict[str, str]] = []
    for item in edits_raw:
        if not isinstance(item, dict):
            continue
        path = str(item.get("path") or "").strip().replace("\\", "/")
        if not path:
            continue

        old = item.get("old")
        new = item.get("new")
        content = item.get("content")

        patch_valid = isinstance(old, str) and bool(old) and isinstance(new, str) and old != new
        if patch_valid:
            if len(old.encode("utf-8")) > v6.MAX_EDIT_TEXT_BYTES or len(new.encode("utf-8")) > v6.MAX_EDIT_TEXT_BYTES:
                raise AgentContractError("ACTOR_EDIT_TOO_LARGE")
            edits.append({"path": path, "old": old, "new": new})
            continue

        content_valid = isinstance(content, str) and bool(content)
        if content_valid:
            if len(content.encode("utf-8")) > v6.MAX_EDIT_TEXT_BYTES:
                raise AgentContractError("ACTOR_EDIT_TOO_LARGE")
            edits.append({"path": path, "content": content})
            continue

        # Empty optional keys and no-op fragments are harmless structured-output
        # placeholders. They cannot mutate the workspace and are ignored here.

    if not edits:
        raise AgentContractError("ACTOR_NO_EFFECTIVE_EDITS")
    return {"criteria": criteria, "edits": tuple(edits)}


def _performance_contract() -> str:
    return (
        "COMPARATOR HOT PATH: materialize the right side once and build hash(value)->candidate values once. "
        "For each hashable left value, test same-hash candidates with the supplied comparator first; if none "
        "matches, fall back to the original comparator scan. Unhashable values use the original scan. Preserve "
        "left output order and duplicates. Keep this as one compact function-body edit; no helpers or comments."
    )


def build_actor_prompt(*, root: str | Path, task: str, policy: AgentPolicy) -> str:
    if not needs_performance_guidance(task):
        return v14.build_actor_prompt(root=root, task=task, policy=policy)
    return v11._append(
        v11._base_actor(root=root, task=task, policy=policy),
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
    if needs_performance_guidance(task):
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

    base = v14.build_repair_prompt(
        root=root,
        task=task,
        policy=policy,
        criteria=criteria,
        findings=findings,
        public_tests=public_tests,
    )
    if needs_shared_contract_guidance(task):
        base += (
            "\n\nCOORDINATED SHARED-CONTRACT REPAIR: update every editable producer/consumer boundary needed "
            "to use the existing shared registry in the same repair. Emit only effective old/new or content edits; "
            "do not emit path-only or empty placeholder edits."
        )
    return base
