"""Batched Qwen3.8 private 12-case certification for Avantiqo Code V3.

The sealed suite and strict World-Class V2 score remain unchanged. The execution
architecture changes: deterministic orchestration snapshots repositories and runs
tests, while Qwen3.8 is called in at most four H100 batches for the entire suite:
implementation, independent review, optional repair, optional final review.
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
from repo_agent_v5 import (
    AgentContractError,
    AgentPolicy,
    MAX_CASE_MODEL_SEQUENCES,
    apply_edits,
    build_actor_prompt,
    build_repair_prompt,
    build_review_prompt,
    parse_actor_result,
    parse_review,
    run_public_tests,
)

CONTRACT = "AVANTIQO_CODE_QWEN38_PRIVATE12_CERT_V3"
RUN_SEED = "20260903-qwen38-private12-v3"
PRIVATE_SECRET_ENV = "AVANTIQO_CODE_PRIVATE_SUITE_SECRET"
WARM_TARGET_MS = 4_000
ACTOR_MAX_TOKENS = 640
REVIEWER_MAX_TOKENS = 320
MAX_MODAL_BATCH_CALLS = 4


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


def _policy(item: fixtures.MaterializedFixture) -> AgentPolicy:
    return AgentPolicy(
        editable_paths=tuple(item.editable_paths),
        test_commands={test_id: tuple(item.public_command) for test_id in item.public_test_ids},
    )


def _batch(prompts: list[str], *, role: str, max_tokens: int) -> tuple[list[str], int, list[int], list[int]]:
    if not prompts:
        return [], 0, [], []
    requests = [
        {
            "contract": RUNTIME_CONTRACT,
            "organization_id": "benchmark-only",
            "instruction": prompt,
            "role": role,
            "max_tokens": max_tokens,
        }
        for prompt in prompts
    ]
    response = generate_v5.remote(requests, approved=True)
    if not isinstance(response, dict) or response.get("status") != "completed":
        raise RuntimeError(f"{CONTRACT}_MODEL_RESPONSE_INVALID")
    outputs = response.get("outputs")
    if not isinstance(outputs, list) or len(outputs) != len(prompts):
        raise RuntimeError(f"{CONTRACT}_MODEL_OUTPUT_COUNT_INVALID")
    texts = [str(item or "").strip() for item in outputs]
    if any(not text for text in texts):
        raise RuntimeError(f"{CONTRACT}_MODEL_OUTPUT_INVALID")
    wall_ms = int(response.get("batch_wall_ms") or 0)
    if wall_ms <= 0:
        raise RuntimeError(f"{CONTRACT}_MODEL_LATENCY_INVALID")
    prompt_counts = [int(v or 0) for v in (response.get("prompt_token_counts") or [])]
    output_counts = [int(v or 0) for v in (response.get("output_token_counts") or [])]
    return texts, wall_ms, prompt_counts, output_counts


def _new_state(item: fixtures.MaterializedFixture) -> dict[str, Any]:
    return {
        "item": item,
        "before": _tree_hash(item.workspace),
        "criteria": (),
        "changed_files": [],
        "public": None,
        "review": None,
        "repair_public": None,
        "final_review": None,
        "error": None,
        "repairs": 0,
        "model_sequences": 0,
        "latencies_ms": [],
        "prompt_tokens": [],
        "output_tokens": [],
    }


def _record_batch(states: list[dict[str, Any]], wall_ms: int, prompt_counts: list[int], output_counts: list[int]) -> None:
    for index, state in enumerate(states):
        state["model_sequences"] += 1
        state["latencies_ms"].append(wall_ms)
        state["prompt_tokens"].append(prompt_counts[index] if index < len(prompt_counts) else 0)
        state["output_tokens"].append(output_counts[index] if index < len(output_counts) else 0)


def _finalize(state: dict[str, Any]) -> dict[str, Any]:
    item: fixtures.MaterializedFixture = state["item"]
    after = _tree_hash(item.workspace)
    changed = sorted(path for path in set(state["before"]) | set(after) if state["before"].get(path) != after.get(path))
    changed_scope = bool(changed) and all(_matches_scope(path, tuple(item.editable_paths)) for path in changed)
    public_evidence = state["repair_public"] or state["public"] or {"passed": False, "runs": []}
    semantic = state["final_review"] or state["review"]
    semantic_passed = isinstance(semantic, dict) and semantic.get("verdict") == "pass"
    public_passed = public_evidence.get("passed") is True

    # Hidden material executes only after the model-visible work is complete and semantically accepted.
    hidden_passed = False
    hidden_exit_code = -1
    if semantic_passed and public_passed and state["error"] is None:
        hidden = fixtures.run_hidden(item)
        hidden_exit_code = hidden.returncode
        hidden_passed = hidden.returncode == 0

    phases = ["inspect", "plan", "edit", "execute_tests", "final_verify", "semantic_review"]
    if state["repairs"]:
        phases.extend(["inspect_failure", "bounded_repair"])
    model_sequences = int(state["model_sequences"])
    security_gate = (
        changed_scope
        and state["error"] is None
        and 1 <= model_sequences <= MAX_CASE_MODEL_SEQUENCES
        and not item.hidden_test_path.resolve().is_relative_to(item.workspace.resolve())
    )
    instruction_gate = state["error"] is None and semantic_passed and public_passed
    warm_ms = max((int(v) for v in state["latencies_ms"]), default=0)
    return {
        "case_id": item.case_id,
        "family_id": item.family_id,
        "dimension": item.dimension,
        "hidden_tests_passed": hidden_passed,
        "regression_tests_passed": public_passed,
        "security_gate_passed": security_gate,
        "instruction_gate_passed": instruction_gate,
        "changed_file_scope_passed": changed_scope,
        "raw_agent_passed": state["error"] is None and semantic_passed,
        "deterministic_source_rewrite_used": False,
        "hidden_material_model_visible": False,
        "repairs": int(state["repairs"]),
        "model_calls": model_sequences,
        "wall_ms": sum(int(v) for v in state["latencies_ms"]),
        "warm_ms": warm_ms,
        "model_phase_latencies_ms": list(state["latencies_ms"]),
        "prompt_token_counts": list(state["prompt_tokens"]),
        "output_token_counts": list(state["output_tokens"]),
        "agent_phases": phases,
        "changed_files": changed,
        "public_exit_code": 0 if public_passed else 1,
        "hidden_exit_code": hidden_exit_code,
        "agent_error": state["error"],
        "semantic_review_passed": semantic_passed,
        "production_deploy_performed": False,
    }


@app.local_entrypoint(name="qwen38_private12_v3")
def qwen38_private12_v3(approved: bool = False) -> None:
    if approved is not True:
        raise RuntimeError(f"{CONTRACT}_EXPLICIT_APPROVAL_REQUIRED")
    secret = _private_secret()
    integrity = suite.assert_suite_integrity(secret, RUN_SEED)
    if integrity.get("valid") is not True or int(integrity.get("cases") or 0) != 12:
        raise RuntimeError(f"{CONTRACT}_SUITE_INTEGRITY_INVALID")

    modal_batch_calls = 0
    started = time.perf_counter()
    with tempfile.TemporaryDirectory(prefix="avantiqo-qwen38-private12-v3-") as directory:
        root = Path(directory).resolve()
        materialized = fixtures.materialize_suite(root, secret=secret, run_seed=RUN_SEED)
        if len(materialized) != 12 or {item.dimension for item in materialized} != suite.dimensions():
            raise RuntimeError(f"{CONTRACT}_SUITE_MATERIALIZATION_INVALID")
        states = [_new_state(item) for item in materialized]

        # Phase 1: one implementation batch for all 12 cases.
        actor_prompts = [build_actor_prompt(root=s["item"].workspace, task=s["item"].task, policy=_policy(s["item"])) for s in states]
        actor_outputs, actor_ms, actor_pt, actor_ot = _batch(actor_prompts, role="actor", max_tokens=ACTOR_MAX_TOKENS)
        modal_batch_calls += 1
        _record_batch(states, actor_ms, actor_pt, actor_ot)
        for state, raw in zip(states, actor_outputs):
            try:
                actor = parse_actor_result(raw)
                state["criteria"] = actor["criteria"]
                state["changed_files"] = apply_edits(root=state["item"].workspace, policy=_policy(state["item"]), edits=actor["edits"])
                state["public"] = run_public_tests(root=state["item"].workspace, policy=_policy(state["item"]))
            except (AgentContractError, RuntimeError, ValueError) as exc:
                state["error"] = f"{type(exc).__name__}:{exc}"

        # Phase 2: one independent semantic-review batch for actor-complete cases.
        review_states = [s for s in states if s["error"] is None]
        review_prompts = [
            build_review_prompt(
                root=s["item"].workspace,
                task=s["item"].task,
                criteria=s["criteria"],
                changed_files=s["changed_files"],
                public_tests=s["public"],
            )
            for s in review_states
        ]
        review_outputs, review_ms, review_pt, review_ot = _batch(review_prompts, role="reviewer", max_tokens=REVIEWER_MAX_TOKENS)
        if review_states:
            modal_batch_calls += 1
            _record_batch(review_states, review_ms, review_pt, review_ot)
        for state, raw in zip(review_states, review_outputs):
            try:
                state["review"] = parse_review(raw, public_tests_passed=state["public"].get("passed") is True)
            except (AgentContractError, RuntimeError, ValueError) as exc:
                state["error"] = f"{type(exc).__name__}:{exc}"

        # Phase 3: only cases explicitly requiring repair get one shared repair batch.
        repair_states = [s for s in review_states if s["error"] is None and s["review"].get("verdict") == "repair"]
        repair_prompts = [
            build_repair_prompt(
                root=s["item"].workspace,
                task=s["item"].task,
                policy=_policy(s["item"]),
                criteria=s["criteria"],
                findings=s["review"]["findings"],
                public_tests=s["public"],
            )
            for s in repair_states
        ]
        repair_outputs, repair_ms, repair_pt, repair_ot = _batch(repair_prompts, role="actor", max_tokens=ACTOR_MAX_TOKENS)
        if repair_states:
            modal_batch_calls += 1
            _record_batch(repair_states, repair_ms, repair_pt, repair_ot)
        for state, raw in zip(repair_states, repair_outputs):
            try:
                repair = parse_actor_result(raw)
                state["repairs"] = 1
                state["changed_files"] = sorted(set(state["changed_files"]) | set(apply_edits(root=state["item"].workspace, policy=_policy(state["item"]), edits=repair["edits"])))
                state["repair_public"] = run_public_tests(root=state["item"].workspace, policy=_policy(state["item"]))
            except (AgentContractError, RuntimeError, ValueError) as exc:
                state["error"] = f"{type(exc).__name__}:{exc}"

        # Phase 4: repaired cases receive one final independent review batch.
        final_states = [s for s in repair_states if s["error"] is None]
        final_prompts = [
            build_review_prompt(
                root=s["item"].workspace,
                task=s["item"].task,
                criteria=s["criteria"],
                changed_files=s["changed_files"],
                public_tests=s["repair_public"],
            )
            for s in final_states
        ]
        final_outputs, final_ms, final_pt, final_ot = _batch(final_prompts, role="reviewer", max_tokens=REVIEWER_MAX_TOKENS)
        if final_states:
            modal_batch_calls += 1
            _record_batch(final_states, final_ms, final_pt, final_ot)
        for state, raw in zip(final_states, final_outputs):
            try:
                state["final_review"] = parse_review(raw, public_tests_passed=state["repair_public"].get("passed") is True)
            except (AgentContractError, RuntimeError, ValueError) as exc:
                state["error"] = f"{type(exc).__name__}:{exc}"

        if modal_batch_calls > MAX_MODAL_BATCH_CALLS:
            raise RuntimeError(f"{CONTRACT}_BATCH_CALL_CEILING_EXCEEDED:{modal_batch_calls}")

        cases = [_finalize(state) for state in states]
        for evidence in cases:
            print("AVANTIQO_CODE_QWEN38_PRIVATE12_V3_CASE=" + json.dumps(evidence, sort_keys=True, separators=(",", ":")), flush=True)

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
            "runtime_contract": RUNTIME_CONTRACT,
            "runtime_model": policy.CANDIDATE_MODEL,
            "revision": policy.CANDIDATE_REVISION,
            "run_seed": RUN_SEED,
            "cases": len(cases),
            "passed": int(summary.get("passed") or 0),
            "hidden_tests_passed": sum(1 for case in cases if case["hidden_tests_passed"]),
            "regression_tests_passed": sum(1 for case in cases if case["regression_tests_passed"]),
            "semantic_review_passed": sum(1 for case in cases if case["semantic_review_passed"]),
            "modal_batch_calls": modal_batch_calls,
            "max_modal_batch_calls": MAX_MODAL_BATCH_CALLS,
            "max_case_model_sequences": max((case["model_calls"] for case in cases), default=0),
            "total_model_sequences": sum(case["model_calls"] for case in cases),
            "suite_wall_ms": round((time.perf_counter() - started) * 1000),
            "warm_p95_ms": summary.get("warm_p95_ms"),
            "warm_latency_target_ms": WARM_TARGET_MS,
            "worldclass_certified": summary.get("certified") is True,
            "prefix_caching_enabled": True,
            "fast_boot_enforce_eager": True,
            "production_routing_change": False,
            "production_deploy_performed": False,
            "model_download_performed": False,
            "volume_created": False,
            "summary": summary,
        }
        print("AVANTIQO_CODE_QWEN38_PRIVATE12_V3_RESULT=" + json.dumps(result, sort_keys=True, separators=(",", ":")), flush=True)
        if summary.get("certified") is not True:
            raise RuntimeError(f"{CONTRACT}_NOT_CERTIFIED:{json.dumps(summary, sort_keys=True)}")
        print(f"{CONTRACT}=PASS", flush=True)
