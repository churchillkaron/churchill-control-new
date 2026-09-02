from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

import modal

CONTRACT = "AVANTIQO_CODE_OWNED_HEAD_TO_HEAD_V1"
ENGINE_CONTRACT = "AVANTIQO_CODE_ENGINE_V1"
PRODUCT_MODEL = "avantiqo-code-v1"
FOUNDATION_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct"
RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8"
BASE_IMAGE_ID = "im-jAkmG5niafDQsnuSUxak9c"
OUTPUT_PATH = Path("artifacts/avantiqo-code-owned-head-to-head.json")
QUALITY_POLICY_VERSION = "AVANTIQO_CODE_DEBUG_QUALITY_POLICY_V1"

TASKS: list[dict[str, str]] = [
    {"id":"invoice_total_math","module":"invoice-total.mjs","source":'''export function invoiceTotal(subtotal, taxRate) {\n  if (!Number.isFinite(subtotal) || !Number.isFinite(taxRate)) throw new TypeError("invalid");\n  return Number((subtotal + taxRate).toFixed(2));\n}\n''',"visible_test":'''import assert from "node:assert/strict";\nimport { invoiceTotal } from "./invoice-total.mjs";\nassert.equal(invoiceTotal(100, 0.07), 107);\n''',"hidden_test":'''import assert from "node:assert/strict";\nimport { invoiceTotal } from "./invoice-total.mjs";\nassert.equal(invoiceTotal(100, 0.07), 107);\nassert.equal(invoiceTotal(19.99, 0.075), 21.49);\nassert.equal(invoiceTotal(0, 0.2), 0);\nassert.throws(() => invoiceTotal(Number.NaN, 0.07), TypeError);\nassert.throws(() => invoiceTotal(100, Number.POSITIVE_INFINITY), TypeError);\n'''},
    {"id":"numeric_normalization","module":"normalize-subtotal.mjs","source":'''export function normalizeSubtotal(value) {\n  return value || 0;\n}\n''',"visible_test":'''import assert from "node:assert/strict";\nimport { normalizeSubtotal } from "./normalize-subtotal.mjs";\nassert.equal(normalizeSubtotal("12.50"), 12.5);\n''',"hidden_test":'''import assert from "node:assert/strict";\nimport { normalizeSubtotal } from "./normalize-subtotal.mjs";\nassert.equal(normalizeSubtotal("12.50"), 12.5);\nassert.equal(normalizeSubtotal(0), 0);\nassert.equal(normalizeSubtotal("0"), 0);\nassert.equal(normalizeSubtotal("bad"), 0);\nassert.equal(normalizeSubtotal(Number.NaN), 0);\nassert.equal(normalizeSubtotal(Number.POSITIVE_INFINITY), 0);\nassert.equal(normalizeSubtotal(null), 0);\n'''},
    {"id":"finite_line_sum","module":"sum-lines.mjs","source":'''export function sumInvoiceLines(lines) {\n  return lines.reduce((sum, line) => sum + line.total, 0);\n}\n''',"visible_test":'''import assert from "node:assert/strict";\nimport { sumInvoiceLines } from "./sum-lines.mjs";\nassert.equal(sumInvoiceLines([{ total: "10" }, { total: 2.5 }]), 12.5);\n''',"hidden_test":'''import assert from "node:assert/strict";\nimport { sumInvoiceLines } from "./sum-lines.mjs";\nassert.equal(sumInvoiceLines([{ total: "10" }, { total: 2.5 }]), 12.5);\nassert.equal(sumInvoiceLines([{ total: "bad" }, { total: 4 }, {}, null]), 4);\nassert.equal(sumInvoiceLines([{ total: Infinity }, { total: -2 }]), -2);\nassert.equal(sumInvoiceLines([]), 0);\nassert.equal(sumInvoiceLines(null), 0);\n'''},
    {"id":"authorization_guard","module":"access.mjs","source":'''export function canAccess(user, organizationId) {\n  return user && user.role === "admin" || user.owner_id === organizationId;\n}\n''',"visible_test":'''import assert from "node:assert/strict";\nimport { canAccess } from "./access.mjs";\nassert.equal(canAccess(null, "org-1"), false);\n''',"hidden_test":'''import assert from "node:assert/strict";\nimport { canAccess } from "./access.mjs";\nassert.equal(canAccess(null, "org-1"), false);\nassert.equal(canAccess({ role: "admin", owner_id: "x" }, "org-1"), true);\nassert.equal(canAccess({ role: "member", owner_id: "org-1" }, "org-1"), true);\nassert.equal(canAccess({ role: "member", owner_id: "org-2" }, "org-1"), false);\nassert.equal(canAccess(undefined, "org-1"), false);\n'''},
    {"id":"email_normalization","module":"email.mjs","source":'''export function normalizeEmail(value) {\n  return value.toLowerCase();\n}\n\nexport function emailsEqual(a, b) {\n  return a === b;\n}\n''',"visible_test":'''import assert from "node:assert/strict";\nimport { normalizeEmail, emailsEqual } from "./email.mjs";\nassert.equal(normalizeEmail(" Alice@Example.COM "), "alice@example.com");\nassert.equal(emailsEqual(" A@B.COM ", "a@b.com"), true);\n''',"hidden_test":'''import assert from "node:assert/strict";\nimport { normalizeEmail, emailsEqual } from "./email.mjs";\nassert.equal(normalizeEmail(" Alice@Example.COM "), "alice@example.com");\nassert.equal(normalizeEmail(null), "");\nassert.equal(normalizeEmail(undefined), "");\nassert.equal(emailsEqual(" A@B.COM ", "a@b.com"), true);\nassert.equal(emailsEqual(null, undefined), true);\nassert.equal(emailsEqual("a@b.com", "c@d.com"), false);\n'''},
    {"id":"currency_aggregation","module":"currency-totals.mjs","source":'''export function totalsByCurrency(rows) {\n  const totals = {};\n  for (const row of rows) totals[row.currency] = (totals[row.currency] || 0) + row.amount;\n  return totals;\n}\n''',"visible_test":'''import assert from "node:assert/strict";\nimport { totalsByCurrency } from "./currency-totals.mjs";\nassert.deepEqual(totalsByCurrency([{ currency: "thb", amount: "10" }, { currency: "THB", amount: 5 }]), { THB: 15 });\n''',"hidden_test":'''import assert from "node:assert/strict";\nimport { totalsByCurrency } from "./currency-totals.mjs";\nconst rows = [{ currency: "thb", amount: "10" }, { currency: "THB", amount: 5 }, { currency: "usd", amount: 2.5 }, { currency: "", amount: 99 }, { currency: "USD", amount: "bad" }, null];\nconst before = JSON.stringify(rows);\nassert.deepEqual(totalsByCurrency(rows), { THB: 15, USD: 2.5 });\nassert.equal(JSON.stringify(rows), before);\nassert.deepEqual(totalsByCurrency(null), {});\nassert.deepEqual(totalsByCurrency([]), {});\n'''}
]

