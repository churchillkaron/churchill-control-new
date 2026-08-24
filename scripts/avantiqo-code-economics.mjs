import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CONTRACT = "AVANTIQO_CODE_ECONOMICS_V1";
const EXPECTED_BENCHMARK_CONTRACT = "AVANTIQO_CODE_CERTIFICATION_BENCHMARK_V2";
const EXPECTED_PROVIDER = "avantiqo-code";
const EXPECTED_FOUNDATION_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct";
const EXPECTED_RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8";
const EXPECTED_SERVING_RUNTIME = "vllm";
const EXPECTED_QUANTIZATION = "fp8";
const REQUIRED_CASES = Object.freeze([
  "generate_finite_sum",
  "edit_numeric_normalization",
  "refactor_email_normalization",
  "review_authorization_guard",
  "debug_numeric_reduce",
  "autonomous_planner_json_protocol",
]);
const REQUIRED_CAPABILITIES = Object.freeze([
  "ai.code.generate",
  "ai.code.edit",
  "ai.code.refactor",
  "ai.code.review",
  "ai.code.debug",
]);

const INPUT = resolve(
  process.env.AVANTIQO_CODE_CERTIFICATION_INPUT ||
    "/tmp/avantiqo-code-certification-benchmark.json",
);
const OUTPUT = resolve(
  process.env.AVANTIQO_CODE_ECONOMICS_OUTPUT ||
    "/tmp/avantiqo-code-economics.json",
);

function text(value) {
  return String(value ?? "").trim();
}

function positive(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(code);
  return number;
}

