"""Repo Agent V8: preserve proven V6 behavior and apply guidance selectively.

V8 intentionally returns to Repo Agent V6 for ordinary implementation/review
behavior because that path proved 10/12 on the sealed quality suite. Extra
semantic guidance is only added when the *visible task text* makes the domain
relevant. No case IDs, hidden profiles, expected patches, or hidden-test
material are used.

V8 also provides one bounded edit-contract recovery prompt which includes the
model's previous output and deterministic local edit error so a no-op, malformed
path, or invalid replacement can be corrected without another tool-driven loop.
Edit application is transactional at the sandbox boundary: all edits are
validated in memory before any file is written, and a commit failure rolls back
files already written by that commit attempt.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable

import repo_agent_v6 as v6

CONTRACT = "AVANTIQO_CODE_REPO_AGENT_V8"
MAX_CASE_MODEL_SEQUENCES = v6.MAX_CASE_MODEL_SEQUENCES
AgentContractError = v6.AgentContractError
AgentPolicy = v6.AgentPolicy
snapshot_workspace = v6.snapshot_workspace
parse_actor_result = v6.parse_actor_result
run_public_tests = v6.run_public_tests
parse_review = v6.parse_review

_FINANCIAL_TERMS = (
    "ledger",
    "accounting",
    "money",
    "monetary",
    "currency",
    "decimal",
    "rounding",
    "round ",
)
_PERFORMANCE_TERMS = (
    "hot path",
    "performance",
    "avoidable work",
    "repeated work",
    "operation count",
    "operation-count",
    "loop",
)


def _contains_any(task: str, terms: tuple[str, ...]) -> bool:
    text = str(task or "").lower()
    return any(term in text for term in terms)


def needs_financial_guidance(task: str) -> bool:
    return _contains_any(task, _FINANCIAL_TERMS)


def needs_performance_guidance(task: str) -> bool:
    return _contains_any(task, _PERFORMANCE_TERMS)


def _financial_guidance() -> str:
    return (
        "For monetary arithmetic, preserve exact decimal semantics. Use a correctly typed zero/identity for an empty reduction. "
        "Avoid intermediate rounding unless the stated business contract explicitly requires it; otherwise accumulate exact values and round only at the stated result boundary. "
        "Preserve the visible currency/scale contract and reject or normalize invalid numeric values only as the visible public contract requires."
    )


def _performance_guidance() -> str:
    return (
        "For hot-path work reduction, identify computations whose inputs are invariant across repeated processing and compute/cache them outside that repeated work. "
        "Do not cache values whose inputs vary. Preserve output values, ordering, duplicate behavior, error behavior, and all externally visible side effects."
    )


def _selective_guidance(task: str) -> str:
    parts: list[str] = []
    if needs_financial_guidance(task):
        parts.append("NUMERIC/FINANCIAL CONTRACT:\n" + _financial_guidance())
    if needs_performance_guidance(task):
        parts.append("PERFORMANCE CONTRACT:\n" + _performance_guidance())
    return "\n\n".join(parts)


def _with_guidance(base: str, task: str) -> str:
    guidance = _selective_guidance(task)
    return base if not guidance else base + "\n\n" + guidance


def build_actor_prompt(*, root: str | Path, task: str, policy: AgentPolicy) -> str:
    return _with_guidance(v6.build_actor_prompt(root=root, task=task, policy=policy), task)


def apply_edits(*, root: str | Path, policy: AgentPolicy, edits: Iterable[dict[str, str]]) -> list[str]:
    """Validate a complete edit set before committing any workspace mutation.

    Multiple edits to the same file are evaluated sequentially in memory. If a
    later edit is invalid, no earlier edit is written. The final commit also keeps
    originals and restores already-written files if an unexpected write failure
    occurs. This prevents bounded recovery from inheriting a half-applied patch.
    """

    workspace = Path(root).resolve()
    planned: dict[str, str] = {}
    originals: dict[str, str] = {}
    targets: dict[str, Path] = {}
    count = 0

    for edit in edits:
        count += 1
        if count > v6.MAX_EDITS:
            raise AgentContractError("MAX_EDITS_EXCEEDED")
        path = str(edit.get("path") or "").strip().replace("\\", "/")
        if not v6.v5._matches_scope(path, policy.editable_paths):
            raise AgentContractError(f"WRITE_SCOPE_FORBIDDEN:{path}")
        target = v6.v5._resolve(workspace, path)
        if not target.is_file() or target.is_symlink():
            raise AgentContractError(f"EDIT_TARGET_INVALID:{path}")

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
            if len(content.encode("utf-8")) > v6.MAX_EDIT_TEXT_BYTES:
                raise AgentContractError("ACTOR_EDIT_TOO_LARGE")
            planned[path] = content
            continue

        old = edit.get("old")
        new = edit.get("new")
        if not isinstance(old, str) or not old or not isinstance(new, str):
            raise AgentContractError(f"EDIT_PATCH_INVALID:{path}")
        if len(old.encode("utf-8")) > v6.MAX_EDIT_TEXT_BYTES or len(new.encode("utf-8")) > v6.MAX_EDIT_TEXT_BYTES:
            raise AgentContractError("ACTOR_EDIT_TOO_LARGE")
        if old == new:
            continue
        occurrences = current.count(old)
        if occurrences != 1:
            raise AgentContractError(f"EDIT_OLD_MATCH_COUNT:{path}:{occurrences}")
        planned[path] = current.replace(old, new, 1)

    changed = sorted(path for path, content in planned.items() if content != originals[path])
    if not changed:
        raise AgentContractError("NO_CHANGED_FILES")

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


def build_review_prompt(
    *,
    root: str | Path,
    task: str,
    criteria: Iterable[str],
    changed_files: Iterable[str],
    public_tests: dict[str, Any],
) -> str:
    return _with_guidance(
        v6.build_review_prompt(
            root=root,
            task=task,
            criteria=criteria,
            changed_files=changed_files,
            public_tests=public_tests,
        ),
        task,
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
    return _with_guidance(
        v6.build_repair_prompt(
            root=root,
            task=task,
            policy=policy,
            criteria=criteria,
            findings=findings,
            public_tests=public_tests,
        ),
        task,
    )


def build_edit_recovery_prompt(
    *,
    root: str | Path,
    task: str,
    policy: AgentPolicy,
    criteria: Iterable[str],
    error: str,
    previous_output: str,
) -> str:
    """One model-visible recovery after a deterministic local edit failure.

    Hidden assertions are never included. The previous model output is bounded so
    the recovery can see exactly what failed (for example a no-op or bad path)
    without causing an unbounded prompt or another model/tool loop.
    """

    previous = v6.v5._bounded(previous_output, 4_000)
    guidance = _selective_guidance(task)
    parts = [
        "AVANTIQO REPOSITORY AGENT V8 — BOUNDED EDIT RECOVERY.",
        "The previous implementation response could not produce a usable workspace change. Correct the edit contract once; do not infer hidden tests or benchmark answers.",
        "ORIGINAL TASK:\n" + task.strip(),
        "LOCAL EDIT ERROR:\n" + str(error),
        "PREVIOUS MODEL OUTPUT:\n" + previous,
        "PREVIOUS ACCEPTANCE CRITERIA:\n" + v6.v5._json(list(criteria)),
        "EDITABLE PATHS (copy file paths exactly, including extensions):\n" + v6.v5._json(list(policy.editable_paths)),
        "CURRENT MODEL-VISIBLE WORKSPACE:\n" + v6.v5._json(snapshot_workspace(root)),
        (
            "Return exactly one JSON object and nothing else with shape "
            '{"criteria":["..."],"edits":[...]}. '
            "Produce at least one effective edit. For an old/new replacement, old must occur exactly once and new must differ. "
            "For a full-file replacement, content must differ from the current file. Use only actual file paths shown in the workspace; do not omit or change their extensions."
        ),
    ]
    if guidance:
        parts.append(guidance)
    return "\n\n".join(parts)
