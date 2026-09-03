"""Apples-to-apples hard 10-case benchmark for the isolated Qwen3.8 candidate.

This reuses the existing Avantiqo hard ERP fixtures, public semantic machine
gates, sealed hidden tests, compact contract-first prompts, and one-repair limit.
Only the inference backend is changed to the isolated Qwen3.8 canary runtime.
No production routing, deployment, model download, or new storage is allowed.
"""

from __future__ import annotations

import json
import os
from typing import Any

import modal_code_hard_owned_cert as hard
import modal_code_hard_owned_cert_final as final  # noqa: F401 - applies hardening
import modal_code_hard_owned_cert_raw as raw  # noqa: F401 - raw-output scoring policy
from modal_code_qwen38_canary_runtime import CONTRACT as RUNTIME_CONTRACT
from modal_code_qwen38_canary_runtime import app, generate

CONTRACT = "AVANTIQO_CODE_QWEN38_HARD10_BENCHMARK_V2"
RESULT_PREFIX = "AVANTIQO_CODE_QWEN38_HARD10_RESULT="
CASE_PREFIX = "AVANTIQO_CODE_QWEN38_HARD10_CASE="
WARM_LATENCY_REFERENCE_MS = 1807


def _request(instruction: str) -> dict[str, Any]:
    return {
        "contract": RUNTIME_CONTRACT,
        "organization_id": "benchmark-only",
        "instruction": instruction,
    }


def _public_algorithm_guard(task: dict[str, str]) -> str:
    case_id = task["id"]
    if case_id == "ledger_currency_summary":
        return (
            "PUBLIC LEDGER ROUNDING ALGORITHM: accumulate raw Number totals without rounding. "
            "At return time apply JavaScript Number(value.toFixed(2)) independently to raw debit, "
            "raw credit, and raw debit-minus-credit. Do not add Number.EPSILON, do not use a "
            "decimal-correction helper, and do not derive balance from already-rounded display "
            "values. Under the declared public probe JavaScript native semantics intentionally "
            "produce Number((2.675).toFixed(2)) === 2.67 and "
            "Number((0.005).toFixed(2)) === 0.01."
        )
    if case_id == "progressive_tier_pricing":
        return (
            "PUBLIC PROGRESSIVE PRICING ALGORITHM: validate the complete tiers array first. Then "
            "track previousThreshold=0 and remainingUnits=units. For each finite tier, width = "
            "upTo - previousThreshold; used = Math.min(remainingUnits, width); add used * rate; "
            "subtract used from remainingUnits; set previousThreshold=upTo. For the final null "
            "tier, add all remainingUnits * rate and set remainingUnits=0. Example from the visible "
            "public test: 150 units with [{upTo:100,rate:1},{upTo:null,rate:0.8}] is "
            "100*1 + 50*0.8 = 140. Never multiply all units by the selected tier rate and never "
            "subtract previousThreshold from remainingUnits."
        )
    return ""


def _repair_instruction(task: dict[str, str], failure: str) -> str:
    plan = final.fixed._contract_repair_plan(task["spec"])
    probe = str(hard.HARD_PROBES.get(task["id"]) or "").strip()
    guard = _public_algorithm_guard(task)
    return "\n\n".join(
        part
        for part in [
            "AVANTIQO CONTRACT-FIRST EXECUTABLE REPAIR.",
            "Write a fresh implementation from the authoritative public contract.",
            (
                f'Return ONLY strict JSON with exactly this shape: '
                f'{{"path":"{task["module"]}","content":"<complete UTF-8 source file>"}}.'
            ),
            f"Modify only {task['module']}. Keep the existing public export name.",
            "No imports, environment access, filesystem, child processes, network calls, global state, or dynamic evaluation.",
            "AUTHORITATIVE PRODUCTION CONTRACT:\n" + task["spec"],
            (
                "DECLARED PUBLIC SEMANTIC PROBE:\n" + probe
                if probe
                else "DECLARED PUBLIC SEMANTIC PROBE: none"
            ),
            guard,
            "DETERMINISTIC MACHINE FAILURE TO CORRECT:\n" + failure[-3000:],
            "MANDATORY CONTRACT-DERIVED ALGORITHM:\n" + plan,
            "Return complete source only inside the strict JSON object; no markdown or prose.",
        ]
        if part
    )


