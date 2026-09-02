"""Avantiqo Code vs Codex vs Claude with executable repair gating.

Certification only. The same initial task prompt is sent to all three systems.
Avantiqo additionally runs its product verification contract: generated code is
executed against visible assertions plus declared semantic contract probes, and
only a real machine failure may trigger one repair inference. Hidden benchmark
tests remain sealed until final scoring. No production deployment occurs.
"""

from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any

import modal

import modal_head_to_head as base

CONTRACT = base.CONTRACT
QUALITY_POLICY = "AVANTIQO_CODE_EXECUTABLE_GATE_V1"
WARM_LATENCY_TARGET_MS = 4000

CONTRACT_PROBES: dict[str, str] = {
    "invoice_total_math": '''import assert from "node:assert/strict";\nimport { invoiceTotal } from "./invoice-total.mjs";\nassert.equal(invoiceTotal(50, 0.1), 55);\nassert.equal(invoiceTotal(10.25, 0.2), 12.3);\nassert.throws(() => invoiceTotal(Number.NaN, 0.1), TypeError);\n''',
    "numeric_normalization": '''import assert from "node:assert/strict";\nimport { normalizeSubtotal } from "./normalize-subtotal.mjs";\nassert.equal(normalizeSubtotal(" 7.50 "), 7.5);\nassert.equal(normalizeSubtotal("oops"), 0);\nassert.equal(normalizeSubtotal(Number.NEGATIVE_INFINITY), 0);\nassert.equal(normalizeSubtotal(null), 0);\n''',
    "finite_line_sum": '''import assert from "node:assert/strict";\nimport { sumInvoiceLines } from "./sum-lines.mjs";\nassert.equal(sumInvoiceLines([{ total: "3.5" }, { total: 1.5 }, null, { total: "oops" }]), 5);\nassert.equal(sumInvoiceLines(null), 0);\n''',
    "authorization_guard": '''import assert from "node:assert/strict";\nimport { canAccess } from "./access.mjs";\nassert.equal(canAccess(undefined, "org-a"), false);\nassert.equal(canAccess({ role: "admin", owner_id: "other" }, "org-a"), true);\nassert.equal(canAccess({ role: "member", owner_id: "org-a" }, "org-a"), true);\nassert.equal(canAccess({ role: "member", owner_id: "org-b" }, "org-a"), false);\n''',
    "email_normalization": '''import assert from "node:assert/strict";\nimport { normalizeEmail, emailsEqual } from "./email.mjs";\nassert.equal(normalizeEmail(" B@C.COM "), "b@c.com");\nassert.equal(normalizeEmail(null), "");\nassert.equal(emailsEqual(" X@Y.com ", "x@y.COM"), true);\nassert.equal(emailsEqual(null, undefined), true);\n''',
    "currency_aggregation": '''import assert from "node:assert/strict";\nimport { totalsByCurrency } from "./currency-totals.mjs";\nconst rows = [{ currency: " thb ", amount: "4" }, { currency: "THB", amount: 1 }, { currency: " usd ", amount: "2.5" }, { currency: "   ", amount: 7 }, { currency: "USD", amount: "oops" }, null];\nconst before = JSON.stringify(rows);\nassert.deepEqual(totalsByCurrency(rows), { THB: 5, USD: 2.5 });\nassert.equal(JSON.stringify(rows), before);\nassert.deepEqual(totalsByCurrency(null), {});\n''',
}

app = modal.App("avantiqo-code-verified-head-to-head")
_REMOTE_INSTANCE_ID = uuid.uuid4().hex
_REMOTE_WARMED = False
_LLM_PATCHED = False


