#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_MUSIC_ELASTIC_CONTROLLED_RENDER_CERTIFICATION_V1";
const CHILD_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_CONTROLLED_RENDER_JOB_V1";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_AUDIO_ENGINE_V1";
const PLAN_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_WARP_PLAN_V1";
const REPORT_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_AUDIO_RENDER_REPORT_V1";
const STRETCH_ENGINE = "SIGNALSMITH_STRETCH_PYTHON_STRETCH_0_3_1";
const BOUNDARY_CONTRACT = "SEAM_TAPER_NO_DUPLICATED_TRAJECTORY_V2";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const LANE = "music-elastic-audio";
const ENDPOINT_NAME = "avantiqo-music-elastic-audio-v1";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-music-elastic-worker-image.json";
const IMAGE_EVIDENCE_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_WORKER_IMAGE_RESULT_V1";
const CANONICAL_REGISTRY_AUTH_NAME = "avantiqo-ghcr";
const BUCKET = "creative-assets";
const FIXTURE_SECONDS = 8;
const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const LISTEN_TTL_SECONDS = 6 * 60 * 60;
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function approved(name) {
  if (text(process.env[name]).toUpperCase() !== "YES") throw new Error(`${name}=YES_REQUIRED`);
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

function endpointVolumeIds(endpoint = {}) {
  return [...new Set([
    endpoint.networkVolumeId ?? endpoint.network_volume_id,
    ...list(endpoint.networkVolumeIds ?? endpoint.network_volume_ids),
  ].map(text).filter(Boolean))];
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
    throw new Error("AVANTIQO_MUSIC_ELASTIC_OUTPUT_WAV_INVALID");
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
        block_align: bytes.readUInt16LE(body + 12),
        bits_per_sample: bytes.readUInt16LE(body + 14),
      };
    }
    if (id === "data") dataSize = size;
    offset = body + size + (size % 2);
  }
  if (!fmt || dataSize === null || !fmt.byte_rate) throw new Error("AVANTIQO_MUSIC_ELASTIC_OUTPUT_WAV_CHUNKS_INVALID");
  return { ...fmt, data_bytes: dataSize, duration_seconds: dataSize / fmt.byte_rate };
}

