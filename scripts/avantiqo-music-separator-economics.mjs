#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_ECONOMICS_V1";
const BENCHMARK_CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_CERTIFICATION_BENCHMARK_V1";
const EXPECTED_PROVIDER = "avantiqo-audio";
const EXPECTED_CAPABILITY = "ai.audio.stems";
const EXPECTED_CATALOG_MODEL = "facebookresearch/demucs:htdemucs_ft";
const EXPECTED_RUNTIME_MODEL = "demucs-htdemucs-ft";
const EXPECTED_DEMUCS_MODEL = "htdemucs_ft";
const EXPECTED_QUALITY_PROFILE = "DEMUCS_HTDEMUCS_FT_4STEM_V1";
const RUNPOD_PUBLIC_PRICING_VERIFIED_AT = "2026-08-26";
const RUNPOD_SERVERLESS_USD_PER_HOUR_BY_GPU_TYPE = Object.freeze({
  "NVIDIA L4": 0.69,
  "NVIDIA RTX A5000": 0.69,
  "NVIDIA GeForce RTX 3090": 0.69,
  "NVIDIA GeForce RTX 4090": 1.10,
});

const INPUT = resolve(
  process.env.AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_OUTPUT ||
    "/tmp/avantiqo-music-separator-certification-benchmark.json",
);
const OUTPUT = resolve(
  process.env.AVANTIQO_MUSIC_SEPARATOR_ECONOMICS_OUTPUT ||
    "/tmp/avantiqo-music-separator-economics.json",
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

function round(value, digits = 8) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function assertBenchmark(report = {}) {
  const failures = [
    ["contract", text(report.contract) === BENCHMARK_CONTRACT],
    ["success", report.success === true],
    ["summary_passed", report?.summary?.passed === true],
    ["provider", text(report.provider) === EXPECTED_PROVIDER],
    ["capability", text(report.capability) === EXPECTED_CAPABILITY],
    ["catalog_model", text(report.catalog_model) === EXPECTED_CATALOG_MODEL],
    ["runtime_model", text(report.runtime_model) === EXPECTED_RUNTIME_MODEL],
    ["demucs_model", text(report.demucs_model) === EXPECTED_DEMUCS_MODEL],
    ["quality_profile", text(report.quality_profile) === EXPECTED_QUALITY_PROFILE],
    ["runtime_benchmark_passed", report?.certification?.runtime_benchmark_passed === true],
    ["production_certified_false", report?.certification?.production_certified === false],
    ["pricing_not_activated", report?.safety?.pricing_activation_performed === false],
  ].filter(([, passed]) => !passed).map(([name]) => name);
  if (failures.length) {
    throw new Error(`AVANTIQO_MUSIC_SEPARATOR_ECONOMICS_BENCHMARK_INVALID:${failures.join(",")}`);
  }

  const observations = Array.isArray(report.observations) ? report.observations : [];
  if (!observations.length) throw new Error("AVANTIQO_MUSIC_SEPARATOR_ECONOMICS_OBSERVATIONS_REQUIRED");
  for (const observation of observations) {
    if (observation?.passed !== true) throw new Error("AVANTIQO_MUSIC_SEPARATOR_ECONOMICS_REQUIRES_PASSED_RUN");
    positive(observation.source_duration_seconds, "AVANTIQO_MUSIC_SEPARATOR_ECONOMICS_SOURCE_DURATION_REQUIRED");
    positive(
      observation.runpod_execution_ms || observation.wall_ms,
      "AVANTIQO_MUSIC_SEPARATOR_ECONOMICS_EXECUTION_TIME_REQUIRED",
    );
  }
  return observations;
}

function resolveGpuRate(benchmark) {
  const override = positiveOptional(
    process.env.AVANTIQO_MUSIC_SEPARATOR_GPU_USD_PER_HOUR,
    "AVANTIQO_MUSIC_SEPARATOR_GPU_USD_PER_HOUR_INVALID",
  );
  if (override !== null) {
    return {
      gpu_type_id: null,
      usd_per_gpu_hour: override,
      source: "OPERATOR_SUPPLIED_RUNPOD_GPU_RATE",
      public_pricing_verified_at: null,
    };
  }

  const gpuTypes = Array.isArray(benchmark?.prerequisite_evidence?.endpoint_gpu_type_ids)
    ? benchmark.prerequisite_evidence.endpoint_gpu_type_ids.map(text).filter(Boolean)
    : [];
  const mapped = gpuTypes.find((gpuType) => Object.hasOwn(RUNPOD_SERVERLESS_USD_PER_HOUR_BY_GPU_TYPE, gpuType));
  if (!mapped) {
    throw new Error(
      `AVANTIQO_MUSIC_SEPARATOR_GPU_RATE_REQUIRED:SET_AVANTIQO_MUSIC_SEPARATOR_GPU_USD_PER_HOUR:endpoint_gpu_types=${gpuTypes.join("|") || "UNKNOWN"}`,
    );
  }
  return {
    gpu_type_id: mapped,
    usd_per_gpu_hour: RUNPOD_SERVERLESS_USD_PER_HOUR_BY_GPU_TYPE[mapped],
    source: "PREFLIGHT_ENDPOINT_GPU_PUBLIC_SERVERLESS_RATE",
    public_pricing_verified_at: RUNPOD_PUBLIC_PRICING_VERIFIED_AT,
  };
}

async function main() {
  const benchmark = JSON.parse(await readFile(INPUT, "utf8"));
  const observations = assertBenchmark(benchmark);
  const rate = resolveGpuRate(benchmark);
  const billedGpuCount = positive(
    process.env.AVANTIQO_MUSIC_SEPARATOR_BILLED_GPU_COUNT || 1,
    "AVANTIQO_MUSIC_SEPARATOR_BILLED_GPU_COUNT_INVALID",
  );
  const targetUtilization = positive(
    process.env.AVANTIQO_MUSIC_SEPARATOR_TARGET_UTILIZATION || 1,
    "AVANTIQO_MUSIC_SEPARATOR_TARGET_UTILIZATION_INVALID",
  );
  if (targetUtilization > 1) {
    throw new Error("AVANTIQO_MUSIC_SEPARATOR_TARGET_UTILIZATION_MUST_NOT_EXCEED_ONE");
  }

  const measured = observations.map((observation) => {
    const executionMs = positive(
      observation.runpod_execution_ms || observation.wall_ms,
      "AVANTIQO_MUSIC_SEPARATOR_ECONOMICS_EXECUTION_TIME_REQUIRED",
    );
    const sourceSeconds = positive(
      observation.source_duration_seconds,
      "AVANTIQO_MUSIC_SEPARATOR_ECONOMICS_SOURCE_DURATION_REQUIRED",
    );
    const executionSeconds = executionMs / 1000;
    const gpuUsdPerSecond = (rate.usd_per_gpu_hour * billedGpuCount) / 3600;
    const rawGpuCost = executionSeconds * gpuUsdPerSecond;
    const adjustedCost = rawGpuCost / targetUtilization;
    return {
      run: observation.run || null,
      runpod_job_id: observation.runpod_job_id || null,
      gpu_type_id: rate.gpu_type_id,
      gpu_usd_per_hour: rate.usd_per_gpu_hour,
      gpu_rate_source: rate.source,
      public_pricing_verified_at: rate.public_pricing_verified_at,
      runpod_execution_ms: executionMs,
      source_audio_seconds: sourceSeconds,
      realtime_factor: round(executionSeconds / sourceSeconds, 6),
      raw_gpu_compute_usd: round(rawGpuCost),
      utilization_adjusted_compute_usd: round(adjustedCost),
      utilization_adjusted_compute_usd_per_source_second: round(adjustedCost / sourceSeconds, 10),
      utilization_adjusted_compute_usd_per_source_minute: round((adjustedCost / sourceSeconds) * 60, 8),
      output_count: Object.keys(observation.storage_references || {}).length,
    };
  });

  const totalExecutionMs = measured.reduce((sum, item) => sum + item.runpod_execution_ms, 0);
  const totalSourceSeconds = measured.reduce((sum, item) => sum + item.source_audio_seconds, 0);
  const totalAdjustedCost = measured.reduce((sum, item) => sum + item.utilization_adjusted_compute_usd, 0);

  const evidence = {
    success: true,
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    provider: EXPECTED_PROVIDER,
    capability: EXPECTED_CAPABILITY,
    catalog_model: EXPECTED_CATALOG_MODEL,
    runtime_model: EXPECTED_RUNTIME_MODEL,
    demucs_model: EXPECTED_DEMUCS_MODEL,
    quality_profile: EXPECTED_QUALITY_PROFILE,
    source_benchmark_contract: benchmark.contract,
    source_benchmark_id: benchmark.benchmark_id || null,
    source_benchmark_passed: true,
    assumptions: {
      gpu_rate_resolution_mode: rate.source,
      gpu_type_id: rate.gpu_type_id,
      gpu_usd_per_hour: rate.usd_per_gpu_hour,
      billed_gpu_count: billedGpuCount,
      target_utilization: targetUtilization,
      public_pricing_verified_at: rate.public_pricing_verified_at,
    },
    measured,
    summary: {
      runs: measured.length,
      total_runpod_execution_ms: totalExecutionMs,
      average_runpod_execution_ms: Math.round(totalExecutionMs / measured.length),
      total_source_audio_seconds: round(totalSourceSeconds, 3),
      aggregate_realtime_factor: round((totalExecutionMs / 1000) / totalSourceSeconds, 6),
      utilization_adjusted_compute_usd: round(totalAdjustedCost),
      utilization_adjusted_compute_usd_per_source_second: round(totalAdjustedCost / totalSourceSeconds, 10),
      utilization_adjusted_compute_usd_per_source_minute: round((totalAdjustedCost / totalSourceSeconds) * 60, 8),
    },
    certification: {
      runtime_benchmark_passed: true,
      economics_measured: true,
      economics_certified: false,
      human_quality_certified: false,
      production_certified: false,
      next_gate: "SEPARATOR_HUMAN_QUALITY_REVIEW_REQUIRED",
    },
    pricing_status: "NOT_PRODUCTION_CERTIFIED",
    pricing_activation_performed: false,
    provider_certification_mutation_performed: false,
    database_mutation_performed: false,
    production_deploy_performed: false,
    automatic_activation_forbidden: true,
    activation_allowed: false,
  };

  await writeFile(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    success: true,
    output_path: OUTPUT,
    contract: CONTRACT,
    benchmark_id: benchmark.benchmark_id || null,
    summary: evidence.summary,
    economics_measured: true,
    economics_certified: false,
    human_quality_certified: false,
    production_certified: false,
    pricing_activation_performed: false,
    activation_allowed: false,
  }, null, 2));
}

main().catch(async (error) => {
  const failure = {
    success: false,
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    error: text(error?.message || error),
    economics_measured: false,
    economics_certified: false,
    human_quality_certified: false,
    production_certified: false,
    pricing_activation_performed: false,
    provider_certification_mutation_performed: false,
    production_deploy_performed: false,
    activation_allowed: false,
  };
  await writeFile(OUTPUT, `${JSON.stringify(failure, null, 2)}\n`, "utf8").catch(() => null);
  console.error(`AVANTIQO_MUSIC_SEPARATOR_ECONOMICS=FAIL reason=${failure.error}`);
  process.exit(1);
});
