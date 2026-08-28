#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_MUSIC_ELASTIC_ECONOMICS_BENCHMARK_V1";
const CHILD_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_ECONOMICS_JOB_V1";
const WORKER_EVIDENCE_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_ECONOMICS_WORKER_EVIDENCE_V1";
const CERTIFICATION_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_PRODUCTION_CERTIFICATION_V1";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_AUDIO_ENGINE_V1";
const PLAN_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_WARP_PLAN_V1";
const REPORT_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_AUDIO_RENDER_REPORT_V1";
const TECHNICAL_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_CONTROLLED_RENDER_CERTIFICATION_V1";
const HUMAN_REVIEW_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_HUMAN_LISTENING_REVIEW_V1";
const STRETCH_ENGINE = "SIGNALSMITH_STRETCH_PYTHON_STRETCH_0_3_1";
const BOUNDARY_CONTRACT = "SEAM_TAPER_NO_DUPLICATED_TRAJECTORY_V2";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const LANE = "music-elastic-audio";
const CAPABILITY = "ai.audio.elastic-warp";
const PROVIDER = "avantiqo-audio";
const MODEL = "signalsmith-stretch";
const QUALITY_PROFILE = "SIGNALSMITH_REVIEWED_TRANSIENT_WARP_V1";
const ENDPOINT_NAME = "avantiqo-music-elastic-audio-v1";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-music-elastic-worker-image.json";
const IMAGE_EVIDENCE_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_WORKER_IMAGE_RESULT_V1";
const BUCKET = "creative-assets";
const FIXTURE_SECONDS = 8;
const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTROL_BASE = "https://api.runpod.io/v2";
const POLL_MS = 1000;
const APPROVAL_ENV = "AVANTIQO_MUSIC_ELASTIC_ECONOMICS_BENCHMARK_APPROVED";
const RUNPOD_PUBLIC_PRICING_VERIFIED_AT = "2026-08-28";
const RUNPOD_SERVERLESS_USD_PER_HOUR_BY_GPU_TYPE = Object.freeze({
  "NVIDIA L4": 0.69,
  "NVIDIA RTX A5000": 0.69,
  "NVIDIA GeForce RTX 3090": 0.69,
  "NVIDIA GeForce RTX 4090": 1.10,
});
const SELF_PATH = fileURLToPath(import.meta.url);

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (value, digits = 10) => {
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

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
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
  return list(endpoint.workers).filter((worker) => {
    const status = text(worker.status ?? worker.workerStatus ?? worker.runtimeStatus).toUpperCase();
    const desired = text(worker.desiredStatus ?? worker.desired_status).toUpperCase();
    const terminal = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
    if (status && !terminal.has(status)) return true;
    if (desired && !terminal.has(desired)) return true;
    return !status && !desired;
  });
}

function endpointVolumeIds(endpoint = {}) {
  return [...new Set([
    endpoint.networkVolumeId ?? endpoint.network_volume_id,
    ...list(endpoint.networkVolumeIds ?? endpoint.network_volume_ids),
  ].map(text).filter(Boolean))];
}

function safeWorkers(body = {}) {
  return list(body?.workers)
    .map((worker) => ({
      status: text(worker?.status).toUpperCase() || null,
      version: finite(worker?.version, null),
      gpu_count: finite(worker?.gpuCount ?? worker?.gpu_count, null),
      gpu_type_id: text(worker?.gpuTypeId ?? worker?.gpu_type_id) || null,
      data_center_id: text(worker?.dataCenterId ?? worker?.data_center_id) || null,
      started_at: text(worker?.startedAt ?? worker?.started_at) || null,
      is_stale: worker?.isStale === true || worker?.is_stale === true,
    }))
    .filter((worker) => worker.gpu_type_id || worker.data_center_id);
}

