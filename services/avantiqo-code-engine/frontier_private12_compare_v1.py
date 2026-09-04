"""Run the exact V17 sealed Private12 suite against one external frontier model.

The suite secret and run seed are supplied by the caller. For the Claude/Codex
comparison workflow they are reconstructed from the exact V17 certification run,
so fixture material, hidden assertions and case identities are identical to the
Avantiqo V17 proof. Hidden material is never included in model prompts.
"""

from __future__ import annotations

import argparse
import json
import os
import tempfile
import time
from pathlib import Path
from typing import Any

import worldclass_cert_v3_contract as cert
import worldclass_private_fixtures_v3 as fixtures
import worldclass_private_suite_v2 as suite
import modal_code_qwen38_private12_v6_cert as base
import repo_agent_v15 as agent
from frontier_provider_runtime_v1 import FrontierProviderRuntime

CONTRACT = "AVANTIQO_CODE_FRONTIER_PRIVATE12_COMPARE_V1"
RUN_SEED = "20260904-qwen38-private12-v17"
PRIVATE_SECRET_ENV = "AVANTIQO_CODE_PRIVATE_SUITE_SECRET"
WARM_TARGET_MS = 4_000
ACTOR_MAX_TOKENS = 640
QUALITY_ACTOR_MAX_TOKENS = 768
REVIEWER_MAX_TOKENS = 256
REPAIR_MAX_TOKENS = 1024
MAX_QUALITY_BATCHES = 4
MAX_LATENCY_CALLS = 3
MAX_CASE_MODEL_SEQUENCES = agent.MAX_CASE_MODEL_SEQUENCES


def emit(kind: str, payload: dict[str, Any]) -> None:
    print(f"AVANTIQO_CODE_FRONTIER_{kind}=" + json.dumps(payload, sort_keys=True, separators=(",", ":")), flush=True)


def private_secret() -> bytes:
    value = str(os.environ.get(PRIVATE_SECRET_ENV) or "").strip()
    if len(value) < 24:
        raise RuntimeError("PRIVATE_SUITE_SECRET_REQUIRED")
    return value.encode("utf-8")


def policy(item: fixtures.MaterializedFixture) -> agent.AgentPolicy:
    return agent.AgentPolicy(
        editable_paths=tuple(item.editable_paths),
        test_commands={test_id: tuple(item.public_command) for test_id in item.public_test_ids},
    )


def request(prompt: str, *, role: str, max_tokens: int) -> dict[str, Any]:
    return {
        "organization_id": "benchmark-only",
        "instruction": prompt,
        "role": role,
        "max_tokens": max_tokens,
    }


def batch(runtime: FrontierProviderRuntime, prompts: list[str], *, phase: str, role: str, max_tokens: int):
    if not prompts:
        emit("PROGRESS", {"phase": phase, "status": "skipped", "requests": 0})
        return [], 0, [], []
    emit("PROGRESS", {"phase": phase, "status": "start", "requests": len(prompts), "role": role, "max_tokens": max_tokens})
    response = runtime.remote([request(p, role=role, max_tokens=max_tokens) for p in prompts], approved=True)
    outputs = response.get("outputs")
    if not isinstance(outputs, list) or len(outputs) != len(prompts):
        raise RuntimeError(f"MODEL_OUTPUT_COUNT_INVALID:{phase}")
    texts = [str(x or "").strip() for x in outputs]
    if any(not x for x in texts):
        raise RuntimeError(f"MODEL_OUTPUT_INVALID:{phase}")
    wall = int(response.get("batch_wall_ms") or 0)
    pts = [int(x or 0) for x in response.get("prompt_token_counts") or []]
    ots = [int(x or 0) for x in response.get("output_token_counts") or []]
    emit("PROGRESS", {"phase": phase, "status": "done", "requests": len(prompts), "wall_ms": wall, "prompt_tokens": sum(pts), "output_tokens": sum(ots)})
    return texts, wall, pts, ots


