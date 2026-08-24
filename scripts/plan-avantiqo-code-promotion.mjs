import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  AVANTIQO_OWNED_MODEL_CATALOG,
} from "../lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js";

const CONTRACT = "AVANTIQO_CODE_PROMOTION_PLAN_V1";
const BENCHMARK_CONTRACT = "AVANTIQO_CODE_CERTIFICATION_BENCHMARK_V2";
const ECONOMICS_CONTRACT = "AVANTIQO_CODE_ECONOMICS_V1";
const PROVIDER = "avantiqo-code";
const MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct";
const RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8";
const CAPABILITIES = Object.freeze([
  "ai.code.generate",
  "ai.code.edit",
  "ai.code.refactor",
  "ai.code.review",
  "ai.code.debug",
]);

const BENCHMARK_INPUT = resolve(
  process.env.AVANTIQO_CODE_CERTIFICATION_INPUT ||
    "/tmp/avantiqo-code-certification-benchmark.json",
);
const ECONOMICS_INPUT = resolve(
  process.env.AVANTIQO_CODE_ECONOMICS_INPUT ||
    "/tmp/avantiqo-code-economics.json",
);
const OUTPUT = resolve(
  process.env.AVANTIQO_CODE_PROMOTION_PLAN_OUTPUT ||
    "/tmp/avantiqo-code-promotion-plan.json",
);

function text(value) {
  return String(value ?? "").trim();
}

function approvedModel(capability) {
  const certification = AVANTIQO_OWNED_MODEL_CATALOG?.[PROVIDER]?.models?.[MODEL];
  return Boolean(
    certification?.license_verified === true &&
      certification?.runtime_compatible === true &&
      certification?.capabilities?.includes(capability),
  );
}

function allCapabilitiesObserved(benchmark = {}) {
  const observed = new Set(
    (Array.isArray(benchmark.observations) ? benchmark.observations : [])
      .filter((item) => item?.passed === true)
      .map((item) => text(item.capability)),
  );
  return CAPABILITIES.filter((capability) => !observed.has(capability));
}

const [benchmark, economics] = await Promise.all([
  readFile(BENCHMARK_INPUT, "utf8").then(JSON.parse),
  readFile(ECONOMICS_INPUT, "utf8").then(JSON.parse),
]);

const failures = [];

if (text(benchmark?.contract) !== BENCHMARK_CONTRACT) {
  failures.push("BENCHMARK_CONTRACT_INVALID");
}
if (benchmark?.summary?.passed !== true) failures.push("BENCHMARK_PASS_REQUIRED");
if (benchmark?.summary?.complete_suite !== true) failures.push("COMPLETE_SUITE_REQUIRED");
if (benchmark?.summary?.planner_protocol_passed !== true) failures.push("PLANNER_PROTOCOL_PASS_REQUIRED");
if (benchmark?.summary?.infrastructure_failure) failures.push("BENCHMARK_INFRASTRUCTURE_FAILURE_PRESENT");
if (text(benchmark?.model?.provider) !== PROVIDER) failures.push("BENCHMARK_PROVIDER_MISMATCH");
if (text(benchmark?.model?.foundation_model) !== MODEL) failures.push("BENCHMARK_MODEL_MISMATCH");
if (text(benchmark?.model?.runtime_model) !== RUNTIME_MODEL) failures.push("BENCHMARK_RUNTIME_MODEL_MISMATCH");
if (text(benchmark?.model?.serving_runtime).toLowerCase() !== "vllm") failures.push("BENCHMARK_SERVING_RUNTIME_MISMATCH");
if (text(benchmark?.model?.quantization).toLowerCase() !== "fp8") failures.push("BENCHMARK_QUANTIZATION_MISMATCH");

const missingCapabilities = allCapabilitiesObserved(benchmark);
for (const capability of missingCapabilities) {
  failures.push(`${capability}:BENCHMARK_EVIDENCE_MISSING`);
}