function uniqueWorkers(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = JSON.stringify([
      row.status,
      row.version,
      row.gpu_count,
      row.gpu_type_id,
      row.data_center_id,
      row.started_at,
      row.is_stale,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findLatestCertification() {
  const explicit = arg("--certification=") || text(process.env.AVANTIQO_MUSIC_ELASTIC_PRODUCTION_CERTIFICATION_OUTPUT);
  if (explicit) {
    const resolved = path.resolve(explicit);
    if (!fs.existsSync(resolved)) throw new Error(`${CONTRACT}_PRODUCTION_CERTIFICATION_FILE_NOT_FOUND`);
    return resolved;
  }

  const matches = [];
  for (const dir of [...new Set([os.tmpdir(), "/tmp"])]) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      const candidate = path.join(dir, name);
      try {
        const stat = fs.statSync(candidate);
        if (!stat.isFile()) continue;
        const value = JSON.parse(fs.readFileSync(candidate, "utf8"));
        if (
          value?.success === true &&
          text(value?.contract) === CERTIFICATION_CONTRACT &&
          value?.production_certified === true
        ) matches.push({ path: candidate, mtime: stat.mtimeMs });
      } catch {}
    }
  }
  matches.sort((a, b) => b.mtime - a.mtime);
  if (!matches.length) throw new Error(`${CONTRACT}_PRODUCTION_CERTIFICATION_NOT_FOUND`);
  return matches[0].path;
}

function validateCertification(certificationPath) {
  const bytes = fs.readFileSync(certificationPath);
  const value = JSON.parse(bytes.toString("utf8"));
  const failures = [];
  const check = (name, condition) => { if (!condition) failures.push(name); };
  check("success", value?.success === true);
  check("contract", text(value?.contract) === CERTIFICATION_CONTRACT);
  check("capability", text(value?.capability) === CAPABILITY);
  check("provider", text(value?.provider) === PROVIDER);
  check("model", text(value?.model) === MODEL);
  check("quality_profile", text(value?.quality_profile) === QUALITY_PROFILE);
  check("engine_contract", text(value?.engine_contract) === ENGINE_CONTRACT);
  check("technical_contract", text(value?.technical_contract) === TECHNICAL_CONTRACT);
  check("human_review_contract", text(value?.human_review_contract) === HUMAN_REVIEW_CONTRACT);
  check("production_certified", value?.production_certified === true);
  check("human_review_pass", value?.evidence?.human_review_decision === "PASS");
  check("human_checks", value?.evidence?.all_listening_checks_passed === true);
  check("single_controlled_job", Number(value?.evidence?.controlled_job_count) === 1);
  check("safe_lease_contract", text(value?.evidence?.safe_lease_contract) === SAFE_LEASE_CONTRACT);
  check("safe_lease_lane", text(value?.evidence?.safe_lease_lane) === LANE);
  check("gate_controlled_render", value?.certification_gates?.controlled_runtime_render === true);
  check("gate_pitch", value?.certification_gates?.pitch_preservation === true);
  check("gate_transients", value?.certification_gates?.transient_boundary_protection === true);
  check("gate_human", value?.certification_gates?.human_listening_review === true);
  check("gate_parked", value?.certification_gates?.provider_parked_after_certification === true);
  if (failures.length) throw new Error(`${CONTRACT}_PRODUCTION_CERTIFICATION_INVALID:${failures.join(",")}`);
  return { value, sha256: sha256(bytes) };
}

function wavPcm16Stereo(seconds = FIXTURE_SECONDS, sampleRate = SAMPLE_RATE) {
  const frames = Math.round(seconds * sampleRate);
  const dataBytes = frames * CHANNELS * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * CHANNELS * 2, 28);
  buffer.writeUInt16LE(CHANNELS * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);

  const chords = [
    [261.6256, 329.6276, 391.9954],
    [220.0000, 261.6256, 329.6276],
    [174.6141, 220.0000, 261.6256],
    [195.9977, 246.9417, 293.6648],
  ];
  const clamp = (value) => Math.max(-0.95, Math.min(0.95, value));
  for (let i = 0; i < frames; i += 1) {
    const t = i / sampleRate;
    const chord = chords[Math.min(chords.length - 1, Math.floor(t / 2))];
    const local = t % 2;
    const chordFade = Math.min(1, local / 0.02, (2 - local) / 0.02);
    const toneL = chord.reduce((sum, f, index) => sum + Math.sin(2 * Math.PI * f * t + index * 0.17) * (0.075 + index * 0.005), 0);
    const toneR = chord.reduce((sum, f, index) => sum + Math.sin(2 * Math.PI * f * t + index * 0.31) * (0.072 + (2 - index) * 0.005), 0);
    const beatPhase = t % 0.5;
    let transient = 0;
    if (beatPhase < 0.10) {
      transient += 0.18 * Math.exp(-beatPhase * 48) * Math.sin(2 * Math.PI * 1500 * beatPhase);
      transient += 0.16 * Math.exp(-beatPhase * 22) * Math.sin(2 * Math.PI * 82 * beatPhase);
    }
    const globalFade = Math.min(1, t / 0.03, (seconds - t) / 0.03);
    const left = clamp((toneL * chordFade + transient) * globalFade * 0.92);
    const right = clamp((toneR * chordFade + transient * 0.94) * globalFade * 0.92);
    buffer.writeInt16LE(Math.round(left * 32767), 44 + i * 4);
    buffer.writeInt16LE(Math.round(right * 32767), 44 + i * 4 + 2);
  }
  return buffer;
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

function validateReport(report) {
  const failures = [];
  const check = (name, ok) => { if (!ok) failures.push(name); };
  check("report_contract", text(report?.contract) === REPORT_CONTRACT);
  check("engine_contract", text(report?.engine_contract) === ENGINE_CONTRACT);
  check("stretch_engine", text(report?.stretch_engine) === STRETCH_ENGINE);
  check("output_format", text(report?.output_format) === "WAV_PCM24");
  check("approved_marker_count", finite(report?.approved_marker_count, -1) === 3);
  check("original_source_preserved", report?.original_source_preserved === true);
  check("automatic_apply_false", report?.automatic_apply_performed === false);
  check("pitch_preserving", report?.render?.pitch_preserving_time_stretch === true);
  check("boundary_contract", text(report?.render?.boundary_smoothing_contract) === BOUNDARY_CONTRACT);
  check("duplicated_transition_false", report?.render?.duplicated_transition_trajectory === false);
  check("duration", Math.abs(finite(report?.render?.duration_seconds, 0) - FIXTURE_SECONDS) <= 0.02);
  check("checksum", /^[a-f0-9]{64}$/i.test(text(report?.output_checksum)));
  if (failures.length) throw new Error(`${CONTRACT}_WORKER_REPORT_INVALID:${failures.join(",")}`);
}

async function runChild() {
  approved(APPROVAL_ENV);
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES") throw new Error(`${CHILD_CONTRACT}_SAFE_LEASE_ACTIVE_REQUIRED`);
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT) throw new Error(`${CHILD_CONTRACT}_SAFE_LEASE_CONTRACT_INVALID`);
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== LANE) throw new Error(`${CHILD_CONTRACT}_SAFE_LEASE_LANE_INVALID`);
  const endpointId = required("AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID");
  const queueKey = text(process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY) || text(process.env.RUNPOD_API_KEY) || required("RUNPOD_MANAGEMENT_API_KEY");
  const payload = JSON.parse(Buffer.from(required("AVANTIQO_MUSIC_ELASTIC_ECONOMICS_PAYLOAD_B64"), "base64").toString("utf8"));
  if (text(payload?.contract) !== CHILD_CONTRACT) throw new Error(`${CHILD_CONTRACT}_PAYLOAD_INVALID`);

  const base = `${QUEUE_BASE}/${encodeURIComponent(endpointId)}`;
  const before = await requestJson(`${base}/health`, queueKey);
  if (
    finite(before?.jobs?.inQueue ?? before?.jobs?.in_queue, 0) !== 0 ||
    finite(before?.jobs?.inProgress ?? before?.jobs?.in_progress, 0) !== 0
  ) throw new Error(`${CHILD_CONTRACT}_ENDPOINT_NOT_IDLE`);

  const startedAt = performance.now();
  const submitted = await requestJson(`${base}/run`, queueKey, {
    method: "POST",
    body: { input: payload.input },
  });
  const jobId = text(submitted?.id || submitted?.job_id || submitted?.jobId);
  if (!jobId) throw new Error(`${CHILD_CONTRACT}_JOB_ID_REQUIRED`);
  console.log(`AVANTIQO_MUSIC_ELASTIC_ECONOMICS_JOB_ID=${jobId}`);
  console.log("AVANTIQO_MUSIC_ELASTIC_ECONOMICS_JOB_COUNT=1");

  const deadline = Date.now() + 8 * 60_000;
  let latest = submitted;
  let lastStatus = "";
  while (Date.now() < deadline) {
    const state = text(latest?.status).toUpperCase();
    if (state && state !== lastStatus) {
      console.log(`AVANTIQO_MUSIC_ELASTIC_ECONOMICS_STATUS=${state}`);
      lastStatus = state;
    }
    if (["COMPLETED", "COMPLETE", "SUCCEEDED", "SUCCESS", "DONE"].includes(state)) break;
    if (["FAILED", "ERROR", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(state)) {
      throw new Error(`${CHILD_CONTRACT}_JOB_FAILED:${state}`);
    }
    await sleep(1000);
    latest = await requestJson(`${base}/status/${encodeURIComponent(jobId)}`, queueKey);
  }

  const finalState = text(latest?.status).toUpperCase();
  if (!["COMPLETED", "COMPLETE", "SUCCEEDED", "SUCCESS", "DONE"].includes(finalState)) {
    throw new Error(`${CHILD_CONTRACT}_JOB_TIMEOUT:${finalState || "UNKNOWN"}`);
  }
  const report = latest?.output && typeof latest.output === "object" ? latest.output : {};
  validateReport(report);

  const runpodExecutionMs = finite(latest?.executionTime ?? latest?.execution_time, null);
  const runpodDelayMs = finite(latest?.delayTime ?? latest?.delay_time, null);
  if (!Number.isFinite(runpodExecutionMs) || runpodExecutionMs <= 0) {
    throw new Error(`${CHILD_CONTRACT}_RUNPOD_EXECUTION_TIME_REQUIRED`);
  }

  const childResult = {
    job_id: jobId,
    job_status: finalState,
    runpod_execution_ms: runpodExecutionMs,
    runpod_delay_ms: runpodDelayMs,
    wall_ms: Math.round(performance.now() - startedAt),
    report,
  };
  console.log(`AVANTIQO_MUSIC_ELASTIC_ECONOMICS_JOB_REPORT_B64=${Buffer.from(JSON.stringify(childResult), "utf8").toString("base64")}`);
  console.log("AVANTIQO_MUSIC_ELASTIC_ECONOMICS_JOB=PASS");
}