async function runChildRender() {
  approved("AVANTIQO_MUSIC_ELASTIC_CONTROLLED_RENDER_APPROVED");
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES") throw new Error(`${CHILD_CONTRACT}_SAFE_LEASE_ACTIVE_REQUIRED`);
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT) throw new Error(`${CHILD_CONTRACT}_SAFE_LEASE_CONTRACT_INVALID`);
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== LANE) throw new Error(`${CHILD_CONTRACT}_SAFE_LEASE_LANE_INVALID`);
  const endpointId = required("AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID");
  const queueKey = text(process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY) || text(process.env.RUNPOD_API_KEY) || required("RUNPOD_MANAGEMENT_API_KEY");
  const payloadRaw = Buffer.from(required("AVANTIQO_MUSIC_ELASTIC_CONTROLLED_RENDER_PAYLOAD_B64"), "base64").toString("utf8");
  const payload = JSON.parse(payloadRaw);
  if (text(payload.contract) !== CHILD_CONTRACT) throw new Error(`${CHILD_CONTRACT}_PAYLOAD_INVALID`);
  const base = `${QUEUE_BASE}/${encodeURIComponent(endpointId)}`;
  const before = await requestJson(`${base}/health`, queueKey);
  const inQueue = finite(before?.jobs?.inQueue ?? before?.jobs?.in_queue, 0);
  const inProgress = finite(before?.jobs?.inProgress ?? before?.jobs?.in_progress, 0);
  if (inQueue !== 0 || inProgress !== 0) throw new Error(`${CHILD_CONTRACT}_ENDPOINT_NOT_IDLE`);

  const submitted = await requestJson(`${base}/run`, queueKey, {
    method: "POST",
    body: { input: payload.input },
    timeoutMs: 30_000,
  });
  const jobId = text(submitted.id || submitted.job_id || submitted.jobId);
  if (!jobId) throw new Error(`${CHILD_CONTRACT}_JOB_ID_REQUIRED`);
  console.log(`AVANTIQO_MUSIC_ELASTIC_CONTROLLED_RENDER_JOB_ID=${jobId}`);
  console.log("AVANTIQO_MUSIC_ELASTIC_CONTROLLED_RENDER_JOB_COUNT=1");

  const deadline = Date.now() + 8 * 60_000;
  let latest = submitted;
  while (Date.now() < deadline) {
    const state = text(latest.status).toUpperCase();
    if (["COMPLETED", "COMPLETE", "SUCCEEDED", "SUCCESS", "DONE"].includes(state)) break;
    if (["FAILED", "ERROR", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(state)) {
      throw new Error(`${CHILD_CONTRACT}_JOB_FAILED:${state}`);
    }
    await sleep(3000);
    latest = await requestJson(`${base}/status/${encodeURIComponent(jobId)}`, queueKey);
  }
  const finalState = text(latest.status).toUpperCase();
  if (!["COMPLETED", "COMPLETE", "SUCCEEDED", "SUCCESS", "DONE"].includes(finalState)) {
    throw new Error(`${CHILD_CONTRACT}_JOB_TIMEOUT:${finalState || "UNKNOWN"}`);
  }
  const report = latest.output && typeof latest.output === "object" ? latest.output : {};
  const failures = [];
  const check = (name, ok) => { if (!ok) failures.push(name); };
  check("report_contract", text(report.contract) === REPORT_CONTRACT);
  check("engine_contract", text(report.engine_contract) === ENGINE_CONTRACT);
  check("stretch_engine", text(report.stretch_engine) === STRETCH_ENGINE);
  check("output_format", text(report.output_format) === "WAV_PCM24");
  check("approved_marker_count", finite(report.approved_marker_count, -1) === 3);
  check("original_source_preserved", report.original_source_preserved === true);
  check("automatic_apply_false", report.automatic_apply_performed === false);
  check("production_certified_false", report.production_certified === false);
  check("human_review_true", report.human_listening_review_required === true);
  check("pitch_preserving", report?.render?.pitch_preserving_time_stretch === true);
  check("boundary_contract", text(report?.render?.boundary_smoothing_contract) === BOUNDARY_CONTRACT);
  check("duplicated_transition_false", report?.render?.duplicated_transition_trajectory === false);
  check("duration", Math.abs(finite(report?.render?.duration_seconds, 0) - FIXTURE_SECONDS) <= 0.02);
  check("segments", finite(report?.render?.segment_count, -1) === 4);
  check("boundaries", finite(report?.render?.boundary_count, -1) === 3);
  check("checksum", /^[a-f0-9]{64}$/i.test(text(report.output_checksum)));
  if (failures.length) throw new Error(`${CHILD_CONTRACT}_REPORT_INVALID:${failures.join(",")}`);

  console.log(`AVANTIQO_MUSIC_ELASTIC_CONTROLLED_RENDER_REPORT_B64=${Buffer.from(JSON.stringify({ job_id: jobId, job_status: finalState, report }), "utf8").toString("base64")}`);
  console.log("AVANTIQO_MUSIC_ELASTIC_CONTROLLED_RENDER_JOB=PASS");
  console.log("AVANTIQO_MUSIC_ELASTIC_AUTOMATIC_APPLY_PERFORMED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_CERTIFIED=false");
}

if (process.argv.includes("--child-render")) {
  await runChildRender();
  process.exit(0);
}

approved("AVANTIQO_MUSIC_ELASTIC_CONTROLLED_RENDER_APPROVED");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const queueKey = text(process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY) || text(process.env.RUNPOD_API_KEY) || managementKey;
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const evidence = JSON.parse(fs.readFileSync(IMAGE_EVIDENCE_PATH, "utf8"));
if (
  evidence?.success !== true ||
  text(evidence.contract) !== IMAGE_EVIDENCE_CONTRACT ||
  evidence.runtime_probe_no_inference !== true ||
  evidence.production_certified !== false ||
  evidence.human_listening_review_required !== true ||
  !/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(text(evidence.immutable_image_reference))
) throw new Error(`${CONTRACT}_IMAGE_EVIDENCE_INVALID`);
const immutableImage = text(evidence.immutable_image_reference);

console.log("============================================================");
console.log("AVANTIQO MUSIC ELASTIC CONTROLLED RENDER CERTIFICATION");
console.log("============================================================");
console.log(`AVANTIQO_MUSIC_ELASTIC_CONTROLLED_RENDER_CONTRACT=${CONTRACT}`);
console.log("AVANTIQO_MUSIC_ELASTIC_FIXTURE_RIGHTS=AVANTIQO_SYNTHETIC_TEST_AUDIO");
console.log("AVANTIQO_MUSIC_ELASTIC_REAL_CUSTOMER_AUDIO_USED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_PROVIDER_PATH_USED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_AUTOMATIC_APPLY_ALLOWED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_CERTIFICATION_ALLOWED=false");

