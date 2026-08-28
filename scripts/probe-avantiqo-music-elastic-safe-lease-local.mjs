#!/usr/bin/env node

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_MUSIC_ELASTIC_RUNTIME_PROBE_CLIENT_V1";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_AUDIO_ENGINE_V1";
const PROBE_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_RUNTIME_PROBE_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "music-elastic-audio";
const RUNPOD_BASE = "https://api.runpod.ai/v2";

const text = (value) => String(value ?? "").trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function approved(name) {
  if (text(process.env[name]).toUpperCase() !== "YES") throw new Error(`${name}=YES_REQUIRED`);
}

function assertSafeLease(endpointId) {
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES") {
    throw new Error("AVANTIQO_MUSIC_ELASTIC_SAFE_LEASE_ACTIVE_REQUIRED");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT) {
    throw new Error("AVANTIQO_MUSIC_ELASTIC_SAFE_LEASE_CONTRACT_INVALID");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== SAFE_LEASE_LANE) {
    throw new Error("AVANTIQO_MUSIC_ELASTIC_SAFE_LEASE_LANE_INVALID");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID) !== endpointId) {
    throw new Error("AVANTIQO_MUSIC_ELASTIC_SAFE_LEASE_ENDPOINT_MISMATCH");
  }
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
  try { body = raw ? JSON.parse(raw) : null; } catch { body = { message: raw }; }
  if (!response.ok) throw new Error(`AVANTIQO_MUSIC_ELASTIC_RUNPOD_HTTP_${response.status}`);
  return body || {};
}

function status(value) {
  return text(value).toUpperCase();
}

approved("AVANTIQO_MUSIC_ELASTIC_RUNTIME_PROBE_SPEND_APPROVED");
const endpointId = required("AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID");
assertSafeLease(endpointId);
const apiKey = text(process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY) || required("RUNPOD_API_KEY");
const baseUrl = `${RUNPOD_BASE}/${encodeURIComponent(endpointId)}`;

const before = await requestJson(`${baseUrl}/health`, apiKey);
const beforeQueue = Number(before?.jobs?.inQueue ?? before?.jobs?.in_queue ?? 0);
const beforeProgress = Number(before?.jobs?.inProgress ?? before?.jobs?.in_progress ?? 0);
if (beforeQueue !== 0 || beforeProgress !== 0) throw new Error("AVANTIQO_MUSIC_ELASTIC_RUNTIME_PROBE_ENDPOINT_NOT_IDLE");

const submitted = await requestJson(`${baseUrl}/run`, apiKey, {
  method: "POST",
  timeoutMs: 30_000,
  body: {
    input: {
      contract: ENGINE_CONTRACT,
      mode: "runtime_probe",
    },
  },
});
const jobId = text(submitted.id || submitted.job_id || submitted.jobId);
if (!jobId) throw new Error("AVANTIQO_MUSIC_ELASTIC_RUNTIME_PROBE_JOB_ID_REQUIRED");

const deadline = Date.now() + Math.max(60_000, Number(process.env.AVANTIQO_MUSIC_ELASTIC_RUNTIME_PROBE_TIMEOUT_MS || 8 * 60_000));
let latest = submitted;
while (Date.now() < deadline) {
  const state = status(latest.status);
  if (["COMPLETED", "COMPLETE", "SUCCEEDED", "SUCCESS", "DONE"].includes(state)) break;
  if (["FAILED", "ERROR", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(state)) {
    throw new Error(`AVANTIQO_MUSIC_ELASTIC_RUNTIME_PROBE_JOB_FAILED:${state}`);
  }
  await sleep(3000);
  latest = await requestJson(`${baseUrl}/status/${encodeURIComponent(jobId)}`, apiKey);
}

const finalState = status(latest.status);
if (!["COMPLETED", "COMPLETE", "SUCCEEDED", "SUCCESS", "DONE"].includes(finalState)) {
  throw new Error(`AVANTIQO_MUSIC_ELASTIC_RUNTIME_PROBE_TIMEOUT:${finalState || "UNKNOWN"}`);
}

const output = latest.output && typeof latest.output === "object" ? latest.output : {};
const failures = [];
const requireFlag = (name, ok) => { if (!ok) failures.push(name); };
requireFlag("success", output.success === true);
requireFlag("probe_contract", text(output.contract) === PROBE_CONTRACT);
requireFlag("engine_contract", text(output.engine_contract) === ENGINE_CONTRACT);
requireFlag("stretch_engine", text(output.stretch_engine) === "SIGNALSMITH_STRETCH_PYTHON_STRETCH_0_3_1");
requireFlag("python_stretch_version", text(output.python_stretch_version) === "0.3.1");
requireFlag("signalsmith_initialization", output.signalsmith_initialization === true);
requireFlag("ffmpeg_available", output.ffmpeg_available === true);
requireFlag("boundary_smoothing_contract", text(output.boundary_smoothing_contract) === "SEAM_TAPER_NO_DUPLICATED_TRAJECTORY_V2");
requireFlag("source_download_false", output.source_download_performed === false);
requireFlag("render_false", output.render_performed === false);
requireFlag("upload_false", output.output_upload_performed === false);
requireFlag("automatic_apply_false", output.automatic_apply_performed === false);
requireFlag("provider_job_false", output.provider_job_submitted === false);
requireFlag("production_certified_false", output.production_certified === false);
requireFlag("human_review_true", output.human_listening_review_required === true);
if (failures.length) throw new Error(`AVANTIQO_MUSIC_ELASTIC_RUNTIME_PROBE_OUTPUT_INVALID:${failures.join(",")}`);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  engine_contract: ENGINE_CONTRACT,
  runtime_probe_contract: PROBE_CONTRACT,
  safe_lease_contract: SAFE_LEASE_CONTRACT,
  safe_lease_lane: SAFE_LEASE_LANE,
  endpoint_id: endpointId,
  job_id: jobId,
  job_status: finalState,
  runtime_probe_job_submitted: true,
  runtime_probe_job_count: 1,
  audio_source_download_performed: false,
  audio_render_performed: false,
  output_upload_performed: false,
  automatic_apply_performed: false,
  production_provider_job_submitted: false,
  production_certified: false,
  human_listening_review_required: true,
  python_stretch_version: text(output.python_stretch_version),
  signalsmith_initialization: true,
  ffmpeg_available: true,
  boundary_smoothing_contract: text(output.boundary_smoothing_contract),
  endpoint_scaling_mutation_performed_by_child: false,
  secrets_printed: false,
}, null, 2));
console.log("AVANTIQO_MUSIC_ELASTIC_RUNTIME_PROBE=PASS");
console.log("AVANTIQO_MUSIC_ELASTIC_RUNTIME_PROBE_NO_INFERENCE=true");
console.log("AVANTIQO_MUSIC_ELASTIC_RUNTIME_PROBE_AUDIO_RENDER=false");
console.log("AVANTIQO_MUSIC_ELASTIC_RUNTIME_PROBE_PRODUCTION_CERTIFIED=false");