if (process.argv.includes("--child-economics")) {
  await runChild();
  process.exit(0);
}

approved(APPROVAL_ENV);
const certificationPath = findLatestCertification();
const certification = validateCertification(certificationPath);
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const queueKey = text(process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY) || text(process.env.RUNPOD_API_KEY) || managementKey;
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");

const imageEvidence = JSON.parse(fs.readFileSync(IMAGE_EVIDENCE_PATH, "utf8"));
if (
  imageEvidence?.success !== true ||
  text(imageEvidence?.contract) !== IMAGE_EVIDENCE_CONTRACT ||
  text(imageEvidence?.model) !== MODEL ||
  text(imageEvidence?.stretch_engine) !== STRETCH_ENGINE ||
  imageEvidence?.runtime_probe_no_inference !== true ||
  !/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(text(imageEvidence?.immutable_image_reference))
) throw new Error(`${CONTRACT}_IMAGE_EVIDENCE_INVALID`);
const immutableImage = text(imageEvidence.immutable_image_reference);

const [endpoints, templates] = await Promise.all([
  requestJson(`${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`, managementKey),
  requestJson(`${REST_BASE}/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false`, managementKey),
]);
if (!Array.isArray(endpoints) || !Array.isArray(templates)) throw new Error(`${CONTRACT}_RUNPOD_LIST_INVALID`);
const matches = endpoints.filter((item) => text(item?.name) === ENDPOINT_NAME);
if (matches.length !== 1) throw new Error(`${CONTRACT}_ENDPOINT_REQUIRED:matches=${matches.length}`);
const endpoint = matches[0];
const endpointId = text(endpoint?.id);
const templateId = text(endpoint?.templateId ?? endpoint?.template_id ?? endpoint?.template?.id);
if (!endpointId || !templateId) throw new Error(`${CONTRACT}_ENDPOINT_BINDING_REQUIRED`);
if (workersMin(endpoint) !== 0 || workersMax(endpoint) !== 0 || activeWorkers(endpoint).length !== 0) {
  throw new Error(`${CONTRACT}_ENDPOINT_MUST_START_PARKED_0_0`);
}
if (endpointVolumeIds(endpoint).length) throw new Error(`${CONTRACT}_NETWORK_VOLUME_FORBIDDEN`);
const template = templates.find((item) => text(item?.id) === templateId);
if (!template || text(template?.imageName ?? template?.image_name) !== immutableImage) {
  throw new Error(`${CONTRACT}_IMMUTABLE_IMAGE_BINDING_MISMATCH`);
}
const health = await requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, queueKey);
if (
  finite(health?.jobs?.inQueue ?? health?.jobs?.in_queue, 0) !== 0 ||
  finite(health?.jobs?.inProgress ?? health?.jobs?.in_progress, 0) !== 0
) throw new Error(`${CONTRACT}_QUEUE_MUST_START_EMPTY`);

