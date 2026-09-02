from __future__ import annotations

import hashlib
import json
import os
import time
import uuid
from pathlib import Path
from typing import Any

import modal

CONTRACT = "AVANTIQO_CODE_OWNED_HEAD_TO_HEAD_V2"
QUALITY_POLICY_VERSION = "AVANTIQO_CODE_DEBUG_QUALITY_POLICY_V2"
PRODUCT_MODEL = "avantiqo-code-v1"
FOUNDATION_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct"
RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8"
BASE_IMAGE_ID = "im-jAkmG5niafDQsnuSUxak9c"
OUTPUT_PATH = Path("artifacts/avantiqo-code-owned-head-to-head-v2.json")
WARM_LATENCY_TARGET_MS = 4000

app = modal.App("avantiqo-code-owned-head-to-head-v2")
image = modal.Image.from_id(BASE_IMAGE_ID).env(
    {
        "VLLM_ENABLE_V1_MULTIPROCESSING": "0",
        "VLLM_WORKER_MULTIPROC_METHOD": "spawn",
        "VLLM_USE_FLASHINFER_SAMPLER": "0",
        "AVANTIQO_CODE_MAX_NEW_TOKENS": "768",
        "AVANTIQO_CODE_REQUIRE_CACHED_MODEL": "1",
    }
)


def _candidate_internal_prompt(data: dict[str, Any]) -> str:
    specification = data.get("structured_specification") or {}
    capability = str(data.get("capability") or "").strip()
    instruction = str(data.get("instruction") or "").strip()
    sections = [
        "You are Avantiqo Code, a production-grade software engineer executing one bounded capability request.",
        "Do not expose chain-of-thought, hidden reasoning, scratchpads, or internal deliberation.",
        "Treat the supplied instruction, visible tests, public API, and structured output contract as authoritative.",
        "Preserve every existing public export unless the request explicitly requires otherwise.",
        "Do not weaken validation, authorization, security, or data-integrity behavior merely to satisfy one visible assertion.",
    ]
    if capability == "ai.code.debug":
        sections.extend([
            "DEBUG QUALITY GATE — complete this verification privately before emitting the patch:",
            "1. Identify the actual semantic defect, not only the literal visible assertion, and repair the smallest coherent behavior.",
            "2. VISIBLE-ASSERTION LOCK: privately execute every supplied visible assertion line by line against the proposed source before returning it. Exact equality, deep equality, key names, key coalescing, omitted values, and value types must match exactly. Never emit a candidate that you can see would still fail a visible assertion.",
            "3. Check null and undefined inputs before property access, iteration, string methods, or arithmetic. A normalizer must map nullish inputs to the canonical neutral representation implied by its public contract rather than leaking null/undefined through unchanged.",
            "4. Distinguish valid falsy values such as 0, false, and empty strings from missing values; do not use truthiness when it changes domain semantics.",
            "5. When accepting numeric or numeric-string input, coerce deliberately and require Number.isFinite on the converted value so NaN and positive/negative Infinity cannot leak into results.",
            "6. For arrays and collections, treat a missing/null collection as the neutral empty collection when the API is an aggregator; skip malformed/null entries safely; never mutate caller-owned inputs.",
            "7. NORMALIZATION PROPAGATION: if visible behavior establishes a canonical representation, derive that canonical value before comparison, lookup, grouping, or aggregation and use the same rule consistently in every related public function. Higher-level comparators and aggregators must not bypass the normalizer semantics.",
            "8. For string or identifier keys, when visible behavior demonstrates equivalence after trimming or case folding, canonicalize before reading or writing aggregation state. Reject canonical blank keys when blank identifiers have no semantic identity.",
            "9. For collection aggregation, validate each entry and each numeric contribution independently: normalize the key first, coerce the value deliberately, require a finite converted number, then aggregate only valid contributions into the canonical key. Once a value has been normalized or converted for validation, carry that exact validated value into the computation; never validate one representation and then aggregate, compare, or calculate with the unconverted raw input.",
            "10. For authorization or boolean guards, make null handling and operator precedence explicit and return a real boolean.",
            "11. For rates, percentages, money, quantities, and totals, infer the intended arithmetic from names plus tests and validate finite operands before calculation.",
            "12. Preserve deterministic behavior and avoid unnecessary dependencies, side effects, environment access, network access, filesystem access, dynamic evaluation, or hidden state.",
            "13. After the visible-test replay, privately challenge the candidate with reasonable boundary cases implied by the function names and public relationships: nullish values, valid falsy values, malformed collection members, non-finite numerics, duplicate semantic keys, normalization equivalence, and immutability. Correct any failure before responding.",
            "The quality gate is internal only. Return no checklist, explanation, markdown, or reasoning unless the requested output contract explicitly asks for it.",
        ])
    sections.extend([
        f"Capability: {capability}",
        f"Instruction: {instruction}",
        "Structured specification: " + json.dumps(specification, ensure_ascii=False, separators=(",", ":")),
        "Return only the useful work product required by the capability and obey any stricter output shape in the instruction exactly.",
    ])
    return "\n\n".join(sections)


