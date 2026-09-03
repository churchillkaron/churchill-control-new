"""World-class bounded repository agent core for Avantiqo Code V3.

V3 hardens the V2 loop around any owned coding model:
inspect -> plan -> edit -> test -> observe -> bounded repair -> final verify.

Security/correctness properties:
- workspace-relative paths only, with symlink escape rejection,
- explicit editable path scope,
- explicit argv test-command allowlist (no shell),
- sanitized subprocess environment with no inherited secrets,
- plan required before first edit,
- failed first implementation is not itself counted as a repair,
- repairs count only edits after an observed failed test,
- finish requires a passing test after the most recent edit,
- observations after a passing test do not invalidate that proof,
- no network, arbitrary shell, hidden-test, or secret tool is exposed.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable

CONTRACT = "AVANTIQO_CODE_REPO_AGENT_V3"
MAX_STEPS = 28
MAX_MODEL_CALLS = 14
MAX_REPAIRS = 2
MAX_READ_BYTES = 120_000
MAX_WRITE_BYTES = 250_000
MAX_OBSERVATION_BYTES = 20_000
MAX_COMMAND_SECONDS = 90
SAFE_ENV_KEYS = (
    "PATH",
    "HOME",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL",
    "NODE_PATH",
    "PYTHONPATH",
)

ModelCall = Callable[[str], str]


@dataclass(frozen=True)
class AgentPolicy:
    editable_paths: tuple[str, ...]
    test_commands: dict[str, tuple[str, ...]]
    max_steps: int = MAX_STEPS
    max_model_calls: int = MAX_MODEL_CALLS
    max_repairs: int = MAX_REPAIRS


@dataclass
class AgentState:
    steps: int = 0
    model_calls: int = 0
    repairs: int = 0
    phase: str = "inspect"
    changed_files: set[str] = field(default_factory=set)
    observations: list[dict[str, Any]] = field(default_factory=list)
    phases_seen: list[str] = field(default_factory=list)
    tests_run: int = 0
    tests_passed: int = 0
    edit_generation: int = 0
    verified_generation: int = -1
    failed_generation: int = -1
    plan_seen: bool = False
    finished: bool = False


class AgentContractError(RuntimeError):
    pass


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _bounded_text(value: Any, limit: int = MAX_OBSERVATION_BYTES) -> str:
    data = str(value or "").encode("utf-8")
    if len(data) <= limit:
        return data.decode("utf-8")
    return data[:limit].decode("utf-8", errors="ignore") + "\n...[truncated]"


def _resolve(root: Path, relative: str) -> Path:
    raw = str(relative or "").strip().replace("\\", "/")
    if not raw or raw.startswith("/") or "\x00" in raw:
        raise AgentContractError("INVALID_RELATIVE_PATH")
    candidate = (root / raw).resolve()
    resolved_root = root.resolve()
    try:
        candidate.relative_to(resolved_root)
    except ValueError as exc:
        raise AgentContractError("PATH_ESCAPE_FORBIDDEN") from exc
    return candidate


def _matches_edit_scope(path: str, editable_paths: Iterable[str]) -> bool:
    normalized = path.replace("\\", "/").lstrip("./")
    for allowed in editable_paths:
        rule = str(allowed).replace("\\", "/").lstrip("./").rstrip("/")
        if rule and (normalized == rule or normalized.startswith(rule + "/")):
            return True
    return False


def _safe_test_env() -> dict[str, str]:
    env = {key: os.environ[key] for key in SAFE_ENV_KEYS if key in os.environ}
    env.update(
        {
            "CI": "1",
            "GITHUB_ACTIONS": "false",
            "NO_COLOR": "1",
            "AVANTIQO_CODE_AGENT_SANDBOX": "1",
        }
    )
    return env


def _manifest(root: Path, max_files: int = 800) -> list[dict[str, Any]]:
    ignored = {".git", "node_modules", ".next", "dist", "build", "coverage"}
    files: list[dict[str, Any]] = []
    for path in sorted(root.rglob("*")):
        if any(part in ignored for part in path.parts) or not path.is_file():
            continue
        try:
            resolved = path.resolve()
            resolved.relative_to(root.resolve())
        except (OSError, ValueError):
            continue
        files.append({"path": path.relative_to(root).as_posix(), "bytes": path.stat().st_size})
        if len(files) >= max_files:
            break
    return files


def _system_contract(task: str, policy: AgentPolicy, manifest: list[dict[str, Any]]) -> str:
    return "\n\n".join(
        [
            "AVANTIQO REPOSITORY AGENT V3.",
            "Return exactly one JSON action per turn and no prose outside JSON.",
            "Inspect relevant code, make an explicit plan before the first edit, then implement the smallest correct patch.",
            "Run declared tests after edits. If a test fails, inspect the observation and repair; never guess success.",
            "Finish only after a declared test has passed after the latest edit.",
            "Never request secrets, hidden tests, network access, parent paths, shell commands, or undeclared commands.",
            f"TASK:\n{task}",
            "EDITABLE PATHS:\n" + _json(list(policy.editable_paths)),
            "ALLOWED TEST COMMAND IDS:\n" + _json(sorted(policy.test_commands)),
            "WORKSPACE MANIFEST:\n" + _json(manifest),
            (
                "ACTION SCHEMA: list:{action,path}; read:{action,path}; search:{action,query,path}; "
                "plan:{action,summary}; write:{action,path,content}; test:{action,command_id}; "
                "finish:{action,summary}."
            ),
        ]
    )


def _prompt(base: str, state: AgentState) -> str:
    return "\n\n".join(
        [
            base,
            "STATE:\n"
            + _json(
                {
                    "phase": state.phase,
                    "steps": state.steps,
                    "model_calls": state.model_calls,
                    "repairs": state.repairs,
                    "changed_files": sorted(state.changed_files),
                    "tests_run": state.tests_run,
                    "tests_passed": state.tests_passed,
                    "latest_edit_generation": state.edit_generation,
                    "verified_generation": state.verified_generation,
                }
            ),
            "RECENT OBSERVATIONS:\n" + _json(state.observations[-8:]),
            "Return the next single strict JSON action.",
        ]
    )


def _parse_action(raw: str) -> dict[str, Any]:
    text = str(raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    try:
        value = json.loads(text)
    except json.JSONDecodeError as exc:
        raise AgentContractError("MODEL_ACTION_JSON_REQUIRED") from exc
    if not isinstance(value, dict):
        raise AgentContractError("MODEL_ACTION_OBJECT_REQUIRED")
    kind = str(value.get("action") or "").strip().lower()
    if kind not in {"list", "read", "search", "plan", "write", "test", "finish"}:
        raise AgentContractError(f"MODEL_ACTION_INVALID:{kind}")
    value["action"] = kind
    return value


def _observe(state: AgentState, observation: dict[str, Any]) -> dict[str, Any]:
    state.observations.append(observation)
    state.steps += 1
    return observation


def _execute(root: Path, policy: AgentPolicy, state: AgentState, action: dict[str, Any]) -> dict[str, Any]:
    kind = action["action"]

    if kind == "plan":
        state.plan_seen = True
        state.phase = "plan"
        state.phases_seen.append("plan")
        return _observe(state, {"tool": "plan", "ok": True, "summary": _bounded_text(action.get("summary"), 4000)})

    if kind in {"list", "read", "search"}:
        base = str(action.get("path") or ".")
        target = root if base in {"", "."} else _resolve(root, base)
        state.phases_seen.append("inspect_failure" if state.failed_generation == state.edit_generation else "inspect")
        if state.failed_generation == state.edit_generation:
            state.phase = "inspect_failure"
        elif state.verified_generation != state.edit_generation:
            state.phase = "inspect"

        if kind == "list":
            if not target.is_dir():
                return _observe(state, {"tool": "list", "ok": False, "error": "DIRECTORY_NOT_FOUND", "path": base})
            entries = [{"name": child.name, "type": "dir" if child.is_dir() else "file"} for child in sorted(target.iterdir(), key=lambda x: x.name)[:300]]
            return _observe(state, {"tool": "list", "ok": True, "path": base, "entries": entries})

        if kind == "read":
            if not target.is_file():
                return _observe(state, {"tool": "read", "ok": False, "error": "FILE_NOT_FOUND", "path": base})
            data = target.read_bytes()[:MAX_READ_BYTES]
            return _observe(state, {"tool": "read", "ok": True, "path": base, "content": data.decode("utf-8", errors="replace"), "truncated": target.stat().st_size > len(data)})

        query = str(action.get("query") or "")
        if not query or len(query) > 300:
            raise AgentContractError("SEARCH_QUERY_INVALID")
        if not target.exists():
            return _observe(state, {"tool": "search", "ok": False, "error": "PATH_NOT_FOUND", "path": base})
        matches: list[dict[str, Any]] = []
        candidates = [target] if target.is_file() else target.rglob("*")
        for file in candidates:
            if len(matches) >= 100 or not file.is_file():
                continue
            try:
                resolved = file.resolve()
                resolved.relative_to(root.resolve())
                if file.stat().st_size > MAX_READ_BYTES:
                    continue
                text = file.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError, ValueError):
                continue
            for line_no, line in enumerate(text.splitlines(), 1):
                if query.lower() in line.lower():
                    matches.append({"path": file.relative_to(root).as_posix(), "line": line_no, "text": _bounded_text(line, 1000)})
                    if len(matches) >= 100:
                        break
        return _observe(state, {"tool": "search", "ok": True, "query": query, "matches": matches})

    if kind == "write":
        if not state.plan_seen:
            raise AgentContractError("PLAN_REQUIRED_BEFORE_EDIT")
        path = str(action.get("path") or "")
        if not _matches_edit_scope(path, policy.editable_paths):
            raise AgentContractError(f"WRITE_SCOPE_FORBIDDEN:{path}")
        content = action.get("content")
        if not isinstance(content, str):
            raise AgentContractError("WRITE_CONTENT_STRING_REQUIRED")
        if len(content.encode("utf-8")) > MAX_WRITE_BYTES:
            raise AgentContractError("WRITE_CONTENT_TOO_LARGE")
        target = _resolve(root, path)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and target.is_symlink():
            raise AgentContractError("SYMLINK_WRITE_FORBIDDEN")
        repairing = state.failed_generation == state.edit_generation and state.edit_generation > 0
        if repairing:
            state.repairs += 1
            if state.repairs > policy.max_repairs:
                raise AgentContractError("MAX_REPAIRS_EXCEEDED")
            state.phases_seen.append("bounded_repair")
        target.write_text(content, encoding="utf-8")
        state.edit_generation += 1
        state.changed_files.add(target.relative_to(root).as_posix())
        state.phase = "bounded_repair" if repairing else "edit"
        state.phases_seen.append("edit")
        return _observe(state, {"tool": "write", "ok": True, "path": path, "bytes": len(content.encode("utf-8")), "repair": repairing})

    if kind == "test":
        command_id = str(action.get("command_id") or "")
        argv = policy.test_commands.get(command_id)
        if argv is None or not argv:
            raise AgentContractError(f"TEST_COMMAND_FORBIDDEN:{command_id}")
        if any(not isinstance(part, str) or not part for part in argv):
            raise AgentContractError("TEST_COMMAND_ARGV_INVALID")
        started = time.perf_counter()
        completed = subprocess.run(list(argv), cwd=root, env=_safe_test_env(), capture_output=True, text=True, timeout=MAX_COMMAND_SECONDS, check=False, shell=False)
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        state.tests_run += 1
        state.phases_seen.append("execute_tests")
        passed = completed.returncode == 0
        if passed:
            state.tests_passed += 1
            state.verified_generation = state.edit_generation
            state.failed_generation = -1
            state.phase = "final_verify"
            state.phases_seen.append("final_verify")
        else:
            state.failed_generation = state.edit_generation
            state.phase = "inspect_failure"
            state.phases_seen.append("inspect_failure")
        return _observe(state, {"tool": "test", "ok": passed, "command_id": command_id, "exit_code": completed.returncode, "elapsed_ms": elapsed_ms, "stdout": _bounded_text(completed.stdout), "stderr": _bounded_text(completed.stderr)})

    if kind == "finish":
        if not state.changed_files:
            raise AgentContractError("FINISH_WITHOUT_CHANGE_FORBIDDEN")
        if state.tests_run < 1 or state.verified_generation != state.edit_generation:
            raise AgentContractError("FINISH_REQUIRES_FRESH_PASSING_TEST")
        state.finished = True
        return _observe(state, {"tool": "finish", "ok": True, "summary": _bounded_text(action.get("summary"), 4000)})

    raise AgentContractError(f"UNHANDLED_ACTION:{kind}")


def run_repo_agent(*, workspace: str | Path, task: str, policy: AgentPolicy, model_call: ModelCall) -> dict[str, Any]:
    root = Path(workspace).resolve()
    if not root.is_dir():
        raise AgentContractError("WORKSPACE_DIRECTORY_REQUIRED")
    if not task.strip():
        raise AgentContractError("TASK_REQUIRED")
    if not policy.editable_paths or not policy.test_commands:
        raise AgentContractError("POLICY_SCOPE_AND_TESTS_REQUIRED")

    state = AgentState()
    base = _system_contract(task.strip(), policy, _manifest(root))
    started = time.perf_counter()
    while not state.finished:
        if state.steps >= policy.max_steps:
            raise AgentContractError("MAX_STEPS_EXCEEDED")
        if state.model_calls >= policy.max_model_calls:
            raise AgentContractError("MAX_MODEL_CALLS_EXCEEDED")
        raw = model_call(_prompt(base, state))
        state.model_calls += 1
        _execute(root, policy, state, _parse_action(raw))

    return {
        "contract": CONTRACT,
        "status": "completed",
        "changed_files": sorted(state.changed_files),
        "steps": state.steps,
        "model_calls": state.model_calls,
        "repairs": state.repairs,
        "tests_run": state.tests_run,
        "tests_passed": state.tests_passed,
        "agent_phases": list(dict.fromkeys(state.phases_seen)),
        "wall_ms": round((time.perf_counter() - started) * 1000),
        "bounded": True,
        "sanitized_test_environment": True,
        "fresh_final_test_required": True,
        "plan_before_edit_required": True,
        "network_tool_exposed": False,
        "arbitrary_shell_exposed": False,
        "hidden_test_tool_exposed": False,
        "secret_tool_exposed": False,
    }
