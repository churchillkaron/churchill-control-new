#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_MUSIC_ELASTIC_ECONOMICS_RECOVERY_V1";
const ECONOMICS_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_ECONOMICS_BENCHMARK_V1";
const CERTIFICATION_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_PRODUCTION_CERTIFICATION_V1";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_AUDIO_ENGINE_V1";
const REPORT_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_AUDIO_RENDER_REPORT_V1";
const STRETCH_ENGINE = "SIGNALSMITH_STRETCH_PYTHON_STRETCH_0_3_1";
const BOUNDARY_CONTRACT = "SEAM_TAPER_NO_DUPLICATED_TRAJECTORY_V2";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const LANE = "music-elastic-audio";
const CAPABILITY = "ai.audio.elastic-warp";
const PROVIDER = "avantiqo-audio";
const MODEL = "signalsmith-stretch";
const QUALITY_PROFILE = "SIGNALSMITH_REVIEWED_TRANSIENT_WARP_V1";
const ENDPOINT_NAME = "avantiqo-music-elastic-audio-v1";
const BUCKET = "creative-assets";
const FIXTURE_SECONDS = 8;
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const EXPECTED_RECOVERY_GPU = "NVIDIA RTX PRO 6000 Blackwell Server Edition MIG 1g.24gb";
const PUBLIC_MIG_24GB_SERVERLESS_USD_PER_HOUR = 0.69;
const PUBLIC_RATE_VERIFIED_AT = "2026-08-28";
const APPROVAL_ENV = "AVANTIQO_MUSIC_ELASTIC_ECONOMICS_RECOVERY_APPROVED";
const SAFE_LEASE_ATTESTATION_ENV = "AVANTIQO_MUSIC_ELASTIC_ECONOMICS_RECOVERY_SAFE_LEASE_PASS";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const round = (value, digits = 12) => {
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
};

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function approved(name) {
  if (text(process.env[name]).toUpperCase() !== "YES") throw new Error(`${name}=YES_REQUIRED`);
}

function arg(prefix) {
  return text(process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length));
}

