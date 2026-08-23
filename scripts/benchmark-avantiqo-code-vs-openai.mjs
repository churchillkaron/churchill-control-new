import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import OpenAI from "openai";

const CONTRACT = "AVANTIQO_CODE_VS_OPENAI_BENCHMARK_V1";
const SOURCE_CONTRACT = "AVANTIQO_CODE_CERTIFICATION_BENCHMARK_V2";
const DEFAULT_SOURCE = "/tmp/avantiqo-code-certification-benchmark.json";
const DEFAULT_OUTPUT = "/tmp/avantiqo-code-vs-openai-benchmark.json";
const MIN_TARGET_GROSS_MARGIN_PERCENT = 25;

// Verified against OpenAI's official model/pricing pages on 2026-08-23.
// GPT-5.3-Codex is the direct agentic-coding commercial reference.
// GPT-5.6 Terra is included as a current general coding/value quality reference.
const OPENAI_REFERENCES = Object.freeze([
  Object.freeze({
    model: "gpt-5.3-codex",
    role: "DIRECT_AGENTIC_CODE_REFERENCE",
    input_usd_per_1m: 1.75,
    cached_input_usd_per_1m: 0.175,
    output_usd_per_1m: 14.0,
  }),
  Object.freeze({
    model: "gpt-5.6-terra",
    role: "CURRENT_BALANCED_CODING_REFERENCE",
    input_usd_per_1m: 2.0,
    cached_input_usd_per_1m: 0.2,
    output_usd_per_1m: 12.0,
  }),
]);

const TARGET_CUSTOMER_PRICING = Object.freeze({
  reference_model: "gpt-5.3-codex",
  input_usd_per_1m: 1.70,
  output_usd_per_1m: 13.50,
  policy: "DIRECT_AGENTIC_REFERENCE_SLIGHT_UNDERCUT",
});

function text(value) {
  return String(value ?? "").trim();
}

