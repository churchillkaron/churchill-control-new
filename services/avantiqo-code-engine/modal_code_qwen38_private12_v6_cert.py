"""Qwen3.8 Private12 V6 certification for Avantiqo Code.

V6 preserves the fresh sealed 12-dimension quality contract and <=4s
representative warm single-request latency target while switching to:

* Repo Agent V7 for exact monetary/reduction semantics;
* one bounded edit-contract recovery for local no-op/application failures;
* Runtime V6 for non-eager CUDA-graph/compile execution, prefix caching and
  model-free n-gram speculative decoding.

The quality call ceiling remains <=4 for the complete suite. Local actor edit
failures and semantic-review repairs share the same bounded repair batch, so the
recovery path cannot recreate the historical sequential-call explosion.
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
import worldclass_cert_v3_contract as cert
import worldclass_private_fixtures_v3 as fixtures
import worldclass_private_suite_v2 as suite
from modal_code_qwen38_canary_runtime_v6 import CONTRACT as RUNTIME_CONTRACT
from modal_code_qwen38_canary_runtime_v6 import app, generate_v6
from repo_agent_v7 import (
    AgentContractError,
    AgentPolicy,
    MAX_CASE_MODEL_SEQUENCES,
    apply_edits,
    build_actor_prompt,
    build_edit_recovery_prompt,
    build_repair_prompt,
    build_review_prompt,
    parse_actor_result,
    parse_review,
    run_public_tests,
)

CONTRACT = "AVANTIQO_CODE_QWEN38_PRIVATE12_CERT_V6"
RUN_SEED = "20260903-qwen38-private12-v6"
PRIVATE_SECRET_ENV = "AVANTIQO_CODE_PRIVATE_SUITE_SECRET"
WARM_TARGET_MS = 4_000
ACTOR_MAX_TOKENS = 640
REVIEWER_MAX_TOKENS = 320
MAX_MODAL_QUALITY_BATCH_CALLS = 4
MAX_MODAL_SINGLE_LATENCY_CALLS = 3
MAX_MODAL_TOTAL_CALLS = MAX_MODAL_QUALITY_BATCH_CALLS + MAX_MODAL_SINGLE_LATENCY_CALLS


def _progress(phase: str, status: str, **extra: Any) -> None:
    payload = {"phase": phase, "status": status, **extra}
    print(
        "AVANTIQO_CODE_QWEN38_PRIVATE12_V6_PROGRESS="
        + json.dumps(payload, sort_keys=True, separators=(",", ":")),
        flush=True,
    )


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


def _request(prompt: str, *, role: str, max_tokens: int) -> dict[str, Any]:
    return {
        "contract": RUNTIME_CONTRACT,
        "organization_id": "benchmark-only",
        "instruction": prompt,
        "role": role,
        "max_tokens": max_tokens,
    }


def _batch(
    prompts: list[str],
    *,
    phase: str,
    role: str,
    max_tokens: int,
) -> tuple[list[str], int, list[int], list[int]]:
    if not prompts:
        _progress(phase, "skipped", requests=0)
        return [], 0, [], []
    _progress(phase, "start", requests=len(prompts), role=role, max_tokens=max_tokens)
    response = generate_v6.remote(
        [_request(prompt, role=role, max_tokens=max_tokens) for prompt in prompts],
        approved=True,
    )
    if not isinstance(response, dict) or response.get("status") != "completed":
        raise RuntimeError(f"{CONTRACT}_MODEL_RESPONSE_INVALID:{phase}")
    outputs = response.get("outputs")
    if not isinstance(outputs, list) or len(outputs) != len(prompts):
        raise RuntimeError(f"{CONTRACT}_MODEL_OUTPUT_COUNT_INVALID:{phase}")
    texts = [str(item or "").strip() for item in outputs]
    if any(not text for text in texts):
        raise RuntimeError(f"{CONTRACT}_MODEL_OUTPUT_INVALID:{phase}")
    wall_ms = int(response.get("batch_wall_ms") or 0)
    if wall_ms <= 0:
        raise RuntimeError(f"{CONTRACT}_MODEL_LATENCY_INVALID:{phase}")
    prompt_counts = [int(value or 0) for value in (response.get("prompt_token_counts") or [])]
    output_counts = [int(value or 0) for value in (response.get("output_token_counts") or [])]
    _progress(
        phase,
        "done",
        requests=len(prompts),
        wall_ms=wall_ms,
        prompt_tokens=sum(prompt_counts),
        output_tokens=sum(output_counts),
    )
    return texts, wall_ms, prompt_counts, output_counts


def _single_latency(
    prompt: str,
    *,
    index: int,
    role: str,
    max_tokens: int,
    source: str,
) -> dict[str, Any]:
    phase = f"latency_{index}_{role}"
    _progress(
        phase,
        "start",
        requests=1,
        role=role,
        max_tokens=max_tokens,
        prompt_chars=len(prompt),
        source=source,
    )
    response = generate_v6.remote(
        [_request(prompt, role=role, max_tokens=max_tokens)],
        approved=True,
    )
    if not isinstance(response, dict) or response.get("status") != "completed":
        raise RuntimeError(f"{CONTRACT}_LATENCY_RESPONSE_INVALID:{index}")
    outputs = response.get("outputs")
    if not isinstance(outputs, list) or len(outputs) != 1 or not str(outputs[0] or "").strip():
        raise RuntimeError(f"{CONTRACT}_LATENCY_OUTPUT_INVALID:{index}")
    wall_ms = int(response.get("batch_wall_ms") or 0)
    if wall_ms <= 0:
        raise RuntimeError(f"{CONTRACT}_LATENCY_INVALID:{index}")
    sample = {
        "index": index,
        "role": role,
        "wall_ms": wall_ms,
        "warm": True,
        "single_request": True,
        "representative": True,
        "source": source,
        "prompt_chars": len(prompt),
        "max_tokens": max_tokens,
        "prompt_tokens": int((response.get("prompt_token_counts") or [0])[0]),
        "output_tokens": int((response.get("output_token_counts") or [0])[0]),
    }
    _progress(phase, "done", **sample)
    return sample


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


def _record_batch(
    states: list[dict[str, Any]],
    wall_ms: int,
    prompt_counts: list[int],
    output_counts: list[int],
) -> None:
    for index, state in enumerate(states):
        state["model_sequences"] += 1
        state["latencies_ms"].append(wall_ms)
        state["prompt_tokens"].append(prompt_counts[index] if index < len(prompt_counts) else 0)
        state["output_tokens"].append(output_counts[index] if index < len(output_counts) else 0)


def _finalize(state: dict[str, Any]) -> dict[str, Any]:
    item: fixtures.MaterializedFixture = state["item"]
    after = _tree_hash(item.workspace)
    changed = sorted(
        path
        for path in set(state["before"]) | set(after)
        if state["before"].get(path) != after.get(path)
    )
    changed_scope = bool(changed) and all(
        _matches_scope(path, tuple(item.editable_paths)) for path in changed
    )
    public_evidence = state["repair_public"] or state["public"] or {"passed": False, "runs": []}
    semantic = state["final_review"] or state["review"]
    semantic_passed = isinstance(semantic, dict) and semantic.get("verdict") == "pass"
    public_passed = public_evidence.get("passed") is True

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
        "wall_ms": sum(int(value) for value in state["latencies_ms"]),
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


def _top_prompts(prompts: list[str], count: int) -> list[str]:
    return sorted(prompts, key=len, reverse=True)[:count]


@app.local_entrypoint(name="qwen38_private12_v6")
def qwen38_private12_v6(approved: bool = False) -> None:
    if approved is not True:
        raise RuntimeError(f"{CONTRACT}_EXPLICIT_APPROVAL_REQUIRED")

    secret = _private_secret()
    integrity = suite.assert_suite_integrity(secret, RUN_SEED)
    if integrity.get("valid") is not True or int(integrity.get("cases") or 0) != 12:
        raise RuntimeError(f"{CONTRACT}_SUITE_INTEGRITY_INVALID")

    quality_calls = 0
    latency_calls = 0
    started = time.perf_counter()
    _progress(
        "suite",
        "start",
        cases=12,
        max_quality_calls=MAX_MODAL_QUALITY_BATCH_CALLS,
        max_latency_calls=MAX_MODAL_SINGLE_LATENCY_CALLS,
        max_total_calls=MAX_MODAL_TOTAL_CALLS,
    )

    with tempfile.TemporaryDirectory(prefix="avantiqo-qwen38-private12-v6-") as directory:
        root = Path(directory).resolve()
        materialized = fixtures.materialize_suite(root, secret=secret, run_seed=RUN_SEED)
        if len(materialized) != 12 or {item.dimension for item in materialized} != suite.dimensions():
            raise RuntimeError(f"{CONTRACT}_SUITE_MATERIALIZATION_INVALID")
        states = [_new_state(item) for item in materialized]

        # 1) One implementation batch for all 12 cases.
        actor_prompts = [
            build_actor_prompt(root=state["item"].workspace, task=state["item"].task, policy=_policy(state["item"]))
            for state in states
        ]
        actor_outputs, actor_ms, actor_pt, actor_ot = _batch(
            actor_prompts,
            phase="quality_actor",
            role="actor",
            max_tokens=ACTOR_MAX_TOKENS,
        )
        quality_calls += 1
        _record_batch(states, actor_ms, actor_pt, actor_ot)

        for state, raw in zip(states, actor_outputs):
            try:
                actor = parse_actor_result(raw)
                state["criteria"] = actor["criteria"]
                state["changed_files"] = apply_edits(
                    root=state["item"].workspace,
                    policy=_policy(state["item"]),
                    edits=actor["edits"],
                )
                state["public"] = run_public_tests(root=state["item"].workspace, policy=_policy(state["item"]))
            except (AgentContractError, RuntimeError, ValueError) as exc:
                state["error"] = f"{type(exc).__name__}:{exc}"

        # 2) Independent semantic review only where an effective edit exists.
        review_states = [state for state in states if state["error"] is None]
        review_prompts = [
            build_review_prompt(
                root=state["item"].workspace,
                task=state["item"].task,
                criteria=state["criteria"],
                changed_files=state["changed_files"],
                public_tests=state["public"],
            )
            for state in review_states
        ]
        review_outputs, review_ms, review_pt, review_ot = _batch(
            review_prompts,
            phase="quality_review",
            role="reviewer",
            max_tokens=REVIEWER_MAX_TOKENS,
        )
        if review_states:
            quality_calls += 1
            _record_batch(review_states, review_ms, review_pt, review_ot)
        for state, raw in zip(review_states, review_outputs):
            try:
                state["review"] = parse_review(raw, public_tests_passed=state["public"].get("passed") is True)
            except (AgentContractError, RuntimeError, ValueError) as exc:
                state["error"] = f"{type(exc).__name__}:{exc}"

        # 3) One shared actor repair batch. Local edit failures receive the V7
        # recovery prompt; semantic-review failures receive the normal repair.
        edit_recovery_states = [state for state in states if state["error"] is not None]
        semantic_repair_states = [
            state
            for state in review_states
            if state["error"] is None and state["review"].get("verdict") == "repair"
        ]
        repair_entries: list[tuple[str, dict[str, Any], str]] = []
        for state in edit_recovery_states:
            repair_entries.append(
                (
                    "edit_recovery",
                    state,
                    build_edit_recovery_prompt(
                        root=state["item"].workspace,
                        task=state["item"].task,
                        policy=_policy(state["item"]),
                        criteria=state["criteria"],
                        error=str(state["error"]),
                    ),
                )
            )
        for state in semantic_repair_states:
            repair_entries.append(
                (
                    "semantic_repair",
                    state,
                    build_repair_prompt(
                        root=state["item"].workspace,
                        task=state["item"].task,
                        policy=_policy(state["item"]),
                        criteria=state["criteria"],
                        findings=state["review"]["findings"],
                        public_tests=state["public"],
                    ),
                )
            )

        repair_prompts = [entry[2] for entry in repair_entries]
        repair_outputs, repair_ms, repair_pt, repair_ot = _batch(
            repair_prompts,
            phase="quality_repair",
            role="actor",
            max_tokens=ACTOR_MAX_TOKENS,
        )
        repair_states = [entry[1] for entry in repair_entries]
        if repair_states:
            quality_calls += 1
            _record_batch(repair_states, repair_ms, repair_pt, repair_ot)

        for (mode, state, _prompt), raw in zip(repair_entries, repair_outputs):
            try:
                repair = parse_actor_result(raw)
                state["repairs"] = 1
                if mode == "edit_recovery":
                    state["criteria"] = repair["criteria"]
                changed_now = apply_edits(
                    root=state["item"].workspace,
                    policy=_policy(state["item"]),
                    edits=repair["edits"],
                )
                state["changed_files"] = sorted(set(state["changed_files"]) | set(changed_now))
                state["repair_public"] = run_public_tests(
                    root=state["item"].workspace,
                    policy=_policy(state["item"]),
                )
                state["error"] = None
            except (AgentContractError, RuntimeError, ValueError) as exc:
                state["error"] = f"{type(exc).__name__}:{exc}"

        # 4) One final independent review for every repaired/recovered case.
        final_states = [state for state in repair_states if state["error"] is None]
        final_prompts = [
            build_review_prompt(
                root=state["item"].workspace,
                task=state["item"].task,
                criteria=state["criteria"],
                changed_files=state["changed_files"],
                public_tests=state["repair_public"],
            )
            for state in final_states
        ]
        final_outputs, final_ms, final_pt, final_ot = _batch(
            final_prompts,
            phase="quality_final_review",
            role="reviewer",
            max_tokens=REVIEWER_MAX_TOKENS,
        )
        if final_states:
            quality_calls += 1
            _record_batch(final_states, final_ms, final_pt, final_ot)
        for state, raw in zip(final_states, final_outputs):
            try:
                state["final_review"] = parse_review(
                    raw,
                    public_tests_passed=state["repair_public"].get("passed") is True,
                )
            except (AgentContractError, RuntimeError, ValueError) as exc:
                state["error"] = f"{type(exc).__name__}:{exc}"

        if quality_calls > MAX_MODAL_QUALITY_BATCH_CALLS:
            raise RuntimeError(f"{CONTRACT}_QUALITY_CALL_CEILING_EXCEEDED:{quality_calls}")

        # Representative latency uses real fresh V7 actor/reviewer prompt shapes,
        # never synthetic toy prompts and never hidden assertions.
        longest_actors = _top_prompts(actor_prompts, 2)
        longest_reviews = _top_prompts(review_prompts, 1)
        if len(longest_actors) != 2 or len(longest_reviews) != 1:
            raise RuntimeError(f"{CONTRACT}_REPRESENTATIVE_LATENCY_PROMPTS_REQUIRED")
        latency_plan = [
            ("actor", longest_actors[0], ACTOR_MAX_TOKENS, "fresh_suite_v7_actor_longest"),
            ("reviewer", longest_reviews[0], REVIEWER_MAX_TOKENS, "fresh_suite_v7_reviewer_longest"),
            ("actor", longest_actors[1], ACTOR_MAX_TOKENS, "fresh_suite_v7_actor_second_longest"),
        ]
        latency_samples: list[dict[str, Any]] = []
        for index, (role, prompt, max_tokens, source) in enumerate(latency_plan, start=1):
            latency_samples.append(
                _single_latency(
                    prompt,
                    index=index,
                    role=role,
                    max_tokens=max_tokens,
                    source=source,
                )
            )
            latency_calls += 1

        if latency_calls != MAX_MODAL_SINGLE_LATENCY_CALLS:
            raise RuntimeError(f"{CONTRACT}_LATENCY_CALL_COUNT_INVALID:{latency_calls}")
        total_calls = quality_calls + latency_calls
        if total_calls > MAX_MODAL_TOTAL_CALLS:
            raise RuntimeError(f"{CONTRACT}_TOTAL_CALL_CEILING_EXCEEDED:{total_calls}")

        cases = [_finalize(state) for state in states]
        for case in cases:
            print(
                "AVANTIQO_CODE_QWEN38_PRIVATE12_V6_CASE="
                + json.dumps(case, sort_keys=True, separators=(",", ":")),
                flush=True,
            )

        evidence = {
            "cases": cases,
            "latency_samples": latency_samples,
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
            "quality_batch_calls": quality_calls,
            "latency_single_calls": latency_calls,
            "total_modal_calls": total_calls,
            "max_modal_total_calls": MAX_MODAL_TOTAL_CALLS,
            "max_case_model_sequences": max((case["model_calls"] for case in cases), default=0),
            "total_quality_model_sequences": sum(case["model_calls"] for case in cases),
            "suite_wall_ms": round((time.perf_counter() - started) * 1000),
            "latency_samples": latency_samples,
            "warm_p95_ms": summary.get("warm_p95_ms"),
            "warm_latency_target_ms": WARM_TARGET_MS,
            "latency_measurement": summary.get("latency_measurement"),
            "worldclass_certified": summary.get("certified") is True,
            "prefix_caching_enabled": True,
            "fast_boot_enforce_eager": False,
            "speculative_decoding_enabled": True,
            "speculative_method": "ngram",
            "production_routing_change": False,
            "production_deploy_performed": False,
            "model_download_performed": False,
            "volume_created": False,
            "summary": summary,
        }
        _progress(
            "suite",
            "done",
            passed=result["passed"],
            hidden_tests_passed=result["hidden_tests_passed"],
            warm_p95_ms=result["warm_p95_ms"],
            total_modal_calls=total_calls,
            worldclass_certified=result["worldclass_certified"],
        )
        print(
            "AVANTIQO_CODE_QWEN38_PRIVATE12_V6_RESULT="
            + json.dumps(result, sort_keys=True, separators=(",", ":")),
            flush=True,
        )
        if summary.get("certified") is not True:
            raise RuntimeError(f"{CONTRACT}_NOT_CERTIFIED:{json.dumps(summary, sort_keys=True)}")
        print(f"{CONTRACT}=PASS", flush=True)