function n(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function round(value, digits = 8) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function assertBenchmark(report = {}) {
  if (text(report.contract) !== EXPECTED_BENCHMARK_CONTRACT) {
    throw new Error(`CODE_ECONOMICS_BENCHMARK_CONTRACT_MISMATCH:${text(report.contract) || "MISSING"}`);
  }
  if (report?.summary?.passed !== true || report?.summary?.complete_suite !== true) {
    throw new Error("CODE_ECONOMICS_REQUIRES_PASSED_COMPLETE_BENCHMARK");
  }
  if (report?.summary?.planner_protocol_passed !== true) {
    throw new Error("CODE_ECONOMICS_REQUIRES_PLANNER_PROTOCOL_PASS");
  }
  if (report?.summary?.infrastructure_failure) {
    throw new Error("CODE_ECONOMICS_REJECTS_INFRASTRUCTURE_FAILURE");
  }

  const model = report.model || {};
  const modelChecks = {
    provider: text(model.provider) === EXPECTED_PROVIDER,
    foundation_model: text(model.foundation_model) === EXPECTED_FOUNDATION_MODEL,
    runtime_model: text(model.runtime_model) === EXPECTED_RUNTIME_MODEL,
    serving_runtime: text(model.serving_runtime).toLowerCase() === EXPECTED_SERVING_RUNTIME,
    quantization: text(model.quantization).toLowerCase() === EXPECTED_QUANTIZATION,
  };
  const failedModelChecks = Object.entries(modelChecks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failedModelChecks.length) {
    throw new Error(`CODE_ECONOMICS_RUNTIME_CONTRACT_MISMATCH:${failedModelChecks.join(",")}`);
  }

  const observations = Array.isArray(report.observations) ? report.observations : [];
  const byCase = new Map(observations.map((item) => [text(item.case_id), item]));
  const missingCases = REQUIRED_CASES.filter((id) => !byCase.has(id));
  if (missingCases.length) {
    throw new Error(`CODE_ECONOMICS_REQUIRED_CASES_MISSING:${missingCases.join(",")}`);
  }

  for (const id of REQUIRED_CASES) {
    const item = byCase.get(id);
    if (item?.passed !== true || item?.contract_pass !== true || item?.reasoning_boundary_pass !== true) {
      throw new Error(`CODE_ECONOMICS_CASE_NOT_CERTIFIABLE:${id}`);
    }
    positive(item.runpod_execution_ms, `CODE_ECONOMICS_EXECUTION_TIME_REQUIRED:${id}`);
  }

  const observedCapabilities = new Set(
    observations.filter((item) => item?.passed === true).map((item) => text(item.capability)),
  );
  const missingCapabilities = REQUIRED_CAPABILITIES.filter(
    (capability) => !observedCapabilities.has(capability),
  );
  if (missingCapabilities.length) {
    throw new Error(`CODE_ECONOMICS_CAPABILITY_COVERAGE_MISSING:${missingCapabilities.join(",")}`);
  }

  return REQUIRED_CASES.map((id) => byCase.get(id));
}

async function main() {
  const benchmark = JSON.parse(await readFile(INPUT, "utf8"));
  const observations = assertBenchmark(benchmark);

  const usdPerGpuHour = positive(
    process.env.AVANTIQO_CODE_GPU_USD_PER_HOUR,
    "AVANTIQO_CODE_GPU_USD_PER_HOUR_REQUIRED",
  );
  const billedGpuCount = positive(
    process.env.AVANTIQO_CODE_BILLED_GPU_COUNT || 1,
    "AVANTIQO_CODE_BILLED_GPU_COUNT_INVALID",
  );
  const targetUtilization = positive(
    process.env.AVANTIQO_CODE_TARGET_UTILIZATION || 1,
    "AVANTIQO_CODE_TARGET_UTILIZATION_INVALID",
  );
  if (targetUtilization > 1) {
    throw new Error("AVANTIQO_CODE_TARGET_UTILIZATION_MUST_NOT_EXCEED_ONE");
  }

  const gpuUsdPerSecond = (usdPerGpuHour * billedGpuCount) / 3600;
  const measured = observations.map((item) => {
    const executionMs = positive(
      item.runpod_execution_ms,
      `CODE_ECONOMICS_EXECUTION_TIME_REQUIRED:${text(item.case_id) || "UNKNOWN"}`,
    );
    const executionSeconds = executionMs / 1000;
    const rawComputeCost = executionSeconds * gpuUsdPerSecond;
    const utilizationAdjustedCost = rawComputeCost / targetUtilization;
    const inputTokens = n(item.input_tokens);
    const outputTokens = n(item.output_tokens);
    const totalTokens = inputTokens + outputTokens;

    return {
      case_id: text(item.case_id) || null,
      capability: text(item.capability) || null,
      runpod_execution_ms: executionMs,
      worker_generation_seconds: n(item.worker_generation_seconds) || null,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      raw_gpu_compute_usd: round(rawComputeCost),
      utilization_adjusted_compute_usd: round(utilizationAdjustedCost),
      compute_usd_per_1m_tokens: totalTokens > 0
        ? round((utilizationAdjustedCost / totalTokens) * 1_000_000, 6)
        : null,
    };
  });

  const totalExecutionMs = measured.reduce((sum, item) => sum + item.runpod_execution_ms, 0);
  const totalRawCost = measured.reduce((sum, item) => sum + item.raw_gpu_compute_usd, 0);
  const totalAdjustedCost = measured.reduce(
    (sum, item) => sum + item.utilization_adjusted_compute_usd,
    0,
  );
  const totalTokens = measured.reduce((sum, item) => sum + item.total_tokens, 0);

  const evidence = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    provider: EXPECTED_PROVIDER,
    product_model: benchmark?.model?.product_model || "avantiqo-code-v1",
    foundation_model: EXPECTED_FOUNDATION_MODEL,
    runtime_model: EXPECTED_RUNTIME_MODEL,
    serving_runtime: EXPECTED_SERVING_RUNTIME,
    quantization: EXPECTED_QUANTIZATION,
    source_benchmark_contract: benchmark.contract,
    source_benchmark_passed: true,
    source_complete_suite: true,
    source_planner_protocol_passed: true,
    capabilities: [...REQUIRED_CAPABILITIES],
    assumptions: {
      gpu_usd_per_hour: usdPerGpuHour,
      billed_gpu_count: billedGpuCount,
      target_utilization: targetUtilization,
      source: "OPERATOR_SUPPLIED_RUNTIME_ECONOMICS",
    },
    measured,
    summary: {
      cases: measured.length,
      total_runpod_execution_ms: totalExecutionMs,
      average_runpod_execution_ms: Math.round(totalExecutionMs / measured.length),
      total_tokens: totalTokens,
      raw_gpu_compute_usd: round(totalRawCost),
      utilization_adjusted_compute_usd: round(totalAdjustedCost),
      average_utilization_adjusted_compute_usd: round(totalAdjustedCost / measured.length),
      utilization_adjusted_compute_usd_per_1m_tokens: totalTokens > 0
        ? round((totalAdjustedCost / totalTokens) * 1_000_000, 6)
        : null,
    },
    certification: {
      benchmark_certified: true,
      economics_measured: true,
      economics_certified: false,
      reason: "MEASUREMENT_ONLY_REQUIRES_EXPLICIT_PRICING_AND_PRODUCTION_CERTIFICATION_REVIEW",
    },
    pricing_status: "NOT_PRODUCTION_CERTIFIED",
    pricing_activation_performed: false,
    provider_selection_changed: false,
    database_mutation_performed: false,
    production_deploy_performed: false,
    activation_allowed: false,
  };

  await writeFile(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    success: true,
    output_path: OUTPUT,
    summary: evidence.summary,
    benchmark_certified: true,
    economics_measured: true,
    economics_certified: false,
    activation_allowed: false,
  }, null, 2));
}

main().catch(async (error) => {
  const failure = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    success: false,
    error: text(error?.message || error),
    benchmark_certified: false,
    economics_measured: false,
    economics_certified: false,
    pricing_activation_performed: false,
    provider_selection_changed: false,
    database_mutation_performed: false,
    production_deploy_performed: false,
    activation_allowed: false,
  };
  await writeFile(OUTPUT, `${JSON.stringify(failure, null, 2)}\n`, "utf8").catch(() => null);
  console.error(`AVANTIQO_CODE_ECONOMICS=FAIL reason=${failure.error}`);
  process.exit(1);
});
