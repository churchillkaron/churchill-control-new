import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CONTRACT = "AVANTIQO_MUSIC_ECONOMICS_V1";
const EXPECTED_BENCHMARK_CONTRACT = "AVANTIQO_MUSIC_CERTIFICATION_BENCHMARK_V3";
const EXPECTED_PROVIDER = "avantiqo-audio";
const EXPECTED_FOUNDATION_MODEL = "ACE-Step/Ace-Step1.5";
const EXPECTED_FAMILY = "ACE_STEP_1_5";
const EXPECTED_VARIANT = "acestep-v15-xl-turbo";
const EXPECTED_QUALITY_PROFILE = "ACE_STEP_1_5_XL_TURBO_1_7B_LM_V1";
const EXPECTED_LM_MODEL = "acestep-5Hz-lm-1.7B";
const EXPECTED_LM_BACKEND = "vllm";

const INPUT = resolve(
  process.env.AVANTIQO_AUDIO_BENCHMARK_OUTPUT ||
    "/tmp/avantiqo-music-certification-benchmark.json",
);
const OUTPUT = resolve(
  process.env.AVANTIQO_AUDIO_ECONOMICS_OUTPUT ||
    "/tmp/avantiqo-music-economics.json",
);

function text(value) {
  return String(value ?? "").trim();
}

function positive(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(code);
  return number;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 8) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function assertBenchmark(report = {}) {
  if (text(report.contract) !== EXPECTED_BENCHMARK_CONTRACT) {
    throw new Error(`MUSIC_ECONOMICS_BENCHMARK_CONTRACT_MISMATCH:${text(report.contract) || "MISSING"}`);
  }
  if (report?.summary?.passed !== true) {
    throw new Error("MUSIC_ECONOMICS_REQUIRES_PASSED_BENCHMARK");
  }

  const model = report.model || {};
  const checks = {
    provider: text(model.provider) === EXPECTED_PROVIDER,
    foundation_model: text(model.foundation_model) === EXPECTED_FOUNDATION_MODEL,
    family: text(model.family) === EXPECTED_FAMILY,
    variant: text(model.variant) === EXPECTED_VARIANT,
    quality_profile: text(model.quality_profile) === EXPECTED_QUALITY_PROFILE,
    lm_required: model.ace_step_lm_required === true,
    lm_model: text(model.ace_step_lm_model) === EXPECTED_LM_MODEL,
    lm_backend: text(model.ace_step_lm_backend) === EXPECTED_LM_BACKEND,
    thinking_required: model.thinking_required === true,
    capability: text(model.capability) === "ai.music.generate",
  };
  const failed = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failed.length) {
    throw new Error(`MUSIC_ECONOMICS_RUNTIME_CONTRACT_MISMATCH:${failed.join(",")}`);
  }

  const observations = Array.isArray(report.observations) ? report.observations : [];
  if (!observations.length) throw new Error("MUSIC_ECONOMICS_OBSERVATIONS_REQUIRED");
  for (const item of observations) {
    if (item?.passed !== true) throw new Error(`MUSIC_ECONOMICS_FAILED_RUN:${item?.run || "UNKNOWN"}`);
    if (item?.ace_step_lm_used !== true) throw new Error(`MUSIC_ECONOMICS_LM_RUN_REQUIRED:${item?.run || "UNKNOWN"}`);
    if (item?.thinking_enabled !== true) throw new Error(`MUSIC_ECONOMICS_THINKING_RUN_REQUIRED:${item?.run || "UNKNOWN"}`);
    positive(item.runpod_execution_ms, `MUSIC_ECONOMICS_EXECUTION_TIME_REQUIRED:${item?.run || "UNKNOWN"}`);
    positive(item.duration_seconds, `MUSIC_ECONOMICS_AUDIO_DURATION_REQUIRED:${item?.run || "UNKNOWN"}`);
  }
  return observations;
}