const [endpoints, templates, registryAuths] = await Promise.all([
  requestJson(`${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`, managementKey),
  requestJson(`${REST_BASE}/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false`, managementKey),
  requestJson(`${REST_BASE}/containerregistryauth`, managementKey),
]);
if (!Array.isArray(endpoints) || !Array.isArray(templates) || !Array.isArray(registryAuths)) throw new Error(`${CONTRACT}_RUNPOD_LIST_INVALID`);
const endpointMatches = endpoints.filter((item) => text(item?.name) === ENDPOINT_NAME);
if (endpointMatches.length !== 1) throw new Error(`${CONTRACT}_ENDPOINT_REQUIRED:matches=${endpointMatches.length}`);
const endpoint = endpointMatches[0];
const endpointId = text(endpoint.id);
const templateId = text(endpoint.templateId ?? endpoint.template_id ?? endpoint.template?.id);
if (!endpointId || !templateId) throw new Error(`${CONTRACT}_ENDPOINT_BINDING_ID_REQUIRED`);
if (workersMin(endpoint) !== 0 || workersMax(endpoint) !== 0 || activeWorkers(endpoint).length !== 0) throw new Error(`${CONTRACT}_ENDPOINT_MUST_START_PARKED_0_0`);
if (endpointVolumeIds(endpoint).length) throw new Error(`${CONTRACT}_NETWORK_VOLUME_FORBIDDEN`);
const authoritativeTemplateMatches = templates.filter((item) => text(item?.id) === templateId);
if (authoritativeTemplateMatches.length !== 1) throw new Error(`${CONTRACT}_AUTHORITATIVE_TEMPLATE_REQUIRED:matches=${authoritativeTemplateMatches.length}`);
const template = authoritativeTemplateMatches[0];
if (text(template.imageName ?? template.image_name) !== immutableImage) throw new Error(`${CONTRACT}_IMMUTABLE_IMAGE_DIGEST_MISMATCH`);
if (finite(template.volumeInGb ?? template.volume_in_gb, 0) !== 0) throw new Error(`${CONTRACT}_LOCAL_VOLUME_FORBIDDEN`);
const canonicalAuths = registryAuths.filter((item) => text(item?.name) === CANONICAL_REGISTRY_AUTH_NAME);
if (canonicalAuths.length !== 1) throw new Error(`${CONTRACT}_CANONICAL_GHCR_AUTH_REQUIRED:matches=${canonicalAuths.length}`);
const templateAuthId = text(template.containerRegistryAuthId ?? template.container_registry_auth_id);
if (!templateAuthId || templateAuthId !== text(canonicalAuths[0].id)) throw new Error(`${CONTRACT}_CANONICAL_GHCR_BINDING_MISMATCH`);
const health = await requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, queueKey);
if (finite(health?.jobs?.inQueue ?? health?.jobs?.in_queue, 0) !== 0 || finite(health?.jobs?.inProgress ?? health?.jobs?.in_progress, 0) !== 0) {
  throw new Error(`${CONTRACT}_QUEUE_MUST_START_EMPTY`);
}
console.log("AVANTIQO_MUSIC_ELASTIC_AUTHORITATIVE_BINDING=PASS");
console.log("AVANTIQO_MUSIC_ELASTIC_EXACT_IMAGE_DIGEST_VERIFIED=true");
console.log("AVANTIQO_MUSIC_ELASTIC_CANONICAL_GHCR_AUTH_VERIFIED=true");
console.log("AVANTIQO_MUSIC_ELASTIC_WORKERS_BEFORE_RENDER=0/0");
console.log("AVANTIQO_MUSIC_ELASTIC_QUEUE_BEFORE_RENDER=0/0");

const runId = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 17);
const prefix = `platform-certification/music-elastic/${runId}`;
const sourceRemotePath = `${prefix}/synthetic-source.wav`;
const outputRemotePath = `${prefix}/elastic-render.wav`;
const sourceAssetId = `music-elastic-synthetic-${runId}`;
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
const sourceSigned = await supabase.storage.from(BUCKET).createSignedUrl(sourceRemotePath, LISTEN_TTL_SECONDS);
if (sourceSigned.error || !sourceSigned.data?.signedUrl) throw new Error(`${CONTRACT}_SOURCE_SIGN_FAILED:${sourceSigned.error?.message || "NO_URL"}`);
const outputUpload = await supabase.storage.from(BUCKET).createSignedUploadUrl(outputRemotePath, { upsert: true });
if (outputUpload.error || !outputUpload.data?.signedUrl) throw new Error(`${CONTRACT}_OUTPUT_UPLOAD_TARGET_FAILED:${outputUpload.error?.message || "NO_URL"}`);