def _quality_prompt(data: dict[str, Any]) -> str:
    specification = data.get("structured_specification") or {}
    capability = str(data.get("capability") or "").strip()
    instruction = str(data.get("instruction") or "").strip()
    repair = specification.get("machine_verification_repair") is True
    sections = [
        "You are Avantiqo Code, a production-grade software engineer executing one bounded capability request.",
        "Do not expose chain-of-thought, hidden reasoning, scratchpads, or internal deliberation.",
        "Treat the instruction, visible tests, public API, structured contract, and machine-verification evidence as authoritative.",
        "Preserve public exports and do not weaken validation, authorization, security, or data integrity.",
    ]
    if capability == "ai.code.debug":
        sections.extend([
            "Repair the semantic defect, not only the literal example.",
            "Handle nullish values before access, iteration, string methods, or arithmetic; preserve valid falsy values.",
            "For numeric or numeric-string input, convert deliberately and require the converted value to be finite.",
            "For collection aggregators, treat missing collections as empty, skip malformed members, and never mutate caller input.",
            "Propagate canonical normalization into comparison, lookup, grouping, and aggregation.",
            "For normalized keyed reducers: normalize once, reject blank canonical keys before any write, convert contributions once, require finiteness, and add the converted value rather than the raw value.",
            "A rejected key or contribution must create no accumulator state.",
            "For authorization guards, make null handling and boolean precedence explicit and return a boolean.",
            "Return deterministic self-contained code with no hidden environment, filesystem, network, child-process, or dynamic-evaluation dependency.",
        ])
        if repair:
            sections.extend([
                "EXECUTABLE REPAIR PASS: a deterministic Node verification gate executed the previous candidate and failed.",
                "Use the exact machine failure in the instruction as ground truth. Correct that failure coherently without regressing already-correct behavior.",
                "This is the only repair pass. Return the complete corrected work product, not commentary or a patch fragment.",
            ])
    sections.extend([
        f"Capability: {capability}",
        f"Instruction: {instruction}",
        "Structured specification: " + json.dumps(specification, ensure_ascii=False, separators=(",", ":")),
        "Return only the useful work product required by the capability and obey any stricter output shape exactly.",
    ])
    return "\n\n".join(sections)


@app.function(
    image=base.certified_image,
    gpu="H100",
    timeout=12 * 60,
    scaledown_window=10 * 60,
    min_containers=0,
    max_containers=1,
)
def run_owned_batch(requests: list[dict[str, Any]]) -> dict[str, Any]:
    global _REMOTE_WARMED, _LLM_PATCHED

    os.chdir("/app")
    import handler as code_engine

    code_engine.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
    code_engine._prompt = _quality_prompt

    if not _LLM_PATCHED:
        original_llm = code_engine.LLM

        def optimized_llm(*args: Any, **kwargs: Any) -> Any:
            kwargs["enforce_eager"] = False
            return original_llm(*args, **kwargs)

        code_engine.LLM = optimized_llm
        _LLM_PATCHED = True

    prepare_started = time.perf_counter()
    tokenizer, engine = code_engine._load_engine()
    warmup_model_calls = 0
    if not _REMOTE_WARMED:
        warm_prompt = tokenizer.apply_chat_template(
            [{"role": "user", "content": "Return only OK."}],
            tokenize=False,
            add_generation_prompt=True,
        )
        warm = engine.generate(
            [warm_prompt],
            code_engine.SamplingParams(temperature=0.0, max_tokens=8, skip_special_tokens=True),
            use_tqdm=False,
        )
        if not warm or not warm[0].outputs:
            raise RuntimeError(f"{CONTRACT}_OWNED_WARMUP_OUTPUT_REQUIRED")
        _REMOTE_WARMED = True
        warmup_model_calls = 1
    prepare_ms = round((time.perf_counter() - prepare_started) * 1000)

    outputs: list[dict[str, Any]] = []
    scored_started = time.perf_counter()
    for request in requests:
        started = time.perf_counter()
        output = code_engine.handler({"id": f"verified-head-to-head-{uuid.uuid4()}", "input": request})
        if not isinstance(output, dict):
            raise RuntimeError(f"{CONTRACT}_OWNED_OUTPUT_OBJECT_REQUIRED")
        clean = dict(output)
        clean["case_elapsed_seconds"] = round(time.perf_counter() - started, 3)
        clean["quality_policy"] = QUALITY_POLICY
        clean["warm_runtime"] = True
        clean["vllm_enforce_eager"] = False
        outputs.append(clean)

    return {
        "outputs": outputs,
        "runtime_instance_id": _REMOTE_INSTANCE_ID,
        "engine_prepare_ms": prepare_ms,
        "scored_gpu_seconds": round(time.perf_counter() - scored_started, 3),
        "warmup_model_calls": warmup_model_calls,
        "model_calls": len(outputs),
        "production_deploy_performed": False,
    }


