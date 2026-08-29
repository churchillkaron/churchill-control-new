#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_MUSIC_ELASTIC_ECONOMICS_BILLING_RECOVERY_V1";
const ECONOMICS_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_ECONOMICS_BENCHMARK_V1";
const EVIDENCE_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_ECONOMICS_CAPTURED_RUN_EVIDENCE_V1";
const ENDPOINT_NAME = "avantiqo-music-elastic-audio-v1";
const BUCKET = "creative-assets";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const APPROVAL_ENV = "AVANTIQO_MUSIC_ELASTIC_ECONOMICS_BILLING_RECOVERY_APPROVED";
const DEFAULT_EVIDENCE = "audits/results/avantiqo-music-elastic-economics-captured-run-20260828.json";

const text = (v) => String(v ?? "").trim();
const list = (v) => Array.isArray(v) ? v : [];
const finite = (v, fallback = null) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const round = (v, digits = 12) => {
  const s = 10 ** digits;
  return Math.round(Number(v) * s) / s;
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

function workersMin(endpoint = {}) { return finite(endpoint.workersMin ?? endpoint.workers_min, -1); }
function workersMax(endpoint = {}) { return finite(endpoint.workersMax ?? endpoint.workers_max, -1); }
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
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, Accept: "audio/wav,application/octet-stream,*/*" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`${CONTRACT}_STORAGE_HTTP_${response.status}:${text(raw).slice(0, 500)}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

approved(APPROVAL_ENV);

const evidencePath = path.resolve(arg("--evidence=") || DEFAULT_EVIDENCE);
if (!fs.existsSync(evidencePath)) throw new Error(`${CONTRACT}_EVIDENCE_FILE_NOT_FOUND`);
const evidenceBytes = fs.readFileSync(evidencePath);
const evidence = JSON.parse(evidenceBytes.toString("utf8"));
if (text(evidence?.contract) !== EVIDENCE_CONTRACT || evidence?.success !== true) throw new Error(`${CONTRACT}_EVIDENCE_INVALID`);
if (evidence?.safe_lease?.safe_lease_pass !== true || evidence?.safe_lease?.release_success !== true) throw new Error(`${CONTRACT}_SAFE_LEASE_EVIDENCE_INVALID`);
if (finite(evidence?.job?.job_count, 0) !== 1 || text(evidence?.job?.status) !== "COMPLETED") throw new Error(`${CONTRACT}_JOB_EVIDENCE_INVALID`);
if (evidence?.safety?.additional_provider_job_authorized !== false) throw new Error(`${CONTRACT}_ADDITIONAL_JOB_GUARD_INVALID`);

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const queueKey = text(process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY) || text(process.env.RUNPOD_API_KEY) || managementKey;
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const endpointId = text(evidence?.endpoint?.id);
if (!endpointId || text(evidence?.endpoint?.name) !== ENDPOINT_NAME) throw new Error(`${CONTRACT}_ENDPOINT_EVIDENCE_INVALID`);

const endpoints = await requestJson(`${REST_BASE}/endpoints?includeTemplate=false&includeWorkers=true`, managementKey);
if (!Array.isArray(endpoints)) throw new Error(`${CONTRACT}_ENDPOINT_LIST_INVALID`);
const endpoint = endpoints.find((entry) => text(entry?.id) === endpointId && text(entry?.name) === ENDPOINT_NAME);
if (!endpoint) throw new Error(`${CONTRACT}_ENDPOINT_NOT_FOUND`);
const health = await requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, queueKey);
const inQueue = finite(health?.jobs?.inQueue ?? health?.jobs?.in_queue, 0);
const inProgress = finite(health?.jobs?.inProgress ?? health?.jobs?.in_progress, 0);
if (workersMin(endpoint) !== 0 || workersMax(endpoint) !== 0 || activeWorkers(endpoint).length !== 0 || inQueue !== 0 || inProgress !== 0) {
  throw new Error(`${CONTRACT}_CURRENT_ENDPOINT_NOT_CLEAN_0_0`);
}

const startTime = text(evidence?.benchmark_window?.start_time);
const endTime = text(evidence?.benchmark_window?.end_time);
if (!startTime || !endTime) throw new Error(`${CONTRACT}_BILLING_WINDOW_REQUIRED`);
const params = new URLSearchParams({ bucketSize: "hour", grouping: "endpointId", endpointId, startTime, endTime });
const billing = await requestJson(`${REST_BASE}/billing/endpoints?${params.toString()}`, managementKey);
if (!Array.isArray(billing)) throw new Error(`${CONTRACT}_BILLING_RESPONSE_INVALID`);
const rows = billing.filter((row) => !text(row?.endpointId) || text(row?.endpointId) === endpointId);
if (!rows.length) throw new Error(`${CONTRACT}_BILLING_RECORD_REQUIRED`);
const billedAmountUsd = rows.reduce((sum, row) => sum + Math.max(0, finite(row?.amount, 0)), 0);
const timeBilledMs = rows.reduce((sum, row) => sum + Math.max(0, finite(row?.timeBilledMs, 0)), 0);
if (!(billedAmountUsd > 0)) throw new Error(`${CONTRACT}_BILLED_AMOUNT_REQUIRED`);
if (!(timeBilledMs > 0)) throw new Error(`${CONTRACT}_TIME_BILLED_REQUIRED`);

const report = evidence.worker_report || {};
const sourceAssetId = text(report.source_asset_id);
if (!/^music-elastic-economics-[0-9]{17}$/.test(sourceAssetId)) throw new Error(`${CONTRACT}_SOURCE_ASSET_ID_INVALID`);
const runId = sourceAssetId.replace(/^music-elastic-economics-/, "");
const prefix = `platform-certification/music-elastic-economics/${runId}`;
const [sourceBytes, outputBytes] = await Promise.all([
  storageDownload(supabaseUrl, serviceKey, `${prefix}/synthetic-source.wav`),
  storageDownload(supabaseUrl, serviceKey, `${prefix}/elastic-render.wav`),
]);
const sourceChecksum = sha256(sourceBytes);
const outputChecksum = sha256(outputBytes);
if (sourceChecksum !== text(report.source_file_checksum)) throw new Error(`${CONTRACT}_SOURCE_CHECKSUM_MISMATCH`);
if (outputChecksum !== text(report.output_checksum)) throw new Error(`${CONTRACT}_OUTPUT_CHECKSUM_MISMATCH`);
if (sourceChecksum === outputChecksum) throw new Error(`${CONTRACT}_OUTPUT_IDENTICAL_TO_SOURCE`);
const wav = parseWav(outputBytes);
if (wav.audio_format !== 1 || wav.channels !== 2 || wav.sample_rate !== 48000 || wav.bits_per_sample !== 24 || Math.abs(wav.duration_seconds - 8) > 0.02) {
  throw new Error(`${CONTRACT}_OUTPUT_PCM24_CONTRACT_MISMATCH`);
}
if (report?.render?.pitch_preserving_time_stretch !== true || report?.render?.duplicated_transition_trajectory !== false) {
  throw new Error(`${CONTRACT}_RENDER_SAFETY_EVIDENCE_INVALID`);
}

const audioSeconds = finite(report?.source_duration_seconds, 8);
const supplierUsdPerAudioSecond = billedAmountUsd / audioSeconds;
const supplierUsdPerAudioMinute = supplierUsdPerAudioSecond * 60;
const effectiveHourlyUsd = billedAmountUsd / (timeBilledMs / 3600000);

const resultPath = path.resolve(text(process.env.AVANTIQO_MUSIC_ELASTIC_ECONOMICS_OUTPUT) || path.join(os.tmpdir(), `avantiqo-music-elastic-economics-billing-recovered-${Date.now()}.json`));
const result = {
  success: true,
  contract: ECONOMICS_CONTRACT,
  recovery_contract: CONTRACT,
  generated_at: new Date().toISOString(),
  evidence_path: evidencePath,
  evidence_sha256: sha256(evidenceBytes),
  recovered_from_runpod_billing_history: true,
  capability: evidence.capability,
  provider: evidence.provider,
  model: evidence.model,
  quality_profile: evidence.quality_profile,
  controlled_benchmark: {
    exactly_one_job: true,
    controlled_job_count: 1,
    runpod_job_id: evidence.job.id,
    runpod_job_status: evidence.job.status,
    runpod_execution_ms: evidence.job.runpod_execution_ms,
    runpod_delay_ms: evidence.job.runpod_delay_ms,
    wall_ms: evidence.job.wall_ms,
    synthetic_audio_only: true,
    source_checksum: sourceChecksum,
    output_checksum: outputChecksum,
    output_format: "WAV_PCM24",
    recovery_submitted_new_provider_job: false
  },
  billing_evidence: {
    endpoint_id: endpointId,
    start_time: startTime,
    end_time: endTime,
    bucket_size: "hour",
    grouping: "endpointId",
    record_count: rows.length,
    amount_usd: round(billedAmountUsd, 12),
    time_billed_ms: timeBilledMs,
    effective_hourly_usd: round(effectiveHourlyUsd, 8)
  },
  economics: {
    measured: true,
    certification_ready: true,
    economics_certified: false,
    pricing_activation_required_for_certified_state: true,
    billed_supplier_compute_usd: round(billedAmountUsd, 12),
    supplier_compute_usd_per_audio_second: round(supplierUsdPerAudioSecond, 12),
    supplier_compute_usd_per_audio_minute: round(supplierUsdPerAudioMinute, 10)
  },
  pricing_policy_ready: {
    supplier_cost_measured: true,
    platform_default_markup_percent: 30,
    customer_price_policy: "SUPPLIER_COST_PLUS_MARKUP",
    currency_conversion_required_before_pricing_row: true,
    pricing_row_created: false,
    pricing_activation_performed: false
  },
  current_verified_rest_state: { workers_min: 0, workers_max: 0, active_workers: 0, jobs_in_queue: 0, jobs_in_progress: 0 },
  recovery_provider_job_submitted: false,
  persistent_endpoint_mutation_performed: false,
  database_mutation_performed: false,
  organization_service_mutation_performed: false,
  provider_routing_mutation_performed: false,
  pricing_mutation_performed: false,
  production_deploy_performed: false,
  next_action: "BUILD_AND_REVIEW_ELASTIC_PRODUCTION_PRICING_PROMOTION"
};
fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  economics_contract: ECONOMICS_CONTRACT,
  output_path: resultPath,
  billing_amount_usd: result.billing_evidence.amount_usd,
  billing_time_billed_ms: result.billing_evidence.time_billed_ms,
  billing_effective_hourly_usd: result.billing_evidence.effective_hourly_usd,
  supplier_compute_usd_per_audio_second: result.economics.supplier_compute_usd_per_audio_second,
  supplier_compute_usd_per_audio_minute: result.economics.supplier_compute_usd_per_audio_minute,
  output_checksum_verified: true,
  current_endpoint_clean_0_0: true,
  recovery_provider_job_submitted: false,
  pricing_activation_performed: false,
  database_mutation_performed: false,
  production_deploy_performed: false,
  next_action: result.next_action
}, null, 2));
console.log("AVANTIQO_MUSIC_ELASTIC_ECONOMICS_BILLING_RECOVERY=PASS");
console.log("AVANTIQO_MUSIC_ELASTIC_ECONOMICS_MEASURED=true");
console.log("AVANTIQO_MUSIC_ELASTIC_ECONOMICS_CERTIFICATION_READY=true");
console.log("AVANTIQO_MUSIC_ELASTIC_ECONOMICS_RECOVERY_NEW_PROVIDER_JOB=false");
console.log("AVANTIQO_MUSIC_ELASTIC_CURRENT_ENDPOINT=0/0");
console.log("AVANTIQO_MUSIC_ELASTIC_PRICING_ACTIVATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_DATABASE_MUTATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_DEPLOY_PERFORMED=false");
console.log(`AVANTIQO_MUSIC_ELASTIC_ECONOMICS_OUTPUT=${resultPath}`);
console.log(`AVANTIQO_MUSIC_ELASTIC_NEXT=${result.next_action}`);
