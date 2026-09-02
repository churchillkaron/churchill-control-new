from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

CONTRACT = "AVANTIQO_CODE_COPILOT_HEAD_TO_HEAD_V1"
OUTPUT_PATH = Path("artifacts/avantiqo-code-copilot-head-to-head.json")
MODELS = {
    "codex": "gpt-5.3-codex",
    "claude": "claude-opus-5",
}

TASKS: list[dict[str, str]] = [
    {"id":"invoice_total_math","module":"invoice-total.mjs","source":'''export function invoiceTotal(subtotal, taxRate) {\n  if (!Number.isFinite(subtotal) || !Number.isFinite(taxRate)) throw new TypeError("invalid");\n  return Number((subtotal + taxRate).toFixed(2));\n}\n''',"visible_test":'''import assert from "node:assert/strict";\nimport { invoiceTotal } from "./invoice-total.mjs";\nassert.equal(invoiceTotal(100, 0.07), 107);\n''',"hidden_test":'''import assert from "node:assert/strict";\nimport { invoiceTotal } from "./invoice-total.mjs";\nassert.equal(invoiceTotal(100, 0.07), 107);\nassert.equal(invoiceTotal(19.99, 0.075), 21.49);\nassert.equal(invoiceTotal(0, 0.2), 0);\nassert.throws(() => invoiceTotal(Number.NaN, 0.07), TypeError);\nassert.throws(() => invoiceTotal(100, Number.POSITIVE_INFINITY), TypeError);\n'''},
    {"id":"numeric_normalization","module":"normalize-subtotal.mjs","source":'''export function normalizeSubtotal(value) {\n  return value || 0;\n}\n''',"visible_test":'''import assert from "node:assert/strict";\nimport { normalizeSubtotal } from "./normalize-subtotal.mjs";\nassert.equal(normalizeSubtotal("12.50"), 12.5);\n''',"hidden_test":'''import assert from "node:assert/strict";\nimport { normalizeSubtotal } from "./normalize-subtotal.mjs";\nassert.equal(normalizeSubtotal("12.50"), 12.5);\nassert.equal(normalizeSubtotal(0), 0);\nassert.equal(normalizeSubtotal("0"), 0);\nassert.equal(normalizeSubtotal("bad"), 0);\nassert.equal(normalizeSubtotal(Number.NaN), 0);\nassert.equal(normalizeSubtotal(Number.POSITIVE_INFINITY), 0);\nassert.equal(normalizeSubtotal(null), 0);\n'''},
    {"id":"finite_line_sum","module":"sum-lines.mjs","source":'''export function sumInvoiceLines(lines) {\n  return lines.reduce((sum, line) => sum + line.total, 0);\n}\n''',"visible_test":'''import assert from "node:assert/strict";\nimport { sumInvoiceLines } from "./sum-lines.mjs";\nassert.equal(sumInvoiceLines([{ total: "10" }, { total: 2.5 }]), 12.5);\n''',"hidden_test":'''import assert from "node:assert/strict";\nimport { sumInvoiceLines } from "./sum-lines.mjs";\nassert.equal(sumInvoiceLines([{ total: "10" }, { total: 2.5 }]), 12.5);\nassert.equal(sumInvoiceLines([{ total: "bad" }, { total: 4 }, {}, null]), 4);\nassert.equal(sumInvoiceLines([{ total: Infinity }, { total: -2 }]), -2);\nassert.equal(sumInvoiceLines([]), 0);\nassert.equal(sumInvoiceLines(null), 0);\n'''},
    {"id":"authorization_guard","module":"access.mjs","source":'''export function canAccess(user, organizationId) {\n  return user && user.role === "admin" || user.owner_id === organizationId;\n}\n''',"visible_test":'''import assert from "node:assert/strict";\nimport { canAccess } from "./access.mjs";\nassert.equal(canAccess(null, "org-1"), false);\n''',"hidden_test":'''import assert from "node:assert/strict";\nimport { canAccess } from "./access.mjs";\nassert.equal(canAccess(null, "org-1"), false);\nassert.equal(canAccess({ role: "admin", owner_id: "x" }, "org-1"), true);\nassert.equal(canAccess({ role: "member", owner_id: "org-1" }, "org-1"), true);\nassert.equal(canAccess({ role: "member", owner_id: "org-2" }, "org-1"), false);\nassert.equal(canAccess(undefined, "org-1"), false);\n'''},
    {"id":"email_normalization","module":"email.mjs","source":'''export function normalizeEmail(value) {\n  return value.toLowerCase();\n}\n\nexport function emailsEqual(a, b) {\n  return a === b;\n}\n''',"visible_test":'''import assert from "node:assert/strict";\nimport { normalizeEmail, emailsEqual } from "./email.mjs";\nassert.equal(normalizeEmail(" Alice@Example.COM "), "alice@example.com");\nassert.equal(emailsEqual(" A@B.COM ", "a@b.com"), true);\n''',"hidden_test":'''import assert from "node:assert/strict";\nimport { normalizeEmail, emailsEqual } from "./email.mjs";\nassert.equal(normalizeEmail(" Alice@Example.COM "), "alice@example.com");\nassert.equal(normalizeEmail(null), "");\nassert.equal(normalizeEmail(undefined), "");\nassert.equal(emailsEqual(" A@B.COM ", "a@b.com"), true);\nassert.equal(emailsEqual(null, undefined), true);\nassert.equal(emailsEqual("a@b.com", "c@d.com"), false);\n'''},
    {"id":"currency_aggregation","module":"currency-totals.mjs","source":'''export function totalsByCurrency(rows) {\n  const totals = {};\n  for (const row of rows) totals[row.currency] = (totals[row.currency] || 0) + row.amount;\n  return totals;\n}\n''',"visible_test":'''import assert from "node:assert/strict";\nimport { totalsByCurrency } from "./currency-totals.mjs";\nassert.deepEqual(totalsByCurrency([{ currency: "thb", amount: "10" }, { currency: "THB", amount: 5 }]), { THB: 15 });\n''',"hidden_test":'''import assert from "node:assert/strict";\nimport { totalsByCurrency } from "./currency-totals.mjs";\nconst rows = [{ currency: "thb", amount: "10" }, { currency: "THB", amount: 5 }, { currency: "usd", amount: 2.5 }, { currency: "", amount: 99 }, { currency: "USD", amount: "bad" }, null];\nconst before = JSON.stringify(rows);\nassert.deepEqual(totalsByCurrency(rows), { THB: 15, USD: 2.5 });\nassert.equal(JSON.stringify(rows), before);\nassert.deepEqual(totalsByCurrency(null), {});\nassert.deepEqual(totalsByCurrency([]), {});\n'''}
]