@app.function(
    image=image,
    gpu="H100",
    timeout=6 * 60,
    scaledown_window=60,
    min_containers=0,
    max_containers=1,
)
def run_owned_batch(requests: list[dict[str, Any]]) -> dict[str, Any]:
    os.chdir("/app")
    import handler as code_engine

    code_engine.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
    code_engine._prompt = _candidate_internal_prompt

    original_llm = code_engine.LLM

    def optimized_llm(*args: Any, **kwargs: Any) -> Any:
        kwargs["enforce_eager"] = False
        return original_llm(*args, **kwargs)

    code_engine.LLM = optimized_llm

    prepare_started = time.perf_counter()
    tokenizer, engine = code_engine._load_engine()
    warm_prompt = tokenizer.apply_chat_template(
        [{"role": "user", "content": "Return only OK."}],
        tokenize=False,
        add_generation_prompt=True,
    )
    warm_outputs = engine.generate(
        [warm_prompt],
        code_engine.SamplingParams(
            temperature=0.0,
            max_tokens=8,
            skip_special_tokens=True,
        ),
        use_tqdm=False,
    )
    if not warm_outputs or not warm_outputs[0].outputs:
        raise RuntimeError(f"{CONTRACT}_WARMUP_OUTPUT_REQUIRED")
    prepare_ms = round((time.perf_counter() - prepare_started) * 1000)

    scored_started = time.perf_counter()
    outputs = []
    for request in requests:
        case_started = time.perf_counter()
        output = code_engine.handler({"id": f"owned-head-to-head-v2-{uuid.uuid4()}", "input": request})
        if not isinstance(output, dict):
            raise RuntimeError(f"{CONTRACT}_OWNED_OUTPUT_OBJECT_REQUIRED")
        clean = dict(output)
        clean["case_elapsed_seconds"] = round(time.perf_counter() - case_started, 3)
        clean["quality_policy"] = QUALITY_POLICY_VERSION
        clean["warm_runtime"] = True
        clean["vllm_enforce_eager"] = False
        outputs.append(clean)

    return {
        "outputs": outputs,
        "engine_prepare_ms": prepare_ms,
        "scored_gpu_seconds": round(time.perf_counter() - scored_started, 3),
        "quality_policy": QUALITY_POLICY_VERSION,
        "warmup_model_calls": 1,
        "scored_model_calls": len(outputs),
        "vllm_enforce_eager": False,
    }