async function main() {
  const benchmark = JSON.parse(await readFile(INPUT, "utf8"));
  const observations = assertBenchmark(benchmark);

  const usdPerGpuHour = positive(
    process.env.AVANTIQO_AUDIO_GPU_USD_PER_HOUR,
    "AVANTIQO_AUDIO_GPU_USD_PER_HOUR_REQUIRED",
  );
  const billedGpuCount = positive(
    process.env.AVANTIQO_AUDIO_BILLED_GPU_COUNT || 1,
    "AVANTIQO_AUDIO_BILLED_GPU_COUNT_INVALID",
  );
  const targetUtilization = positive(
    process.env.AVANTIQO_AUDIO_TARGET_UTILIZATION || 1,
    "AVANTIQO_AUDIO_TARGET_UTILIZATION_INVALID",
  );
  if (targetUtilization > 1) {
    throw new Error("AVANTIQO_AUDIO_TARGET_UTILIZATION_MUST_NOT_EXCEED_ONE");
  }

  const gpuUsdPerSecond = (usdPerGpuHour * billedGpuCount) / 3600;
  const measured = observations.map((item) => {
    const executionMs = positive(
      item.runpod_execution_ms,
      `MUSIC_ECONOMICS_EXECUTION_TIME_REQUIRED:${item?.run || "UNKNOWN"}`,
    );
    const executionSeconds = executionMs / 1000;
    const audioSeconds = positive(
      item.duration_seconds,
      `MUSIC_ECONOMICS_AUDIO_DURATION_REQUIRED:${item?.run || "UNKNOWN"}`,
    );
    const rawComputeCost = executionSeconds * gpuUsdPerSecond;
    const utilizationAdjustedCost = rawComputeCost / targetUtilization;

    return {
      run: item.run || null,
      runpod_execution_ms: executionMs,
      runpod_delay_ms: finite(item.runpod_delay_ms, null),
      worker_generation_seconds: finite(item.worker_generation_seconds, null),
      audio_duration_seconds: audioSeconds,
      realtime_factor: round(executionSeconds / audioSeconds, 6),
      raw_gpu_compute_usd: round(rawComputeCost),
      utilization_adjusted_compute_usd: round(utilizationAdjustedCost),
      utilization_adjusted_compute_usd_per_audio_second: round(utilizationAdjustedCost / audioSeconds, 10),
      utilization_adjusted_compute_usd_per_audio_minute: round((utilizationAdjustedCost / audioSeconds) * 60, 8),
    };
  });

  const totalExecutionMs = measured.reduce((sum, item) => sum + item.runpod_execution_ms, 0);
  const totalAudioSeconds = measured.reduce((sum, item) => sum + item.audio_duration_seconds, 0);
  const totalRawCost = measured.reduce((sum, item) => sum + item.raw_gpu_compute_usd, 0);
  const totalAdjustedCost = measured.reduce((sum, item) => sum + item.utilization_adjusted_compute_usd, 0);

  const evidence = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    provider: EXPECTED_PROVIDER,
    product_model: "avantiqo-music-v1",
    foundation_model: EXPECTED_FOUNDATION_MODEL,
    model_family: EXPECTED_FAMILY,
    model_variant: EXPECTED_VARIANT,
    quality_profile: EXPECTED_QUALITY_PROFILE,
    ace_step_lm_required: true,
    ace_step_lm_model: EXPECTED_LM_MODEL,
    ace_step_lm_backend: EXPECTED_LM_BACKEND,
    thinking_required: true,
    capability: "ai.music.generate",
    source_benchmark_contract: benchmark.contract,
    source_benchmark_id: benchmark.benchmark_id || null,
    source_benchmark_passed: true,
    assumptions: {
      gpu_usd_per_hour: usdPerGpuHour,
      billed_gpu_count: billedGpuCount,
      target_utilization: targetUtilization,
      source: "OPERATOR_SUPPLIED_RUNPOD_GPU_RATE",
    },
    measured,
    summary: {
      runs: measured.length,
      total_runpod_execution_ms: totalExecutionMs,
      average_runpod_execution_ms: Math.round(totalExecutionMs / measured.length),
      total_audio_seconds: round(totalAudioSeconds, 3),
      aggregate_realtime_factor: round((totalExecutionMs / 1000) / totalAudioSeconds, 6),
      raw_gpu_compute_usd: round(totalRawCost),
      utilization_adjusted_compute_usd: round(totalAdjustedCost),
      utilization_adjusted_compute_usd_per_audio_second: round(totalAdjustedCost / totalAudioSeconds, 10),
      utilization_adjusted_compute_usd_per_audio_minute: round((totalAdjustedCost / totalAudioSeconds) * 60, 8),
    },
    certification: {
      benchmark_certified: true,
      economics_measured: true,
      economics_certified: false,
      human_audio_quality_certified: false,
      reason: "MEASUREMENT_ONLY_REQUIRES_HUMAN_AUDIO_REVIEW_AND_EXPLICIT_PRICING_PROMOTION",
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
    quality_profile: EXPECTED_QUALITY_PROFILE,
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
  console.error(`AVANTIQO_MUSIC_ECONOMICS=FAIL reason=${failure.error}`);
  process.exit(1);
});