console.log("============================================================");
console.log("AVANTIQO MUSIC ELASTIC ECONOMICS BENCHMARK");
console.log("============================================================");
console.log(`AVANTIQO_MUSIC_ELASTIC_ECONOMICS_CONTRACT=${CONTRACT}`);
console.log("AVANTIQO_MUSIC_ELASTIC_ECONOMICS_EXACTLY_ONE_JOB=true");
console.log("AVANTIQO_MUSIC_ELASTIC_ECONOMICS_SYNTHETIC_AUDIO_ONLY=true");
console.log("AVANTIQO_MUSIC_ELASTIC_ECONOMICS_PRICING_ACTIVATION=false");
console.log("AVANTIQO_MUSIC_ELASTIC_ECONOMICS_DATABASE_MUTATION=false");
console.log("AVANTIQO_MUSIC_ELASTIC_ECONOMICS_PRODUCTION_DEPLOY=false");

const runId = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 17);
const prefix = `platform-certification/music-elastic-economics/${runId}`;
const sourceRemotePath = `${prefix}/synthetic-source.wav`;
const outputRemotePath = `${prefix}/elastic-render.wav`;
const sourceAssetId = `music-elastic-economics-${runId}`;
const sourceBytes = wavPcm16Stereo();
const sourceChecksum = sha256(sourceBytes);
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const sourceUpload = await supabase.storage.from(BUCKET).upload(sourceRemotePath, sourceBytes, {
  contentType: "audio/wav",
  cacheControl: "0",
  upsert: true,
});
if (sourceUpload.error) throw new Error(`${CONTRACT}_SOURCE_UPLOAD_FAILED:${sourceUpload.error.message}`);
const sourceSigned = await supabase.storage.from(BUCKET).createSignedUrl(sourceRemotePath, 60 * 60);
if (sourceSigned.error || !sourceSigned.data?.signedUrl) throw new Error(`${CONTRACT}_SOURCE_SIGN_FAILED`);
const outputUpload = await supabase.storage.from(BUCKET).createSignedUploadUrl(outputRemotePath, { upsert: true });
if (outputUpload.error || !outputUpload.data?.signedUrl) throw new Error(`${CONTRACT}_OUTPUT_UPLOAD_TARGET_FAILED`);