app = modal.App("avantiqo-code-owned-head-to-head-v1")
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
            "2. Check null and undefined inputs before property access, iteration, string methods, or arithmetic.",
            "3. Distinguish valid falsy values such as 0, false, and empty strings from missing values; do not use truthiness when it changes domain semantics.",
            "4. When accepting numeric or numeric-string input, coerce deliberately and require Number.isFinite on the converted value so NaN and positive/negative Infinity cannot leak into results.",
            "5. For arrays and collections, handle absent collections and malformed/null entries safely when the function's contract is aggregating or normalizing; do not mutate caller-owned inputs.",
            "6. When the visible behavior establishes semantic string or identifier normalization, apply that normalization consistently at every comparison/aggregation boundary, including trimming and case normalization where justified.",
            "7. For authorization or boolean guards, make null handling and operator precedence explicit and return a real boolean.",
            "8. For rates, percentages, money, quantities, and totals, infer the intended arithmetic from names plus tests and validate finite operands before calculation.",
            "9. Preserve deterministic behavior and avoid unnecessary dependencies, side effects, environment access, network access, filesystem access, dynamic evaluation, or hidden state.",
            "10. Mentally replay the visible test plus reasonable boundary cases implied by the function contract before final output. If one candidate fails an inferred boundary case, correct it before responding.",
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
    timeout=30 * 60,
    scaledown_window=10 * 60,
    min_containers=0,
    max_containers=1,
)
def run_owned_batch(requests: list[dict[str, Any]]) -> dict[str, Any]:
    os.chdir("/app")
    import handler as code_engine
    code_engine.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
    code_engine._prompt = _candidate_internal_prompt
    started = time.perf_counter()
    outputs = []
    for request in requests:
        case_started = time.perf_counter()
        output = code_engine.handler({"id": f"owned-head-to-head-{uuid.uuid4()}", "input": request})
        if not isinstance(output, dict):
            raise RuntimeError(f"{CONTRACT}_OWNED_OUTPUT_OBJECT_REQUIRED")
        clean = dict(output)
        clean["case_elapsed_seconds"] = round(time.perf_counter() - case_started, 3)
        clean["quality_policy"] = QUALITY_POLICY_VERSION
        outputs.append(clean)
    return {"outputs": outputs, "gpu_function_seconds": round(time.perf_counter() - started, 3), "quality_policy": QUALITY_POLICY_VERSION}


