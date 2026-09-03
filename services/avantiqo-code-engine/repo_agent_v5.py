"""Batched, low-call repository agent contract for Avantiqo Code V5.

V5 removes the model-driven tool-by-tool loop. Deterministic orchestration owns
inspection, edit application and tests; the model is used only for implementation,
independent semantic review, and at most one repair. The paid certification can
batch all 12 cases per phase on one warm H100.
"""

from __future__ import annotations

import json
import re
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

CONTRACT = "AVANTIQO_CODE_REPO_AGENT_V5"
MAX_SNAPSHOT_BYTES = 160_000
MAX_FILE_BYTES = 80_000
MAX_EDITS = 12
MAX_CRITERIA = 16
MAX_FINDINGS = 8
MAX_EDIT_TEXT_BYTES = 80_000
MAX_TEST_SECONDS = 90
MAX_CASE_MODEL_SEQUENCES = 4
IGNORED_PARTS = {".git", "node_modules", ".next", "dist", "build", "coverage", "__pycache__"}


class AgentContractError(RuntimeError):
    pass


@dataclass(frozen=True)
class AgentPolicy:
    editable_paths: tuple[str, ...]
    test_commands: dict[str, tuple[str, ...]]


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _bounded(value: Any, limit: int) -> str:
    data = str(value or "").encode("utf-8")
    if len(data) <= limit:
        return data.decode("utf-8")
    return data[:limit].decode("utf-8", errors="ignore") + "\n...[truncated]"