const warpPlan = {
  contract: PLAN_CONTRACT,
  source_asset_id: sourceAssetId,
  duration_seconds: FIXTURE_SECONDS,
  automatic_apply_forbidden: true,
  pitch_preserving_render_required: true,
  transient_preservation_required: true,
  render_ready: true,
  all_reviewed: true,
  markers: [
    { id: "warp-1", source_seconds: 2.0, target_seconds: 2.08, proposed_shift_ms: 80, approved: true, musician_override: false },
    { id: "warp-2", source_seconds: 4.0, target_seconds: 3.96, proposed_shift_ms: -40, approved: true, musician_override: false },
    { id: "warp-3", source_seconds: 6.0, target_seconds: 6.04, proposed_shift_ms: 40, approved: true, musician_override: false },
  ],
};
const payload = {
  contract: CHILD_CONTRACT,
  input: {
    contract: ENGINE_CONTRACT,
    source_audio_url: sourceSigned.data.signedUrl,
    output_upload_url: outputUpload.data.signedUrl,
    source_asset_id: sourceAssetId,
    source_offset_seconds: 0,
    duration_seconds: FIXTURE_SECONDS,
    approved_warp_plan: warpPlan,
  },
};
const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");

const captures = [];
let captureAttempts = 0;
let captureErrors = 0;
let lastCaptureError = null;
let childExited = false;
let childStdout = "";
let childStderr = "";