def _prompt(task: dict[str, str]) -> str:
    return "\n".join([
        "Fix the supplied JavaScript module so the visible test passes and the implementation is robust to reasonable edge cases.",
        f'Return ONLY strict JSON with exactly this shape: {{"path":"{task["module"]}","content":"<complete UTF-8 source file>"}}.',
        "Do not use markdown fences or commentary outside the JSON object.",
        f'Modify only {task["module"]}. Keep all existing public export names.',
        "The generated module must be self-contained: no imports, environment access, filesystem, child processes, network calls, or dynamic code evaluation.",
        "BUGGY MODULE:", task["source"], "VISIBLE TEST:", task["visible_test"], "VISIBLE FAILURE:", "visible assertion failed"
    ])


def _request(task: dict[str, str]) -> dict[str, Any]:
    return {
        "contract": ENGINE_CONTRACT,
        "capability": "ai.code.debug",
        "model": PRODUCT_MODEL,
        "organization_id": "benchmark-only",
        "usage_id": f"owned-head-to-head-{task['id']}-{uuid.uuid4()}",
        "instruction": _prompt(task),
        "structured_specification": {
            "benchmark_contract": CONTRACT,
            "benchmark_case": task["id"],
            "output_contract": {"format": "strict-json", "path": task["module"], "complete_file_content_required": True},
            "raw_reasoning_must_not_persist": True,
        },
    }


def _parse(raw: str, expected_path: str) -> dict[str, Any]:
    original = str(raw or "").strip()
    candidate = re.sub(r"^```(?:json)?\s*", "", original, flags=re.IGNORECASE)
    candidate = re.sub(r"\s*```$", "", candidate).strip()
    start, end = candidate.find("{"), candidate.rfind("}")
    if start < 0 or end <= start:
        return {"valid": False, "strict": False, "content": "", "error": "JSON_OBJECT_REQUIRED"}
    blob = candidate[start:end + 1]
    try:
        parsed = json.loads(blob)
    except json.JSONDecodeError:
        return {"valid": False, "strict": False, "content": "", "error": "JSON_INVALID"}
    content = str(parsed.get("content") or "") if isinstance(parsed, dict) else ""
    valid = isinstance(parsed, dict) and sorted(parsed.keys()) == ["content", "path"] and str(parsed.get("path") or "").strip() == expected_path and bool(content.strip())
    return {"valid": valid, "strict": valid and original == blob, "content": content, "error": None}


def _security(source: str) -> bool:
    forbidden = (r"\bimport\s*(?:\(|[\"'])", r"\brequire\s*\(", r"\bprocess\b", r"\bglobalThis\b", r"\bfetch\s*\(", r"\bWebSocket\b", r"\bchild_process\b", r"\bnode:", r"\beval\s*\(", r"\bnew\s+Function\b")
    return not any(re.search(pattern, source, re.IGNORECASE) for pattern in forbidden)


