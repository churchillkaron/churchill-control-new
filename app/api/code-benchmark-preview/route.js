const MODELS = Object.freeze({
  codex: "openai/gpt-5.3-codex",
  claude: "anthropic/claude-opus-5",
});

const TASKS = Object.freeze({
  invoice_total_math: Object.freeze({
    module: "invoice-total.mjs",
    source: `export function invoiceTotal(subtotal, taxRate) {\n  if (!Number.isFinite(subtotal) || !Number.isFinite(taxRate)) throw new TypeError("invalid");\n  return Number((subtotal + taxRate).toFixed(2));\n}\n`,
    visibleTest: `import assert from "node:assert/strict";\nimport { invoiceTotal } from "./invoice-total.mjs";\nassert.equal(invoiceTotal(100, 0.07), 107);\n`,
    visibleFailure: "Expected 100.07 to equal 107",
  }),
  numeric_normalization: Object.freeze({
    module: "normalize-subtotal.mjs",
    source: `export function normalizeSubtotal(value) {\n  return value || 0;\n}\n`,
    visibleTest: `import assert from "node:assert/strict";\nimport { normalizeSubtotal } from "./normalize-subtotal.mjs";\nassert.equal(normalizeSubtotal("12.50"), 12.5);\n`,
    visibleFailure: "Expected string '12.50' to equal number 12.5",
  }),
  finite_line_sum: Object.freeze({
    module: "sum-lines.mjs",
    source: `export function sumInvoiceLines(lines) {\n  return lines.reduce((sum, line) => sum + line.total, 0);\n}\n`,
    visibleTest: `import assert from "node:assert/strict";\nimport { sumInvoiceLines } from "./sum-lines.mjs";\nassert.equal(sumInvoiceLines([{ total: "10" }, { total: 2.5 }]), 12.5);\n`,
    visibleFailure: "Expected '0102.5' to equal 12.5",
  }),
  authorization_guard: Object.freeze({
    module: "access.mjs",
    source: `export function canAccess(user, organizationId) {\n  return user && user.role === "admin" || user.owner_id === organizationId;\n}\n`,
    visibleTest: `import assert from "node:assert/strict";\nimport { canAccess } from "./access.mjs";\nassert.equal(canAccess(null, "org-1"), false);\n`,
    visibleFailure: "TypeError: Cannot read properties of null (reading 'owner_id')",
  }),
  email_normalization: Object.freeze({
    module: "email.mjs",
    source: `export function normalizeEmail(value) {\n  return value.toLowerCase();\n}\n\nexport function emailsEqual(a, b) {\n  return a === b;\n}\n`,
    visibleTest: `import assert from "node:assert/strict";\nimport { normalizeEmail, emailsEqual } from "./email.mjs";\nassert.equal(normalizeEmail(" Alice@Example.COM "), "alice@example.com");\nassert.equal(emailsEqual(" A@B.COM ", "a@b.com"), true);\n`,
    visibleFailure: "Expected leading/trailing whitespace to be removed and normalized emails to compare equal",
  }),
  currency_aggregation: Object.freeze({
    module: "currency-totals.mjs",
    source: `export function totalsByCurrency(rows) {\n  const totals = {};\n  for (const row of rows) totals[row.currency] = (totals[row.currency] || 0) + row.amount;\n  return totals;\n}\n`,
    visibleTest: `import assert from "node:assert/strict";\nimport { totalsByCurrency } from "./currency-totals.mjs";\nassert.deepEqual(totalsByCurrency([{ currency: "thb", amount: "10" }, { currency: "THB", amount: 5 }]), { THB: 15 });\n`,
    visibleFailure: "Expected normalized currency keys and numeric aggregation",
  }),
});

function promptFor(task) {
  return [
    "Fix the supplied JavaScript module so the visible test passes and the implementation is robust to reasonable edge cases.",
    `Return ONLY strict JSON with exactly this shape: {\"path\":\"${task.module}\",\"content\":\"<complete UTF-8 source file>\"}.`,
    "Do not use markdown fences or commentary outside the JSON object.",
    `Modify only ${task.module}. Keep all existing public export names.`,
    "The generated module must be self-contained: no imports, environment access, filesystem, child processes, network calls, or dynamic code evaluation.",
    "BUGGY MODULE:",
    task.source,
    "VISIBLE TEST:",
    task.visibleTest,
    "VISIBLE FAILURE:",
    task.visibleFailure,
  ].join("\n");
}

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  if (process.env.VERCEL_ENV !== "preview") {
    return Response.json({ error: "PREVIEW_ONLY" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const modelKey = String(body?.model || "").trim();
  const caseId = String(body?.case_id || "").trim();
  const model = MODELS[modelKey];
  const task = TASKS[caseId];
  if (!model || !task) {
    return Response.json({ error: "FIXED_MODEL_AND_CASE_REQUIRED" }, { status: 400 });
  }

  const token = String(process.env.VERCEL_OIDC_TOKEN || "").trim();
  if (!token) {
    return Response.json({ error: "VERCEL_OIDC_TOKEN_REQUIRED" }, { status: 503 });
  }

  const started = performance.now();
  const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: promptFor(task) }],
      stream: false,
      max_tokens: 2500,
    }),
    signal: AbortSignal.timeout(55_000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return Response.json({
      error: "AI_GATEWAY_REQUEST_FAILED",
      model,
      case_id: caseId,
      status: response.status,
      detail: String(payload?.error?.message || payload?.message || "gateway error").slice(0, 1000),
    }, { status: 502 });
  }

  return Response.json({
    success: true,
    contract: "AVANTIQO_CODE_EXTERNAL_CONTROL_PREVIEW_V1",
    model_key: modelKey,
    model,
    case_id: caseId,
    result: String(payload?.choices?.[0]?.message?.content || ""),
    usage: payload?.usage || null,
    wall_ms: Math.round(performance.now() - started),
    preview_only: true,
    production_deploy_performed_by_route: false,
  });
}
