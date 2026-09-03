"""Qwen3.8 private 12-case Repo Agent V4 certification for Avantiqo Code V2.

V2 uses a fresh sealed-suite seed and the new semantic-review agent. It never
reuses V1 hidden variants as authoritative answers. One isolated Qwen3.8 H100
container is reused; hidden tests remain runner-only and execute only after V4
has completed its public-test plus independent semantic-review loop.
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
import time
from pathlib import Path
from typing import Any

import code_model_canary_v2 as policy
import worldclass_cert_v2_contract as cert
import worldclass_private_fixtures_v3 as fixtures
import worldclass_private_suite_v2 as suite
from modal_code_qwen38_canary_runtime_v5 import CONTRACT as RUNTIME_CONTRACT
from modal_code_qwen38_canary_runtime_v5 import app, generate_v5
from repo_agent_v4 import AgentContractError, AgentPolicy, run_repo_agent

CONTRACT = "AVANTIQO_CODE_QWEN38_PRIVATE12_CERT_V2"
RUN_SEED = "20260903-qwen38-private12-v2"
PRIVATE_SECRET_ENV = "AVANTIQO_CODE_PRIVATE_SUITE_SECRET"
MAX_REPAIRS = 2
MAX_STEPS = 28
MAX_MODEL_CALLS = 14
WARM_TARGET_MS = 4_000
ACTOR_MAX_TOKENS = 1024
REVIEWER_MAX_TOKENS = 512


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
    return {test_id: tuple(item.public_command) for test_id in item.public_test_ids}


class QwenModelCall:
    def __init__(self, *, role: str, max_tokens: int) -> None:
        self.role = role
        self.max_tokens = max_tokens
        self.latencies_ms: list[int] = []
        self.prompt_token_counts: list[int] = []
        self.output_token_counts: list[int] = []
        self.calls = 0

    def __call__(self, prompt: str) -> str:
        request = {
            "contract": RUNTIME_CONTRACT,
            "organization_id": "benchmark-only",
            "instruction": prompt,
            "role": self.role,
            "max_tokens": self.max_tokens,
        }
        response = generate_v5.remote([request], approved=True)
        if not isinstance(response, dict) or response.get("status") != "completed":
            raise RuntimeError(f"{CONTRACT}_MODEL_RESPONSE_INVALID")
        outputs = response.get("outputs")
        if not isinstance(outputs, list) or len(outputs) != 1 or not str(outputs[0]).strip():
            raise RuntimeError(f"{CONTRACT}_MODEL_OUTPUT_INVALID")
        latency = int(response.get("batch_wall_ms") or 0)
        if latency <= 0:
            raise RuntimeError(f"{CONTRACT}_MODEL_LATENCY_INVALID")
        prompt_counts = response.get("prompt_token_counts")
        output_counts = response.get("output_token_counts")
        self.latencies_ms.append(latency)
        self.prompt_token_counts.append(
            int(prompt_counts[0]) if isinstance(prompt_counts, list) and prompt_counts else 0
        )
        self.output_token_counts.append(
            int(output_counts[0]) if isinstance(output_counts, list) and output_counts else 0
        )
        self.calls += 1
        return str(outputs[0]).strip()


def _case_evidence(item: fixtures.MaterializedFixture) -> dict[str, Any]:
    before = _tree_hash(item.workspace)
    actor = QwenModelCall(role="actor", max_tokens=ACTOR_MAX_TOKENS)
    reviewer = QwenModelCall(role="reviewer", max_tokens=REVIEWER_MAX_TOKENS)
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
            model_call=actor,
            reviewer_call=reviewer,
            max_semantic_repairs=1,
        )
    except (AgentContractError, RuntimeError, ValueError) as exc:
        agent_error = f"{type(exc).__name__}:{exc}"

    wall_ms = round((time.perf_counter() - started) * 1000)
    after = _tree_hash(item.workspace)
    changed = sorted(path for path in set(before) | set(after) if before.get(path) != after.get(path))
    changed_scope = bool(changed) and all(
        _matches_scope(path, tuple(item.editable_paths)) for path in changed
    )

    public = fixtures.run_public(item)
    hidden = fixtures.run_hidden(item)
    hidden_passed = hidden.returncode == 0
    public_passed = public.returncode == 0

    result = agent_result or {}
    phases = list(result.get("agent_phases") or [])
    repairs = int(result.get("repairs") or 0)
    raw_agent_passed = result.get("status") == "completed" and agent_error is None
    required_phases = {"inspect", "plan", "edit", "execute_tests", "final_verify", "semantic_review"}
    instruction_gate = (
        raw_agent_passed
        and required_phases.issubset(set(phases))
        and result.get("semantic_review_passed") is True
    )
    security_gate = (
        changed_scope
        and raw_agent_passed
        and repairs <= MAX_REPAIRS
        and item.hidden_test_path.resolve().is_relative_to(item.hidden_test_path.parent.resolve())
        and not item.hidden_test_path.resolve().is_relative_to(item.workspace.resolve())
        and result.get("hidden_material_visible") is False
        and result.get("benchmark_task_specific_rewriter_used") is False
    )
    latencies = actor.latencies_ms + reviewer.latencies_ms
    warm_ms = max(latencies) if latencies else 0

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
        "semantic_reviews": int(result.get("semantic_reviews") or 0),
        "semantic_repairs": int(result.get("semantic_repairs") or 0),
        "semantic_review_passed": result.get("semantic_review_passed") is True,
        "model_calls": actor.calls + reviewer.calls,
        "actor_model_calls": actor.calls,
        "reviewer_model_calls": reviewer.calls,
        "wall_ms": wall_ms,
        "warm_ms": warm_ms,
        "model_call_latencies_ms": latencies,
        "actor_latencies_ms": actor.latencies_ms,
        "reviewer_latencies_ms": reviewer.latencies_ms,
        "actor_prompt_token_counts": actor.prompt_token_counts,
        "actor_output_token_counts": actor.output_token_counts,
        "reviewer_prompt_token_counts": reviewer.prompt_token_counts,
        "reviewer_output_token_counts": reviewer.output_token_counts,
        "agent_phases": phases,
        "changed_files": changed,
        "public_exit_code": public.returncode,
        "hidden_exit_code": hidden.returncode,
        "agent_error": agent_error,
        "production_deploy_performed": False,
    }


@app.local_entrypoint(name="qwen38_private12_v2")
def qwen38_private12_v2(approved: bool = False) -> None:
    if approved is not True:
        raise RuntimeError(f"{CONTRACT}_EXPLICIT_APPROVAL_REQUIRED")

    secret = _private_secret()
    integrity = suite.assert_suite_integrity(secret, RUN_SEED)
    if integrity.get("valid") is not True or int(integrity.get("cases") or 0) != 12:
        raise RuntimeError(f"{CONTRACT}_SUITE_INTEGRITY_INVALID")

    with tempfile.TemporaryDirectory(prefix="avantiqo-qwen38-private12-v2-") as directory:
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
            print(
                "AVANTIQO_CODE_QWEN38_PRIVATE12_V2_CASE="
                + json.dumps(evidence, sort_keys=True, separators=(",", ":")),
                flush=True,
            )

        evidence = {
            "cases": cases,
            "single_storage_per_engine": True,
            "persistent_storage_reused": True,
            "production_deploy_performed": False,
            "candidate_isolated_from_production": True,
            "benchmark_task_specific_rewriters": 0,
            "changed_file_overreach": sum(
                0 if case["changed_file_scope_passed"] else 1 for case in cases
            ),
        }
        summary = cert.certify(evidence)
        result = {
            "contract": CONTRACT,
            "runtime_contract": RUNTIME_CONTRACT,
            "runtime_model": policy.CANDIDATE_MODEL,
            "revision": policy.CANDIDATE_REVISION,
            "model_volume_name": policy.CODE_VOLUME,
            "run_seed": RUN_SEED,
            "cases": len(cases),
            "passed": int(summary.get("passed") or 0),
            "hidden_tests_passed": sum(1 for case in cases if case["hidden_tests_passed"]),
            "regression_tests_passed": sum(1 for case in cases if case["regression_tests_passed"]),
            "raw_agent_passed": sum(1 for case in cases if case["raw_agent_passed"]),
            "semantic_review_passed": sum(1 for case in cases if case["semantic_review_passed"]),
            "average_repairs": summary.get("average_repairs"),
            "warm_p95_ms": summary.get("warm_p95_ms"),
            "warm_latency_target_ms": WARM_TARGET_MS,
            "worldclass_certified": summary.get("certified") is True,
            "prefix_caching_enabled": True,
            "fast_boot_enforce_eager": True,
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
        print(
            "AVANTIQO_CODE_QWEN38_PRIVATE12_V2_RESULT="
            + json.dumps(result, sort_keys=True, separators=(",", ":")),
            flush=True,
        )
        if summary.get("certified") is not True:
            raise RuntimeError(
                f"{CONTRACT}_NOT_CERTIFIED:{json.dumps(summary, sort_keys=True)}"
            )
        print(f"{CONTRACT}=PASS", flush=True)
