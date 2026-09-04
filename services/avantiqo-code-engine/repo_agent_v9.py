"""Repo Agent V9: robust edit execution on the paid-proven V8/V7 path.

V9 is a general agent/tooling correction derived from certification evidence:

* syntactically valid no-op edits are not treated as an orchestration crash;
  deterministic tests, independent review and final changed-file/hidden gates
  still decide acceptance;
* a model path missing only a filename extension can be canonicalized when and
  only when it maps to exactly one real file inside the declared editable scope;
* filesystem-boundary tasks receive explicit root-containment and symlink
  reasoning based only on the visible task/source contract.

No case IDs, hidden profiles, hidden assertions, expected patches or
benchmark-specific source rewrites are encoded here.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable

import repo_agent_v8 as v8

CONTRACT = "AVANTIQO_CODE_REPO_AGENT_V9"
MAX_CASE_MODEL_SEQUENCES = v8.MAX_CASE_MODEL_SEQUENCES
AgentContractError = v8.AgentContractError
AgentPolicy = v8.AgentPolicy
snapshot_workspace = v8.snapshot_workspace
run_public_tests = v8.run_public_tests
parse_review = v8.parse_review

_SECURITY_TERMS = (
    "path traversal",
    "symlink",
    "filesystem",
    "file boundary",
    "read_user_file",
    "unsafe input",
    "security boundary",
)


def needs_financial_guidance(task: str) -> bool:
    return v8.needs_financial_guidance(task)


def needs_performance_guidance(task: str) -> bool:
    return v8.needs_performance_guidance(task)


def needs_security_guidance(task: str) -> bool:
    text = str(task or "").lower()
    return any(term in text for term in _SECURITY_TERMS)


def _security_guidance() -> str:
    return (
        "For filesystem containment, reason about canonical/resolved paths, not string prefixes. "
        "The resolved candidate must be the resolved root itself or a descendant of it; traversal and symlink escapes must be rejected while ordinary in-root files remain readable. "
        "Do not remove intended file-reading capability merely to make unsafe inputs fail."
    )


def _review_guidance(task: str) -> str:
    parts: list[str] = []
    if needs_financial_guidance(task):
        parts.append(
            "FINANCIAL REVIEW: verify exact decimal accumulation, a correctly typed empty identity, and rounding at the stated result boundary unless the visible contract explicitly says otherwise."
        )
    if needs_performance_guidance(task):
        parts.append(
            "PERFORMANCE REVIEW: verify the changed implementation materially reduces avoidable repeated comparisons while preserving the task's stated order, duplicate and externally visible behavior. "
            "Do not demand one particular algorithm or data structure when another implementation satisfies those visible requirements."
        )
    if needs_security_guidance(task):
        parts.append("FILESYSTEM SECURITY REVIEW: " + _security_guidance())
    return "\n\n".join(parts)


def _actor_guidance(task: str) -> str:
    parts: list[str] = []
    if needs_security_guidance(task):
        parts.append("FILESYSTEM SECURITY CONTRACT:\n" + _security_guidance())
    return "\n\n".join(parts)


def build_actor_prompt(*, root: str | Path, task: str, policy: AgentPolicy) -> str:
    base = v8.build_actor_prompt(root=root, task=task, policy=policy)
    extra = _actor_guidance(task)
    return base if not extra else base + "\n\n" + extra


def build_review_prompt(
    *,
    root: str | Path,
    task: str,
    criteria: Iterable[str],
    changed_files: Iterable[str],
    public_tests: dict[str, Any],
) -> str:
    # Start from V6 review behavior to avoid converting implementation hints into
    # mandatory algorithms, then add only task-relevant review invariants.
    base = v8.v6.build_review_prompt(
        root=root,
        task=task,
        criteria=criteria,
        changed_files=changed_files,
        public_tests=public_tests,
    )
    extra = _review_guidance(task)
    return base if not extra else base + "\n\n" + extra


def build_repair_prompt(
    *,
    root: str | Path,
    task: str,
    policy: AgentPolicy,
    criteria: Iterable[str],
    findings: Iterable[dict[str, str]],
    public_tests: dict[str, Any],
) -> str:
    base = v8.build_repair_prompt(
        root=root,
        task=task,
        policy=policy,
        criteria=criteria,
        findings=findings,
        public_tests=public_tests,
    )
    extra = _actor_guidance(task)
    return base if not extra else base + "\n\n" + extra


def build_edit_recovery_prompt(
    *,
    root: str | Path,
    task: str,
    policy: AgentPolicy,
    criteria: Iterable[str],
    error: str,
    previous_output: str = "",
) -> str:
    return v8.build_edit_recovery_prompt(
        root=root,
        task=task,
        policy=policy,
        criteria=criteria,
        error=error,
        previous_output=previous_output,
    )


def parse_actor_result(raw: str) -> dict[str, Any]:
    """Parse V8 actor JSON but retain syntactically valid no-op edits.

    A no-op is not accepted as a successful solution: apply_edits returns no
    changed files, public tests/review still run, and the certification scorer
    ultimately requires a real changed file plus all quality gates. Retaining
    the edit simply prevents an orchestration-format exception from pre-empting
    those stronger checks.
    """

    v6 = v8.v6
    value = v6.v5._clean_json(raw)
    if not isinstance(value, dict):
        raise AgentContractError("ACTOR_OBJECT_REQUIRED")

    criteria_raw = value.get("criteria")
    edits_raw = value.get("edits")
    if not isinstance(criteria_raw, list) or not criteria_raw or len(criteria_raw) > v6.MAX_CRITERIA:
        raise AgentContractError("ACTOR_CRITERIA_INVALID")
    criteria = tuple(
        v6.v5._bounded(item, 800).strip()
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
            if len(content.encode("utf-8")) > v6.MAX_EDIT_TEXT_BYTES:
                raise AgentContractError("ACTOR_EDIT_TOO_LARGE")
            edits.append({"path": path, "content": content})
            continue

        old = item.get("old")
        new = item.get("new")
        if not isinstance(old, str) or not old or not isinstance(new, str):
            raise AgentContractError("ACTOR_EDIT_INVALID")
        if len(old.encode("utf-8")) > v6.MAX_EDIT_TEXT_BYTES or len(new.encode("utf-8")) > v6.MAX_EDIT_TEXT_BYTES:
            raise AgentContractError("ACTOR_EDIT_TOO_LARGE")
        edits.append({"path": path, "old": old, "new": new})

    if not edits:
        raise AgentContractError("ACTOR_EDITS_REQUIRED")
    return {"criteria": criteria, "edits": tuple(edits)}


def _editable_files(workspace: Path, policy: AgentPolicy) -> list[str]:
    result: set[str] = set()
    for allowed in policy.editable_paths:
        normalized = str(allowed).replace("\\", "/").lstrip("./").rstrip("/")
        if not normalized:
            continue
        target = v8.v6.v5._resolve(workspace, normalized)
        if target.is_file() and not target.is_symlink():
            result.add(normalized)
            continue
        if target.is_dir() and not target.is_symlink():
            for candidate in target.rglob("*"):
                if candidate.is_file() and not candidate.is_symlink():
                    relative = candidate.relative_to(workspace).as_posix()
                    if v8.v6.v5._matches_scope(relative, policy.editable_paths):
                        result.add(relative)
    return sorted(result)


def _canonical_path(workspace: Path, requested: str, policy: AgentPolicy) -> str:
    path = str(requested or "").strip().replace("\\", "/").lstrip("./")
    if not path:
        raise AgentContractError("ACTOR_EDIT_PATH_REQUIRED")
    if not v8.v6.v5._matches_scope(path, policy.editable_paths):
        raise AgentContractError(f"WRITE_SCOPE_FORBIDDEN:{path}")

    target = v8.v6.v5._resolve(workspace, path)
    if target.is_file() and not target.is_symlink():
        return path

    # The only deterministic correction allowed is adding a missing filename
    # extension. Never rewrite directories, change stems, or choose ambiguously.
    if Path(path).suffix:
        raise AgentContractError(f"EDIT_TARGET_INVALID:{path}")
    candidates = [
        candidate
        for candidate in _editable_files(workspace, policy)
        if str(Path(candidate).with_suffix("")) == path
    ]
    if len(candidates) == 1:
        return candidates[0]
    raise AgentContractError(f"EDIT_TARGET_INVALID:{path}")


def apply_edits(*, root: str | Path, policy: AgentPolicy, edits: Iterable[dict[str, str]]) -> list[str]:
    """Apply edits transactionally with conservative path canonicalization.

    A fully no-op edit set returns [] rather than crashing orchestration. That is
    not a pass: the surrounding tests, review, hidden tests and changed-file
    scorer remain authoritative.
    """

    workspace = Path(root).resolve()
    planned: dict[str, str] = {}
    originals: dict[str, str] = {}
    targets: dict[str, Path] = {}
    count = 0

    for edit in edits:
        count += 1
        if count > v8.v6.MAX_EDITS:
            raise AgentContractError("MAX_EDITS_EXCEEDED")
        requested = str(edit.get("path") or "")
        path = _canonical_path(workspace, requested, policy)
        target = v8.v6.v5._resolve(workspace, path)

        if path not in originals:
            original = target.read_text(encoding="utf-8")
            originals[path] = original
            planned[path] = original
            targets[path] = target
        current = planned[path]

        if "content" in edit:
            content = edit.get("content")
            if not isinstance(content, str):
                raise AgentContractError(f"EDIT_CONTENT_INVALID:{path}")
            if len(content.encode("utf-8")) > v8.v6.MAX_EDIT_TEXT_BYTES:
                raise AgentContractError("ACTOR_EDIT_TOO_LARGE")
            planned[path] = content
            continue

        old = edit.get("old")
        new = edit.get("new")
        if not isinstance(old, str) or not old or not isinstance(new, str):
            raise AgentContractError(f"EDIT_PATCH_INVALID:{path}")
        if len(old.encode("utf-8")) > v8.v6.MAX_EDIT_TEXT_BYTES or len(new.encode("utf-8")) > v8.v6.MAX_EDIT_TEXT_BYTES:
            raise AgentContractError("ACTOR_EDIT_TOO_LARGE")
        if old == new:
            continue
        occurrences = current.count(old)
        if occurrences != 1:
            raise AgentContractError(f"EDIT_OLD_MATCH_COUNT:{path}:{occurrences}")
        planned[path] = current.replace(old, new, 1)

    changed = sorted(path for path, content in planned.items() if content != originals[path])
    if not changed:
        return []

    written: list[str] = []
    try:
        for path in changed:
            targets[path].write_text(planned[path], encoding="utf-8")
            written.append(path)
    except OSError as exc:
        for path in reversed(written):
            try:
                targets[path].write_text(originals[path], encoding="utf-8")
            except OSError:
                pass
        raise AgentContractError("EDIT_COMMIT_FAILED") from exc
    return changed