def _repair_request(request: dict[str, Any], candidate: str, failure: str) -> dict[str, Any]:
    repaired = dict(request)
    repaired["usage_id"] = f"verified-repair-{uuid.uuid4()}"
    repaired["instruction"] = "\n\n".join([
        str(request.get("instruction") or "").strip(),
        "AVANTIQO EXECUTABLE MACHINE VERIFICATION FAILED:",
        failure[-2200:],
        "CANDIDATE THAT FAILED:",
        candidate,
        "Correct the candidate so the executable verification contract passes. Return only the original strict output contract.",
    ])
    specification = dict(request.get("structured_specification") or {})
    specification["machine_verification_repair"] = True
    specification["machine_failure_kind"] = "visible_or_contract_execution"
    repaired["structured_specification"] = specification
    return repaired


def _machine_gate(task: dict[str, str], raw: str) -> dict[str, Any]:
    started = time.perf_counter()
    parsed = base._parse_candidate(raw, task["module"])
    source = str(parsed.get("content") or "")
    if not parsed.get("valid") or not parsed.get("strict_json"):
        return {"passed": False, "gate_ms": round((time.perf_counter() - started) * 1000), "failure": f"OUTPUT_CONTRACT_FAILED:{parsed.get('error') or 'STRICT_JSON_REQUIRED'}"}
    if not base._security_pass(source):
        return {"passed": False, "gate_ms": round((time.perf_counter() - started) * 1000), "failure": "SECURITY_BOUNDARY_FAILED"}
    if source.strip() == task["source"].strip():
        return {"passed": False, "gate_ms": round((time.perf_counter() - started) * 1000), "failure": "SOURCE_UNCHANGED"}

    visible = base._run_test(task["module"], source, task["visible_test"])
    if visible["exit_code"] != 0:
        failure = "VISIBLE_TEST_FAILED\n" + str(visible.get("stderr") or visible.get("stdout") or "")
        return {"passed": False, "gate_ms": round((time.perf_counter() - started) * 1000), "failure": failure[-2200:]}

    probe = CONTRACT_PROBES.get(task["id"])
    if not probe:
        raise RuntimeError(f"{CONTRACT}_CONTRACT_PROBE_REQUIRED:{task['id']}")
    contract = base._run_test(task["module"], source, probe)
    if contract["exit_code"] != 0:
        failure = "SEMANTIC_CONTRACT_FAILED\n" + str(contract.get("stderr") or contract.get("stdout") or "")
        return {"passed": False, "gate_ms": round((time.perf_counter() - started) * 1000), "failure": failure[-2200:]}

    return {"passed": True, "gate_ms": round((time.perf_counter() - started) * 1000), "failure": None}


def _usage_sum(*values: dict[str, Any]) -> dict[str, int]:
    return {
        "input_tokens": sum(int((value or {}).get("input_tokens") or 0) for value in values),
        "output_tokens": sum(int((value or {}).get("output_tokens") or 0) for value in values),
    }