def _clean_json(raw: str) -> Any:
    text = str(raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise AgentContractError("MODEL_JSON_REQUIRED") from exc


def _resolve(root: Path, relative: str) -> Path:
    raw = str(relative or "").strip().replace("\\", "/")
    if not raw or raw.startswith("/") or "\x00" in raw:
        raise AgentContractError("INVALID_RELATIVE_PATH")
    target = (root / raw).resolve()
    try:
        target.relative_to(root.resolve())
    except ValueError as exc:
        raise AgentContractError("PATH_ESCAPE_FORBIDDEN") from exc
    return target


def _matches_scope(path: str, editable_paths: Iterable[str]) -> bool:
    normalized = str(path or "").replace("\\", "/").lstrip("./")
    for allowed in editable_paths:
        rule = str(allowed or "").replace("\\", "/").lstrip("./").rstrip("/")
        if rule and (normalized == rule or normalized.startswith(rule + "/")):
            return True
    return False


def snapshot_workspace(root: str | Path) -> list[dict[str, str]]:
    """Return model-visible workspace files only; sibling sealed material is unreachable."""
    workspace = Path(root).resolve()
    if not workspace.is_dir():
        raise AgentContractError("WORKSPACE_DIRECTORY_REQUIRED")
    remaining = MAX_SNAPSHOT_BYTES
    result: list[dict[str, str]] = []
    for path in sorted(workspace.rglob("*")):
        if remaining <= 0:
            break
        if not path.is_file() or any(part in IGNORED_PARTS for part in path.parts):
            continue
        try:
            resolved = path.resolve()
            resolved.relative_to(workspace)
        except (OSError, ValueError):
            continue
        size = min(path.stat().st_size, MAX_FILE_BYTES, remaining)
        data = path.read_bytes()[:size]
        remaining -= len(data)
        result.append(
            {
                "path": path.relative_to(workspace).as_posix(),
                "content": data.decode("utf-8", errors="replace"),
            }
        )
    return result


def _task_discipline(task: str) -> str:
    return "\n".join(
        [
            "Implement every explicit behavioral clause and qualifier in the task.",
            "Treat words such as once, at-most-once, order, duplicates, empty, mismatch, archived, disabled, raw, final, ambiguous and preserving as contract terms when present.",
            "Public tests are evidence, not the whole contract. Do not add benchmark-specific logic or infer hidden tests.",
            "Prefer the smallest general fix that makes the stated contract true.",
            "Use only editable paths. Return exact replacements, not prose and not shell commands.",
            "ORIGINAL TASK:\n" + task.strip(),
        ]
    )


def build_actor_prompt(*, root: str | Path, task: str, policy: AgentPolicy) -> str:
    if not task.strip():
        raise AgentContractError("TASK_REQUIRED")
    if not policy.editable_paths:
        raise AgentContractError("EDITABLE_PATHS_REQUIRED")
    return "\n\n".join(
        [
            "AVANTIQO REPOSITORY AGENT V5 — IMPLEMENTATION.",
            _task_discipline(task),
            "EDITABLE PATHS:\n" + _json(list(policy.editable_paths)),
            "MODEL-VISIBLE WORKSPACE:\n" + _json(snapshot_workspace(root)),
            (
                "Return exactly one JSON object and nothing else with shape: "
                '{"criteria":["explicit clause..."],"edits":[{"path":"relative/file","old":"exact existing text","new":"replacement text"}]}. '
                "criteria must enumerate the material task clauses. old must match exactly once at the moment it is applied. Keep edits minimal."
            ),
        ]
    )


def parse_actor_result(raw: str) -> dict[str, Any]:
    value = _clean_json(raw)
    if not isinstance(value, dict):
        raise AgentContractError("ACTOR_OBJECT_REQUIRED")
    criteria_raw = value.get("criteria")
    edits_raw = value.get("edits")
    if not isinstance(criteria_raw, list) or not criteria_raw or len(criteria_raw) > MAX_CRITERIA:
        raise AgentContractError("ACTOR_CRITERIA_INVALID")
    criteria = tuple(_bounded(item, 800).strip() for item in criteria_raw if str(item or "").strip())
    if not criteria:
        raise AgentContractError("ACTOR_CRITERIA_REQUIRED")
    if not isinstance(edits_raw, list) or not edits_raw or len(edits_raw) > MAX_EDITS:
        raise AgentContractError("ACTOR_EDITS_INVALID")
    edits: list[dict[str, str]] = []
    for item in edits_raw:
        if not isinstance(item, dict):
            raise AgentContractError("ACTOR_EDIT_OBJECT_REQUIRED")
        path = str(item.get("path") or "").strip().replace("\\", "/")
        old = item.get("old")
        new = item.get("new")
        if not path or not isinstance(old, str) or not old or not isinstance(new, str) or old == new:
            raise AgentContractError("ACTOR_EDIT_INVALID")
        if len(old.encode("utf-8")) > MAX_EDIT_TEXT_BYTES or len(new.encode("utf-8")) > MAX_EDIT_TEXT_BYTES:
            raise AgentContractError("ACTOR_EDIT_TOO_LARGE")
        edits.append({"path": path, "old": old, "new": new})
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
        if not _matches_scope(path, policy.editable_paths):
            raise AgentContractError(f"WRITE_SCOPE_FORBIDDEN:{path}")
        target = _resolve(workspace, path)
        if not target.is_file() or target.is_symlink():
            raise AgentContractError(f"EDIT_TARGET_INVALID:{path}")
        old = str(edit.get("old") or "")
        new = str(edit.get("new") or "")
        current = target.read_text(encoding="utf-8")
        occurrences = current.count(old)
        if occurrences != 1:
            raise AgentContractError(f"EDIT_OLD_MATCH_COUNT:{path}:{occurrences}")
        target.write_text(current.replace(old, new, 1), encoding="utf-8")
        changed.add(path)
    if not changed:
        raise AgentContractError("NO_CHANGED_FILES")
    return sorted(changed)


def _safe_test_env() -> dict[str, str]:
    import os

    keep = ("PATH", "HOME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "NODE_PATH", "PYTHONPATH")
    env = {key: os.environ[key] for key in keep if key in os.environ}
    env.update({"CI": "1", "GITHUB_ACTIONS": "false", "NO_COLOR": "1", "AVANTIQO_CODE_AGENT_SANDBOX": "1"})
    return env


def run_public_tests(*, root: str | Path, policy: AgentPolicy) -> dict[str, Any]:
    workspace = Path(root).resolve()
    if not policy.test_commands:
        raise AgentContractError("TEST_COMMANDS_REQUIRED")
    unique: list[tuple[str, ...]] = []
    for argv in policy.test_commands.values():
        normalized = tuple(argv)
        if not normalized or any(not isinstance(part, str) or not part for part in normalized):
            raise AgentContractError("TEST_COMMAND_INVALID")
        if normalized not in unique:
            unique.append(normalized)
    results: list[dict[str, Any]] = []
    all_passed = True
    for argv in unique:
        started = time.perf_counter()
        completed = subprocess.run(
            list(argv),
            cwd=workspace,
            env=_safe_test_env(),
            capture_output=True,
            text=True,
            timeout=MAX_TEST_SECONDS,
            check=False,
            shell=False,
        )
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        passed = completed.returncode == 0
        all_passed = all_passed and passed
        results.append(
            {
                "argv": list(argv),
                "passed": passed,
                "exit_code": completed.returncode,
                "elapsed_ms": elapsed_ms,
                "stdout": _bounded(completed.stdout, 12_000),
                "stderr": _bounded(completed.stderr, 12_000),
            }
        )
    return {"passed": all_passed, "runs": results}


def _changed_sources(root: str | Path, changed_files: Iterable[str]) -> list[dict[str, str]]:
    workspace = Path(root).resolve()
    payload: list[dict[str, str]] = []
    for relative in sorted(set(str(item) for item in changed_files)):
        target = _resolve(workspace, relative)
        if target.is_file():
            payload.append({"path": relative, "content": _bounded(target.read_text(encoding="utf-8"), MAX_FILE_BYTES)})
    return payload


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
            "AVANTIQO INDEPENDENT SEMANTIC REVIEWER V5.",
            "You did not implement this patch. Judge only the ORIGINAL TASK, current changed source, and public-test evidence.",
            "A finding must identify an explicit task clause that is not guaranteed. Do not invent requirements, infer hidden tests, request secrets, or fail a patch for unrelated improvements.",
            "If public tests failed, verdict must be repair. If they passed, still check every explicit qualifier and boundary semantic in the task.",
            "ORIGINAL TASK:\n" + task.strip(),
            "IMPLEMENTER CRITERIA:\n" + _json(list(criteria)),
            "PUBLIC TEST EVIDENCE:\n" + _json(public_tests),
            "CURRENT CHANGED SOURCES:\n" + _json(_changed_sources(root, changed_files)),
            (
                "Return exactly one JSON object and no prose: "
                '{"verdict":"pass|repair","criteria_checked":["..."],"findings":[{"clause":"exact task clause","gap":"specific implementation gap"}]}. '
                "Use pass only when public tests pass and every material explicit task clause is guaranteed."
            ),
        ]
    )