const child = spawn(
  process.execPath,
  [
    "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs",
    `--lane=${LANE}`,
    "--ttl-ms=600000",
    "--",
    process.execPath,
    SELF_PATH,
    "--child-economics",
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED: "YES",
      AVANTIQO_RUNPOD_SAFE_LEASE_TARGET_QUEUE_API_KEY: queueKey,
      AVANTIQO_RUNPOD_SAFE_LEASE_INERT_PEER_ISOLATION_LANE: LANE,
      AVANTIQO_RUNPOD_SAFE_LEASE_TARGET_AND_OPEN_HEALTH_LANE: LANE,
      AVANTIQO_MUSIC_ELASTIC_ECONOMICS_PAYLOAD_B64: payloadB64,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
child.stdout.on("data", (chunk) => {
  const value = chunk.toString("utf8");
  childStdout += value;
  process.stdout.write(value);
});
child.stderr.on("data", (chunk) => {
  const value = chunk.toString("utf8");
  childStderr += value;
  process.stderr.write(value);
});

const poller = (async () => {
  while (!childExited) {
    try {
      const liveHealth = await requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, queueKey);
      const inProgress = finite(liveHealth?.jobs?.inProgress ?? liveHealth?.jobs?.in_progress, 0);
      if (inProgress > 0) {
        captureAttempts += 1;
        const workers = await requestJson(`${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`, managementKey);
        captures.push(...safeWorkers(workers));
      }
    } catch (error) {
      captureErrors += 1;
      lastCaptureError = text(error?.message || error).slice(0, 500) || "UNKNOWN";
    }
    if (!childExited) await sleep(POLL_MS);
  }
})();

const childResult = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code, signal) => resolve({ code, signal }));
});
childExited = true;
await poller;

if (childResult.code !== 0) {
  throw new Error(`${CONTRACT}_SAFE_LEASE_CHILD_FAILED:exit=${childResult.code ?? "UNKNOWN"}:signal=${childResult.signal || "NONE"}:${text(childStderr).slice(-800)}`);
}
if (!childStdout.includes(`${SAFE_LEASE_CONTRACT}=PASS`)) throw new Error(`${CONTRACT}_SAFE_LEASE_PASS_EVIDENCE_REQUIRED`);
const reportMatch = childStdout.match(/AVANTIQO_MUSIC_ELASTIC_ECONOMICS_JOB_REPORT_B64=([A-Za-z0-9+/=]+)/);
if (!reportMatch) throw new Error(`${CONTRACT}_CHILD_REPORT_REQUIRED`);
const job = JSON.parse(Buffer.from(reportMatch[1], "base64").toString("utf8"));
validateReport(job.report);

const workerEvidence = uniqueWorkers(captures);
const activeWorker =
  workerEvidence.find((worker) => worker.status === "RUNNING" && worker.gpu_type_id) ||
  workerEvidence.find((worker) => worker.gpu_type_id) ||
  null;
if (!activeWorker?.gpu_type_id) throw new Error(`${CONTRACT}_ACTIVE_WORKER_GPU_EVIDENCE_REQUIRED`);

const operatorRate = finite(process.env.AVANTIQO_MUSIC_ELASTIC_GPU_USD_PER_HOUR, null);
const mappedRate = RUNPOD_SERVERLESS_USD_PER_HOUR_BY_GPU_TYPE[activeWorker.gpu_type_id];
if (!(operatorRate > 0) && !(mappedRate > 0)) {
  throw new Error(`${CONTRACT}_GPU_RATE_UNMAPPED:${activeWorker.gpu_type_id}`);
}
const gpuUsdPerHour = operatorRate > 0 ? operatorRate : mappedRate;
const rateSource = operatorRate > 0 ? "OPERATOR_SUPPLIED_RUNPOD_GPU_RATE" : "RUNPOD_PUBLIC_SERVERLESS_RATE";
const billedGpuCount = finite(process.env.AVANTIQO_MUSIC_ELASTIC_BILLED_GPU_COUNT, null) || finite(activeWorker.gpu_count, null) || 1;
if (!(billedGpuCount > 0)) throw new Error(`${CONTRACT}_BILLED_GPU_COUNT_INVALID`);
const targetUtilization = finite(process.env.AVANTIQO_MUSIC_ELASTIC_TARGET_UTILIZATION, 1);
if (!(targetUtilization > 0 && targetUtilization <= 1)) throw new Error(`${CONTRACT}_TARGET_UTILIZATION_INVALID`);
const executionMs = finite(job.runpod_execution_ms, null);
if (!(executionMs > 0)) throw new Error(`${CONTRACT}_RUNPOD_EXECUTION_TIME_REQUIRED`);
const executionSeconds = executionMs / 1000;
const rawComputeUsd = executionSeconds * ((gpuUsdPerHour * billedGpuCount) / 3600);
const utilizationAdjustedUsd = rawComputeUsd / targetUtilization;
const supplierUsdPerAudioSecond = utilizationAdjustedUsd / FIXTURE_SECONDS;