if (text(economics?.contract) !== ECONOMICS_CONTRACT) failures.push("ECONOMICS_CONTRACT_INVALID");
if (text(economics?.provider) !== PROVIDER) failures.push("ECONOMICS_PROVIDER_MISMATCH");
if (text(economics?.foundation_model) !== MODEL) failures.push("ECONOMICS_MODEL_MISMATCH");
if (text(economics?.runtime_model) !== RUNTIME_MODEL) failures.push("ECONOMICS_RUNTIME_MODEL_MISMATCH");
if (economics?.source_benchmark_passed !== true) failures.push("ECONOMICS_SOURCE_BENCHMARK_PASS_REQUIRED");
if (economics?.source_complete_suite !== true) failures.push("ECONOMICS_COMPLETE_SUITE_REQUIRED");
if (economics?.source_planner_protocol_passed !== true) failures.push("ECONOMICS_PLANNER_PROTOCOL_PASS_REQUIRED");
if (economics?.certification?.economics_measured !== true) failures.push("ECONOMICS_MEASUREMENT_REQUIRED");
if (!Number.isFinite(Number(economics?.summary?.utilization_adjusted_compute_usd))) {
  failures.push("ECONOMICS_TOTAL_COST_REQUIRED");
}
if (!Number.isFinite(Number(economics?.summary?.utilization_adjusted_compute_usd_per_1m_tokens))) {
  failures.push("ECONOMICS_TOKEN_RATE_REQUIRED");
}
if (economics?.pricing_activation_performed !== false || economics?.activation_allowed !== false) {
  failures.push("ECONOMICS_EVIDENCE_MUST_REMAIN_PRE_PROMOTION");
}

for (const capability of CAPABILITIES) {
  if (!approvedModel(capability)) failures.push(`${capability}:MODEL_NOT_APPROVED`);
}

if (failures.length) {
  throw new Error(`AVANTIQO_CODE_PROMOTION_PLAN_BLOCKED:${failures.join(",")}`);
}

const measuredRateUsdPer1mTokens = Number(
  economics.summary.utilization_adjusted_compute_usd_per_1m_tokens,
);
const measuredTotalUsd = Number(economics.summary.utilization_adjusted_compute_usd);

const promotions = CAPABILITIES.map((capability) => ({
  provider: PROVIDER,
  capability,
  model: MODEL,
  required_current_state: {
    active: false,
    pricing_status: "MARKET_PARITY_READY",
    owned_inference: true,
    runtime_compatible: true,
    model_license_verified: true,
    production_routing_allowed: false,
  },
  required_pricing_metadata: {
    pricing_status: "PRODUCTION_CERTIFIED",
    owned_inference: true,
    benchmark_certified: true,
    economics_certified: true,
    model_license_verified: true,
    runtime_compatible: true,
    recalibration_required: false,
    production_routing_allowed: true,
    certified_capability: capability,
    certified_model: MODEL,
    certification_benchmark_contract: BENCHMARK_CONTRACT,
    certification_economics_contract: ECONOMICS_CONTRACT,
    measured_compute_usd_per_1m_tokens: measuredRateUsdPer1mTokens,
  },
  required_row_state_after_explicit_promotion: {
    active: true,
  },
}));

const plan = {
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  provider: PROVIDER,
  foundation_model: MODEL,
  runtime_model: RUNTIME_MODEL,
  serving_runtime: "vllm",
  quantization: "fp8",
  capability_count: CAPABILITIES.length,
  capabilities: [...CAPABILITIES],
  evidence: {
    benchmark_contract: BENCHMARK_CONTRACT,
    benchmark_passed: true,
    complete_suite: true,
    planner_protocol_passed: true,
    economics_contract: ECONOMICS_CONTRACT,
    economics_measured: true,
    economics_certified: false,
    measured_total_compute_usd: measuredTotalUsd,
    measured_compute_usd_per_1m_tokens: measuredRateUsdPer1mTokens,
  },
  promotions,
  certification_environment: {
    name: "AVANTIQO_CODE_CERTIFIED_CAPABILITIES",
    value: CAPABILITIES.join(","),
  },
  pricing_review: {
    required: true,
    reason: "MEASURED_GPU_ECONOMICS_MUST_BE_REVIEWED_AND_CONVERTED_INTO_THE_CONFIGURED_PRICING_CURRENCY_BEFORE_DATABASE_PROMOTION",
  },
  mutation_performed: false,
  pricing_mutation_performed: false,
  provider_configuration_mutation_performed: false,
  production_deployment_performed: false,
  activation_performed: false,
  automatic_activation_forbidden: true,
  ready_for_explicit_pricing_review: true,
  ready_for_explicit_promotion: false,
};

await writeFile(OUTPUT, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: true,
  output_path: OUTPUT,
  capability_count: plan.capability_count,
  measured_compute_usd_per_1m_tokens: measuredRateUsdPer1mTokens,
  ready_for_explicit_pricing_review: true,
  ready_for_explicit_promotion: false,
  activation_performed: false,
  production_deployment_performed: false,
}, null, 2));