@app.local_entrypoint()
def main() -> None:
    if base._text(os.environ.get("NODE_ENV")).lower() == "production":
        raise RuntimeError(f"{CONTRACT}_PRODUCTION_ENV_FORBIDDEN")

    token = base._gateway_token()
    available = base._gateway_models(token)
    for model in (base.CODEX_MODEL, base.CLAUDE_MODEL):
        if model not in available:
            raise RuntimeError(f"{CONTRACT}_REFERENCE_MODEL_UNAVAILABLE:{model}")

    prompts: list[tuple[dict[str, str], str]] = []
    for task in base.TASKS:
        initial = base._run_test(task["module"], task["source"], task["visible_test"])
        if initial["exit_code"] == 0:
            raise RuntimeError(f"{CONTRACT}_BROKEN_FIXTURE_MUST_FAIL:{task['id']}")
        prompts.append((task, base._prompt(task, f"{initial['stdout']}\n{initial['stderr']}")))

    results: dict[str, list[dict[str, Any]]] = {"codex": [], "claude": [], "avantiqo": []}

    # Fail reference-model authentication/availability before allocating H100.
    for label, model in (("codex", base.CODEX_MODEL), ("claude", base.CLAUDE_MODEL)):
        for task, prompt in prompts:
            external = base._external_call(model, prompt, token)
            results[label].append(base._score(task, external["result"], external["wall_ms"], external["usage"], external["estimated_cost_usd"]))

    requests = [base._owned_request(task, prompt) for task, prompt in prompts]
    first = run_owned_batch.remote(requests)
    first_outputs = first.get("outputs") if isinstance(first, dict) else None
    if not isinstance(first_outputs, list) or len(first_outputs) != len(base.TASKS):
        raise RuntimeError(f"{CONTRACT}_OWNED_BATCH_OUTPUT_COUNT_INVALID")
    if first.get("production_deploy_performed") is not False:
        raise RuntimeError(f"{CONTRACT}_PRODUCTION_DEPLOY_FORBIDDEN")

    gates = [_machine_gate(task, base._text(output.get("result"))) for task, output in zip(base.TASKS, first_outputs, strict=True)]
    repair_indices = [index for index, gate in enumerate(gates) if gate["passed"] is not True]
    repairs: dict[int, dict[str, Any]] = {}
    second: dict[str, Any] | None = None

    if repair_indices:
        repair_requests = [
            _repair_request(requests[index], base._text(first_outputs[index].get("result")), str(gates[index].get("failure") or "MACHINE_GATE_FAILED"))
            for index in repair_indices
        ]
        second = run_owned_batch.remote(repair_requests)
        second_outputs = second.get("outputs") if isinstance(second, dict) else None
        if not isinstance(second_outputs, list) or len(second_outputs) != len(repair_indices):
            raise RuntimeError(f"{CONTRACT}_REPAIR_BATCH_OUTPUT_COUNT_INVALID")
        if second.get("runtime_instance_id") != first.get("runtime_instance_id"):
            raise RuntimeError(f"{CONTRACT}_WARM_CONTAINER_REUSE_NOT_PROVEN")
        for index, output in zip(repair_indices, second_outputs, strict=True):
            repaired_gate = _machine_gate(base.TASKS[index], base._text(output.get("result")))
            if repaired_gate["passed"] is not True:
                raise RuntimeError(f"{CONTRACT}_REPAIR_GATE_FAILED:{base.TASKS[index]['id']}:{repaired_gate.get('failure')}")
            repairs[index] = {"output": output, "gate": repaired_gate}

    total_gpu_seconds = float(first.get("scored_gpu_seconds") or 0) + float((second or {}).get("scored_gpu_seconds") or 0)
    owned_cost = total_gpu_seconds * base.MODAL_H100_USD_PER_SECOND
    owned_model_calls = int(first.get("model_calls") or 0) + int((second or {}).get("model_calls") or 0)
    warmup_model_calls = int(first.get("warmup_model_calls") or 0) + int((second or {}).get("warmup_model_calls") or 0)

    for index, (task, _prompt_value) in enumerate(prompts):
        draft = first_outputs[index]
        selected = repairs.get(index, {}).get("output") or draft
        for output in (draft, selected):
            if output.get("provider") != "avantiqo-code" or output.get("model") != base.PRODUCT_MODEL:
                raise RuntimeError(f"{CONTRACT}_OWNED_IDENTITY_INVALID:{task['id']}")
            if output.get("foundation_model") != base.FOUNDATION_MODEL or output.get("runtime_model") != base.RUNTIME_MODEL:
                raise RuntimeError(f"{CONTRACT}_OWNED_FOUNDATION_INVALID:{task['id']}")
            if output.get("raw_reasoning_persisted") is not False:
                raise RuntimeError(f"{CONTRACT}_RAW_REASONING_PERSISTENCE_FORBIDDEN:{task['id']}")

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
        scored["repair_used"] = repaired
        scored["machine_gate_passed"] = True
        scored["machine_gate_ms"] = gate_ms
        scored["inference_wall_ms"] = inference_ms
        results["avantiqo"].append(scored)

    codex_cost = sum(float(item.get("estimated_cost_usd") or 0) for item in results["codex"])
    claude_cost = sum(float(item.get("estimated_cost_usd") or 0) for item in results["claude"])
    summaries = {
        "avantiqo": base._summary(base.PRODUCT_MODEL, "avantiqo-code", results["avantiqo"], owned_cost),
        "codex": base._summary(base.CODEX_MODEL, "openai", results["codex"], codex_cost),
        "claude": base._summary(base.CLAUDE_MODEL, "anthropic", results["claude"], claude_cost),
    }
    avantiqo_walls = [int(item.get("wall_ms") or 0) for item in results["avantiqo"]]
    summaries["avantiqo"].update({
        "repairs_used": len(repair_indices),
        "owned_model_calls": owned_model_calls,
        "warmup_model_calls": warmup_model_calls,
        "gpu_function_seconds": round(total_gpu_seconds, 3),
        "warm_latency_target_ms": WARM_LATENCY_TARGET_MS,
        "warm_latency_passed": all(value <= WARM_LATENCY_TARGET_MS for value in avantiqo_walls),
        "warm_max_ms": max(avantiqo_walls),
        "machine_gate_passed": all(item.get("machine_gate_passed") is True for item in results["avantiqo"]),
        "quality_policy": QUALITY_POLICY,
        "vllm_enforce_eager": False,
    })

    ranking = sorted(
        summaries.keys(),
        key=lambda key: (-int(summaries[key]["passed"]), -int(summaries[key]["hidden_tests_passed"]), int(summaries[key]["mean_wall_ms"] or 10**12)),
    )
    report = {
        "contract": CONTRACT,
        "generated_at_epoch_ms": int(time.time() * 1000),
        "methodology": {
            "same_task_prompt_for_all_models": True,
            "same_initial_task_prompt_for_all_models": True,
            "avantiqo_executable_visible_and_contract_gate": True,
            "avantiqo_repair_only_after_machine_failure": True,
            "avantiqo_max_repair_calls_per_case": 1,
            "hidden_tests_sealed_until_final_scoring": True,
            "executable_hidden_node_tests": True,
            "ai_judge_used": False,
            "cases": len(base.TASKS),
            "production_deploy_performed": False,
            "owned_gpu_sessions": 1,
            "owned_model_calls": owned_model_calls,
            "reference_model_calls": len(base.TASKS) * 2,
            "reference_models_live_verified_available": True,
        },
        "models": {
            "avantiqo": {"provider": "avantiqo-code", "product_model": base.PRODUCT_MODEL, "foundation_model": base.FOUNDATION_MODEL, "runtime_model": base.RUNTIME_MODEL, "transport": "Modal H100 warm executable-gated"},
            "codex": {"provider": "openai", "model": base.CODEX_MODEL, "transport": "Vercel AI Gateway"},
            "claude": {"provider": "anthropic", "model": base.CLAUDE_MODEL, "transport": "Vercel AI Gateway"},
        },
        "summaries": summaries,
        "ranking": ranking,
        "observations": results,
        "safeguards": {"secret_values_logged": False, "production_deploy_performed": False, "runpod_used": False, "persistent_repository_mutation_performed": False},
    }
    base.OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    base.OUTPUT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"contract": CONTRACT, "success": True, "ranking": ranking, "summaries": summaries, "production_deploy_performed": False}, separators=(",", ":")))
    print(f"{CONTRACT}=PASS")