def _run_test(task: dict[str, str], source: str) -> dict[str, Any]:
    node = shutil.which("node")
    if not node:
        raise RuntimeError(f"{CONTRACT}_NODE_REQUIRED")
    with tempfile.TemporaryDirectory(prefix="avantiqo-owned-head-to-head-") as raw:
        root = Path(raw)
        (root / task["module"]).write_text(source, encoding="utf-8")
        test_name = "benchmark.test.mjs"
        (root / test_name).write_text(task["hidden_test"], encoding="utf-8")
        result = subprocess.run([node, "--permission", f"--allow-fs-read={root}", test_name], cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=30, check=False, env={"PATH": os.environ.get("PATH", ""), "HOME": str(root), "TMPDIR": str(root), "NODE_NO_WARNINGS": "1"})
        return {"exit_code": result.returncode, "stdout": result.stdout[-1000:], "stderr": result.stderr[-1000:]}


@app.local_entrypoint()
def main() -> None:
    if str(os.environ.get("NODE_ENV") or "").strip().lower() == "production":
        raise RuntimeError(f"{CONTRACT}_PRODUCTION_ENV_FORBIDDEN")
    batch = run_owned_batch.remote([_request(task) for task in TASKS])
    outputs = batch.get("outputs") if isinstance(batch, dict) else None
    if not isinstance(outputs, list) or len(outputs) != len(TASKS):
        raise RuntimeError(f"{CONTRACT}_OUTPUT_COUNT_INVALID")
    if batch.get("quality_policy") != QUALITY_POLICY_VERSION:
        raise RuntimeError(f"{CONTRACT}_QUALITY_POLICY_NOT_PROVEN")
    results = []
    for task, output in zip(TASKS, outputs):
        if output.get("provider") != "avantiqo-code" or output.get("model") != PRODUCT_MODEL:
            raise RuntimeError(f"{CONTRACT}_OWNED_IDENTITY_INVALID:{task['id']}")
        if output.get("foundation_model") != FOUNDATION_MODEL or output.get("runtime_model") != RUNTIME_MODEL:
            raise RuntimeError(f"{CONTRACT}_OWNED_MODEL_INVALID:{task['id']}")
        if output.get("raw_reasoning_persisted") is not False:
            raise RuntimeError(f"{CONTRACT}_RAW_REASONING_FORBIDDEN:{task['id']}")
        if output.get("quality_policy") != QUALITY_POLICY_VERSION:
            raise RuntimeError(f"{CONTRACT}_QUALITY_POLICY_NOT_PROVEN:{task['id']}")
        raw = str(output.get("result") or "")
        parsed = _parse(raw, task["module"])
        source = parsed["content"]
        security = bool(parsed["valid"] and _security(source))
        changed = bool(source and source.strip() != task["source"].strip())
        test = _run_test(task, source) if security and changed else {"exit_code": 1, "stderr": parsed.get("error") or "not executed"}
        usage = output.get("usage") if isinstance(output.get("usage"), dict) else {}
        row = {
            "case": task["id"],
            "hidden_pass": test["exit_code"] == 0,
            "hidden_error": None if test["exit_code"] == 0 else str(test.get("stderr") or "")[-300:],
            "strict_json": bool(parsed["strict"]),
            "security_pass": security,
            "source_changed": changed,
            "passed": bool(test["exit_code"] == 0 and parsed["strict"] and security and changed),
            "wall_ms": round(float(output.get("case_elapsed_seconds") or 0) * 1000),
            "input_tokens": int(usage.get("input_tokens") or 0),
            "output_tokens": int(usage.get("output_tokens") or 0),
            "raw_sha256": hashlib.sha256(raw.encode("utf-8")).hexdigest(),
        }
        results.append(row)
        print("AVANTIQO_OWNED_BENCHMARK_RESULT=" + json.dumps(row, separators=(",", ":")), flush=True)
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
        "mean_wall_ms": round(sum(row["wall_ms"] for row in results) / len(results)),
        "input_tokens": sum(row["input_tokens"] for row in results),
        "output_tokens": sum(row["output_tokens"] for row in results),
        "gpu_function_seconds": float(batch.get("gpu_function_seconds") or 0),
        "owned_gpu_sessions": 1,
        "owned_model_calls": len(results),
        "production_deploy_performed": False,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps({"summary": summary, "results": results}, indent=2) + "\n", encoding="utf-8")
    print("AVANTIQO_OWNED_BENCHMARK_SUMMARY=" + json.dumps(summary, separators=(",", ":")), flush=True)
