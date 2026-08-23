import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CONTRACT = "AVANTIQO_CODE_VS_OPENAI_BENCHMARK_V2";
const SOURCE_CONTRACT = "AVANTIQO_CODE_CERTIFICATION_BENCHMARK_V2";
const DEFAULT_SOURCE = "/tmp/avantiqo-code-certification-benchmark.json";
const DEFAULT_OUTPUT = "/tmp/avantiqo-code-vs-openai-benchmark.json";
const MIN_TARGET_GROSS_MARGIN_PERCENT = 25;

// Commercial comparison only. Normal Avantiqo Code execution does not call
// OpenAI. These reference prices were verified against OpenAI's official
// pricing/model pages on 2026-08-23 and should be refreshed deliberately when
// commercial pricing is reviewed.
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

// Last controlled six-case OpenAI quality comparison. This is evidence, not an
// execution path. Keeping the measured control here lets economics/pricing be
// recomputed without paying OpenAI on every build or certification run.
const OPENAI_CONTROL_EVIDENCE = Object.freeze([
  Object.freeze({
    model: "gpt-5.3-codex",
    role: "DIRECT_AGENTIC_CODE_REFERENCE",
    evidence_contract: "AVANTIQO_CODE_OPENAI_CONTROL_EVIDENCE_V1",
    measured_at: "2026-08-23",
    live_provider_call_performed_by_this_script: false,
    summary: Object.freeze({
      completed_runs: 6,
      passed: true,
      complete_suite: true,
      p50_wall_ms: 1921,
      p95_wall_ms: 3571,
      total_input_tokens: 402,
      total_output_tokens: 468,
      estimated_api_cost_usd: 0.0072555,
    }),
  }),
  Object.freeze({
    model: "gpt-5.6-terra",
    role: "CURRENT_BALANCED_CODING_REFERENCE",
    evidence_contract: "AVANTIQO_CODE_OPENAI_CONTROL_EVIDENCE_V1",
    measured_at: "2026-08-23",
    live_provider_call_performed_by_this_script: false,
    summary: Object.freeze({
      completed_runs: 6,
      passed: true,
      complete_suite: true,
      p50_wall_ms: 1519,
      p95_wall_ms: 3657,
      total_input_tokens: 402,
      total_output_tokens: 486,
      estimated_api_cost_usd: 0.006636,
    }),
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

function usdForTokens({ inputTokens, outputTokens, pricing }) {
  return Number((
    (inputTokens * pricing.input_usd_per_1m) / 1_000_000 +
    (outputTokens * pricing.output_usd_per_1m) / 1_000_000
  ).toFixed(8));
}

function referenceEvidence() {
  return OPENAI_CONTROL_EVIDENCE.map((evidence) => {
    const pricing = OPENAI_REFERENCES.find((item) => item.model === evidence.model);
    if (!pricing) throw new Error(`OPENAI_REFERENCE_PRICING_MISSING:${evidence.model}`);
    return {
      ...evidence,
      pricing: {
        input_usd_per_1m: pricing.input_usd_per_1m,
        cached_input_usd_per_1m: pricing.cached_input_usd_per_1m,
        output_usd_per_1m: pricing.output_usd_per_1m,
        verified_at: "2026-08-23",
      },
    };
  });
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
const ownedInputTokens = ownedObservations.reduce(
  (sum, item) => sum + (number(item.input_tokens, 0) || 0),
  0,
);
const ownedOutputTokens = ownedObservations.reduce(
  (sum, item) => sum + (number(item.output_tokens, 0) || 0),
  0,
);
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

const references = referenceEvidence();
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
  provider_execution: {
    openai_live_call_performed: false,
    openai_api_key_required: false,
    normal_avantiqo_code_execution_uses_openai: false,
    reference_evidence_mode: "SAVED_CONTROLLED_LIVE_BENCHMARK",
  },
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
    pricing_verified_at: "2026-08-23",
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
    reference_evidence_live_at_measurement: true,
    live_openai_call_performed_by_this_script: false,
    openai_models_all_passed: references.every((item) => item.summary.passed),
    direct_reference_passed:
      references.find((item) => item.model === TARGET_CUSTOMER_PRICING.reference_model)?.summary?.passed === true,
  },
  certification_requirements: {
    target_price_viable: targetPriceViable,
    quality_comparison_complete: references.every((item) => item.summary.complete_suite),
    comparison_refresh_is_explicit_optional_work: true,
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
  openai_live_call_performed: false,
  openai_api_key_required: false,
  target_customer_pricing: report.target_customer_pricing,
  owned_economics: report.owned_economics,
  quality_comparison: report.quality_comparison,
  openai: references.map((item) => ({
    model: item.model,
    role: item.role,
    measured_at: item.measured_at,
    summary: item.summary,
  })),
  activation_allowed: false,
}, null, 2));

if (!report.quality_comparison.direct_reference_passed || !targetPriceViable) {
  process.exitCode = 1;
}
