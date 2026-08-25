import { access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_VOICE_TTS_FRESH_RECOVERY_FINISH_V2";
const RECOVERY_ENDPOINT_NAME = "avantiqo-voice-tts-v1-recovery-20260825";
const CERTIFIED_IMAGE = "ghcr.io/churchillkaron/avantiqo-voice-tts-worker@sha256:c9ce291cc27bb7de119cf1120a92dd6466962b6d79fd5728a1266a743bad1a06";
const FOUNDATION = "resemble-ai/chatterbox:multilingual-v3";
const AUDIO_PATH = process.env.AVANTIQO_VOICE_TTS_FRESH_RECOVERY_AUDIO || path.join(os.homedir(), "Downloads", "avantiqo-voice-tts-blackwell.wav");
const REPORT_PATH = process.env.AVANTIQO_VOICE_TTS_FRESH_RECOVERY_REPORT || "/tmp/avantiqo-voice-tts-fresh-recovery-smoke.json";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function normalizeList(value, candidateKeys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...candidateKeys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalized = normalizeList(value[key], candidateKeys, depth + 1);
    if (normalized) return normalized;
  }
  return null;
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 800);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function rest(pathname, key, options = {}) {
  return readJson(await fetch(`${REST}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_FRESH_RECOVERY_FINISH_REST");
}

async function listEndpoints(key) {
  const body = await rest("/endpoints?includeTemplate=true&includeWorkers=true", key);
  return normalizeList(body, ["endpoints", "serverlessEndpoints"]) || [];
}

async function listTemplates(key) {
  const body = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    key,
  );
  return normalizeList(body, ["templates"]) || [];
}

async function resolveRecoveryEndpoint(key) {
  const endpoints = await listEndpoints(key);
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === RECOVERY_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_VOICE_TTS_FRESH_RECOVERY_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return matches[0];
}

async function resolveBoundTemplate(endpoint, key) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  if (!templateId) {
    throw new Error("AVANTIQO_VOICE_TTS_FRESH_RECOVERY_TEMPLATE_ID_REQUIRED");
  }
  const templates = await listTemplates(key);
  const matches = templates.filter((template) => text(template?.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_VOICE_TTS_FRESH_RECOVERY_TEMPLATE_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return matches[0];
}

async function forceWorkersMinZero(endpointId, key) {
  let endpoint = await resolveRecoveryEndpoint(key);
  if (text(endpoint?.id) !== endpointId) {
    throw new Error("AVANTIQO_VOICE_TTS_FRESH_RECOVERY_ENDPOINT_ID_CHANGED");
  }
  if (Number(endpoint?.workersMin) !== 0) {
    await rest(`/endpoints/${encodeURIComponent(endpointId)}`, key, {
      method: "PATCH",
      body: { workersMin: 0 },
    });
  }
  endpoint = await resolveRecoveryEndpoint(key);
  if (Number(endpoint?.workersMin) !== 0) {
    throw new Error("AVANTIQO_VOICE_TTS_FRESH_RECOVERY_WORKERS_MIN_ZERO_VERIFY_FAILED");
  }
  return endpoint;
}

const approved = text(process.env.AVANTIQO_VOICE_TTS_FRESH_RECOVERY_FINISH_APPROVED).toUpperCase() === "YES";
if (!approved) {
  throw new Error("AVANTIQO_VOICE_TTS_FRESH_RECOVERY_FINISH_APPROVED=YES_REQUIRED");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
let endpoint = await resolveRecoveryEndpoint(managementKey);
const endpointId = text(endpoint?.id);
if (!endpointId) throw new Error("AVANTIQO_VOICE_TTS_FRESH_RECOVERY_ENDPOINT_ID_REQUIRED");

const boundTemplate = await resolveBoundTemplate(endpoint, managementKey);
if (text(boundTemplate?.imageName || boundTemplate?.image) !== CERTIFIED_IMAGE) {
  throw new Error("AVANTIQO_VOICE_TTS_FRESH_RECOVERY_CERTIFIED_IMAGE_MISMATCH");
}
if (text(endpoint?.minCudaVersion) !== "12.8") {
  throw new Error("AVANTIQO_VOICE_TTS_FRESH_RECOVERY_CUDA_12_8_REQUIRED");
}
if (Number(endpoint?.workersMax) !== 1 || Number(endpoint?.gpuCount) !== 1) {
  throw new Error("AVANTIQO_VOICE_TTS_FRESH_RECOVERY_ENDPOINT_SHAPE_MISMATCH");
}

endpoint = await forceWorkersMinZero(endpointId, managementKey);
console.log(JSON.stringify({
  event: "AVANTIQO_VOICE_TTS_FRESH_RECOVERY_COST_GUARD_VERIFIED",
  endpoint_id: endpointId,
  template_id: text(boundTemplate?.id),
  certified_image_verified: true,
  cuda_runtime: text(endpoint?.minCudaVersion),
  workers_min: 0,
  workers_max: Number(endpoint?.workersMax),
  always_on_billing_enabled: false,
  generation_submitted: false,
  secrets_printed: false,
}, null, 2));

if (!text(process.env.RUNPOD_API_KEY)) {
  process.env.RUNPOD_API_KEY = managementKey;
  console.log(JSON.stringify({
    event: "AVANTIQO_VOICE_TTS_FRESH_RECOVERY_INFERENCE_CREDENTIAL_ALIAS",
    source: "RUNPOD_MANAGEMENT_API_KEY",
    target: "RUNPOD_API_KEY_PROCESS_ONLY",
    persisted: false,
    secret_values_printed: false,
  }));
}

process.env.RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID = endpointId;
process.env.AVANTIQO_VOICE_TTS_FOUNDATION_MODEL = FOUNDATION;
process.env.AVANTIQO_VOICE_TTS_COLD_START_AUDIO_OUTPUT = AUDIO_PATH;
process.env.AVANTIQO_VOICE_TTS_COLD_START_REPORT_OUTPUT = REPORT_PATH;
process.env.AVANTIQO_VOICE_TTS_COLD_START_TIMEOUT_MS = String(20 * 60_000);

let importError = null;
try {
  await import("./smoke-avantiqo-voice-tts-cold-start-local.mjs");
} catch (error) {
  importError = error;
} finally {
  await forceWorkersMinZero(endpointId, managementKey).catch((error) => {
    console.error(JSON.stringify({
      event: "AVANTIQO_VOICE_TTS_FRESH_RECOVERY_COST_GUARD_RESTORE_FAILED",
      endpoint_id: endpointId,
      error: text(error?.message || error),
      secrets_printed: false,
    }));
    process.exitCode = 1;
  });
}

let smoke = null;
try {
  smoke = JSON.parse(await readFile(REPORT_PATH, "utf8"));
} catch {
  smoke = null;
}

const finalEndpoint = await resolveRecoveryEndpoint(managementKey);
if (Number(finalEndpoint?.workersMin) !== 0) {
  throw new Error("AVANTIQO_VOICE_TTS_FRESH_RECOVERY_FINAL_WORKERS_MIN_NOT_ZERO");
}

console.log(JSON.stringify({
  event: "AVANTIQO_VOICE_TTS_FRESH_RECOVERY_FINAL_COST_GUARD",
  endpoint_id: endpointId,
  workers_min: 0,
  always_on_billing_enabled: false,
  generation_submitted: smoke?.generation_submitted === true,
  generation_submission_outcome: text(smoke?.generation_submission_outcome) || null,
  job_id: text(smoke?.job_id) || null,
  smoke_success: smoke?.success === true,
  secrets_printed: false,
}, null, 2));

if (importError) throw importError;
if (smoke?.success !== true) {
  throw new Error(`AVANTIQO_VOICE_TTS_FRESH_RECOVERY_FINISH_FAILED:${text(smoke?.error_code) || "UNKNOWN"}`);
}

await access(AUDIO_PATH);
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  endpoint_id: endpointId,
  job_id: text(smoke?.job_id) || null,
  workers_min: 0,
  always_on_billing_enabled: false,
  audio_path: AUDIO_PATH,
  audio_bytes: Number(smoke?.tts?.audio_bytes) || null,
  wav_header: text(smoke?.tts?.wav_header) || null,
  foundation_model: FOUNDATION,
  certified_image: CERTIFIED_IMAGE,
  stt_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`AVANTIQO_VOICE_TTS_FRESH_RECOVERY_AUDIO=${AUDIO_PATH}`);

if (process.platform === "darwin") {
  const playback = spawnSync("afplay", [AUDIO_PATH], { stdio: "inherit" });
  console.log(`AVANTIQO_VOICE_TTS_FRESH_RECOVERY_AFPLAY_STATUS=${playback.status ?? "UNKNOWN"}`);
}
