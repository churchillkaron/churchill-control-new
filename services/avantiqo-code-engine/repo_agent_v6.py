"""Resilient low-call repository agent contract for Avantiqo Code V6.

V6 keeps V5's deterministic sandbox/test orchestration and bounded model phases,
while hardening two general engineering boundaries:

* edits may be exact fragment replacements or explicit full-file replacements;
  malformed/no-op edit entries cannot invalidate unrelated valid edits;
* semantic review checks operation-intrinsic boundary invariants (for example,
  reduction identity/result type, ordering/duplicates, and where normalization or
  rounding occurs) when those semantics are implied by the task and visible code.

No hidden tests, benchmark case IDs, expected patches, or task-specific rewrite
rules are available to the model or encoded here.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable

import repo_agent_v5 as v5

CONTRACT = "AVANTIQO_CODE_REPO_AGENT_V6"
MAX_SNAPSHOT_BYTES = v5.MAX_SNAPSHOT_BYTES
MAX_FILE_BYTES = v5.MAX_FILE_BYTES
MAX_EDITS = v5.MAX_EDITS
MAX_CRITERIA = v5.MAX_CRITERIA
MAX_FINDINGS = v5.MAX_FINDINGS
MAX_EDIT_TEXT_BYTES = v5.MAX_EDIT_TEXT_BYTES
MAX_TEST_SECONDS = v5.MAX_TEST_SECONDS
MAX_CASE_MODEL_SEQUENCES = v5.MAX_CASE_MODEL_SEQUENCES
IGNORED_PARTS = v5.IGNORED_PARTS

AgentContractError = v5.AgentContractError
AgentPolicy = v5.AgentPolicy
snapshot_workspace = v5.snapshot_workspace
run_public_tests = v5.run_public_tests
parse_review = v5.parse_review


def _task_discipline(task: str) -> str:
    return "\n".join(
        [
            "Implement every explicit behavioral clause and qualifier in the task.",
            "Public tests are evidence, not the whole contract. Do not add benchmark-specific logic or infer hidden tests.",
            "Preserve ordinary operation-intrinsic boundary semantics that are directly implied by the task and visible code.",
            "For reductions or aggregations, reason about identity/result type for an empty collection and about whether normalization, rounding, filtering, or conversion belongs per item or at the final boundary.",
            "For collection transforms, preserve required order and duplicate behavior; for stateful/external work, preserve stated once/at-most-once and ambiguity semantics.",
            "For public boundaries, keep behavior deterministic for malformed or boundary-shaped inputs when the task makes that boundary relevant.",
            "Prefer the smallest general fix that makes the stated contract true.",
            "Use only editable paths. Return structured edits only; never shell commands or prose outside the JSON object.",
            "ORIGINAL TASK:\n" + task.strip(),
        ]
    )


def _edit_schema_text() -> str:
    return (
        "Each edit must use exactly one of two safe forms: "
        '{"path":"relative/file","old":"exact existing fragment","new":"replacement fragment"} '
        "for a minimal exact replacement, OR "
        '{"path":"relative/file","content":"complete replacement file content"} '
        "when a full-file rewrite is clearer. Do not emit unchanged/no-op edits."
    )


def build_actor_prompt(*, root: str | Path, task: str, policy: AgentPolicy) -> str:
    if not task.strip():
        raise AgentContractError("TASK_REQUIRED")
    if not policy.editable_paths:
        raise AgentContractError("EDITABLE_PATHS_REQUIRED")
    return "\n\n".join(
        [
            "AVANTIQO REPOSITORY AGENT V6 — IMPLEMENTATION.",
            _task_discipline(task),
            "EDITABLE PATHS:\n" + v5._json(list(policy.editable_paths)),
            "MODEL-VISIBLE WORKSPACE:\n" + v5._json(snapshot_workspace(root)),
            (
                "Return exactly one JSON object and nothing else with shape "
                '{"criteria":["material acceptance criterion..."],"edits":[...]}.'
            ),
            _edit_schema_text(),
            "criteria must cover the material contract, including operation-intrinsic boundary semantics that are directly implied by the task/code. Keep edits minimal and general.",
        ]
    )


def parse_actor_result(raw: str) -> dict[str, Any]:
    value = v5._clean_json(raw)
    if not isinstance(value, dict):
        raise AgentContractError("ACTOR_OBJECT_REQUIRED")

    criteria_raw = value.get("criteria")
    edits_raw = value.get("edits")
    if not isinstance(criteria_raw, list) or not criteria_raw or len(criteria_raw) > MAX_CRITERIA:
        raise AgentContractError("ACTOR_CRITERIA_INVALID")
    criteria = tuple(
        v5._bounded(item, 800).strip()
        for item in criteria_raw
        if str(item or "").strip()
    )
    if not criteria:
        raise AgentContractError("ACTOR_CRITERIA_REQUIRED")
    if not isinstance(edits_raw, list) or not edits_raw or len(edits_raw) > MAX_EDITS:
        raise AgentContractError("ACTOR_EDITS_INVALID")

    edits: list[dict[str, str]] = []
    for item in edits_raw:
        if not isinstance(item, dict):
            raise AgentContractError("ACTOR_EDIT_OBJECT_REQUIRED")
        path = str(item.get("path") or "").strip().replace("\\", "/")
        if not path:
            raise AgentContractError("ACTOR_EDIT_PATH_REQUIRED")

        content = item.get("content")
        has_content = isinstance(content, str)
        has_patch_keys = "old" in item or "new" in item
        if has_content and has_patch_keys:
            raise AgentContractError("ACTOR_EDIT_MODE_AMBIGUOUS")
        if has_content:
            if len(content.encode("utf-8")) > MAX_EDIT_TEXT_BYTES:
                raise AgentContractError("ACTOR_EDIT_TOO_LARGE")
            edits.append({"path": path, "content": content})
            continue

        old = item.get("old")
        new = item.get("new")
        if not isinstance(old, str) or not old or not isinstance(new, str):
            raise AgentContractError("ACTOR_EDIT_INVALID")
        if len(old.encode("utf-8")) > MAX_EDIT_TEXT_BYTES or len(new.encode("utf-8")) > MAX_EDIT_TEXT_BYTES:
            raise AgentContractError("ACTOR_EDIT_TOO_LARGE")
        if old == new:
            # A harmless no-op should not invalidate other valid edits. It is
            # ignored here and the application layer still requires at least
            # one actual changed file.
            continue
        edits.append({"path": path, "old": old, "new": new})

    if not edits:
        raise AgentContractError("ACTOR_NO_EFFECTIVE_EDITS")
    return {"criteria": criteria, "edits": tuple(edits)}


def apply_edits(*, root: str | Path, policy: AgentPolicy, edits: Iterable[dict[str, str]]) -> list[str]:
    workspace = Path(root).resolve()
    changed: set[str] = set()
    count = 0
    for edit in edits:
        count += 1
        if count > MAX_EDITS:
            raise AgentContractError("MAX_EDITS_EXCEEDED")
        path = str(edit.get("path") or "").strip().replace("\\", "/")
        if not v5._matches_scope(path, policy.editable_paths):
            raise AgentContractError(f"WRITE_SCOPE_FORBIDDEN:{path}")
        target = v5._resolve(workspace, path)
        if not target.is_file() or target.is_symlink():
            raise AgentContractError(f"EDIT_TARGET_INVALID:{path}")
        current = target.read_text(encoding="utf-8")

        if "content" in edit:
            content = edit.get("content")
            if not isinstance(content, str):
                raise AgentContractError(f"EDIT_CONTENT_INVALID:{path}")
            if content == current:
                continue
            target.write_text(content, encoding="utf-8")
            changed.add(path)
            continue

        old = edit.get("old")
        new = edit.get("new")
        if not isinstance(old, str) or not old or not isinstance(new, str):
            raise AgentContractError(f"EDIT_PATCH_INVALID:{path}")
        if old == new:
            continue
        occurrences = current.count(old)
        if occurrences != 1:
            raise AgentContractError(f"EDIT_OLD_MATCH_COUNT:{path}:{occurrences}")
        target.write_text(current.replace(old, new, 1), encoding="utf-8")
        changed.add(path)

    if not changed:
        raise AgentContractError("NO_CHANGED_FILES")
    return sorted(changed)


def build_review_prompt(
    *,
    root: str | Path,
    task: str,
    criteria: Iterable[str],
    changed_files: Iterable[str],
    public_tests: dict[str, Any],
) -> str:
    return "\n\n".join(
        [
            "AVANTIQO INDEPENDENT SEMANTIC REVIEWER V6.",
            "You did not implement this patch. Judge only the ORIGINAL TASK, current changed source, and public-test evidence.",
            "Public tests are incomplete evidence. Do not infer hidden tests, request secrets, invent unrelated requirements, or reward benchmark-specific logic.",
            "Check every explicit task clause and operation-intrinsic boundary semantic directly implied by the task and visible code.",
            "When reviewing a reduction/aggregation, verify its identity/result type for an empty collection and whether normalization/rounding/conversion happens at the correct stage. When reviewing collections, verify required order and duplicate behavior. Apply analogous boundary reasoning only when relevant to the actual task/code.",
            "If public tests failed, verdict must be repair.",
            "ORIGINAL TASK:\n" + task.strip(),
            "IMPLEMENTER CRITERIA:\n" + v5._json(list(criteria)),
            "PUBLIC TEST EVIDENCE:\n" + v5._json(public_tests),
            "CURRENT CHANGED SOURCES:\n" + v5._json(v5._changed_sources(root, changed_files)),
            (
                "Return exactly one JSON object and no prose: "
                '{"verdict":"pass|repair","criteria_checked":["..."],"findings":[{"clause":"task or operation-intrinsic contract","gap":"specific implementation gap"}]}. '
                "Use pass only when public tests pass and the material contract is guaranteed."
            ),
        ]
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
    return "\n\n".join(
        [
            "AVANTIQO REPOSITORY AGENT V6 — ONE BOUNDED REPAIR.",
            _task_discipline(task),
            "ORIGINAL IMPLEMENTER CRITERIA:\n" + v5._json(list(criteria)),
            "INDEPENDENT REVIEW FINDINGS:\n" + v5._json(list(findings)),
            "PUBLIC TEST EVIDENCE:\n" + v5._json(public_tests),
            "EDITABLE PATHS:\n" + v5._json(list(policy.editable_paths)),
            "CURRENT MODEL-VISIBLE WORKSPACE:\n" + v5._json(snapshot_workspace(root)),
            "Return exactly one JSON object and nothing else with shape "
            '{"criteria":["..."],"edits":[...]}.' ,
            _edit_schema_text(),
            "Repair only the stated contract gaps. Keep edits minimal and general.",
        ]
    )