def parse_review(raw: str, *, public_tests_passed: bool) -> dict[str, Any]:
    value = _clean_json(raw)
    if not isinstance(value, dict):
        raise AgentContractError("REVIEW_OBJECT_REQUIRED")
    verdict = str(value.get("verdict") or "").strip().lower()
    if verdict not in {"pass", "repair"}:
        raise AgentContractError("REVIEW_VERDICT_INVALID")
    criteria_raw = value.get("criteria_checked")
    if not isinstance(criteria_raw, list) or not criteria_raw:
        raise AgentContractError("REVIEW_CRITERIA_REQUIRED")
    criteria = tuple(_bounded(item, 800).strip() for item in criteria_raw[:MAX_CRITERIA] if str(item or "").strip())
    findings_raw = value.get("findings")
    if not isinstance(findings_raw, list) or len(findings_raw) > MAX_FINDINGS:
        raise AgentContractError("REVIEW_FINDINGS_INVALID")
    findings: list[dict[str, str]] = []
    for item in findings_raw:
        if not isinstance(item, dict):
            raise AgentContractError("REVIEW_FINDING_OBJECT_REQUIRED")
        clause = _bounded(item.get("clause"), 800).strip()
        gap = _bounded(item.get("gap"), 1200).strip()
        if not clause or not gap:
            raise AgentContractError("REVIEW_FINDING_INVALID")
        findings.append({"clause": clause, "gap": gap})
    if verdict == "pass" and (findings or not public_tests_passed):
        raise AgentContractError("REVIEW_FALSE_PASS_FORBIDDEN")
    if verdict == "repair" and not findings:
        raise AgentContractError("REVIEW_REPAIR_FINDINGS_REQUIRED")
    return {"verdict": verdict, "criteria_checked": criteria, "findings": tuple(findings)}


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
            "AVANTIQO REPOSITORY AGENT V5 — ONE BOUNDED REPAIR.",
            _task_discipline(task),
            "ORIGINAL IMPLEMENTER CRITERIA:\n" + _json(list(criteria)),
            "INDEPENDENT REVIEW FINDINGS:\n" + _json(list(findings)),
            "PUBLIC TEST EVIDENCE:\n" + _json(public_tests),
            "EDITABLE PATHS:\n" + _json(list(policy.editable_paths)),
            "CURRENT MODEL-VISIBLE WORKSPACE:\n" + _json(snapshot_workspace(root)),
            (
                "Return exactly one JSON object and nothing else with shape: "
                '{"criteria":["..."],"edits":[{"path":"relative/file","old":"exact existing text","new":"replacement text"}]}. '
                "Repair only the stated contract gaps. Keep edits minimal and general."
            ),
        ]
    )
