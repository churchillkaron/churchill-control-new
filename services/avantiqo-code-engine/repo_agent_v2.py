"""Bounded repository agent core for Avantiqo Code V2.

The owned model remains the reasoning/generation engine. This module provides the
missing deterministic execution loop around it: inspect -> plan -> edit -> test
-> observe -> bounded repair -> final verify.

It is deliberately provider/model agnostic and does not know hidden benchmark
material. A caller supplies a model function and an isolated workspace. All
filesystem and command activity is constrained to that workspace and an explicit
command allowlist.
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

CONTRACT = "AVANTIQO_CODE_REPO_AGENT_V2"
MAX_STEPS = 24
MAX_MODEL_CALLS = 12
MAX_REPAIRS = 2
MAX_READ_BYTES = 120_000
MAX_WRITE_BYTES = 250_000
MAX_OBSERVATION_BYTES = 20_000
MAX_COMMAND_SECONDS = 90

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
    finished: bool = False


class AgentContractError(RuntimeError):
    pass


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _bounded_text(value: Any, limit: int = MAX_OBSERVATION_BYTES) -> str:
    text = str(value or "")
    if len(text.encode("utf-8")) <= limit:
        return text
    encoded = text.encode("utf-8")[:limit]
    return encoded.decode("utf-8", errors="ignore") + "\n...[truncated]"


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
        if not rule:
            continue
        if normalized == rule or normalized.startswith(rule + "/"):
            return True
    return False


def _workspace_manifest(root: Path, max_files: int = 800) -> list[dict[str, Any]]:
    ignored = {".git", "node_modules", ".next", "dist", "build", "coverage"}
    files: list[dict[str, Any]] = []
    for path in sorted(root.rglob("*")):
        if any(part in ignored for part in path.parts):
            continue
        if not path.is_file():
            continue
        relative = path.relative_to(root).as_posix()
        stat = path.stat()
        files.append({"path": relative, "bytes": stat.st_size})
        if len(files) >= max_files:
            break
    return files


def _system_contract(task: str, policy: AgentPolicy, manifest: list[dict[str, Any]]) -> str:
    command_ids = sorted(policy.test_commands)
    return "\n\n".join(
        [
            "AVANTIQO REPOSITORY AGENT V2.",
            "Work only through the declared JSON action protocol. Do not output prose outside JSON.",
            "Do not claim success until tests have actually been executed after the final edit.",
            "Never request hidden tests, secrets, network access, parent paths, or undeclared commands.",
            "Prefer the smallest correct patch. Preserve existing behavior outside the task contract.",
            f"TASK:\n{task}",
            "EDITABLE PATHS:\n" + _json(list(policy.editable_paths)),
            "ALLOWED TEST COMMAND IDS:\n" + _json(command_ids),
            "WORKSPACE MANIFEST:\n" + _json(manifest),
            (
                "ACTION SCHEMA: one strict JSON object. action is one of "
                "list, read, search, write, test, plan, finish. "
                "list:{action,path}; read:{action,path}; search:{action,query,path}; "
                "write:{action,path,content}; test:{action,command_id}; "
                "plan:{action,summary}; finish:{action,summary}."
            ),
        ]
    )


def _observation_prompt(base: str, state: AgentState) -> str:
    tail = state.observations[-8:]
    return "\n\n".join(
        [
            base,
            "CURRENT AGENT STATE:\n"
            + _json(
                {
                    "phase": state.phase,
                    "steps": state.steps,
                    "model_calls": state.model_calls,
                    "repairs": state.repairs,
                    "changed_files": sorted(state.changed_files),
                    "tests_run": state.tests_run,
                    "tests_passed": state.tests_passed,
                }
            ),
            "RECENT TOOL OBSERVATIONS:\n" + _json(tail),
            "Return the next single action as strict JSON.",
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
    action = str(value.get("action") or "").strip().lower()
    if action not in {"list", "read", "search", "write", "test", "plan", "finish"}:
        raise AgentContractError(f"MODEL_ACTION_INVALID:{action}")
    value["action"] = action
    return value


def _execute_action(root: Path, policy: AgentPolicy, state: AgentState, action: dict[str, Any]) -> dict[str, Any]:
    kind = action["action"]
    if kind == "plan":
        state.phase = "plan"
        state.phases_seen.append("plan")
        return {"tool": "plan", "ok": True, "summary": _bounded_text(action.get("summary"), 4000)}

    if kind == "list":
        path = str(action.get("path") or ".")
        target = root if path in {"", "."} else _resolve(root, path)
        if not target.is_dir():
            return {"tool": "list", "ok": False, "error": "DIRECTORY_NOT_FOUND", "path": path}
        entries = []
        for child in sorted(target.iterdir(), key=lambda item: item.name)[:300]:
            entries.append({"name": child.name, "type": "dir" if child.is_dir() else "file"})
        state.phase = "inspect"
        state.phases_seen.append("inspect")
        return {"tool": "list", "ok": True, "path": path, "entries": entries}

    if kind == "read":
        path = str(action.get("path") or "")
        target = _resolve(root, path)
        if not target.is_file():
            return {"tool": "read", "ok": False, "error": "FILE_NOT_FOUND", "path": path}
        data = target.read_bytes()
        if len(data) > MAX_READ_BYTES:
            data = data[:MAX_READ_BYTES]
        state.phase = "inspect"
        state.phases_seen.append("inspect")
        return {
            "tool": "read",
            "ok": True,
            "path": path,
            "content": data.decode("utf-8", errors="replace"),
            "truncated": target.stat().st_size > len(data),
        }

    if kind == "search":
        query = str(action.get("query") or "")
        if not query or len(query) > 300:
            raise AgentContractError("SEARCH_QUERY_INVALID")
        base = str(action.get("path") or ".")
        target = root if base == "." else _resolve(root, base)
        if not target.exists():
            return {"tool": "search", "ok": False, "error": "PATH_NOT_FOUND", "path": base}
        matches: list[dict[str, Any]] = []
        candidates = [target] if target.is_file() else target.rglob("*")
        for file in candidates:
            if len(matches) >= 100:
                break
            if not file.is_file() or file.stat().st_size > MAX_READ_BYTES:
                continue
            try:
                text = file.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            for line_no, line in enumerate(text.splitlines(), start=1):
                if query.lower() in line.lower():
                    matches.append(
                        {
                            "path": file.relative_to(root).as_posix(),
                            "line": line_no,
                            "text": _bounded_text(line, 1000),
                        }
                    )
                    if len(matches) >= 100:
                        break
        state.phase = "inspect"
        state.phases_seen.append("inspect")
        return {"tool": "search", "ok": True, "query": query, "matches": matches}

    if kind == "write":
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
        target.write_text(content, encoding="utf-8")
        state.changed_files.add(target.relative_to(root).as_posix())
        state.phase = "edit"
        state.phases_seen.append("edit")
        return {"tool": "write", "ok": True, "path": path, "bytes": len(content.encode("utf-8"))}

    if kind == "test":
        command_id = str(action.get("command_id") or "")
        argv = policy.test_commands.get(command_id)
        if argv is None or not argv:
            raise AgentContractError(f"TEST_COMMAND_FORBIDDEN:{command_id}")
        started = time.perf_counter()
        completed = subprocess.run(
            list(argv),
            cwd=root,
            env={**os.environ, "CI": "1"},
            capture_output=True,
            text=True,
            timeout=MAX_COMMAND_SECONDS,
            check=False,
        )
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        state.tests_run += 1
        passed = completed.returncode == 0
        if passed:
            state.tests_passed += 1
            state.phase = "final_verify"
            state.phases_seen.extend(("execute_tests", "final_verify"))
        else:
            if state.phase in {"edit", "final_verify", "inspect_failure", "bounded_repair"}:
                state.repairs += 1
                if state.repairs > policy.max_repairs:
                    raise AgentContractError("MAX_REPAIRS_EXCEEDED")
                state.phase = "inspect_failure"
                state.phases_seen.extend(("execute_tests", "inspect_failure", "bounded_repair"))
            else:
                state.phase = "inspect_failure"
                state.phases_seen.extend(("execute_tests", "inspect_failure"))
        return {
            "tool": "test",
            "ok": passed,
            "command_id": command_id,
            "exit_code": completed.returncode,
            "elapsed_ms": elapsed_ms,
            "stdout": _bounded_text(completed.stdout),
            "stderr": _bounded_text(completed.stderr),
        }

    if kind == "finish":
        if not state.changed_files:
            raise AgentContractError("FINISH_WITHOUT_CHANGE_FORBIDDEN")
        if state.tests_run < 1 or state.tests_passed < 1 or state.phase != "final_verify":
            raise AgentContractError("FINISH_REQUIRES_PASSING_FINAL_TEST")
        state.finished = True
        return {"tool": "finish", "ok": True, "summary": _bounded_text(action.get("summary"), 4000)}

    raise AgentContractError(f"UNHANDLED_ACTION:{kind}")


def run_repo_agent(
    *,
    workspace: str | Path,
    task: str,
    policy: AgentPolicy,
    model_call: ModelCall,
) -> dict[str, Any]:
    root = Path(workspace).resolve()
    if not root.is_dir():
        raise AgentContractError("WORKSPACE_DIRECTORY_REQUIRED")
    if not task.strip():
        raise AgentContractError("TASK_REQUIRED")
    if not policy.editable_paths:
        raise AgentContractError("EDITABLE_PATHS_REQUIRED")
    if not policy.test_commands:
        raise AgentContractError("TEST_COMMANDS_REQUIRED")

    state = AgentState()
    base = _system_contract(task.strip(), policy, _workspace_manifest(root))
    started = time.perf_counter()

    while not state.finished:
        if state.steps >= policy.max_steps:
            raise AgentContractError("MAX_STEPS_EXCEEDED")
        if state.model_calls >= policy.max_model_calls:
            raise AgentContractError("MAX_MODEL_CALLS_EXCEEDED")

        prompt = _observation_prompt(base, state)
        raw = model_call(prompt)
        state.model_calls += 1
        action = _parse_action(raw)
        observation = _execute_action(root, policy, state, action)
        state.steps += 1
        state.observations.append(observation)

    phases = tuple(dict.fromkeys(state.phases_seen))
    return {
        "contract": CONTRACT,
        "status": "completed",
        "changed_files": sorted(state.changed_files),
        "steps": state.steps,
        "model_calls": state.model_calls,
        "repairs": state.repairs,
        "tests_run": state.tests_run,
        "tests_passed": state.tests_passed,
        "agent_phases": list(phases),
        "wall_ms": round((time.perf_counter() - started) * 1000),
        "bounded": True,
        "network_tool_exposed": False,
        "arbitrary_shell_exposed": False,
        "hidden_test_tool_exposed": False,
    }
