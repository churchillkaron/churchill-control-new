"""Live, deterministic Avantiqo Code vs Codex vs Claude benchmark.

This is a certification/benchmark transport only. It performs no production
activation or deployment. Avantiqo's six model calls are batched into one Modal
H100 function so a single warm model instance serves the complete suite.
External reference calls use the Vercel AI Gateway with the exact same task
prompt and are scored by executable hidden Node tests rather than an AI judge.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any

import modal

CONTRACT = "AVANTIQO_CODE_HEAD_TO_HEAD_V1"
ENGINE_CONTRACT = "AVANTIQO_CODE_ENGINE_V1"
PRODUCT_MODEL = "avantiqo-code-v1"
FOUNDATION_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct"
RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8"
CODEX_MODEL = "openai/gpt-5.3-codex"
CLAUDE_MODEL = "anthropic/claude-opus-5"
GATEWAY_BASE = "https://ai-gateway.vercel.sh/v1"
MODAL_H100_USD_PER_SECOND = 0.001097
OUTPUT_PATH = Path("artifacts/avantiqo-code-head-to-head.json")

EXTERNAL_PRICING = {
    CODEX_MODEL: {"input_per_million_usd": 1.75, "output_per_million_usd": 14.0},
    CLAUDE_MODEL: {"input_per_million_usd": 5.0, "output_per_million_usd": 25.0},
}

TASKS: list[dict[str, str]] = [
    {
        "id": "invoice_total_math",
        "module": "invoice-total.mjs",
        "source": '''export function invoiceTotal(subtotal, taxRate) {\n  if (!Number.isFinite(subtotal) || !Number.isFinite(taxRate)) throw new TypeError("invalid");\n  return Number((subtotal + taxRate).toFixed(2));\n}\n''',
        "visible_test": '''import assert from "node:assert/strict";\nimport { invoiceTotal } from "./invoice-total.mjs";\nassert.equal(invoiceTotal(100, 0.07), 107);\n''',
        "hidden_test": '''import assert from "node:assert/strict";\nimport { invoiceTotal } from "./invoice-total.mjs";\nassert.equal(invoiceTotal(100, 0.07), 107);\nassert.equal(invoiceTotal(19.99, 0.075), 21.49);\nassert.equal(invoiceTotal(0, 0.2), 0);\nassert.throws(() => invoiceTotal(Number.NaN, 0.07), TypeError);\nassert.throws(() => invoiceTotal(100, Number.POSITIVE_INFINITY), TypeError);\n''',
    },
    {
        "id": "numeric_normalization",
        "module": "normalize-subtotal.mjs",
        "source": '''export function normalizeSubtotal(value) {\n  return value || 0;\n}\n''',
        "visible_test": '''import assert from "node:assert/strict";\nimport { normalizeSubtotal } from "./normalize-subtotal.mjs";\nassert.equal(normalizeSubtotal("12.50"), 12.5);\n''',
        "hidden_test": '''import assert from "node:assert/strict";\nimport { normalizeSubtotal } from "./normalize-subtotal.mjs";\nassert.equal(normalizeSubtotal("12.50"), 12.5);\nassert.equal(normalizeSubtotal(0), 0);\nassert.equal(normalizeSubtotal("0"), 0);\nassert.equal(normalizeSubtotal("bad"), 0);\nassert.equal(normalizeSubtotal(Number.NaN), 0);\nassert.equal(normalizeSubtotal(Number.POSITIVE_INFINITY), 0);\nassert.equal(normalizeSubtotal(null), 0);\n''',
    },
    {
        "id": "finite_line_sum",
        "module": "sum-lines.mjs",
        "source": '''export function sumInvoiceLines(lines) {\n  return lines.reduce((sum, line) => sum + line.total, 0);\n}\n''',
        "visible_test": '''import assert from "node:assert/strict";\nimport { sumInvoiceLines } from "./sum-lines.mjs";\nassert.equal(sumInvoiceLines([{ total: "10" }, { total: 2.5 }]), 12.5);\n''',
        "hidden_test": '''import assert from "node:assert/strict";\nimport { sumInvoiceLines } from "./sum-lines.mjs";\nassert.equal(sumInvoiceLines([{ total: "10" }, { total: 2.5 }]), 12.5);\nassert.equal(sumInvoiceLines([{ total: "bad" }, { total: 4 }, {}, null]), 4);\nassert.equal(sumInvoiceLines([{ total: Infinity }, { total: -2 }]), -2);\nassert.equal(sumInvoiceLines([]), 0);\nassert.equal(sumInvoiceLines(null), 0);\n''',
    },
    {
        "id": "authorization_guard",
        "module": "access.mjs",
        "source": '''export function canAccess(user, organizationId) {\n  return user && user.role === "admin" || user.owner_id === organizationId;\n}\n''',
        "visible_test": '''import assert from "node:assert/strict";\nimport { canAccess } from "./access.mjs";\nassert.equal(canAccess(null, "org-1"), false);\n''',
        "hidden_test": '''import assert from "node:assert/strict";\nimport { canAccess } from "./access.mjs";\nassert.equal(canAccess(null, "org-1"), false);\nassert.equal(canAccess({ role: "admin", owner_id: "x" }, "org-1"), true);\nassert.equal(canAccess({ role: "member", owner_id: "org-1" }, "org-1"), true);\nassert.equal(canAccess({ role: "member", owner_id: "org-2" }, "org-1"), false);\nassert.equal(canAccess(undefined, "org-1"), false);\n''',
    },
    {
        "id": "email_normalization",
        "module": "email.mjs",
        "source": '''export function normalizeEmail(value) {\n  return value.toLowerCase();\n}\n\nexport function emailsEqual(a, b) {\n  return a === b;\n}\n''',
        "visible_test": '''import assert from "node:assert/strict";\nimport { normalizeEmail, emailsEqual } from "./email.mjs";\nassert.equal(normalizeEmail(" Alice@Example.COM "), "alice@example.com");\nassert.equal(emailsEqual(" A@B.COM ", "a@b.com"), true);\n''',
        "hidden_test": '''import assert from "node:assert/strict";\nimport { normalizeEmail, emailsEqual } from "./email.mjs";\nassert.equal(normalizeEmail(" Alice@Example.COM "), "alice@example.com");\nassert.equal(normalizeEmail(null), "");\nassert.equal(normalizeEmail(undefined), "");\nassert.equal(emailsEqual(" A@B.COM ", "a@b.com"), true);\nassert.equal(emailsEqual(null, undefined), true);\nassert.equal(emailsEqual("a@b.com", "c@d.com"), false);\n''',
    },
    {
        "id": "currency_aggregation",
        "module": "currency-totals.mjs",
        "source": '''export function totalsByCurrency(rows) {\n  const totals = {};\n  for (const row of rows) totals[row.currency] = (totals[row.currency] || 0) + row.amount;\n  return totals;\n}\n''',
        "visible_test": '''import assert from "node:assert/strict";\nimport { totalsByCurrency } from "./currency-totals.mjs";\nassert.deepEqual(totalsByCurrency([{ currency: "thb", amount: "10" }, { currency: "THB", amount: 5 }]), { THB: 15 });\n''',
        "hidden_test": '''import assert from "node:assert/strict";\nimport { totalsByCurrency } from "./currency-totals.mjs";\nconst rows = [{ currency: "thb", amount: "10" }, { currency: "THB", amount: 5 }, { currency: "usd", amount: 2.5 }, { currency: "", amount: 99 }, { currency: "USD", amount: "bad" }, null];\nconst before = JSON.stringify(rows);\nassert.deepEqual(totalsByCurrency(rows), { THB: 15, USD: 2.5 });\nassert.equal(JSON.stringify(rows), before);\nassert.deepEqual(totalsByCurrency(null), {});\nassert.deepEqual(totalsByCurrency([]), {});\n''',
    },
]


def _load_certified_modal_image() -> Any:
    path = Path(__file__).with_name("modal_app.py")
    spec = importlib.util.spec_from_file_location("avantiqo_code_certified_modal_app", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"{CONTRACT}_CERTIFIED_MODAL_APP_IMPORT_FAILED")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.image


app = modal.App("avantiqo-code-head-to-head-v1")
certified_image = _load_certified_modal_image()


@app.function(image=certified_image, gpu="H100", timeout=30 * 60, scaledown_window=5)
def run_owned_batch(requests: list[dict[str, Any]]) -> dict[str, Any]:
    os.chdir("/app")
    import handler as code_engine

    code_engine.runpod.serverless.progress_update = lambda *_args, **_kwargs: None
    batch_started = time.perf_counter()
    outputs: list[dict[str, Any]] = []
    for request in requests:
        started = time.perf_counter()
        output = code_engine.handler(
            {"id": f"head-to-head-{uuid.uuid4()}", "input": request}
        )
        if not isinstance(output, dict):
            raise RuntimeError(f"{CONTRACT}_OWNED_OUTPUT_OBJECT_REQUIRED")
        clean = dict(output)
        clean["case_elapsed_seconds"] = round(time.perf_counter() - started, 3)
        clean["modal_transport"] = "batched-head-to-head-h100"
        clean["modal_gpu"] = "H100"
        clean["production_deploy_performed"] = False
        outputs.append(clean)
    return {
        "outputs": outputs,
        "gpu_function_seconds": round(time.perf_counter() - batch_started, 3),
        "modal_gpu": "H100",
        "production_deploy_performed": False,
    }


def _text(value: Any) -> str:
    return str(value or "").strip()


def _prompt(task: dict[str, str], initial_failure: str) -> str:
    return "\n".join(
        [
            "Fix the supplied JavaScript module so the visible test passes and the implementation is robust to reasonable edge cases.",
            f'Return ONLY strict JSON with exactly this shape: {{"path":"{task["module"]}","content":"<complete UTF-8 source file>"}}.',
            "Do not use markdown fences or commentary outside the JSON object.",
            f'Modify only {task["module"]}. Keep all existing public export names.',
            "The generated module must be self-contained: no imports, environment access, filesystem, child processes, network calls, or dynamic code evaluation.",
            "BUGGY MODULE:",
            task["source"],
            "VISIBLE TEST:",
            task["visible_test"],
            "VISIBLE FAILURE:",
            initial_failure[-2500:],
        ]
    )


def _run_test(module: str, module_source: str, test_source: str) -> dict[str, Any]:
    node = shutil.which("node")
    if not node:
        raise RuntimeError(f"{CONTRACT}_NODE_REQUIRED")
    with tempfile.TemporaryDirectory(prefix="avantiqo-code-head-to-head-") as raw:
        root = Path(raw)
        (root / module).write_text(module_source, encoding="utf-8")
        test_name = "benchmark.test.mjs"
        (root / test_name).write_text(test_source, encoding="utf-8")
        result = subprocess.run(
            [node, "--permission", f"--allow-fs-read={root}", test_name],
            cwd=root,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=30,
            check=False,
            env={"PATH": os.environ.get("PATH", ""), "HOME": str(root), "TMPDIR": str(root), "NODE_NO_WARNINGS": "1"},
        )
        return {
            "exit_code": result.returncode,
            "stdout": result.stdout[-2000:],
            "stderr": result.stderr[-2000:],
        }


def _security_pass(source: str) -> bool:
    forbidden = (
        r"\bimport\s*(?:\(|[\"'])",
        r"\brequire\s*\(",
        r"\bprocess\b",
        r"\bglobalThis\b",
        r"\bfetch\s*\(",
        r"\bWebSocket\b",
        r"\bchild_process\b",
        r"\bnode:",
        r"\beval\s*\(",
        r"\bnew\s+Function\b",
    )
    return not any(re.search(pattern, source, re.IGNORECASE) for pattern in forbidden)


def _parse_candidate(raw: str, expected_path: str) -> dict[str, Any]:
    original = _text(raw)
    candidate = re.sub(r"^```(?:json)?\s*", "", original, flags=re.IGNORECASE)
    candidate = re.sub(r"\s*```$", "", candidate).strip()
    start, end = candidate.find("{"), candidate.rfind("}")
    if start < 0 or end <= start:
        return {"valid": False, "strict_json": False, "error": "JSON_OBJECT_REQUIRED"}
    blob = candidate[start : end + 1]
    try:
        parsed = json.loads(blob)
    except json.JSONDecodeError:
        return {"valid": False, "strict_json": False, "error": "JSON_INVALID"}
    if not isinstance(parsed, dict) or sorted(parsed.keys()) != ["content", "path"]:
        return {"valid": False, "strict_json": False, "error": "JSON_KEYS_INVALID"}
    content = str(parsed.get("content") or "")
    path = _text(parsed.get("path"))
    return {
        "valid": bool(path == expected_path and content.strip()),
        "strict_json": original == blob and path == expected_path and bool(content.strip()),
        "path": path,
        "content": content,
        "error": None,
    }


def _owned_request(task: dict[str, str], prompt: str) -> dict[str, Any]:
    return {
        "contract": ENGINE_CONTRACT,
        "capability": "ai.code.debug",
        "model": PRODUCT_MODEL,
        "organization_id": "benchmark-only",
        "usage_id": f"head-to-head-{task['id']}-{uuid.uuid4()}",
        "instruction": prompt,
        "structured_specification": {
            "benchmark_contract": CONTRACT,
            "benchmark_case": task["id"],
            "output_contract": {"format": "strict-json", "path": task["module"], "complete_file_content_required": True},
            "raw_reasoning_must_not_persist": True,
        },
    }


def _gateway_token() -> str:
    token = _text(os.environ.get("AI_GATEWAY_API_KEY") or os.environ.get("VERCEL_OIDC_TOKEN"))
    if not token:
        raise RuntimeError(f"{CONTRACT}_AI_GATEWAY_AUTH_REQUIRED")
    return token


def _gateway_json(path: str, token: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        f"{GATEWAY_BASE}{path}",
        data=data,
        method="GET" if body is None else "POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1200]
        raise RuntimeError(f"{CONTRACT}_GATEWAY_HTTP_{exc.code}:{detail}") from exc


def _gateway_models(token: str) -> set[str]:
    body = _gateway_json("/models", token)
    values = body.get("data") if isinstance(body, dict) else None
    return {_text(item.get("id")) for item in values or [] if isinstance(item, dict) and _text(item.get("id"))}


def _external_call(model: str, prompt: str, token: str) -> dict[str, Any]:
    started = time.perf_counter()
    body = _gateway_json(
        "/chat/completions",
        token,
        {"model": model, "messages": [{"role": "user", "content": prompt}], "stream": False},
    )
    elapsed_ms = round((time.perf_counter() - started) * 1000)
    choices = body.get("choices") if isinstance(body, dict) else None
    content = ""
    if isinstance(choices, list) and choices and isinstance(choices[0], dict):
        content = _text((choices[0].get("message") or {}).get("content"))
    usage = body.get("usage") if isinstance(body.get("usage"), dict) else {}
    input_tokens = int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
    output_tokens = int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)
    pricing = EXTERNAL_PRICING[model]
    estimated_cost = (input_tokens * pricing["input_per_million_usd"] + output_tokens * pricing["output_per_million_usd"]) / 1_000_000
    return {
        "result": content,
        "wall_ms": elapsed_ms,
        "usage": {"input_tokens": input_tokens, "output_tokens": output_tokens},
        "estimated_cost_usd": round(estimated_cost, 8),
    }


def _score(task: dict[str, str], raw: str, wall_ms: int | None, usage: dict[str, Any], estimated_cost_usd: float | None) -> dict[str, Any]:
    parsed = _parse_candidate(raw, task["module"])
    source = str(parsed.get("content") or "")
    security = bool(parsed.get("valid") and _security_pass(source))
    changed = bool(source and source != task["source"])
    test = _run_test(task["module"], source, task["hidden_test"]) if security and changed else {"exit_code": 1, "stdout": "", "stderr": "not executed"}
    hidden_pass = test["exit_code"] == 0
    return {
        "case_id": task["id"],
        "passed": bool(hidden_pass and parsed.get("strict_json") and security and changed),
        "hidden_tests_passed": hidden_pass,
        "instruction_format_passed": bool(parsed.get("strict_json")),
        "security_boundary_passed": security,
        "source_changed": changed,
        "wall_ms": wall_ms,
        "usage": usage,
        "estimated_cost_usd": estimated_cost_usd,
        "generated_bytes": len(source.encode("utf-8")) if source else 0,
        "generated_sha256": hashlib.sha256(source.encode("utf-8")).hexdigest() if source else None,
        "error": parsed.get("error") if not parsed.get("valid") else (test["stderr"][-500:] if not hidden_pass else None),
    }


def _summary(model_name: str, provider: str, observations: list[dict[str, Any]], cost_usd: float | None) -> dict[str, Any]:
    walls = [int(item["wall_ms"]) for item in observations if isinstance(item.get("wall_ms"), int)]
    return {
        "provider": provider,
        "model": model_name,
        "cases": len(observations),
        "passed": sum(1 for item in observations if item["passed"]),
        "hidden_tests_passed": sum(1 for item in observations if item["hidden_tests_passed"]),
        "instruction_format_passed": sum(1 for item in observations if item["instruction_format_passed"]),
        "security_boundary_passed": sum(1 for item in observations if item["security_boundary_passed"]),
        "pass_rate_percent": round(100 * sum(1 for item in observations if item["passed"]) / max(1, len(observations)), 2),
        "total_wall_ms": sum(walls) if walls else None,
        "mean_wall_ms": round(sum(walls) / len(walls)) if walls else None,
        "total_input_tokens": sum(int((item.get("usage") or {}).get("input_tokens") or 0) for item in observations),
        "total_output_tokens": sum(int((item.get("usage") or {}).get("output_tokens") or 0) for item in observations),
        "estimated_cost_usd": round(cost_usd, 8) if cost_usd is not None else None,
    }


@app.local_entrypoint()
def main() -> None:
    if _text(os.environ.get("NODE_ENV")).lower() == "production":
        raise RuntimeError(f"{CONTRACT}_PRODUCTION_ENV_FORBIDDEN")
    token = _gateway_token()
    available = _gateway_models(token)
    for model in (CODEX_MODEL, CLAUDE_MODEL):
        if model not in available:
            raise RuntimeError(f"{CONTRACT}_REFERENCE_MODEL_UNAVAILABLE:{model}")

    prompts: list[tuple[dict[str, str], str]] = []
    for task in TASKS:
        initial = _run_test(task["module"], task["source"], task["visible_test"])
        if initial["exit_code"] == 0:
            raise RuntimeError(f"{CONTRACT}_BROKEN_FIXTURE_MUST_FAIL:{task['id']}")
        prompts.append((task, _prompt(task, f"{initial['stdout']}\n{initial['stderr']}")))

    results: dict[str, list[dict[str, Any]]] = {"codex": [], "claude": [], "avantiqo": []}

    # External controls run first. If gateway auth or model availability is bad,
    # fail before allocating the paid H100 benchmark session.
    for label, model in (("codex", CODEX_MODEL), ("claude", CLAUDE_MODEL)):
        for task, prompt in prompts:
            external = _external_call(model, prompt, token)
            results[label].append(_score(task, external["result"], external["wall_ms"], external["usage"], external["estimated_cost_usd"]))

    owned_requests = [_owned_request(task, prompt) for task, prompt in prompts]
    remote_started = time.perf_counter()
    owned_batch = run_owned_batch.remote(owned_requests)
    owned_remote_wall_ms = round((time.perf_counter() - remote_started) * 1000)
    outputs = owned_batch.get("outputs") if isinstance(owned_batch, dict) else None
    if not isinstance(outputs, list) or len(outputs) != len(TASKS):
        raise RuntimeError(f"{CONTRACT}_OWNED_BATCH_OUTPUT_COUNT_INVALID")
    if owned_batch.get("production_deploy_performed") is not False:
        raise RuntimeError(f"{CONTRACT}_PRODUCTION_DEPLOY_FORBIDDEN")

    gpu_seconds = float(owned_batch.get("gpu_function_seconds") or 0)
    owned_estimated_cost = gpu_seconds * MODAL_H100_USD_PER_SECOND
    for (task, _prompt_value), output in zip(prompts, outputs, strict=True):
        if output.get("provider") != "avantiqo-code" or output.get("model") != PRODUCT_MODEL:
            raise RuntimeError(f"{CONTRACT}_OWNED_IDENTITY_INVALID:{task['id']}")
        if output.get("foundation_model") != FOUNDATION_MODEL or output.get("runtime_model") != RUNTIME_MODEL:
            raise RuntimeError(f"{CONTRACT}_OWNED_FOUNDATION_INVALID:{task['id']}")
        if output.get("raw_reasoning_persisted") is not False:
            raise RuntimeError(f"{CONTRACT}_RAW_REASONING_PERSISTENCE_FORBIDDEN:{task['id']}")
        usage = output.get("usage") if isinstance(output.get("usage"), dict) else {}
        case_ms = round(float(output.get("case_elapsed_seconds") or 0) * 1000)
        results["avantiqo"].append(_score(task, _text(output.get("result")), case_ms, usage, None))

    codex_cost = sum(float(item.get("estimated_cost_usd") or 0) for item in results["codex"])
    claude_cost = sum(float(item.get("estimated_cost_usd") or 0) for item in results["claude"])
    summaries = {
        "avantiqo": _summary(PRODUCT_MODEL, "avantiqo-code", results["avantiqo"], owned_estimated_cost),
        "codex": _summary(CODEX_MODEL, "openai", results["codex"], codex_cost),
        "claude": _summary(CLAUDE_MODEL, "anthropic", results["claude"], claude_cost),
    }
    summaries["avantiqo"]["gpu_function_seconds"] = round(gpu_seconds, 3)
    summaries["avantiqo"]["remote_wall_ms"] = owned_remote_wall_ms
    summaries["avantiqo"]["gpu_rate_usd_per_second"] = MODAL_H100_USD_PER_SECOND

    ranking = sorted(
        summaries.keys(),
        key=lambda key: (
            -int(summaries[key]["passed"]),
            -int(summaries[key]["hidden_tests_passed"]),
            int(summaries[key]["mean_wall_ms"] or 10**12),
        ),
    )
    report = {
        "contract": CONTRACT,
        "generated_at_epoch_ms": int(time.time() * 1000),
        "methodology": {
            "same_task_prompt_for_all_models": True,
            "executable_hidden_node_tests": True,
            "ai_judge_used": False,
            "cases": len(TASKS),
            "production_deploy_performed": False,
            "owned_gpu_sessions": 1,
            "owned_model_calls": len(TASKS),
            "external_model_calls": len(TASKS) * 2,
            "reference_models_live_verified_available": True,
        },
        "models": {
            "avantiqo": {"provider": "avantiqo-code", "product_model": PRODUCT_MODEL, "foundation_model": FOUNDATION_MODEL, "runtime_model": RUNTIME_MODEL, "transport": "Modal H100 batched"},
            "codex": {"provider": "openai", "model": CODEX_MODEL, "transport": "Vercel AI Gateway"},
            "claude": {"provider": "anthropic", "model": CLAUDE_MODEL, "transport": "Vercel AI Gateway"},
        },
        "summaries": summaries,
        "ranking": ranking,
        "observations": results,
        "safeguards": {"secret_values_logged": False, "production_deploy_performed": False, "runpod_used": False, "persistent_repository_mutation_performed": False},
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"contract": CONTRACT, "success": True, "ranking": ranking, "summaries": summaries, "production_deploy_performed": False}, separators=(",", ":")))
    print(f"{CONTRACT}=PASS")
