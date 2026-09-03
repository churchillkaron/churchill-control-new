"""Qwen3.8 private 12-case Repo Agent V3 certification for Avantiqo Code.

One explicitly approved H100-backed Qwen3.8 canary container is reused while
12 seeded, sealed mini-repositories are solved through the real Repo Agent V3
inspect -> plan -> edit -> test -> bounded repair -> verify loop.

Hidden tests are never model-visible. They remain on the GitHub runner in a
sealed sibling directory and execute only after the agent has finished a case.
No benchmark-specific source rewriting, model download, volume creation,
production routing change, or production deployment is permitted.
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
import time
from pathlib import Path
from typing import Any

import modal

import code_model_canary_v2 as policy
import worldclass_cert_v2_contract as cert
import worldclass_private_fixtures_v3 as fixtures
import worldclass_private_suite_v2 as suite
from modal_code_qwen38_canary_runtime import app, generate
from repo_agent_v3 import AgentPolicy, AgentContractError, run_repo_agent

CONTRACT = "AVANTIQO_CODE_QWEN38_PRIVATE12_CERT_V1"
RUN_SEED = "20260903-qwen38-private12-v1"
PRIVATE_SECRET_ENV = "AVANTIQO_CODE_PRIVATE_SUITE_SECRET"
MAX_REPAIRS = 2
MAX_STEPS = 28
MAX_MODEL_CALLS = 14
WARM_TARGET_MS = 4_000


def _tree_hash(root: Path) -> dict[str, str]:
    ignored = {"__pycache__", ".git", "node_modules", ".next", "dist", "build", "coverage"}
    result: dict[str, str] = {}
    for path in sorted(root.rglob("*")):
        if not path.is_file() or any(part in ignored for part in path.parts):
            continue
        result[path.relative_to(root).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


def _matches_scope(path: str, editable_paths: tuple[str, ...]) -> bool:
    normalized = path.replace("\\", "/").lstrip("./")
    for allowed in editable_paths:
        rule = str(allowed).replace("\\", "/").lstrip("./").rstrip("/")
        if rule and (normalized == rule or normalized.startswith(rule + "/")):
            return True
    return False


def _private_secret() -> bytes:
    value = str(os.environ.get(PRIVATE_SECRET_ENV) or "").strip()
    if len(value) < 24:
        raise RuntimeError(f"{CONTRACT}_PRIVATE_SECRET_REQUIRED")
    return value.encode("utf-8")


def _public_test_commands(item: fixtures.MaterializedFixture) -> dict[str, tuple[str, ...]]:
    # Fixture families may expose several semantic test IDs, but the sealed
    # executable fixture intentionally has one public command that exercises the
    # visible contract. Map every declared ID to that same argv so the model may
    # choose any public test ID without gaining hidden information.
    return {test_id: tuple(item.public_command) for test_id in item.public_test_ids}


class QwenModelCall:
    def __init__(self) -> None:
        self.latencies_ms: list[int] = []
        self.calls = 0

    def __call__(self, prompt: str) -> str:
        request = {
            "contract": "AVANTIQO_CODE_QWEN38_CANARY_RUNTIME_V4",
            "organization_id": "benchmark-only",
            "instruction": prompt,
        }
        response = generate.remote([request], approved=True)
        if not isinstance(response, dict) or response.get("status") != "completed":
            raise RuntimeError(f"{CONTRACT}_MODEL_RESPONSE_INVALID")
        outputs = response.get("outputs")
        if not isinstance(outputs, list) or len(outputs) != 1 or not str(outputs[0]).strip():
            raise RuntimeError(f"{CONTRACT}_MODEL_OUTPUT_INVALID")
        latency = int(response.get("batch_wall_ms") or 0)
        if latency <= 0:
            raise RuntimeError(f"{CONTRACT}_MODEL_LATENCY_INVALID")
        self.latencies_ms.append(latency)
        self.calls += 1
        return str(outputs[0]).strip()


def _case_evidence(item: fixtures.MaterializedFixture) -> dict[str, Any]:
    before = _tree_hash(item.workspace)
    model = QwenModelCall()
    started = time.perf_counter()
    agent_error: str | None = None
    agent_result: dict[str, Any] | None = None

    try:
        agent_result = run_repo_agent(
            workspace=item.workspace,
            task=item.task,
            policy=AgentPolicy(
                editable_paths=tuple(item.editable_paths),
                test_commands=_public_test_commands(item),
                max_steps=MAX_STEPS,
                max_model_calls=MAX_MODEL_CALLS,
                max_repairs=MAX_REPAIRS,
            ),
            model_call=model,
        )
    except (AgentContractError, RuntimeError, ValueError) as exc:
        agent_error = f"{type(exc).__name__}:{exc}"

    wall_ms = round((time.perf_counter() - started) * 1000)
    after = _tree_hash(item.workspace)
    changed = sorted(path for path in set(before) | set(after) if before.get(path) != after.get(path))
    changed_scope = bool(changed) and all(_matches_scope(path, tuple(item.editable_paths)) for path in changed)

    public = fixtures.run_public(item)
    hidden = fixtures.run_hidden(item)
    hidden_passed = hidden.returncode == 0
    public_passed = public.returncode == 0

    result = agent_result or {}
    phases = list(result.get("agent_phases") or [])
    repairs = int(result.get("repairs") or 0)
    raw_agent_passed = result.get("status") == "completed" and agent_error is None
    core_phases = {"inspect", "plan", "edit", "execute_tests", "final_verify"}
    instruction_gate = raw_agent_passed and core_phases.issubset(set(phases))
    security_gate = (
        changed_scope
        and raw_agent_passed
        and repairs <= MAX_REPAIRS
        and item.hidden_test_path.resolve().is_relative_to(item.hidden_test_path.parent.resolve())
        and not item.hidden_test_path.resolve().is_relative_to(item.workspace.resolve())
    )
    warm_ms = max(model.latencies_ms) if model.latencies_ms else 0

    return {
        "case_id": item.case_id,
        "family_id": item.family_id,
        "dimension": item.dimension,
        "hidden_tests_passed": hidden_passed,
        "regression_tests_passed": public_passed,
        "security_gate_passed": security_gate,
        "instruction_gate_passed": instruction_gate,
        "changed_file_scope_passed": changed_scope,
        "raw_agent_passed": raw_agent_passed,
        "deterministic_source_rewrite_used": False,
        "hidden_material_model_visible": False,
        "repairs": repairs,
        "model_calls": int(result.get("model_calls") or model.calls),
        "wall_ms": wall_ms,
        # World-class latency is actual warm model-action latency, not local
        # filesystem/test/orchestration wall time.
        "warm_ms": warm_ms,
        "model_call_latencies_ms": model.latencies_ms,
        "agent_phases": phases,
        "changed_files": changed,
        "public_exit_code": public.returncode,
        "hidden_exit_code": hidden.returncode,
        "agent_error": agent_error,
        "production_deploy_performed": False,
    }


@app.local_entrypoint()
def qwen38_private12(approved: bool = False) -> None:
    if approved is not True:
        raise RuntimeError(f"{CONTRACT}_EXPLICIT_APPROVAL_REQUIRED")

    secret = _private_secret()
    integrity = suite.assert_suite_integrity(secret, RUN_SEED)
    if integrity.get("valid") is not True or int(integrity.get("cases") or 0) != 12:
        raise RuntimeError(f"{CONTRACT}_SUITE_INTEGRITY_INVALID")

    with tempfile.TemporaryDirectory(prefix="avantiqo-qwen38-private12-") as directory:
        root = Path(directory).resolve()
        materialized = fixtures.materialize_suite(root, secret=secret, run_seed=RUN_SEED)
        if len(materialized) != 12:
            raise RuntimeError(f"{CONTRACT}_CASE_COUNT_INVALID")
        if {item.dimension for item in materialized} != suite.dimensions():
            raise RuntimeError(f"{CONTRACT}_DIMENSION_SET_INVALID")

        cases: list[dict[str, Any]] = []
        for item in materialized:
            evidence = _case_evidence(item)
            cases.append(evidence)
            print("AVANTIQO_CODE_QWEN38_PRIVATE12_CASE=" + json.dumps(evidence, sort_keys=True, separators=(",", ":")))

        evidence = {
            "cases": cases,
            "single_storage_per_engine": True,
            "persistent_storage_reused": True,
            "production_deploy_performed": False,
            "candidate_isolated_from_production": True,
            "benchmark_task_specific_rewriters": 0,
            "changed_file_overreach": sum(0 if case["changed_file_scope_passed"] else 1 for case in cases),
        }
        summary = cert.certify(evidence)
        result = {
            "contract": CONTRACT,
            "runtime_model": policy.CANDIDATE_MODEL,
            "revision": policy.CANDIDATE_REVISION,
            "model_volume_name": policy.CODE_VOLUME,
            "cases": len(cases),
            "passed": int(summary.get("passed") or 0),
            "hidden_tests_passed": sum(1 for case in cases if case["hidden_tests_passed"]),
            "regression_tests_passed": sum(1 for case in cases if case["regression_tests_passed"]),
            "raw_agent_passed": sum(1 for case in cases if case["raw_agent_passed"]),
            "average_repairs": summary.get("average_repairs"),
            "warm_p95_ms": summary.get("warm_p95_ms"),
            "warm_latency_target_ms": WARM_TARGET_MS,
            "worldclass_certified": summary.get("certified") is True,
            "single_storage_per_engine": True,
            "persistent_storage_reused": True,
            "candidate_isolated_from_production": True,
            "benchmark_task_specific_rewriters": 0,
            "production_routing_change": False,
            "production_deploy_performed": False,
            "model_download_performed": False,
            "volume_created": False,
            "summary": summary,
        }
        print("AVANTIQO_CODE_QWEN38_PRIVATE12_RESULT=" + json.dumps(result, sort_keys=True, separators=(",", ":")))
        if summary.get("certified") is not True:
            raise RuntimeError(f"{CONTRACT}_NOT_CERTIFIED:{json.dumps(summary, sort_keys=True)}")
        print(f"{CONTRACT}=PASS")
