import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CONTRACT = "AVANTIQO_INTELLIGENCE_ECONOMICS_V1";
const INPUT = resolve(
  process.env.AVANTIQO_INTELLIGENCE_CERTIFICATION_INPUT ||
    "/tmp/avantiqo-intelligence-certification-benchmark.json",
);
const OUTPUT = resolve(
  process.env.AVANTIQO_INTELLIGENCE_ECONOMICS_OUTPUT ||
    "/tmp/avantiqo-intelligence-economics.json",
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

function benchmarkCases(report = {}) {
  const direct = Array.isArray(report?.benchmark?.results)
    ? report.benchmark.results
    : Array.isArray(report?.results)
      ? report.results
      : [];
  return direct.filter((item) => item?.passed === true);
}

async function main() {
  const certification = JSON.parse(await readFile(INPUT, "utf8"));
  if (certification?.summary?.passed !== true && certification?.passed !== true) {
    throw new Error("INTELLIGENCE_ECONOMICS_REQUIRES_PASSED_CERTIFICATION");
  }

  const usdPerGpuHour = positive(
    process.env.AVANTIQO_INTELLIGENCE_GPU_USD_PER_HOUR,
    "AVANTIQO_INTELLIGENCE_GPU_USD_PER_HOUR_REQUIRED",
  );
  const workerCount = positive(
    process.env.AVANTIQO_INTELLIGENCE_BILLED_GPU_COUNT || 1,
    "AVANTIQO_INTELLIGENCE_BILLED_GPU_COUNT_INVALID",
  );
  const utilization = positive(
    process.env.AVANTIQO_INTELLIGENCE_TARGET_UTILIZATION || 1,
    "AVANTIQO_INTELLIGENCE_TARGET_UTILIZATION_INVALID",
  );
  if (utilization > 1) {
    throw new Error("AVANTIQO_INTELLIGENCE_TARGET_UTILIZATION_MUST_NOT_EXCEED_ONE");
  }

  const cases = benchmarkCases(certification);
  if (!cases.length) throw new Error("INTELLIGENCE_ECONOMICS_BENCHMARK_CASES_REQUIRED");

  const gpuUsdPerSecond = (usdPerGpuHour * workerCount) / 3600;
  const measured = cases.map((item) => {
    const latencyMs = positive(item.latency_ms, "INTELLIGENCE_ECONOMICS_CASE_LATENCY_REQUIRED");
    const wallSeconds = latencyMs / 1000;
    const rawComputeCost = wallSeconds * gpuUsdPerSecond;
    const utilizationAdjustedCost = rawComputeCost / utilization;
    const inputTokens = n(item.input_tokens);
    const outputTokens = n(item.output_tokens);
    const totalTokens = inputTokens + outputTokens;
    return {
      id: text(item.id) || null,
      class: text(item.class) || null,
      latency_ms: latencyMs,
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

  const totalAdjusted = measured.reduce(
    (sum, item) => sum + item.utilization_adjusted_compute_usd,
    0,
  );
  const totalTokens = measured.reduce((sum, item) => sum + item.total_tokens, 0);
  const totalLatencyMs = measured.reduce((sum, item) => sum + item.latency_ms, 0);
  const evidence = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    provider: "avantiqo-intelligence",
    model: certification.model || certification?.benchmark?.model || null,
    source_certification_contract: certification.contract || null,
    source_certification_passed: true,
    assumptions: {
      gpu_usd_per_hour: usdPerGpuHour,
      billed_gpu_count: workerCount,
      target_utilization: utilization,
      source: "OPERATOR_SUPPLIED_RUNTIME_ECONOMICS",
    },
    measured,
    summary: {
      cases: measured.length,
      total_latency_ms: totalLatencyMs,
      average_latency_ms: Math.round(totalLatencyMs / measured.length),
      total_tokens: totalTokens,
      average_utilization_adjusted_compute_usd: round(totalAdjusted / measured.length),
      utilization_adjusted_compute_usd_per_1m_tokens: totalTokens > 0
        ? round((totalAdjusted / totalTokens) * 1_000_000, 6)
        : null,
    },
    certification: {
      economics_measured: true,
      economics_certified: false,
      reason: "MEASUREMENT_ONLY_REQUIRES_QUALITY_EQUIVALENCE_AND_PRICING_REVIEW",
    },
    pricing_activation_performed: false,
    provider_selection_changed: false,
    production_deploy_performed: false,
    activation_allowed: false,
  };

  await writeFile(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ success: true, output_path: OUTPUT, summary: evidence.summary }, null, 2));
}

main().catch(async (error) => {
  const failure = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    success: false,
    error: text(error?.message || error),
    economics_certified: false,
    pricing_activation_performed: false,
    provider_selection_changed: false,
    production_deploy_performed: false,
    activation_allowed: false,
  };
  await writeFile(OUTPUT, `${JSON.stringify(failure, null, 2)}\n`, "utf8").catch(() => null);
  console.error(`AVANTIQO_INTELLIGENCE_ECONOMICS=FAIL reason=${failure.error}`);
  process.exit(1);
});
