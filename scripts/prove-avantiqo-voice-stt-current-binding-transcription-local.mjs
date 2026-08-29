import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VOICE_STT_CURRENT_BINDING_TRANSCRIPTION_PROOF_V1";
const ENDPOINT_NAME = "avantiqo-voice-stt-v1";
const EVIDENCE_PATH = resolve("audits/results/avantiqo-voice-stt-worker-image.json");
const PROOF_SCRIPT = resolve("scripts/run-avantiqo-voice-stt-existing-audio-proof-local.mjs");
const AUDIO_AIFF = "/tmp/avantiqo-voice-stt-current-binding-proof.aiff";
const AUDIO_WAV = "/tmp/avantiqo-voice-stt-current-binding-proof.wav";
const REST = "https://rest.runpod.io/v1";
const CONTROL = "https://api.runpod.io/v2";
const QUEUE = "https://api.runpod.ai/v2";
const IDLE_TIMEOUT = 5;
const POLL_MS = 3000;
const CLEANUP_TIMEOUT_MS = 180_000;

const text = (value) => String(value ?? "").trim();
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, 700);
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
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok) throw new Error(`${CONTRACT}_HTTP_${response.status}:${redact(body?.message || body?.error || raw)}`);
  return body;
}
function normalizeList(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const found = normalizeList(value[key], keys, depth + 1);
    if (found) return found;
  }
  return null;
}
async function inventory(managementKey) {
  const [endpointBody, templateBody] = await Promise.all([
    requestJson(`${REST}/endpoints?includeTemplate=true&includeWorkers=true`, managementKey),
    requestJson(`${REST}/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false`, managementKey),
  ]);
  const endpoints = normalizeList(endpointBody, ["endpoints", "serverlessEndpoints"]) || [];
  const templates = normalizeList(templateBody, ["templates"]) || [];
  const matches = endpoints.filter((row) => text(row?.name) === ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  const endpoint = matches[0];
  const endpointId = text(endpoint?.id);
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  const template = templates.find((row) => text(row?.id) === templateId);
  if (!endpointId || !templateId || !template) throw new Error(`${CONTRACT}_ENDPOINT_TEMPLATE_BINDING_REQUIRED`);
  return { endpoint, endpointId, template };
}
async function health(endpointId, queueKey) {
  return requestJson(`${QUEUE}/${encodeURIComponent(endpointId)}/health`, queueKey);
}
function jobs(body = {}) {
  const value = body?.jobs || {};
  return {
    queued: Math.max(0, finite(value.inQueue ?? value.in_queue, 0)),
    progress: Math.max(0, finite(value.inProgress ?? value.in_progress, 0)),
  };
}
async function patchScaling(endpointId, max, managementKey) {
  await requestJson(`${CONTROL}/serverless/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workers: { min: 0, max, idleTimeout: IDLE_TIMEOUT } },
  });
  const endpoint = await requestJson(`${CONTROL}/serverless/${encodeURIComponent(endpointId)}`, managementKey);
  const workers = endpoint?.workers || {};
  if (finite(workers.min, -1) !== 0 || finite(workers.max, -1) !== max || finite(workers.idleTimeout, -1) !== IDLE_TIMEOUT) {
    throw new Error(`${CONTRACT}_SCALING_VERIFY_FAILED:${workers.min}/${workers.max}/${workers.idleTimeout}`);
  }
}
async function workerCount(endpointId, managementKey) {
  const body = await requestJson(`${CONTROL}/serverless/${encodeURIComponent(endpointId)}/workers`, managementKey);
  if (Array.isArray(body)) return body.length;
  if (Array.isArray(body?.workers)) return body.workers.length;
  if (Array.isArray(body?.data?.workers)) return body.data.workers.length;
  return 0;
}
async function cleanup(endpointId, managementKey, queueKey) {
  try { await requestJson(`${QUEUE}/${encodeURIComponent(endpointId)}/purge-queue`, queueKey, { method: "POST" }); } catch {}
  await patchScaling(endpointId, 0, managementKey);
  const deadline = Date.now() + CLEANUP_TIMEOUT_MS;
  let latest = null;
  while (Date.now() < deadline) {
    const endpoint = await requestJson(`${CONTROL}/serverless/${encodeURIComponent(endpointId)}`, managementKey);
    const workers = endpoint?.workers || {};
    const active = await workerCount(endpointId, managementKey);
    const state = jobs(await health(endpointId, queueKey));
    latest = {
      min: finite(workers.min, -1),
      max: finite(workers.max, -1),
      idle_timeout: finite(workers.idleTimeout, -1),
      active_workers: active,
      jobs_in_queue: state.queued,
      jobs_in_progress: state.progress,
    };
    if (latest.min === 0 && latest.max === 0 && latest.idle_timeout === IDLE_TIMEOUT && active === 0 && state.queued === 0 && state.progress === 0) return latest;
    await sleep(POLL_MS);
  }
  throw new Error(`${CONTRACT}_CLEANUP_TIMEOUT:${JSON.stringify(latest)}`);
}
function createFixture() {
  const say = spawnSync("say", ["-o", AUDIO_AIFF, "Avantiqo voice is working and ready"], { stdio: "inherit", encoding: "utf8" });
  if (say.error || say.status !== 0 || !existsSync(AUDIO_AIFF)) {
    throw new Error(`${CONTRACT}_MACOS_SAY_FIXTURE_FAILED`);
  }
  const convert = spawnSync("afconvert", ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1", AUDIO_AIFF, AUDIO_WAV], { stdio: "inherit", encoding: "utf8" });
  if (convert.error || convert.status !== 0 || !existsSync(AUDIO_WAV)) {
    throw new Error(`${CONTRACT}_MACOS_AFCONVERT_FIXTURE_FAILED`);
  }
}

if (!approved(process.env.AVANTIQO_VOICE_STT_CURRENT_BINDING_TRANSCRIPTION_PROOF_APPROVED)) {
  throw new Error("AVANTIQO_VOICE_STT_CURRENT_BINDING_TRANSCRIPTION_PROOF_APPROVED=YES_REQUIRED");
}
if (!existsSync(EVIDENCE_PATH) || !existsSync(PROOF_SCRIPT)) throw new Error(`${CONTRACT}_SOURCE_REQUIRED`);

const evidence = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
const certifiedImage = text(evidence?.immutable_image_reference);
if (
  evidence?.success !== true ||
  evidence?.contract !== "AVANTIQO_VOICE_STT_WORKER_IMAGE_RESULT_V1" ||
  evidence?.source_sha_matches_trigger !== true ||
  !/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(certifiedImage)
) throw new Error(`${CONTRACT}_CERTIFIED_IMAGE_EVIDENCE_REQUIRED`);

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const queueKey = text(process.env.RUNPOD_API_KEY) || managementKey;
const { endpoint, endpointId, template } = await inventory(managementKey);
if (text(template?.imageName) !== certifiedImage) {
  throw new Error(`${CONTRACT}_CURRENT_BINDING_NOT_CERTIFIED_IMAGE:${text(template?.imageName) || "MISSING"}`);
}
if (!text(template?.containerRegistryAuthId)) throw new Error(`${CONTRACT}_CURRENT_BINDING_REGISTRY_AUTH_REQUIRED`);
if (finite(endpoint?.workersMin, -1) !== 0 || finite(endpoint?.workersMax, -1) !== 0) {
  throw new Error(`${CONTRACT}_ENDPOINT_MUST_START_0_0:${finite(endpoint?.workersMin)}/${finite(endpoint?.workersMax)}`);
}
const initialJobs = jobs(await health(endpointId, queueKey));
if (initialJobs.queued !== 0 || initialJobs.progress !== 0) throw new Error(`${CONTRACT}_QUEUE_NOT_CLEAN`);
if (await workerCount(endpointId, managementKey) !== 0) throw new Error(`${CONTRACT}_ACTIVE_WORKER_PRESENT_AT_START`);

createFixture();

let scalingAttempted = false;
let cleaned = null;
let failure = null;
try {
  console.log(JSON.stringify({
    event: `${CONTRACT}_BEGIN`,
    endpoint_name: ENDPOINT_NAME,
    current_binding_is_certified_image: true,
    registry_auth_present: true,
    real_stt_jobs_expected: 1,
    tts_touched: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  }));

  scalingAttempted = true;
  await patchScaling(endpointId, 1, managementKey);
  await sleep(5000);

  const proof = spawnSync(process.execPath, [PROOF_SCRIPT], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RUNPOD_API_KEY: queueKey,
      RUNPOD_MANAGEMENT_API_KEY: managementKey,
      RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID: endpointId,
      AVANTIQO_VOICE_STT_EXISTING_AUDIO_APPROVED: "YES",
      AVANTIQO_VOICE_STT_EXISTING_AUDIO: AUDIO_WAV,
      AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE: "YES",
      AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT: "AVANTIQO_RUNPOD_SAFE_LEASE_V2",
      AVANTIQO_RUNPOD_SAFE_LEASE_LANE: "voice-stt",
      AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID: endpointId,
      AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT: new Date(Date.now() + 20 * 60_000).toISOString(),
    },
    stdio: "inherit",
    encoding: "utf8",
  });
  if (proof.error) throw proof.error;
  if (proof.status !== 0) throw new Error(`${CONTRACT}_REAL_TRANSCRIPTION_FAILED:exit=${proof.status}`);
} catch (error) {
  failure = error;
} finally {
  if (scalingAttempted) {
    try { cleaned = await cleanup(endpointId, managementKey, queueKey); }
    catch (cleanupError) {
      if (!failure) failure = cleanupError;
      else console.error(`${CONTRACT}_SECONDARY_CLEANUP_ERROR:${redact(cleanupError?.message)}`);
    }
  }
}

if (failure) throw failure;

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  endpoint_name: ENDPOINT_NAME,
  current_binding_is_certified_image: true,
  registry_auth_present: true,
  real_stt_transcription_proved: true,
  permanent_rest_state: cleaned,
  tts_touched: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}, null, 2));
console.log("AVANTIQO_VOICE_STT_CURRENT_BINDING_TRANSCRIPTION_PROOF=PASS");