def prompt(task: dict[str, str]) -> str:
    return "\n".join([
        "Fix the supplied JavaScript module so the visible test passes and the implementation is robust to reasonable edge cases.",
        f'Return ONLY strict JSON with exactly this shape: {{"path":"{task["module"]}","content":"<complete UTF-8 source file>"}}.',
        "Do not use markdown fences or commentary outside the JSON object.",
        f'Modify only {task["module"]}. Keep all existing public export names.',
        "The generated module must be self-contained: no imports, environment access, filesystem, child processes, network calls, or dynamic code evaluation.",
        "BUGGY MODULE:", task["source"], "VISIBLE TEST:", task["visible_test"], "VISIBLE FAILURE:", "visible assertion failed"
    ])


def parse(raw: str, expected_path: str) -> dict[str, Any]:
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


def security(source: str) -> bool:
    forbidden = (r"\bimport\s*(?:\(|[\"'])", r"\brequire\s*\(", r"\bprocess\b", r"\bglobalThis\b", r"\bfetch\s*\(", r"\bWebSocket\b", r"\bchild_process\b", r"\bnode:", r"\beval\s*\(", r"\bnew\s+Function\b")
    return not any(re.search(pattern, source, re.IGNORECASE) for pattern in forbidden)


def run_test(task: dict[str, str], source: str) -> dict[str, Any]:
    node = shutil.which("node")
    if not node:
        raise RuntimeError(f"{CONTRACT}_NODE_REQUIRED")
    with tempfile.TemporaryDirectory(prefix="avantiqo-copilot-head-to-head-") as raw:
        root = Path(raw)
        (root / task["module"]).write_text(source, encoding="utf-8")
        test_name = "benchmark.test.mjs"
        (root / test_name).write_text(task["hidden_test"], encoding="utf-8")
        result = subprocess.run([node, "--permission", f"--allow-fs-read={root}", test_name], cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=30, check=False, env={"PATH": os.environ.get("PATH", ""), "HOME": str(root), "TMPDIR": str(root), "NODE_NO_WARNINGS": "1"})
        return {"exit_code": result.returncode, "stderr": result.stderr[-1000:]}