async function requestJson(url, key) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 800);
    throw new Error(`${CONTRACT}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

function workersMin(endpoint = {}) {
  return finite(endpoint.workersMin ?? endpoint.workers_min, -1);
}

function workersMax(endpoint = {}) {
  return finite(endpoint.workersMax ?? endpoint.workers_max, -1);
}

function activeWorkers(endpoint = {}) {
  const terminal = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
  return list(endpoint.workers).filter((worker) => {
    const status = text(worker.status ?? worker.workerStatus ?? worker.runtimeStatus).toUpperCase();
    const desired = text(worker.desiredStatus ?? worker.desired_status).toUpperCase();
    if (status && !terminal.has(status)) return true;
    if (desired && !terminal.has(desired)) return true;
    return !status && !desired;
  });
}

function validateCertification(filePath) {
  const bytes = fs.readFileSync(filePath);
  const value = JSON.parse(bytes.toString("utf8"));
  const failures = [];
  const check = (name, ok) => { if (!ok) failures.push(name); };
  check("success", value?.success === true);
  check("contract", text(value?.contract) === CERTIFICATION_CONTRACT);
  check("capability", text(value?.capability) === CAPABILITY);
  check("provider", text(value?.provider) === PROVIDER);
  check("model", text(value?.model) === MODEL);
  check("quality_profile", text(value?.quality_profile) === QUALITY_PROFILE);
  check("engine_contract", text(value?.engine_contract) === ENGINE_CONTRACT);
  check("production_certified", value?.production_certified === true);
  check("human_review_pass", text(value?.evidence?.human_review_decision) === "PASS");
  check("human_checks", value?.evidence?.all_listening_checks_passed === true);
  check("provider_parked_gate", value?.certification_gates?.provider_parked_after_certification === true);
  if (failures.length) throw new Error(`${CONTRACT}_CERTIFICATION_INVALID:${failures.join(",")}`);
  return { value, sha256: sha256(bytes) };
}

function validateWorkerReport(report = {}) {
  const failures = [];
  const check = (name, ok) => { if (!ok) failures.push(name); };
  check("contract", text(report.contract) === REPORT_CONTRACT);
  check("engine_contract", text(report.engine_contract) === ENGINE_CONTRACT);
  check("stretch_engine", text(report.stretch_engine) === STRETCH_ENGINE);
  check("output_format", text(report.output_format) === "WAV_PCM24");
  check("approved_marker_count", finite(report.approved_marker_count, -1) === 3);
  check("automatic_apply_false", report.automatic_apply_performed === false);
  check("original_source_preserved", report.original_source_preserved === true);
  check("pitch_preserving", report?.render?.pitch_preserving_time_stretch === true);
  check("boundary_contract", text(report?.render?.boundary_smoothing_contract) === BOUNDARY_CONTRACT);
  check("duplicated_transition_false", report?.render?.duplicated_transition_trajectory === false);
  check("duration", Math.abs(finite(report?.render?.duration_seconds, 0) - FIXTURE_SECONDS) <= 0.02);
  check("checksum", /^[a-f0-9]{64}$/i.test(text(report.output_checksum)));
  check("source_asset_id", /^music-elastic-economics-[0-9]{17}$/.test(text(report.source_asset_id)));
  if (failures.length) throw new Error(`${CONTRACT}_WORKER_REPORT_INVALID:${failures.join(",")}`);
}

function parseWav(bytes) {
  if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`${CONTRACT}_OUTPUT_WAV_INVALID`);
  }
  let offset = 12;
  let fmt = null;
  let dataSize = null;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (body + size > bytes.length) break;
    if (id === "fmt " && size >= 16) {
      fmt = {
        audio_format: bytes.readUInt16LE(body),
        channels: bytes.readUInt16LE(body + 2),
        sample_rate: bytes.readUInt32LE(body + 4),
        byte_rate: bytes.readUInt32LE(body + 8),
        bits_per_sample: bytes.readUInt16LE(body + 14),
      };
    }
    if (id === "data") dataSize = size;
    offset = body + size + (size % 2);
  }
  if (!fmt || dataSize === null || !fmt.byte_rate) throw new Error(`${CONTRACT}_OUTPUT_WAV_CHUNKS_INVALID`);
  return { ...fmt, data_bytes: dataSize, duration_seconds: dataSize / fmt.byte_rate };
}

async function storageDownload(supabaseUrl, serviceKey, objectPath) {
  const encoded = objectPath.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/authenticated/${encodeURIComponent(BUCKET)}/${encoded}`, {
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      Accept: "audio/wav,application/octet-stream,*/*",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`${CONTRACT}_STORAGE_HTTP_${response.status}:${text(raw).slice(0, 500)}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

approved(APPROVAL_ENV);
approved(SAFE_LEASE_ATTESTATION_ENV);

const certificationPath = path.resolve(
  arg("--certification=") || required("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_CERTIFICATION_OUTPUT"),
);
if (!fs.existsSync(certificationPath)) throw new Error(`${CONTRACT}_CERTIFICATION_FILE_NOT_FOUND`);
const certification = validateCertification(certificationPath);

const jobId = arg("--job-id=");
if (!jobId) throw new Error(`${CONTRACT}_JOB_ID_REQUIRED`);
const gpuTypeId = arg("--gpu-type-id=");
if (gpuTypeId !== EXPECTED_RECOVERY_GPU) throw new Error(`${CONTRACT}_GPU_TYPE_MISMATCH:${gpuTypeId || "MISSING"}`);
const capturedHourlyCostUsd = finite(arg("--captured-hourly-cost-usd="), null);
if (!(capturedHourlyCostUsd > 0 && capturedHourlyCostUsd <= 6)) throw new Error(`${CONTRACT}_CAPTURED_HOURLY_COST_INVALID`);

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const queueKey = text(process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY) || text(process.env.RUNPOD_API_KEY) || managementKey;
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");

const endpoints = await requestJson(`${REST_BASE}/endpoints?includeTemplate=false&includeWorkers=true`, managementKey);
if (!Array.isArray(endpoints)) throw new Error(`${CONTRACT}_ENDPOINT_LIST_INVALID`);
const matches = endpoints.filter((entry) => text(entry?.name) === ENDPOINT_NAME);
if (matches.length !== 1) throw new Error(`${CONTRACT}_ENDPOINT_REQUIRED:matches=${matches.length}`);
const endpoint = matches[0];
const endpointId = text(endpoint.id);
if (!endpointId) throw new Error(`${CONTRACT}_ENDPOINT_ID_REQUIRED`);

const [health, completed] = await Promise.all([
  requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, queueKey),
  requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`, queueKey),
]);