function number(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function percentile(values, fraction) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function includesAll(result, values = []) {
  const source = result.toLowerCase();
  return values.every((value) => source.includes(String(value).toLowerCase()));
}

function includesAny(result, values = []) {
  if (!values.length) return true;
  const source = result.toLowerCase();
  return values.some((value) => source.includes(String(value).toLowerCase()));
}

function parsePlannerJson(result) {
  const raw = text(result)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function plannerProtocolPass(result) {
  const parsed = parsePlannerJson(result);
  return Boolean(
    parsed &&
    parsed.action === "read" &&
    parsed.input?.file_path === "lib/code/runtime/CodeAIMissionRuntime.js" &&
    text(parsed.description) &&
    text(parsed.reason),
  );
}

const cases = Object.freeze([
  Object.freeze({
    id: "generate_finite_sum",
    capability: "ai.code.generate",
    instruction: "Return code only. Write a JavaScript function named sumInvoiceLines(lines) that sums only finite numeric line.total values. Convert numeric strings with Number(...), ignore invalid totals, and return 0 for non-arrays. The implementation must use Number.isFinite.",
    requiredAll: ["sumInvoiceLines", "Number.isFinite"],
    requiredAny: ["Number(line.total)", "Number(line?.total)"],
  }),
  Object.freeze({
    id: "edit_numeric_normalization",
    capability: "ai.code.edit",
    instruction: "Return the complete corrected JavaScript function only. Edit this function so numeric strings become numbers, invalid values return 0, and zero remains zero: function normalizeSubtotal(value) { return value || 0; } Use Number(value) and Number.isFinite.",
    requiredAll: ["normalizeSubtotal", "Number(value)", "Number.isFinite"],
  }),
  Object.freeze({
    id: "refactor_email_normalization",
    capability: "ai.code.refactor",
    instruction: "Refactor this JavaScript without changing behavior and return code only: const customerEmail = String(customer.email || '').trim().toLowerCase(); const vendorEmail = String(vendor.email || '').trim().toLowerCase(); Extract a reusable function named normalizeEmail and use it for both values.",
    requiredAll: ["normalizeEmail", "trim()", "toLowerCase()", "customerEmail", "vendorEmail"],
  }),
  Object.freeze({
    id: "review_authorization_guard",
    capability: "ai.code.review",
    instruction: "Review this authorization expression and give the highest-risk correctness issue plus a corrected guarded expression: user && user.role === 'admin' || user.owner_id === organizationId. Explain why a falsy user can still reach user.owner_id because of && / || evaluation. Keep the answer concise.",
    requiredAll: ["user.owner_id"],
    requiredAny: ["falsy", "null", "undefined", "TypeError", "guard"],
  }),
  Object.freeze({
    id: "debug_numeric_reduce",
    capability: "ai.code.debug",
    instruction: "Return only the corrected one-line JavaScript expression. Fix this so numeric string totals add numerically instead of concatenating: const total = rows.reduce((sum, row) => sum + row.total, 0); The corrected expression must use Number(row.total).",
    requiredAll: ["reduce", "Number(row.total)"],
  }),
  Object.freeze({
    id: "autonomous_planner_json_protocol",
    capability: "ai.code.debug",
    instruction: "Return exactly one JSON object and no markdown. You are choosing the next safe Code AI action. Evidence says the relevant file is known but has not been read yet. Choose action read for lib/code/runtime/CodeAIMissionRuntime.js lines 1 through 240. Required shape: {\"action\":\"read\",\"description\":\"...\",\"input\":{\"file_path\":\"lib/code/runtime/CodeAIMissionRuntime.js\",\"start_line\":1,\"end_line\":240},\"reason\":\"...\"}.",
    plannerProtocol: true,
  }),
]);

function semanticPass(sample, result) {
  return sample.plannerProtocol
    ? plannerProtocolPass(result)
    : includesAll(result, sample.requiredAll) && includesAny(result, sample.requiredAny);
}

function outputText(response = {}) {
  const direct = text(response.output_text);
  if (direct) return direct;
  const items = Array.isArray(response.output) ? response.output : [];
  return items
    .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .map((item) => text(item?.text || item?.output_text))
    .filter(Boolean)
    .join("\n");
}

function usdForTokens({ inputTokens, outputTokens, pricing }) {
  return Number((
    (inputTokens * pricing.input_usd_per_1m) / 1_000_000 +
    (outputTokens * pricing.output_usd_per_1m) / 1_000_000
  ).toFixed(8));
}

async function runOpenAIReference(client, reference) {
  const observations = [];
  for (let index = 0; index < cases.length; index += 1) {
    const sample = cases[index];
    const started = performance.now();
    try {
      const response = await client.responses.create({
        model: reference.model,
        input: sample.instruction,
        max_output_tokens: 1800,
      });
      const wallMs = Math.round(performance.now() - started);
      const result = outputText(response);
      const inputTokens = number(response?.usage?.input_tokens, 0) || 0;
      const outputTokens = number(response?.usage?.output_tokens, 0) || 0;
      const passed = semanticPass(sample, result) && result.length > 10;
      observations.push({
        run: index + 1,
        case_id: sample.id,
        capability: sample.capability,
        wall_ms: wallMs,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_api_cost_usd: usdForTokens({
          inputTokens,
          outputTokens,
          pricing: reference,
        }),
        result_length: result.length,
        semantic_pass: passed,
        passed,
      });
    } catch (error) {
      observations.push({
        run: index + 1,
        case_id: sample.id,
        capability: sample.capability,
        passed: false,
        error: text(error?.message || error).slice(0, 1000),
      });
      break;
    }
  }

  const wall = observations.map((item) => item.wall_ms);
  const completeSuite = cases.every((sample) =>
    observations.some((item) => item.case_id === sample.id && item.passed),
  );
  const inputTokens = observations.reduce((sum, item) => sum + (number(item.input_tokens, 0) || 0), 0);
  const outputTokens = observations.reduce((sum, item) => sum + (number(item.output_tokens, 0) || 0), 0);
  const estimatedCost = observations.reduce((sum, item) => sum + (number(item.estimated_api_cost_usd, 0) || 0), 0);

  return {
    model: reference.model,
    role: reference.role,
    pricing: {
      input_usd_per_1m: reference.input_usd_per_1m,
      cached_input_usd_per_1m: reference.cached_input_usd_per_1m,
      output_usd_per_1m: reference.output_usd_per_1m,
    },
    summary: {
      completed_runs: observations.filter((item) => !item.error).length,
      passed: completeSuite && observations.every((item) => item.passed),
      complete_suite: completeSuite,
      p50_wall_ms: percentile(wall, 0.5),
      p95_wall_ms: percentile(wall, 0.95),
      total_input_tokens: inputTokens,
      total_output_tokens: outputTokens,
      estimated_api_cost_usd: Number(estimatedCost.toFixed(8)),
    },
    observations,
  };
}

const sourcePath = resolve(process.env.AVANTIQO_CODE_BENCHMARK_SOURCE || DEFAULT_SOURCE);
const source = JSON.parse(await readFile(sourcePath, "utf8"));
if (text(source.contract) !== SOURCE_CONTRACT) {
  throw new Error(`AVANTIQO_CODE_COMPARISON_SOURCE_CONTRACT_INVALID:${text(source.contract)}`);
}
if (source?.summary?.passed !== true || source?.summary?.complete_suite !== true) {
  throw new Error("AVANTIQO_CODE_COMPARISON_REQUIRES_PASSED_OWNED_BENCHMARK");
}

const gpuHourlyUsd = number(required("AVANTIQO_CODE_RUNPOD_GPU_HOURLY_USD"));
if (!(gpuHourlyUsd > 0)) throw new Error("AVANTIQO_CODE_RUNPOD_GPU_HOURLY_USD_INVALID");

const ownedObservations = Array.isArray(source.observations) ? source.observations : [];
const ownedInputTokens = ownedObservations.reduce((sum, item) => sum + (number(item.input_tokens, 0) || 0), 0);
const ownedOutputTokens = ownedObservations.reduce((sum, item) => sum + (number(item.output_tokens, 0) || 0), 0);
const ownedTotalTokens = ownedInputTokens + ownedOutputTokens;
const executionSeconds = ownedObservations.reduce(
  (sum, item) => sum + ((number(item.runpod_execution_ms, 0) || 0) / 1000),
  0,
);
const measuredSupplierCost = Number(((executionSeconds / 3600) * gpuHourlyUsd).toFixed(8));
const blendedSupplierCostPer1m = ownedTotalTokens > 0
  ? Number(((measuredSupplierCost / ownedTotalTokens) * 1_000_000).toFixed(6))
  : null;
const targetCustomerRevenue = usdForTokens({
  inputTokens: ownedInputTokens,
  outputTokens: ownedOutputTokens,
  pricing: TARGET_CUSTOMER_PRICING,
});
const grossProfit = Number((targetCustomerRevenue - measuredSupplierCost).toFixed(8));
const grossMarginPercent = targetCustomerRevenue > 0
  ? Number(((grossProfit / targetCustomerRevenue) * 100).toFixed(2))
  : null;
const targetPriceViable = Boolean(
  targetCustomerRevenue > measuredSupplierCost &&
  grossMarginPercent !== null &&
  grossMarginPercent >= MIN_TARGET_GROSS_MARGIN_PERCENT,
);

const openai = new OpenAI({ apiKey: required("OPENAI_API_KEY") });
const references = [];
for (const reference of OPENAI_REFERENCES) {
  references.push(await runOpenAIReference(openai, reference));
}

const directReference = OPENAI_REFERENCES.find(
  (reference) => reference.model === TARGET_CUSTOMER_PRICING.reference_model,
);
const inputDiscountPercent = directReference
  ? Number(((1 - TARGET_CUSTOMER_PRICING.input_usd_per_1m / directReference.input_usd_per_1m) * 100).toFixed(2))
  : null;
const outputDiscountPercent = directReference
  ? Number(((1 - TARGET_CUSTOMER_PRICING.output_usd_per_1m / directReference.output_usd_per_1m) * 100).toFixed(2))
  : null;

const report = {
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  purpose: "QUALITY_PRICE_COMPARISON_AND_ECONOMICS_GATE",
  activation_allowed: false,
  owned_engine: {
    provider: source?.model?.provider || "avantiqo-code",
    product_model: source?.model?.product_model || "avantiqo-code-v1",
    foundation_model: source?.model?.foundation_model || null,
    benchmark_contract: source.contract,
    benchmark_passed: true,
    summary: source.summary,
  },
  openai_references: references,
  commercial_reference: {
    provider: "openai",
    model: TARGET_CUSTOMER_PRICING.reference_model,
    official_input_usd_per_1m: directReference?.input_usd_per_1m ?? null,
    official_output_usd_per_1m: directReference?.output_usd_per_1m ?? null,
  },
  target_customer_pricing: {
    ...TARGET_CUSTOMER_PRICING,
    input_discount_percent_vs_reference: inputDiscountPercent,
    output_discount_percent_vs_reference: outputDiscountPercent,
  },
  owned_economics: {
    runpod_gpu_hourly_usd: gpuHourlyUsd,
    measured_runpod_execution_seconds: Number(executionSeconds.toFixed(3)),
    measured_supplier_cost_usd: measuredSupplierCost,
    total_input_tokens: ownedInputTokens,
    total_output_tokens: ownedOutputTokens,
    total_tokens: ownedTotalTokens,
    blended_supplier_cost_per_1m_tokens_usd: blendedSupplierCostPer1m,
    benchmark_customer_revenue_at_target_usd: targetCustomerRevenue,
    benchmark_gross_profit_at_target_usd: grossProfit,
    benchmark_gross_margin_percent_at_target: grossMarginPercent,
    minimum_required_gross_margin_percent: MIN_TARGET_GROSS_MARGIN_PERCENT,
    target_price_viable: targetPriceViable,
  },
  quality_comparison: {
    avantiqo_passed: true,
    openai_models_all_passed: references.every((item) => item.summary.passed),
    direct_reference_passed:
      references.find((item) => item.model === TARGET_CUSTOMER_PRICING.reference_model)?.summary?.passed === true,
  },
  certification_requirements: {
    target_price_viable: targetPriceViable,
    quality_comparison_complete: references.every((item) => item.summary.complete_suite),
    autonomous_repair_gate: "SEPARATE_LIVE_GATE",
    live_github_connect_commit_required: true,
    production_pricing_status_required: "PRODUCTION_CERTIFIED",
  },
};

const outputPath = resolve(process.env.AVANTIQO_CODE_OPENAI_BENCHMARK_OUTPUT || DEFAULT_OUTPUT);
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: report.quality_comparison.direct_reference_passed && targetPriceViable,
  contract: CONTRACT,
  output_path: outputPath,
  target_customer_pricing: report.target_customer_pricing,
  owned_economics: report.owned_economics,
  quality_comparison: report.quality_comparison,
  openai: references.map((item) => ({
    model: item.model,
    role: item.role,
    summary: item.summary,
  })),
  activation_allowed: false,
}, null, 2));

if (!report.quality_comparison.direct_reference_passed || !targetPriceViable) {
  process.exitCode = 1;
}