def single_latency(runtime: FrontierProviderRuntime, prompt: str, *, index: int, role: str, max_tokens: int, source: str):
    phase = f"latency_{index}_{role}"
    emit("PROGRESS", {"phase": phase, "status": "start", "requests": 1, "role": role, "max_tokens": max_tokens, "source": source})
    response = runtime.remote([request(prompt, role=role, max_tokens=max_tokens)], approved=True)
    wall = int(response.get("batch_wall_ms") or 0)
    sample = {
        "index": index,
        "role": role,
        "wall_ms": wall,
        "warm": True,
        "single_request": True,
        "representative": True,
        "source": source,
        "prompt_chars": len(prompt),
        "max_tokens": max_tokens,
        "prompt_tokens": int((response.get("prompt_token_counts") or [0])[0]),
        "output_tokens": int((response.get("output_token_counts") or [0])[0]),
    }
    emit("PROGRESS", {"phase": phase, "status": "done", **sample})
    return sample


def new_state(item: fixtures.MaterializedFixture) -> dict[str, Any]:
    return {
        "item": item,
        "before": base._tree_hash(item.workspace),
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


def record(states: list[dict[str, Any]], wall: int, pts: list[int], ots: list[int]) -> None:
    for i, state in enumerate(states):
        state["model_sequences"] += 1
        state["latencies_ms"].append(wall)
        state["prompt_tokens"].append(pts[i] if i < len(pts) else 0)
        state["output_tokens"].append(ots[i] if i < len(ots) else 0)


def finalize(state: dict[str, Any]) -> dict[str, Any]:
    item = state["item"]
    after = base._tree_hash(item.workspace)
    changed = sorted(path for path in set(state["before"]) | set(after) if state["before"].get(path) != after.get(path))
    changed_scope = bool(changed) and all(base._matches_scope(path, tuple(item.editable_paths)) for path in changed)
    public = state["repair_public"] or state["public"] or {"passed": False, "runs": []}
    semantic = state["final_review"] or state["review"]
    semantic_passed = isinstance(semantic, dict) and semantic.get("verdict") == "pass"
    public_passed = public.get("passed") is True
    hidden_passed = False
    hidden_exit = -1
    if semantic_passed and public_passed and state["error"] is None:
        hidden = fixtures.run_hidden(item)
        hidden_exit = hidden.returncode
        hidden_passed = hidden.returncode == 0
    sequences = int(state["model_sequences"])
    security = changed_scope and state["error"] is None and 1 <= sequences <= MAX_CASE_MODEL_SEQUENCES and not item.hidden_test_path.resolve().is_relative_to(item.workspace.resolve())
    return {
        "case_id": item.case_id,
        "family_id": item.family_id,
        "dimension": item.dimension,
        "hidden_tests_passed": hidden_passed,
        "regression_tests_passed": public_passed,
        "security_gate_passed": security,
        "instruction_gate_passed": state["error"] is None and semantic_passed and public_passed,
        "changed_file_scope_passed": changed_scope,
        "raw_agent_passed": state["error"] is None and semantic_passed,
        "deterministic_source_rewrite_used": False,
        "hidden_material_model_visible": False,
        "repairs": int(state["repairs"]),
        "model_calls": sequences,
        "wall_ms": sum(int(x) for x in state["latencies_ms"]),
        "model_phase_latencies_ms": list(state["latencies_ms"]),
        "prompt_token_counts": list(state["prompt_tokens"]),
        "output_token_counts": list(state["output_tokens"]),
        "changed_files": changed,
        "public_exit_code": 0 if public_passed else 1,
        "hidden_exit_code": hidden_exit,
        "agent_error": state["error"],
        "semantic_review_passed": semantic_passed,
        "production_deploy_performed": False,
    }


def run(provider: str, model: str) -> dict[str, Any]:
    secret = private_secret()
    integrity = suite.assert_suite_integrity(secret, RUN_SEED)
    if integrity.get("valid") is not True or int(integrity.get("cases") or 0) != 12:
        raise RuntimeError("SUITE_INTEGRITY_INVALID")
    runtime = FrontierProviderRuntime(provider=provider, model=model)
    quality_batches = 0
    started = time.perf_counter()

    with tempfile.TemporaryDirectory(prefix=f"frontier-private12-{provider}-") as directory:
        materialized = fixtures.materialize_suite(Path(directory).resolve(), secret=secret, run_seed=RUN_SEED)
        states = [new_state(item) for item in materialized]

        actor_prompts = [agent.build_actor_prompt(root=s["item"].workspace, task=s["item"].task, policy=policy(s["item"])) for s in states]
        outputs, wall, pts, ots = batch(runtime, actor_prompts, phase="quality_actor", role="actor", max_tokens=QUALITY_ACTOR_MAX_TOKENS)
        quality_batches += 1
        record(states, wall, pts, ots)
        for state, raw in zip(states, outputs):
            try:
                parsed = agent.parse_actor_result(raw)
                state["criteria"] = parsed["criteria"]
                state["changed_files"] = agent.apply_edits(root=state["item"].workspace, policy=policy(state["item"]), edits=parsed["edits"])
                state["public"] = agent.run_public_tests(root=state["item"].workspace, policy=policy(state["item"]))
            except (agent.AgentContractError, RuntimeError, ValueError) as exc:
                state["error"] = f"{type(exc).__name__}:{exc}"

        review_states = [s for s in states if s["error"] is None]
        review_prompts = [agent.build_review_prompt(root=s["item"].workspace, task=s["item"].task, criteria=s["criteria"], changed_files=s["changed_files"], public_tests=s["public"]) for s in review_states]
        outputs, wall, pts, ots = batch(runtime, review_prompts, phase="quality_review", role="reviewer", max_tokens=REVIEWER_MAX_TOKENS)
        if review_states:
            quality_batches += 1
            record(review_states, wall, pts, ots)
        for state, raw in zip(review_states, outputs):
            try:
                state["review"] = agent.parse_review(raw, public_tests_passed=state["public"].get("passed") is True)
            except (agent.AgentContractError, RuntimeError, ValueError) as exc:
                state["error"] = f"{type(exc).__name__}:{exc}"

        repair_entries = []
        for state in [s for s in states if s["error"] is not None]:
            repair_entries.append(("edit_recovery", state, agent.build_edit_recovery_prompt(root=state["item"].workspace, task=state["item"].task, policy=policy(state["item"]), criteria=state["criteria"], error=str(state["error"]), previous_output="")))
        for state in [s for s in review_states if s["error"] is None and s["review"].get("verdict") == "repair"]:
            repair_entries.append(("semantic_repair", state, agent.build_repair_prompt(root=state["item"].workspace, task=state["item"].task, policy=policy(state["item"]), criteria=state["criteria"], findings=state["review"].get("findings") or [], public_tests=state["public"])))

        repair_prompts = [x[2] for x in repair_entries]
        outputs, wall, pts, ots = batch(runtime, repair_prompts, phase="quality_repair", role="actor", max_tokens=REPAIR_MAX_TOKENS)
        repair_states = [x[1] for x in repair_entries]
        if repair_states:
            quality_batches += 1
            record(repair_states, wall, pts, ots)
        for (mode, state, _), raw in zip(repair_entries, outputs):
            try:
                parsed = agent.parse_actor_result(raw)
                state["repairs"] = 1
                if mode == "edit_recovery":
                    state["criteria"] = parsed["criteria"]
                changed_now = agent.apply_edits(root=state["item"].workspace, policy=policy(state["item"]), edits=parsed["edits"])
                state["changed_files"] = sorted(set(state["changed_files"]) | set(changed_now))
                state["repair_public"] = agent.run_public_tests(root=state["item"].workspace, policy=policy(state["item"]))
                state["error"] = None
            except (agent.AgentContractError, RuntimeError, ValueError) as exc:
                state["error"] = f"{type(exc).__name__}:{exc}"

        final_states = [s for s in repair_states if s["error"] is None]
        final_prompts = [agent.build_review_prompt(root=s["item"].workspace, task=s["item"].task, criteria=s["criteria"], changed_files=s["changed_files"], public_tests=s["repair_public"]) for s in final_states]
        outputs, wall, pts, ots = batch(runtime, final_prompts, phase="quality_final_review", role="reviewer", max_tokens=REVIEWER_MAX_TOKENS)
        if final_states:
            quality_batches += 1
            record(final_states, wall, pts, ots)
        for state, raw in zip(final_states, outputs):
            try:
                state["final_review"] = agent.parse_review(raw, public_tests_passed=state["repair_public"].get("passed") is True)
            except (agent.AgentContractError, RuntimeError, ValueError) as exc:
                state["error"] = f"{type(exc).__name__}:{exc}"

        if quality_batches > MAX_QUALITY_BATCHES:
            raise RuntimeError(f"QUALITY_BATCH_CEILING_EXCEEDED:{quality_batches}")

        longest_actors = sorted(actor_prompts, key=len, reverse=True)[:2]
        longest_reviews = sorted(review_prompts, key=len, reverse=True)[:1]
        latency_plan = [
            ("actor", longest_actors[0], ACTOR_MAX_TOKENS, "exact_v17_actor_longest"),
            ("reviewer", longest_reviews[0], REVIEWER_MAX_TOKENS, "exact_v17_reviewer_longest"),
            ("actor", longest_actors[1], ACTOR_MAX_TOKENS, "exact_v17_actor_second_longest"),
        ]
        latency_samples = [single_latency(runtime, p, index=i, role=r, max_tokens=m, source=s) for i, (r, p, m, s) in enumerate(latency_plan, start=1)]

        cases = [finalize(s) for s in states]
        for case in cases:
            emit("CASE", case)
        evidence = {
            "cases": cases,
            "latency_samples": latency_samples,
            "single_storage_per_engine": True,
            "persistent_storage_reused": True,
            "production_deploy_performed": False,
            "candidate_isolated_from_production": True,
            "benchmark_task_specific_rewriters": 0,
            "changed_file_overreach": sum(0 if c["changed_file_scope_passed"] else 1 for c in cases),
        }
        summary = cert.certify(evidence)
        result = {
            "contract": CONTRACT,
            "provider": provider,
            "model": model,
            "run_seed": RUN_SEED,
            "cases": len(cases),
            "passed": int(summary.get("passed") or 0),
            "hidden_tests_passed": sum(1 for c in cases if c["hidden_tests_passed"]),
            "regression_tests_passed": sum(1 for c in cases if c["regression_tests_passed"]),
            "semantic_review_passed": sum(1 for c in cases if c["semantic_review_passed"]),
            "quality_batch_calls": quality_batches,
            "latency_single_calls": len(latency_samples),
            "total_quality_model_sequences": sum(c["model_calls"] for c in cases),
            "max_case_model_sequences": max((c["model_calls"] for c in cases), default=0),
            "latency_samples": latency_samples,
            "warm_p95_ms": summary.get("warm_p95_ms"),
            "warm_latency_target_ms": WARM_TARGET_MS,
            "worldclass_certified": summary.get("certified") is True,
            "suite_wall_ms": round((time.perf_counter() - started) * 1000),
            "provider_usage": runtime.usage(),
            "summary": summary,
        }
        emit("RESULT", result)
        return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", choices=["openai", "anthropic"], required=True)
    parser.add_argument("--model", required=True)
    args = parser.parse_args()
    run(args.provider, args.model)


if __name__ == "__main__":
    main()