const inQueue = finite(health?.jobs?.inQueue ?? health?.jobs?.in_queue, 0);
const inProgress = finite(health?.jobs?.inProgress ?? health?.jobs?.in_progress, 0);
if (
  workersMin(endpoint) !== 0 ||
  workersMax(endpoint) !== 0 ||
  activeWorkers(endpoint).length !== 0 ||
  inQueue !== 0 ||
  inProgress !== 0
) throw new Error(`${CONTRACT}_CURRENT_ENDPOINT_NOT_CLEAN_0_0`);

const status = text(completed?.status).toUpperCase();
if (!["COMPLETED", "COMPLETE", "SUCCEEDED", "SUCCESS", "DONE"].includes(status)) {
  throw new Error(`${CONTRACT}_COMPLETED_JOB_NOT_AVAILABLE:${status || "UNKNOWN"}`);
}
const executionMs = finite(completed?.executionTime ?? completed?.execution_time, null);
const delayMs = finite(completed?.delayTime ?? completed?.delay_time, null);
if (!(executionMs > 0)) throw new Error(`${CONTRACT}_RUNPOD_EXECUTION_TIME_REQUIRED`);
const report = completed?.output && typeof completed.output === "object" ? completed.output : {};
validateWorkerReport(report);

const sourceAssetId = text(report.source_asset_id);
const runId = sourceAssetId.replace(/^music-elastic-economics-/, "");
const prefix = `platform-certification/music-elastic-economics/${runId}`;
const sourcePath = `${prefix}/synthetic-source.wav`;
const outputPath = `${prefix}/elastic-render.wav`;
const [sourceBytes, outputBytes] = await Promise.all([
  storageDownload(supabaseUrl, serviceKey, sourcePath),
  storageDownload(supabaseUrl, serviceKey, outputPath),
]);
const sourceChecksum = sha256(sourceBytes);
const outputChecksum = sha256(outputBytes);
if (sourceChecksum !== text(report.source_file_checksum)) throw new Error(`${CONTRACT}_SOURCE_CHECKSUM_MISMATCH`);
if (outputChecksum !== text(report.output_checksum)) throw new Error(`${CONTRACT}_OUTPUT_CHECKSUM_MISMATCH`);
if (sourceChecksum === outputChecksum) throw new Error(`${CONTRACT}_OUTPUT_IDENTICAL_TO_SOURCE`);
const wav = parseWav(outputBytes);
if (
  wav.audio_format !== 1 ||
  wav.channels !== 2 ||
  wav.sample_rate !== 48000 ||
  wav.bits_per_sample !== 24 ||
  Math.abs(wav.duration_seconds - FIXTURE_SECONDS) > 0.02
) throw new Error(`${CONTRACT}_OUTPUT_PCM24_CONTRACT_MISMATCH`);

const executionSeconds = executionMs / 1000;
const rawComputeUsd = executionSeconds * (capturedHourlyCostUsd / 3600);
const supplierUsdPerAudioSecond = rawComputeUsd / FIXTURE_SECONDS;
const supplierUsdPerAudioMinute = supplierUsdPerAudioSecond * 60;