const outputDownload = await supabase.storage.from(BUCKET).download(outputRemotePath);
if (outputDownload.error || !outputDownload.data) throw new Error(`${CONTRACT}_OUTPUT_DOWNLOAD_FAILED`);
const outputBytes = Buffer.from(await outputDownload.data.arrayBuffer());
const outputChecksum = sha256(outputBytes);
if (outputChecksum !== text(job?.report?.output_checksum) || outputChecksum === sourceChecksum) {
  throw new Error(`${CONTRACT}_OUTPUT_CHECKSUM_INVALID`);
}
const outputWav = parseWav(outputBytes);
if (
  outputWav.audio_format !== 1 ||
  outputWav.channels !== 2 ||
  outputWav.sample_rate !== 48000 ||
  outputWav.bits_per_sample !== 24 ||
  Math.abs(outputWav.duration_seconds - FIXTURE_SECONDS) > 0.02
) throw new Error(`${CONTRACT}_OUTPUT_PCM24_CONTRACT_MISMATCH`);

const finalEndpoint = await requestJson(`${REST_BASE}/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=true`, managementKey);
const finalHealth = await requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, queueKey);
if (
  workersMin(finalEndpoint) !== 0 ||
  workersMax(finalEndpoint) !== 0 ||
  activeWorkers(finalEndpoint).length !== 0 ||
  finite(finalHealth?.jobs?.inQueue ?? finalHealth?.jobs?.in_queue, 0) !== 0 ||
  finite(finalHealth?.jobs?.inProgress ?? finalHealth?.jobs?.in_progress, 0) !== 0
) throw new Error(`${CONTRACT}_FINAL_PARK_STATE_INVALID`);