def run_model(label: str, model: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for task in TASKS:
        started = time.perf_counter()
        command = [
            "copilot", "-p", prompt(task), "-s", f"--model={model}",
            "--no-ask-user", "--no-custom-instructions", "--no-auto-update", "--no-color",
            "--max-ai-credits=4",
            "--excluded-tools=bash,powershell,list_bash,list_powershell,read_bash,read_powershell,stop_bash,stop_powershell,write_bash,write_powershell,apply_patch,create,edit,view,list_agents,read_agent,task,write_agent,glob,grep,skill,web_fetch",
        ]
        completed = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=240, check=False)
        raw = completed.stdout.strip()
        parsed = parse(raw, task["module"])
        source = parsed["content"]
        safe = bool(parsed["valid"] and security(source))
        changed = bool(source and source.strip() != task["source"].strip())
        test = run_test(task, source) if safe and changed else {"exit_code": 1, "stderr": parsed.get("error") or completed.stderr[-1000:] or "not executed"}
        row = {
            "model_label": label,
            "model": model,
            "case": task["id"],
            "hidden_pass": test["exit_code"] == 0,
            "hidden_error": None if test["exit_code"] == 0 else str(test.get("stderr") or "")[-300:],
            "strict_json": bool(parsed["strict"]),
            "security_pass": safe,
            "source_changed": changed,
            "passed": bool(test["exit_code"] == 0 and parsed["strict"] and safe and changed),
            "wall_ms": round((time.perf_counter() - started) * 1000),
            "raw_sha256": hashlib.sha256(raw.encode("utf-8")).hexdigest(),
            "cli_exit_code": completed.returncode,
        }
        rows.append(row)
        print("AVANTIQO_COMPETITOR_BENCHMARK_RESULT=" + json.dumps(row, separators=(",", ":")), flush=True)
    return rows


def main() -> None:
    if not os.environ.get("GITHUB_TOKEN"):
        raise RuntimeError(f"{CONTRACT}_GITHUB_TOKEN_REQUIRED")
    if not shutil.which("copilot"):
        raise RuntimeError(f"{CONTRACT}_COPILOT_CLI_REQUIRED")
    results: list[dict[str, Any]] = []
    summaries: dict[str, Any] = {}
    for label, model in MODELS.items():
        rows = run_model(label, model)
        results.extend(rows)
        summaries[label] = {
            "model": model,
            "passed": sum(1 for row in rows if row["passed"]),
            "total": len(rows),
            "hidden_passed": sum(1 for row in rows if row["hidden_pass"]),
            "strict_json": sum(1 for row in rows if row["strict_json"]),
            "security_passed": sum(1 for row in rows if row["security_pass"]),
            "mean_wall_ms": round(sum(row["wall_ms"] for row in rows) / len(rows)),
        }
    summary = {
        "contract": CONTRACT,
        "competitors": summaries,
        "total_model_calls": len(results),
        "credential_source": "github-actions-github-token",
        "production_deploy_performed": False,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps({"summary": summary, "results": results}, indent=2) + "\n", encoding="utf-8")
    print("AVANTIQO_COMPETITOR_BENCHMARK_SUMMARY=" + json.dumps(summary, separators=(",", ":")), flush=True)


if __name__ == "__main__":
    main()