const resultPath = path.resolve(
  text(process.env.AVANTIQO_MUSIC_ELASTIC_ECONOMICS_OUTPUT) ||
    path.join(os.tmpdir(), `avantiqo-music-elastic-economics-recovered-${Date.now()}.json`),
);
const result = {
  success: true,
  contract: ECONOMICS_CONTRACT,
  recovery_contract: CONTRACT,
  recovered_from_completed_job: true,
  generated_at: new Date().toISOString(),
  capability: CAPABILITY,
  provider: PROVIDER,
  model: MODEL,
  quality_profile: QUALITY_PROFILE,
  engine_contract: ENGINE_CONTRACT,
  production_certification: {
    path: certificationPath,
    sha256: certification.sha256,
    verified: true,
    production_certified: true,
    human_quality_certified: true,
  },
  controlled_benchmark: {
    exactly_one_job: true,
    controlled_job_count: 1,
    runpod_job_id: jobId,
    runpod_job_status: status,
    safe_lease_contract: SAFE_LEASE_CONTRACT,
    safe_lease_lane: LANE,
    safe_lease_pass_operator_attested: true,
    synthetic_source_rights: "AVANTIQO_SYNTHETIC_TEST_AUDIO",
    source_duration_seconds: FIXTURE_SECONDS,
    source_checksum: sourceChecksum,
    output_checksum: outputChecksum,
    output_format: "WAV_PCM24",
    automatic_apply_performed: false,
    production_provider_path_used: false,
    recovery_submitted_new_provider_job: false,
  },
  worker_cost_evidence: {
    gpu_type_id: gpuTypeId,
    gpu_memory_class_gb: 24,
    captured_effective_hourly_cost_usd: capturedHourlyCostUsd,
    captured_cost_source: "SAFE_LEASE_WATCHDOG_SINGLE_ACTIVE_WORKER_TARGET_HOURLY_COST",
    public_serverless_reference_hourly_cost_usd: PUBLIC_MIG_24GB_SERVERLESS_USD_PER_HOUR,
    public_reference_verified_at: PUBLIC_RATE_VERIFIED_AT,
    public_reference_scope: "RUNPOD_SERVERLESS_24GB_MIG_TIER",
    captured_rate_used_for_supplier_cost: true,
  },
  economics: {
    measured: true,
    certification_ready: true,
    economics_certified: false,
    pricing_activation_required_for_certified_state: true,
    runpod_execution_ms: executionMs,
    runpod_delay_ms: delayMs,
    audio_duration_seconds: FIXTURE_SECONDS,
    realtime_factor: round(executionSeconds / FIXTURE_SECONDS, 6),
    gpu_usd_per_hour: capturedHourlyCostUsd,
    gpu_rate_source: "CAPTURED_EFFECTIVE_WORKER_HOURLY_COST",
    raw_gpu_compute_usd: round(rawComputeUsd, 12),
    supplier_compute_usd_per_audio_second: round(supplierUsdPerAudioSecond, 12),
    supplier_compute_usd_per_audio_minute: round(supplierUsdPerAudioMinute, 10),
  },
  pricing_policy_ready: {
    supplier_cost_measured: true,
    platform_default_markup_percent: 30,
    customer_price_policy: "SUPPLIER_COST_PLUS_MARKUP",
    currency_conversion_required_before_pricing_row: true,
    pricing_row_created: false,
    pricing_activation_performed: false,
  },
  current_verified_rest_state: {
    workers_min: 0,
    workers_max: 0,
    active_workers: 0,
    jobs_in_queue: 0,
    jobs_in_progress: 0,
  },
  recovery_provider_job_submitted: false,
  persistent_endpoint_mutation_performed: false,
  database_mutation_performed: false,
  organization_service_mutation_performed: false,
  provider_routing_mutation_performed: false,
  pricing_mutation_performed: false,
  production_deploy_performed: false,
  next_action: "BUILD_AND_REVIEW_ELASTIC_PRODUCTION_PRICING_PROMOTION",
};
fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  economics_contract: ECONOMICS_CONTRACT,
  output_path: resultPath,
  recovered_from_completed_job: true,
  runpod_job_id: jobId,
  runpod_execution_ms: executionMs,
  gpu_type_id: gpuTypeId,
  captured_effective_hourly_cost_usd: capturedHourlyCostUsd,
  public_mig_24gb_serverless_reference_usd_per_hour: PUBLIC_MIG_24GB_SERVERLESS_USD_PER_HOUR,
  supplier_compute_usd_per_audio_second: result.economics.supplier_compute_usd_per_audio_second,
  supplier_compute_usd_per_audio_minute: result.economics.supplier_compute_usd_per_audio_minute,
  output_checksum_verified: true,
  current_endpoint_clean_0_0: true,
  recovery_provider_job_submitted: false,
  pricing_activation_performed: false,
  database_mutation_performed: false,
  production_deploy_performed: false,
  next_action: result.next_action,
}, null, 2));
console.log("AVANTIQO_MUSIC_ELASTIC_ECONOMICS_RECOVERY=PASS");
console.log("AVANTIQO_MUSIC_ELASTIC_ECONOMICS_MEASURED=true");
console.log("AVANTIQO_MUSIC_ELASTIC_ECONOMICS_CERTIFICATION_READY=true");
console.log("AVANTIQO_MUSIC_ELASTIC_ECONOMICS_RECOVERY_NEW_PROVIDER_JOB=false");
console.log("AVANTIQO_MUSIC_ELASTIC_CURRENT_ENDPOINT=0/0");
console.log("AVANTIQO_MUSIC_ELASTIC_PRICING_ACTIVATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_DATABASE_MUTATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_DEPLOY_PERFORMED=false");
console.log(`AVANTIQO_MUSIC_ELASTIC_ECONOMICS_OUTPUT=${resultPath}`);
console.log(`AVANTIQO_MUSIC_ELASTIC_NEXT=${result.next_action}`);