const resultPath = path.resolve(
  text(process.env.AVANTIQO_MUSIC_ELASTIC_ECONOMICS_OUTPUT) ||
    path.join(os.tmpdir(), `avantiqo-music-elastic-economics-${Date.now()}.json`),
);
const result = {
  success: true,
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  capability: CAPABILITY,
  provider: PROVIDER,
  model: MODEL,
  quality_profile: QUALITY_PROFILE,
  engine_contract: ENGINE_CONTRACT,
  production_certification: {
    path: certificationPath,
    sha256: certification.sha256,
    contract: CERTIFICATION_CONTRACT,
    verified: true,
    production_certified: true,
    human_quality_certified: true,
    human_review_contract: HUMAN_REVIEW_CONTRACT,
    human_review_decision: certification.value?.evidence?.human_review_decision || null,
    all_listening_checks_passed: certification.value?.evidence?.all_listening_checks_passed === true,
  },
  controlled_benchmark: {
    exactly_one_job: true,
    controlled_job_count: 1,
    runpod_job_id: text(job.job_id),
    runpod_job_status: text(job.job_status),
    safe_lease_contract: SAFE_LEASE_CONTRACT,
    safe_lease_lane: LANE,
    synthetic_source_rights: "AVANTIQO_SYNTHETIC_TEST_AUDIO",
    source_duration_seconds: FIXTURE_SECONDS,
    source_checksum: sourceChecksum,
    output_checksum: outputChecksum,
    output_format: "WAV_PCM24",
    automatic_apply_performed: false,
    production_provider_path_used: false,
  },
  worker_evidence: {
    contract: WORKER_EVIDENCE_CONTRACT,
    captured: true,
    capture_source: "RUNPOD_SERVERLESS_WORKERS_WHILE_JOB_IN_PROGRESS",
    poll_interval_ms: POLL_MS,
    capture_attempts: captureAttempts,
    capture_errors: captureErrors,
    last_capture_error: lastCaptureError,
    active_worker: activeWorker,
    observed_workers: workerEvidence,
  },
  economics: {
    measured: true,
    certification_ready: true,
    economics_certified: false,
    pricing_activation_required_for_certified_state: true,
    runpod_execution_ms: executionMs,
    runpod_delay_ms: finite(job.runpod_delay_ms, null),
    wall_ms: finite(job.wall_ms, null),
    audio_duration_seconds: FIXTURE_SECONDS,
    realtime_factor: round(executionSeconds / FIXTURE_SECONDS, 6),
    gpu_type_id: activeWorker.gpu_type_id,
    data_center_id: activeWorker.data_center_id,
    billed_gpu_count: billedGpuCount,
    gpu_usd_per_hour: gpuUsdPerHour,
    gpu_rate_source: rateSource,
    runpod_public_pricing_verified_at: operatorRate > 0 ? null : RUNPOD_PUBLIC_PRICING_VERIFIED_AT,
    target_utilization: targetUtilization,
    raw_gpu_compute_usd: round(rawComputeUsd, 10),
    utilization_adjusted_compute_usd: round(utilizationAdjustedUsd, 10),
    supplier_compute_usd_per_audio_second: round(supplierUsdPerAudioSecond, 12),
    supplier_compute_usd_per_audio_minute: round(supplierUsdPerAudioSecond * 60, 10),
  },
  pricing_policy_ready: {
    supplier_cost_measured: true,
    platform_default_markup_percent: 30,
    customer_price_policy: "SUPPLIER_COST_PLUS_MARKUP",
    currency_conversion_required_before_pricing_row: true,
    pricing_row_created: false,
    pricing_activation_performed: false,
  },
  final_state: {
    workers_min: 0,
    workers_max: 0,
    active_workers: 0,
    jobs_in_queue: 0,
    jobs_in_progress: 0,
  },
  safe_lease_temporary_capacity_claim_performed: true,
  persistent_endpoint_mutation_performed: false,
  database_mutation_performed: false,
  organization_service_mutation_performed: false,
  provider_routing_mutation_performed: false,
  pricing_mutation_performed: false,
  provider_job_submitted: true,
  provider_job_count: 1,
  production_deploy_performed: false,
  next_action: "BUILD_AND_REVIEW_ELASTIC_PRODUCTION_PRICING_PROMOTION",
};
fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  output_path: resultPath,
  capability: CAPABILITY,
  provider: PROVIDER,
  model: MODEL,
  production_certification_verified: true,
  worker_evidence_captured: true,
  gpu_type_id: activeWorker.gpu_type_id,
  gpu_usd_per_hour: gpuUsdPerHour,
  runpod_execution_ms: executionMs,
  audio_duration_seconds: FIXTURE_SECONDS,
  supplier_compute_usd_per_audio_second: result.economics.supplier_compute_usd_per_audio_second,
  supplier_compute_usd_per_audio_minute: result.economics.supplier_compute_usd_per_audio_minute,
  pricing_activation_performed: false,
  database_mutation_performed: false,
  persistent_endpoint_mutation_performed: false,
  final_workers: "0/0",
  final_jobs: 0,
  production_deploy_performed: false,
  next_action: result.next_action,
}, null, 2));
console.log("AVANTIQO_MUSIC_ELASTIC_ECONOMICS_BENCHMARK=PASS");
console.log("AVANTIQO_MUSIC_ELASTIC_ECONOMICS_MEASURED=true");
console.log("AVANTIQO_MUSIC_ELASTIC_ECONOMICS_CERTIFICATION_READY=true");
console.log("AVANTIQO_MUSIC_ELASTIC_PRICING_ACTIVATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_DATABASE_MUTATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PERSISTENT_ENDPOINT_MUTATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PROVIDER_JOB_COUNT=1");
console.log("AVANTIQO_MUSIC_ELASTIC_FINAL_WORKERS=0/0");
console.log("AVANTIQO_MUSIC_ELASTIC_FINAL_JOBS=0");
console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_DEPLOY_PERFORMED=false");
console.log(`AVANTIQO_MUSIC_ELASTIC_ECONOMICS_OUTPUT=${resultPath}`);
console.log(`AVANTIQO_MUSIC_ELASTIC_NEXT=${result.next_action}`);