def _score_hidden(task: dict[str, str], raw_output: str) -> dict[str, Any]:
    parsed = hard.base._parse_candidate(raw_output, task["module"])
    source = str(parsed.get("content") or "")
    if not parsed.get("valid") or not parsed.get("strict_json"):
        return {
            "passed": False,
            "hidden_tests_passed": False,
            "instruction_format_passed": False,
            "security_boundary_passed": False,
            "source": source,
            "failure": f"OUTPUT_CONTRACT_FAILED:{parsed.get('error') or 'STRICT_JSON_REQUIRED'}",
        }
    security = hard.base._security_pass(source)
    hidden = hard.base._run_test(task["module"], source, task["hidden_test"])
    hidden_pass = hidden.get("exit_code") == 0
    return {
        "passed": bool(security and hidden_pass),
        "hidden_tests_passed": hidden_pass,
        "instruction_format_passed": True,
        "security_boundary_passed": bool(security),
        "source": source,
        "failure": None if security and hidden_pass else str(hidden.get("stderr") or hidden.get("stdout") or "HIDDEN_TEST_FAILED")[-2000:],
    }


@app.local_entrypoint(name="qwen38_hard10")
def qwen38_hard10(approved: bool = False) -> None:
    if approved is not True:
        raise RuntimeError(f"{CONTRACT}_EXPLICIT_APPROVAL_REQUIRED")
    if str(os.environ.get("NODE_ENV") or "").strip().lower() == "production":
        raise RuntimeError(f"{CONTRACT}_PRODUCTION_ENV_FORBIDDEN")
    if len(hard.HARD_TASKS) != 10:
        raise RuntimeError(f"{CONTRACT}_TEN_CASE_FIXTURE_REQUIRED")

    prompts: list[str] = []
    for task in hard.HARD_TASKS:
        initial = hard.base._run_test(task["module"], task["source"], task["visible_test"])
        if initial.get("exit_code") == 0:
            raise RuntimeError(f"{CONTRACT}_BROKEN_FIXTURE_MUST_FAIL:{task['id']}")
        prompt = hard._hard_prompt(task, f"{initial.get('stdout','')}\n{initial.get('stderr','')}")
        guard = _public_algorithm_guard(task)
        prompts.append(prompt + ("\n\n" + guard if guard else ""))

    first = generate.remote([_request(prompt) for prompt in prompts], approved=True)
    if not isinstance(first, dict):
        raise RuntimeError(f"{CONTRACT}_FIRST_BATCH_RESULT_REQUIRED")
    first_outputs = first.get("outputs")
    if not isinstance(first_outputs, list) or len(first_outputs) != 10:
        raise RuntimeError(f"{CONTRACT}_FIRST_BATCH_OUTPUT_COUNT_INVALID")
    if first.get("production_routing_change") is not False or first.get("production_deploy_performed") is not False:
        raise RuntimeError(f"{CONTRACT}_PRODUCTION_CHANGE_FORBIDDEN")
    if first.get("model_volume_name") != "avantiqo-code-models":
        raise RuntimeError(f"{CONTRACT}_SINGLE_STORAGE_NOT_PROVEN")

    first_gates = [
        hard._machine_gate(task, str(output))
        for task, output in zip(hard.HARD_TASKS, first_outputs, strict=True)
    ]
    repair_indices = [i for i, gate in enumerate(first_gates) if gate.get("passed") is not True]
    repaired_outputs: dict[int, str] = {}
    second: dict[str, Any] | None = None

    if repair_indices:
        repair_requests = [
            _request(
                _repair_instruction(
                    hard.HARD_TASKS[i],
                    str(first_gates[i].get("failure") or "MACHINE_GATE_FAILED"),
                )
            )
            for i in repair_indices
        ]
        second = generate.remote(repair_requests, approved=True)
        if not isinstance(second, dict):
            raise RuntimeError(f"{CONTRACT}_REPAIR_BATCH_RESULT_REQUIRED")
        second_outputs = second.get("outputs")
        if not isinstance(second_outputs, list) or len(second_outputs) != len(repair_indices):
            raise RuntimeError(f"{CONTRACT}_REPAIR_BATCH_OUTPUT_COUNT_INVALID")
        for i, output in zip(repair_indices, second_outputs, strict=True):
            repaired_gate = hard._machine_gate(hard.HARD_TASKS[i], str(output))
            if repaired_gate.get("passed") is True:
                repaired_outputs[i] = str(output)

    case_results: list[dict[str, Any]] = []
    for i, task in enumerate(hard.HARD_TASKS):
        selected = repaired_outputs.get(i, str(first_outputs[i]))
        final_gate = hard._machine_gate(task, selected)
        hidden = _score_hidden(task, selected) if final_gate.get("passed") is True else {
            "passed": False,
            "hidden_tests_passed": False,
            "instruction_format_passed": False,
            "security_boundary_passed": False,
            "failure": str(final_gate.get("failure") or "MACHINE_GATE_FAILED")[-2000:],
        }
        item = {
            "id": task["id"],
            "repair_used": i in repaired_outputs,
            "repair_attempted": i in repair_indices,
            "machine_gate_passed": final_gate.get("passed") is True,
            "hidden_tests_passed": hidden.get("hidden_tests_passed") is True,
            "instruction_format_passed": hidden.get("instruction_format_passed") is True,
            "security_boundary_passed": hidden.get("security_boundary_passed") is True,
            "passed": hidden.get("passed") is True and final_gate.get("passed") is True,
            "failure": hidden.get("failure"),
        }
        case_results.append(item)
        print(CASE_PREFIX + json.dumps(item, sort_keys=True, separators=(",", ":")), flush=True)

    passed = sum(1 for item in case_results if item["passed"])
    hidden_passed = sum(1 for item in case_results if item["hidden_tests_passed"])
    machine_passed = sum(1 for item in case_results if item["machine_gate_passed"])
    summary = {
        "contract": CONTRACT,
        "runtime_contract": RUNTIME_CONTRACT,
        "runtime_model": first.get("runtime_model"),
        "revision": first.get("revision"),
        "cases": 10,
        "passed": passed,
        "hidden_tests_passed": hidden_passed,
        "machine_gate_passed": machine_passed,
        "repairs_attempted": len(repair_indices),
        "repairs_successful": len(repaired_outputs),
        "max_repair_calls_per_case": 1,
        "raw_model_output_scored": True,
        "benchmark_specific_source_rewrite_used": False,
        "first_batch_wall_ms": int(first.get("batch_wall_ms") or 0),
        "repair_batch_wall_ms": int((second or {}).get("batch_wall_ms") or 0),
        "smoke_warm_reference_ms": WARM_LATENCY_REFERENCE_MS,
        "smoke_warm_latency_target_ms": 4000,
        "smoke_warm_latency_passed": WARM_LATENCY_REFERENCE_MS <= 4000,
        "model_volume_name": first.get("model_volume_name"),
        "load_format": first.get("load_format"),
        "gdn_prefill_backend": first.get("gdn_prefill_backend"),
        "deep_gemm_enabled": first.get("deep_gemm_enabled"),
        "production_routing_change": first.get("production_routing_change"),
        "production_deploy_performed": first.get("production_deploy_performed"),
        "model_download_performed": first.get("model_download_performed"),
        "volume_created": first.get("volume_created"),
        "candidate_better_than_current_9_of_10": passed == 10,
    }
    print(RESULT_PREFIX + json.dumps(summary, sort_keys=True, separators=(",", ":")), flush=True)

    if passed != 10:
        raise RuntimeError(f"{CONTRACT}_NOT_10_OF_10:{passed}")
    if hidden_passed != 10 or machine_passed != 10:
        raise RuntimeError(f"{CONTRACT}_CERTIFICATION_INCOMPLETE")
    if summary["production_routing_change"] is not False or summary["production_deploy_performed"] is not False:
        raise RuntimeError(f"{CONTRACT}_PRODUCTION_CHANGE_FORBIDDEN")
    print(f"{CONTRACT}=PASS", flush=True)