const plan = {
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
const renderPayload = {
  contract: CHILD_CONTRACT,
  input: {
    contract: ENGINE_CONTRACT,
    source_audio_url: sourceSigned.data.signedUrl,
    output_upload_url: outputUpload.data.signedUrl,
    source_asset_id: sourceAssetId,
    source_offset_seconds: 0,
    duration_seconds: FIXTURE_SECONDS,
    approved_warp_plan: plan,
  },
};
const payloadB64 = Buffer.from(JSON.stringify(renderPayload), "utf8").toString("base64");

console.log("AVANTIQO_MUSIC_ELASTIC_SYNTHETIC_FIXTURE_CREATED=true");
console.log(`AVANTIQO_MUSIC_ELASTIC_SOURCE_CHECKSUM=${sourceChecksum}`);
console.log("AVANTIQO_MUSIC_ELASTIC_APPROVED_MARKER_COUNT=3");

const lease = spawnSync(
  process.execPath,
  [
    "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs",
    `--lane=${LANE}`,
    "--ttl-ms=600000",
    "--",
    process.execPath,
    "scripts/run-avantiqo-music-elastic-controlled-render-certification-local.mjs",
    "--child-render",
  ],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: {
      ...process.env,
      AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED: "YES",
      AVANTIQO_RUNPOD_SAFE_LEASE_TARGET_QUEUE_API_KEY: queueKey,
      AVANTIQO_RUNPOD_SAFE_LEASE_INERT_PEER_ISOLATION_LANE: LANE,
      AVANTIQO_RUNPOD_SAFE_LEASE_TARGET_AND_OPEN_HEALTH_LANE: LANE,
      AVANTIQO_MUSIC_ELASTIC_CONTROLLED_RENDER_APPROVED: "YES",
      AVANTIQO_MUSIC_ELASTIC_CONTROLLED_RENDER_PAYLOAD_B64: payloadB64,
    },
  },
);
if (lease.stdout) process.stdout.write(lease.stdout);
if (lease.stderr) process.stderr.write(lease.stderr);
if (lease.status !== 0) throw new Error(`${CONTRACT}_SAFE_LEASE_RENDER_FAILED:${lease.status ?? "UNKNOWN"}`);
if (!String(lease.stdout || "").includes(`${SAFE_LEASE_CONTRACT}=PASS`)) throw new Error(`${CONTRACT}_SAFE_LEASE_PASS_EVIDENCE_REQUIRED`);
const reportMatch = String(lease.stdout || "").match(/AVANTIQO_MUSIC_ELASTIC_CONTROLLED_RENDER_REPORT_B64=([A-Za-z0-9+/=]+)/);
if (!reportMatch) throw new Error(`${CONTRACT}_CHILD_REPORT_REQUIRED`);
const childResult = JSON.parse(Buffer.from(reportMatch[1], "base64").toString("utf8"));
const report = childResult.report || {};

const outputDownload = await supabase.storage.from(BUCKET).download(outputRemotePath);
if (outputDownload.error || !outputDownload.data) throw new Error(`${CONTRACT}_OUTPUT_DOWNLOAD_FAILED:${outputDownload.error?.message || "NO_DATA"}`);
const outputBytes = Buffer.from(await outputDownload.data.arrayBuffer());
const outputChecksum = sha256(outputBytes);
if (outputChecksum !== text(report.output_checksum)) throw new Error(`${CONTRACT}_OUTPUT_CHECKSUM_MISMATCH`);
if (outputChecksum === sourceChecksum) throw new Error(`${CONTRACT}_OUTPUT_IDENTICAL_TO_SOURCE`);
const outputWav = parseWav(outputBytes);
if (outputWav.audio_format !== 1 || outputWav.channels !== 2 || outputWav.sample_rate !== 48000 || outputWav.bits_per_sample !== 24) {
  throw new Error(`${CONTRACT}_OUTPUT_PCM24_CONTRACT_MISMATCH`);
}
if (Math.abs(outputWav.duration_seconds - FIXTURE_SECONDS) > 0.02) throw new Error(`${CONTRACT}_OUTPUT_DURATION_MISMATCH`);
const outputSigned = await supabase.storage.from(BUCKET).createSignedUrl(outputRemotePath, LISTEN_TTL_SECONDS);
if (outputSigned.error || !outputSigned.data?.signedUrl) throw new Error(`${CONTRACT}_OUTPUT_SIGN_FAILED:${outputSigned.error?.message || "NO_URL"}`);

