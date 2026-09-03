"""Sealed repo-level benchmark runner for Avantiqo Code World-Class V2.

This module turns the private-suite design into an enforceable execution
boundary without embedding benchmark answers into model-visible prompts.

The model receives only:
- the public task,
- a public workspace,
- declared editable paths,
- declared public test command IDs.

Hidden tests live in a sibling sealed directory outside the workspace. They are
executed only after the repository agent has finished. The model callback never
receives hidden paths, hidden assertions, expected patches, or hidden output.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping

from repo_agent_v3 import AgentPolicy, run_repo_agent

CONTRACT = "AVANTIQO_CODE_PRIVATE_RUNNER_V2"
MAX_HIDDEN_SECONDS = 90
MAX_HIDDEN_OUTPUT_BYTES = 20_000

ModelCall = Callable[[str], str]


@dataclass(frozen=True)
class PrivateCaseSpec:
    case_id: str
    dimension: str
    public_goal: str
    public_files: Mapping[str, str]
    editable_paths: tuple[str, ...]
    public_test_commands: Mapping[str, tuple[str, ...]]
    hidden_files: Mapping[str, str]
    hidden_command: tuple[str, ...]


class PrivateRunnerError(RuntimeError):
    pass


def _safe_relative(value: str) -> str:
    raw = str(value or "").strip().replace("\\", "/")
    if not raw or raw.startswith("/") or "\x00" in raw:
        raise PrivateRunnerError("PRIVATE_PATH_INVALID")
    parts = [part for part in raw.split("/") if part not in {"", "."}]
    if not parts or any(part == ".." for part in parts):
        raise PrivateRunnerError("PRIVATE_PATH_ESCAPE_FORBIDDEN")
    return "/".join(parts)


def _write_files(root: Path, files: Mapping[str, str]) -> None:
    for relative, content in files.items():
        path = root / _safe_relative(relative)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(str(content), encoding="utf-8")


def _hash_tree(root: Path) -> dict[str, str]:
    ignored = {".git", "node_modules", ".next", "dist", "build", "coverage", "__pycache__"}
    result: dict[str, str] = {}
    for path in sorted(root.rglob("*")):
        if not path.is_file() or any(part in ignored for part in path.parts):
            continue
        relative = path.relative_to(root).as_posix()
        result[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


def _matches_scope(path: str, editable_paths: tuple[str, ...]) -> bool:
    normalized = _safe_relative(path)
    for allowed in editable_paths:
        rule = _safe_relative(allowed).rstrip("/")
        if normalized == rule or normalized.startswith(rule + "/"):
            return True
    return False


def _hidden_env() -> dict[str, str]:
    keep = ("PATH", "HOME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "NODE_PATH", "PYTHONPATH")
    env = {key: os.environ[key] for key in keep if key in os.environ}
    env.update(
        {
            "CI": "1",
            "NO_COLOR": "1",
            "AVANTIQO_CODE_HIDDEN_RUNNER": "1",
        }
    )
    return env


def _bounded(value: str) -> str:
    encoded = str(value or "").encode("utf-8")
    if len(encoded) <= MAX_HIDDEN_OUTPUT_BYTES:
        return encoded.decode("utf-8", errors="replace")
    return encoded[:MAX_HIDDEN_OUTPUT_BYTES].decode("utf-8", errors="replace") + "\n...[truncated]"


def validate_spec(spec: PrivateCaseSpec) -> None:
    if not spec.case_id.strip() or not spec.dimension.strip() or not spec.public_goal.strip():
        raise PrivateRunnerError("PRIVATE_CASE_IDENTITY_REQUIRED")
    if not spec.public_files or not spec.editable_paths or not spec.public_test_commands:
        raise PrivateRunnerError("PRIVATE_PUBLIC_FIXTURE_REQUIRED")
    if not spec.hidden_files or not spec.hidden_command:
        raise PrivateRunnerError("PRIVATE_HIDDEN_FIXTURE_REQUIRED")
    public_paths = {_safe_relative(path) for path in spec.public_files}
    hidden_paths = {_safe_relative(path) for path in spec.hidden_files}
    if public_paths & hidden_paths:
        raise PrivateRunnerError("PRIVATE_PUBLIC_HIDDEN_PATH_COLLISION")
    for editable in spec.editable_paths:
        _safe_relative(editable)
    for argv in spec.public_test_commands.values():
        if not argv or any(not isinstance(part, str) or not part for part in argv):
            raise PrivateRunnerError("PRIVATE_PUBLIC_COMMAND_INVALID")
    if any(not isinstance(part, str) or not part for part in spec.hidden_command):
        raise PrivateRunnerError("PRIVATE_HIDDEN_COMMAND_INVALID")


def run_private_case(
    *,
    spec: PrivateCaseSpec,
    model_call: ModelCall,
    max_steps: int = 28,
    max_model_calls: int = 14,
    max_repairs: int = 2,
) -> dict[str, Any]:
    """Run one public repo-agent task, then score sealed hidden tests.

    Hidden material is never copied into the public workspace. The hidden
    process receives the public workspace path through an environment variable
    only after model interaction has ended.
    """
    validate_spec(spec)
    started = time.perf_counter()
    with tempfile.TemporaryDirectory(prefix="avantiqo-code-public-") as public_tmp, tempfile.TemporaryDirectory(
        prefix="avantiqo-code-sealed-"
    ) as hidden_tmp:
        public_root = Path(public_tmp).resolve()
        hidden_root = Path(hidden_tmp).resolve()
        if public_root.parent == hidden_root or hidden_root.parent == public_root:
            raise PrivateRunnerError("PRIVATE_SEALED_DIRECTORY_RELATION_INVALID")
        _write_files(public_root, spec.public_files)
        _write_files(hidden_root, spec.hidden_files)

        before = _hash_tree(public_root)
        hidden_before = _hash_tree(hidden_root)
        policy = AgentPolicy(
            editable_paths=tuple(spec.editable_paths),
            test_commands={key: tuple(value) for key, value in spec.public_test_commands.items()},
            max_steps=max_steps,
            max_model_calls=max_model_calls,
            max_repairs=max_repairs,
        )
        agent_result = run_repo_agent(
            workspace=public_root,
            task=spec.public_goal,
            policy=policy,
            model_call=model_call,
        )
        if agent_result.get("status") != "completed":
            raise PrivateRunnerError("PRIVATE_AGENT_NOT_COMPLETED")

        after = _hash_tree(public_root)
        changed = sorted(path for path in set(before) | set(after) if before.get(path) != after.get(path))
        changed_scope_passed = bool(changed) and all(_matches_scope(path, spec.editable_paths) for path in changed)

        if _hash_tree(hidden_root) != hidden_before:
            raise PrivateRunnerError("PRIVATE_HIDDEN_FIXTURE_CHANGED_BEFORE_SCORE")

        hidden_env = _hidden_env()
        hidden_env["AVANTIQO_CODE_PUBLIC_WORKSPACE"] = str(public_root)
        hidden_started = time.perf_counter()
        hidden = subprocess.run(
            list(spec.hidden_command),
            cwd=hidden_root,
            env=hidden_env,
            capture_output=True,
            text=True,
            timeout=MAX_HIDDEN_SECONDS,
            check=False,
            shell=False,
        )
        hidden_ms = round((time.perf_counter() - hidden_started) * 1000)
        hidden_tests_passed = hidden.returncode == 0

        if _hash_tree(hidden_root) != hidden_before:
            raise PrivateRunnerError("PRIVATE_HIDDEN_FIXTURE_MUTATED")

        wall_ms = round((time.perf_counter() - started) * 1000)
        result = {
            "contract": CONTRACT,
            "case_id": spec.case_id,
            "dimension": spec.dimension,
            "status": "completed",
            "raw_agent_passed": agent_result.get("status") == "completed",
            "hidden_tests_passed": hidden_tests_passed,
            "changed_file_scope_passed": changed_scope_passed,
            "changed_files": changed,
            "repairs": int(agent_result.get("repairs") or 0),
            "model_calls": int(agent_result.get("model_calls") or 0),
            "agent_phases": list(agent_result.get("agent_phases") or []),
            "wall_ms": wall_ms,
            "warm_ms": wall_ms,
            "hidden_wall_ms": hidden_ms,
            "hidden_exit_code": hidden.returncode,
            "hidden_stdout": _bounded(hidden.stdout),
            "hidden_stderr": _bounded(hidden.stderr),
            "hidden_material_model_visible": False,
            "hidden_material_copied_into_workspace": False,
            "deterministic_source_rewrite_used": False,
            "production_deploy_performed": False,
        }
        return result


def model_safe_case_manifest(spec: PrivateCaseSpec) -> dict[str, Any]:
    """Metadata that may be shown to a model/controller; no hidden material."""
    validate_spec(spec)
    return {
        "case_id": spec.case_id,
        "dimension": spec.dimension,
        "public_goal": spec.public_goal,
        "editable_paths": list(spec.editable_paths),
        "public_test_command_ids": sorted(spec.public_test_commands),
        "hidden_material_model_visible": False,
    }


def assert_no_hidden_leak(spec: PrivateCaseSpec) -> None:
    encoded = json.dumps(model_safe_case_manifest(spec), sort_keys=True)
    for path, content in spec.hidden_files.items():
        if _safe_relative(path) in encoded or str(content) in encoded:
            raise PrivateRunnerError("PRIVATE_HIDDEN_MATERIAL_LEAKED")
    for part in spec.hidden_command:
        if str(part) in encoded:
            raise PrivateRunnerError("PRIVATE_HIDDEN_COMMAND_LEAKED")
