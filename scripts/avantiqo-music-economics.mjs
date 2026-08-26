import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CONTRACT = "AVANTIQO_MUSIC_ECONOMICS_V1";
const EXPECTED_BENCHMARK_CONTRACT = "AVANTIQO_MUSIC_CERTIFICATION_BENCHMARK_V3";
const EXPECTED_WORKER_EVIDENCE_CONTRACT = "AVANTIQO_MUSIC_CONTROLLED_BENCHMARK_WORKER_EVIDENCE_V1";
const EXPECTED_PROVIDER = "avantiqo-audio";
const EXPECTED_FOUNDATION_MODEL = "ACE-Step/Ace-Step1.5";
const EXPECTED_FAMILY = "ACE_STEP_1_5";
const EXPECTED_VARIANT = "acestep-v15-xl-turbo";
const EXPECTED_QUALITY_PROFILE = "ACE_STEP_1_5_XL_TURBO_1_7B_LM_V1";
const EXPECTED_LM_MODEL = "acestep-5Hz-lm-1.7B";
const EXPECTED_LM_BACKEND = "vllm";
const RUNPOD_PUBLIC_PRICING_VERIFIED_AT = "2026-08-26";
const RUNPOD_SERVERLESS_USD_PER_HOUR_BY_GPU_TYPE = Object.freeze({
  "NVIDIA L4": 0.69,
  "NVIDIA RTX A5000": 0.69,
  "NVIDIA GeForce RTX 3090": 0.69,
  "NVIDIA GeForce RTX 4090": 1.10,
});

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

function positiveOptional(value, code) {
  const raw = text(value);
  if (!raw) return null;
  return positive(raw, code);
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

function capturedWorkerRate(item, report) {
  const worker = item?.runpod_worker || null;
  const gpuTypeId = text(worker?.gpu_type_id);
  const dataCenterId = text(worker?.data_center_id);
  if (!gpuTypeId) {
    throw new Error(`MUSIC_ECONOMICS_CAPTURED_WORKER_GPU_REQUIRED:${item?.run || "UNKNOWN"}`);
  }
  if (!Object.hasOwn(RUNPOD_SERVERLESS_USD_PER_HOUR_BY_GPU_TYPE, gpuTypeId)) {
    throw new Error(`MUSIC_ECONOMICS_CAPTURED_WORKER_GPU_RATE_UNMAPPED:${gpuTypeId}`);
  }
  if (
    text(report?.runtime_worker_evidence?.contract) !== EXPECTED_WORKER_EVIDENCE_CONTRACT ||
    report?.runtime_worker_evidence?.captured !== true
  ) {
    throw new Error("MUSIC_ECONOMICS_WORKER_EVIDENCE_CONTRACT_REQUIRED");
  }
  return {
    gpu_type_id: gpuTypeId,
    data_center_id: dataCenterId || null,
    usd_per_gpu_hour: RUNPOD_SERVERLESS_USD_PER_HOUR_BY_GPU_TYPE[gpuTypeId],
    source: "CAPTURED_RUNPOD_WORKER_GPU_PUBLIC_SERVERLESS_RATE",
    public_pricing_verified_at: RUNPOD_PUBLIC_PRICING_VERIFIED_AT,
  };
}

async function main() {
  const benchmark = JSON.parse(await readFile(INPUT, "utf8"));
  const observations = assertBenchmark(benchmark);

  const operatorRateOverride = positiveOptional(
    process.env.AVANTIQO_AUDIO_GPU_USD_PER_HOUR,
    "AVANTIQO_AUDIO_GPU_USD_PER_HOUR_INVALID",
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

  const rateResolutions = observations.map((item) => {
    if (operatorRateOverride !== null) {
      return {
        gpu_type_id: text(item?.runpod_worker?.gpu_type_id) || null,
        data_center_id: text(item?.runpod_worker?.data_center_id) || null,
        usd_per_gpu_hour: operatorRateOverride,
        source: "OPERATOR_SUPPLIED_RUNPOD_GPU_RATE",
        public_pricing_verified_at: null,
      };
    }
    return capturedWorkerRate(item, benchmark);
  });

  const measured = observations.map((item, index) => {
    const rate = rateResolutions[index];
    const executionMs = positive(
      item.runpod_execution_ms,
      `MUSIC_ECONOMICS_EXECUTION_TIME_REQUIRED:${item?.run || "UNKNOWN"}`,
    );
    const executionSeconds = executionMs / 1000;
    const audioSeconds = positive(
      item.duration_seconds,
      `MUSIC_ECONOMICS_AUDIO_DURATION_REQUIRED:${item?.run || "UNKNOWN"}`,
    );
    const gpuUsdPerSecond = (rate.usd_per_gpu_hour * billedGpuCount) / 3600;
    const rawComputeCost = executionSeconds * gpuUsdPerSecond;
    const utilizationAdjustedCost = rawComputeCost / targetUtilization;

    return {
      run: item.run || null,
      runpod_job_id: text(item.runpod_job_id) || null,
      gpu_type_id: rate.gpu_type_id,
      data_center_id: rate.data_center_id,
      gpu_usd_per_hour: rate.usd_per_gpu_hour,
      gpu_rate_source: rate.source,
      public_pricing_verified_at: rate.public_pricing_verified_at,
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
  const uniqueGpuTypes = [...new Set(measured.map((item) => item.gpu_type_id).filter(Boolean))];
  const uniqueGpuRates = [...new Set(measured.map((item) => item.gpu_usd_per_hour))];

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
    source_worker_evidence_contract: text(benchmark?.runtime_worker_evidence?.contract) || null,
    assumptions: {
      gpu_rate_resolution_mode: operatorRateOverride !== null
        ? "OPERATOR_OVERRIDE"
        : "CAPTURED_WORKER_GPU_PUBLIC_RATE",
      operator_gpu_rate_override_used: operatorRateOverride !== null,
      gpu_usd_per_hour: uniqueGpuRates.length === 1 ? uniqueGpuRates[0] : null,
      gpu_type_ids: uniqueGpuTypes,
      billed_gpu_count: billedGpuCount,
      target_utilization: targetUtilization,
      public_pricing_verified_at: operatorRateOverride === null
        ? RUNPOD_PUBLIC_PRICING_VERIFIED_AT
        : null,
      source: operatorRateOverride !== null
        ? "OPERATOR_SUPPLIED_RUNPOD_GPU_RATE"
        : "CAPTURED_RUNPOD_WORKER_GPU_PUBLIC_SERVERLESS_RATE",
    },
    measured,
    summary: {
      runs: measured.length,
      gpu_type_ids: uniqueGpuTypes,
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
      worker_gpu_evidence_captured: benchmark?.runtime_worker_evidence?.captured === true,
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
    gpu_rate_resolution_mode: evidence.assumptions.gpu_rate_resolution_mode,
    gpu_type_ids: evidence.summary.gpu_type_ids,
    summary: evidence.summary,
    benchmark_certified: true,
    worker_gpu_evidence_captured: evidence.certification.worker_gpu_evidence_captured,
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