const finalEndpoint = await requestJson(`${REST_BASE}/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=true`, managementKey);
const finalHealth = await requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, queueKey);
if (
  workersMin(finalEndpoint) !== 0 ||
  workersMax(finalEndpoint) !== 0 ||
  activeWorkers(finalEndpoint).length !== 0 ||
  finite(finalHealth?.jobs?.inQueue ?? finalHealth?.jobs?.in_queue, 0) !== 0 ||
  finite(finalHealth?.jobs?.inProgress ?? finalHealth?.jobs?.in_progress, 0) !== 0
) throw new Error(`${CONTRACT}_FINAL_REST_STATE_INVALID`);

const resultPath = path.join(os.tmpdir(), `avantiqo-music-elastic-controlled-render-${runId}.json`);
const result = {
  success: true,
  contract: CONTRACT,
  technical_render_certification_passed: true,
  endpoint_name: ENDPOINT_NAME,
  endpoint_id: endpointId,
  immutable_image: immutableImage,
  canonical_registry_auth_name: CANONICAL_REGISTRY_AUTH_NAME,
  safe_lease_contract: SAFE_LEASE_CONTRACT,
  safe_lease_lane: LANE,
  controlled_job_count: 1,
  source_fixture: {
    rights: "AVANTIQO_SYNTHETIC_TEST_AUDIO",
    duration_seconds: FIXTURE_SECONDS,
    sample_rate: SAMPLE_RATE,
    channels: CHANNELS,
    checksum: sourceChecksum,
    storage_reference: `storage://${BUCKET}/${sourceRemotePath}`,
    listen_url: sourceSigned.data.signedUrl,
  },
  output: {
    checksum: outputChecksum,
    format: "WAV_PCM24",
    sample_rate: outputWav.sample_rate,
    channels: outputWav.channels,
    bits_per_sample: outputWav.bits_per_sample,
    duration_seconds: Number(outputWav.duration_seconds.toFixed(6)),
    storage_reference: `storage://${BUCKET}/${outputRemotePath}`,
    listen_url: outputSigned.data.signedUrl,
  },
  warp_plan: plan,
  worker_report: report,
  automatic_apply_performed: false,
  original_source_preserved: true,
  production_provider_path_used: false,
  production_certified: false,
  human_listening_review_required: true,
  human_listening_review: null,
  human_review_checks: [
    "Pitch/chord tone remains stable without obvious pitch wobble.",
    "Percussive transients remain crisp around the warped boundaries.",
    "No double-hit, repeated seam, click, gap, or obvious boundary artifact is audible.",
    "Warped timing is audible but musical and the overall duration remains unchanged.",
  ],
  final_workers_min: 0,
  final_workers_max: 0,
  final_jobs: 0,
  generated_at: new Date().toISOString(),
};
fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

console.log("AVANTIQO_MUSIC_ELASTIC_CONTROLLED_RENDER_TECHNICAL_CERTIFICATION=PASS");
console.log(`AVANTIQO_MUSIC_ELASTIC_RENDER_RESULT_PATH=${resultPath}`);
console.log(`AVANTIQO_MUSIC_ELASTIC_SOURCE_LISTEN_URL=${sourceSigned.data.signedUrl}`);
console.log(`AVANTIQO_MUSIC_ELASTIC_RENDER_LISTEN_URL=${outputSigned.data.signedUrl}`);
console.log("AVANTIQO_MUSIC_ELASTIC_HUMAN_LISTENING_REVIEW_REQUIRED=true");
console.log("AVANTIQO_MUSIC_ELASTIC_HUMAN_LISTENING_REVIEW_RECORDED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_CERTIFIED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_FINAL_WORKERS=0/0");
console.log("AVANTIQO_MUSIC_ELASTIC_FINAL_QUEUE=0/0");
console.log("AVANTIQO_MUSIC_ELASTIC_NEXT=HUMAN_LISTEN_SOURCE_AND_RENDER_THEN_RECORD_PASS_OR_FAIL");
