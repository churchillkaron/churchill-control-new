"""Paid owned-only certification for the executable-gated Avantiqo Code path.

This intentionally excludes external reference calls so missing AI Gateway
credentials cannot block certification of the changed Avantiqo architecture.
It performs one warm H100 generation batch, executes visible + semantic contract
checks locally, sends only failing cases through one repair batch, then applies
the sealed hidden benchmark exactly once for final scoring.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

import modal_verified_head_to_head as verified

CONTRACT = "AVANTIQO_CODE_EXECUTABLE_GATE_CERT_V1"
OUTPUT_PATH = Path("artifacts/avantiqo-code-executable-gate-cert.json")


def _usage_sum(*values: dict[str, Any]) -> dict[str, int]:
    return {
        "input_tokens": sum(int((value or {}).get("input_tokens") or 0) for value in values),
        "output_tokens": sum(int((value or {}).get("output_tokens") or 0) for value in values),
    }


def _validate_identity(task: dict[str, str], output: dict[str, Any]) -> None:
    base = verified.base
    if output.get("provider") != "avantiqo-code" or output.get("model") != base.PRODUCT_MODEL:
        raise RuntimeError(f"{CONTRACT}_OWNED_IDENTITY_INVALID:{task['id']}")
    if output.get("foundation_model") != base.FOUNDATION_MODEL or output.get("runtime_model") != base.RUNTIME_MODEL:
        raise RuntimeError(f"{CONTRACT}_OWNED_MODEL_INVALID:{task['id']}")
    if output.get("raw_reasoning_persisted") is not False:
        raise RuntimeError(f"{CONTRACT}_RAW_REASONING_FORBIDDEN:{task['id']}")
    if output.get("quality_policy") != verified.QUALITY_POLICY:
        raise RuntimeError(f"{CONTRACT}_QUALITY_POLICY_INVALID:{task['id']}")
    if output.get("warm_runtime") is not True or output.get("vllm_enforce_eager") is not False:
        raise RuntimeError(f"{CONTRACT}_WARM_RUNTIME_NOT_PROVEN:{task['id']}")


@verified.app.local_entrypoint()
def main() -> None:
    base = verified.base
    if base._text(os.environ.get("NODE_ENV")).lower() == "production":
        raise RuntimeError(f"{CONTRACT}_PRODUCTION_ENV_FORBIDDEN")

    prompts: list[tuple[dict[str, str], str]] = []
    for task in base.TASKS:
        initial = base._run_test(task["module"], task["source"], task["visible_test"])
        if initial["exit_code"] == 0:
            raise RuntimeError(f"{CONTRACT}_BROKEN_FIXTURE_MUST_FAIL:{task['id']}")
        prompts.append((task, base._prompt(task, f"{initial['stdout']}\n{initial['stderr']}")))

    requests = [base._owned_request(task, prompt) for task, prompt in prompts]
    remote_started = time.perf_counter()
    first = verified.run_owned_batch.remote(requests)
    first_remote_wall_ms = round((time.perf_counter() - remote_started) * 1000)
    first_outputs = first.get("outputs") if isinstance(first, dict) else None
    if not isinstance(first_outputs, list) or len(first_outputs) != len(base.TASKS):
        raise RuntimeError(f"{CONTRACT}_FIRST_BATCH_OUTPUT_COUNT_INVALID")
    if first.get("production_deploy_performed") is not False:
        raise RuntimeError(f"{CONTRACT}_PRODUCTION_DEPLOY_FORBIDDEN")

    gates = [verified._machine_gate(task, base._text(output.get("result"))) for task, output in zip(base.TASKS, first_outputs, strict=True)]
    repair_indices = [index for index, gate in enumerate(gates) if gate.get("passed") is not True]
    repairs: dict[int, dict[str, Any]] = {}
    second: dict[str, Any] | None = None
    second_remote_wall_ms = 0

    if repair_indices:
        repair_requests = [
            verified._repair_request(
                requests[index],
                base._text(first_outputs[index].get("result")),
                str(gates[index].get("failure") or "MACHINE_GATE_FAILED"),
            )
            for index in repair_indices
        ]
        remote_started = time.perf_counter()
        second = verified.run_owned_batch.remote(repair_requests)
        second_remote_wall_ms = round((time.perf_counter() - remote_started) * 1000)
        second_outputs = second.get("outputs") if isinstance(second, dict) else None
        if not isinstance(second_outputs, list) or len(second_outputs) != len(repair_indices):
            raise RuntimeError(f"{CONTRACT}_REPAIR_BATCH_OUTPUT_COUNT_INVALID")
        if second.get("runtime_instance_id") != first.get("runtime_instance_id"):
            raise RuntimeError(f"{CONTRACT}_WARM_CONTAINER_REUSE_NOT_PROVEN")
        for index, output in zip(repair_indices, second_outputs, strict=True):
            repaired_gate = verified._machine_gate(base.TASKS[index], base._text(output.get("result")))
            if repaired_gate.get("passed") is not True:
                raise RuntimeError(f"{CONTRACT}_REPAIR_GATE_FAILED:{base.TASKS[index]['id']}:{repaired_gate.get('failure')}")
            repairs[index] = {"output": output, "gate": repaired_gate}

    results: list[dict[str, Any]] = []
    for index, (task, _prompt) in enumerate(prompts):
        draft = first_outputs[index]
        selected = repairs.get(index, {}).get("output") or draft
        _validate_identity(task, draft)
        if selected is not draft:
            _validate_identity(task, selected)

        draft_usage = draft.get("usage") if isinstance(draft.get("usage"), dict) else {}
        selected_usage = selected.get("usage") if isinstance(selected.get("usage"), dict) else {}
        repaired = index in repairs
        usage = _usage_sum(draft_usage, selected_usage) if repaired else _usage_sum(draft_usage)
        inference_ms = round(float(draft.get("case_elapsed_seconds") or 0) * 1000)
        gate_ms = int(gates[index].get("gate_ms") or 0)
        if repaired:
            inference_ms += round(float(selected.get("case_elapsed_seconds") or 0) * 1000)
            gate_ms += int(repairs[index]["gate"].get("gate_ms") or 0)
        wall_ms = inference_ms + gate_ms
        scored = base._score(task, base._text(selected.get("result")), wall_ms, usage, None)
        scored.update({
            "repair_used": repaired,
            "machine_gate_passed": True,
            "machine_gate_ms": gate_ms,
            "inference_wall_ms": inference_ms,
            "initial_machine_failure": gates[index].get("failure") if repaired else None,
        })
        results.append(scored)
        print("AVANTIQO_CODE_EXECUTABLE_GATE_CASE=" + json.dumps(scored, separators=(",", ":")), flush=True)

    walls = [int(item.get("wall_ms") or 0) for item in results]
    total_gpu_seconds = float(first.get("scored_gpu_seconds") or 0) + float((second or {}).get("scored_gpu_seconds") or 0)
    owned_model_calls = int(first.get("model_calls") or 0) + int((second or {}).get("model_calls") or 0)
    warmup_model_calls = int(first.get("warmup_model_calls") or 0) + int((second or {}).get("warmup_model_calls") or 0)
    summary = base._summary(base.PRODUCT_MODEL, "avantiqo-code", results, total_gpu_seconds * base.MODAL_H100_USD_PER_SECOND)
    summary.update({
        "contract": CONTRACT,
        "quality_policy": verified.QUALITY_POLICY,
        "repairs_used": len(repair_indices),
        "owned_model_calls": owned_model_calls,
        "warmup_model_calls": warmup_model_calls,
        "total_model_calls": owned_model_calls + warmup_model_calls,
        "owned_gpu_sessions": 1,
        "gpu_function_seconds": round(total_gpu_seconds, 3),
        "first_remote_wall_ms": first_remote_wall_ms,
        "second_remote_wall_ms": second_remote_wall_ms,
        "warm_container_reused": second is None or second.get("runtime_instance_id") == first.get("runtime_instance_id"),
        "warm_latency_target_ms": verified.WARM_LATENCY_TARGET_MS,
        "warm_latency_passed": all(value <= verified.WARM_LATENCY_TARGET_MS for value in walls),
        "warm_max_ms": max(walls),
        "machine_gate_passed": all(item.get("machine_gate_passed") is True for item in results),
        "hidden_tests_sealed_until_final_scoring": True,
        "max_repair_calls_per_case": 1,
        "vllm_enforce_eager": False,
        "production_deploy_performed": False,
    })

    report = {
        "contract": CONTRACT,
        "generated_at_epoch_ms": int(time.time() * 1000),
        "summary": summary,
        "results": results,
        "methodology": {
            "cases": len(base.TASKS),
            "visible_tests_executed_before_acceptance": True,
            "semantic_contract_probes_executed_before_acceptance": True,
            "repair_only_after_machine_failure": True,
            "max_repair_calls_per_case": 1,
            "hidden_tests_sealed_until_final_scoring": True,
            "ai_judge_used": False,
            "production_deploy_performed": False,
        },
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("AVANTIQO_CODE_EXECUTABLE_GATE_SUMMARY=" + json.dumps(summary, separators=(",", ":")), flush=True)
    print(f"{CONTRACT}=PASS")