@app.local_entrypoint()
def main() -> None:
    if str(os.environ.get("NODE_ENV") or "").strip().lower() == "production":
        raise RuntimeError(f"{CONTRACT}_PRODUCTION_ENV_FORBIDDEN")

    import modal_owned_head_to_head as base

    batch = run_owned_batch.remote([base._request(task) for task in base.TASKS])
    outputs = batch.get("outputs") if isinstance(batch, dict) else None
    if not isinstance(outputs, list) or len(outputs) != len(base.TASKS):
        raise RuntimeError(f"{CONTRACT}_OUTPUT_COUNT_INVALID")
    if batch.get("quality_policy") != QUALITY_POLICY_VERSION:
        raise RuntimeError(f"{CONTRACT}_QUALITY_POLICY_NOT_PROVEN")

    results = []
    for task, output in zip(base.TASKS, outputs):
        if output.get("provider") != "avantiqo-code" or output.get("model") != PRODUCT_MODEL:
            raise RuntimeError(f"{CONTRACT}_OWNED_IDENTITY_INVALID:{task['id']}")
        if output.get("foundation_model") != FOUNDATION_MODEL or output.get("runtime_model") != RUNTIME_MODEL:
            raise RuntimeError(f"{CONTRACT}_OWNED_MODEL_INVALID:{task['id']}")
        if output.get("raw_reasoning_persisted") is not False:
            raise RuntimeError(f"{CONTRACT}_RAW_REASONING_FORBIDDEN:{task['id']}")
        if output.get("quality_policy") != QUALITY_POLICY_VERSION:
            raise RuntimeError(f"{CONTRACT}_QUALITY_POLICY_NOT_PROVEN:{task['id']}")
        if output.get("warm_runtime") is not True or output.get("vllm_enforce_eager") is not False:
            raise RuntimeError(f"{CONTRACT}_WARM_RUNTIME_NOT_PROVEN:{task['id']}")

        raw = str(output.get("result") or "")
        parsed = base._parse(raw, task["module"])
        source = parsed["content"]
        security = bool(parsed["valid"] and base._security(source))
        changed = bool(source and source.strip() != task["source"].strip())
        test = base._run_test(task, source) if security and changed else {"exit_code": 1, "stderr": parsed.get("error") or "not executed"}
        usage = output.get("usage") if isinstance(output.get("usage"), dict) else {}
        wall_ms = round(float(output.get("case_elapsed_seconds") or 0) * 1000)
        row = {
            "case": task["id"],
            "hidden_pass": test["exit_code"] == 0,
            "hidden_error": None if test["exit_code"] == 0 else str(test.get("stderr") or "")[-300:],
            "strict_json": bool(parsed["strict"]),
            "security_pass": security,
            "source_changed": changed,
            "passed": bool(test["exit_code"] == 0 and parsed["strict"] and security and changed),
            "wall_ms": wall_ms,
            "latency_target_ms": WARM_LATENCY_TARGET_MS,
            "latency_pass": wall_ms <= WARM_LATENCY_TARGET_MS,
            "input_tokens": int(usage.get("input_tokens") or 0),
            "output_tokens": int(usage.get("output_tokens") or 0),
            "raw_sha256": hashlib.sha256(raw.encode("utf-8")).hexdigest(),
        }
        results.append(row)
        print("AVANTIQO_OWNED_V2_BENCHMARK_RESULT=" + json.dumps(row, separators=(",", ":")), flush=True)

    walls = sorted(row["wall_ms"] for row in results)
    p95_index = min(len(walls) - 1, max(0, int((len(walls) * 0.95) + 0.999999) - 1))
    summary = {
        "contract": CONTRACT,
        "model": PRODUCT_MODEL,
        "foundation_model": FOUNDATION_MODEL,
        "runtime_model": RUNTIME_MODEL,
        "quality_policy": QUALITY_POLICY_VERSION,
        "passed": sum(1 for row in results if row["passed"]),
        "total": len(results),
        "hidden_passed": sum(1 for row in results if row["hidden_pass"]),
        "strict_json": sum(1 for row in results if row["strict_json"]),
        "security_passed": sum(1 for row in results if row["security_pass"]),
        "warm_latency_target_ms": WARM_LATENCY_TARGET_MS,
        "warm_latency_passed": all(row["latency_pass"] for row in results),
        "warm_mean_ms": round(sum(walls) / len(walls)),
        "warm_p95_ms": walls[p95_index],
        "warm_max_ms": max(walls),
        "engine_prepare_ms": int(batch.get("engine_prepare_ms") or 0),
        "scored_gpu_seconds": float(batch.get("scored_gpu_seconds") or 0),
        "input_tokens": sum(row["input_tokens"] for row in results),
        "output_tokens": sum(row["output_tokens"] for row in results),
        "owned_gpu_sessions": 1,
        "owned_model_calls": len(results),
        "warmup_model_calls": int(batch.get("warmup_model_calls") or 0),
        "total_model_calls": len(results) + int(batch.get("warmup_model_calls") or 0),
        "vllm_enforce_eager": batch.get("vllm_enforce_eager"),
        "production_deploy_performed": False,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps({"summary": summary, "results": results}, indent=2) + "\n", encoding="utf-8")
    print("AVANTIQO_OWNED_V2_BENCHMARK_SUMMARY=" + json.dumps(summary, separators=(",", ":")), flush=True)
