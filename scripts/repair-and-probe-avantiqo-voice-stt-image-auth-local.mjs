import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VOICE_STT_IMAGE_AUTH_REPAIR_AND_BOOT_PROOF_V1";
const ENDPOINT_NAME = "avantiqo-voice-stt-v1";
const REPAIR_SCRIPT = resolve("scripts/repair-avantiqo-voice-stt-ghcr-auth-local.mjs");
const PROBE_SCRIPT = resolve("scripts/run-avantiqo-voice-stt-offline-image-runtime-probe-local.mjs");
const REST = "https://rest.runpod.io/v1";
const CONTROL = "https://api.runpod.io/v2";
const QUEUE = "https://api.runpod.ai/v2";
const IDLE_TIMEOUT = 5;
const CLEANUP_TIMEOUT_MS = 180_000;
const POLL_MS = 3000;

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
async function resolveEndpoint(managementKey) {
  const raw = await requestJson(`${REST}/endpoints?includeTemplate=true&includeWorkers=true`, managementKey);
  const rows = normalizeList(raw, ["endpoints", "serverlessEndpoints"]) || [];
  const matches = rows.filter((row) => text(row?.name) === ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  const endpointId = text(matches[0]?.id);
  if (!endpointId) throw new Error(`${CONTRACT}_ENDPOINT_ID_REQUIRED`);
  return endpointId;
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
  try {
    await requestJson(`${QUEUE}/${encodeURIComponent(endpointId)}/purge-queue`, queueKey, { method: "POST" });
  } catch {}
  await patchScaling(endpointId, 0, managementKey);
  const deadline = Date.now() + CLEANUP_TIMEOUT_MS;
  let latest = null;
  while (Date.now() < deadline) {
    const endpoint = await requestJson(`${CONTROL}/serverless/${encodeURIComponent(endpointId)}`, managementKey);
    const workers = endpoint?.workers || {};
    const active = await workerCount(endpointId, managementKey);
    const jobState = jobs(await health(endpointId, queueKey));
    latest = {
      min: finite(workers.min, -1),
      max: finite(workers.max, -1),
      idle_timeout: finite(workers.idleTimeout, -1),
      active_workers: active,
      jobs_in_queue: jobState.queued,
      jobs_in_progress: jobState.progress,
    };
    if (latest.min === 0 && latest.max === 0 && latest.idle_timeout === IDLE_TIMEOUT && active === 0 && jobState.queued === 0 && jobState.progress === 0) return latest;
    await sleep(POLL_MS);
  }
  throw new Error(`${CONTRACT}_CLEANUP_TIMEOUT:${JSON.stringify(latest)}`);
}

if (!approved(process.env.AVANTIQO_VOICE_STT_IMAGE_AUTH_REPAIR_AND_BOOT_PROOF_APPROVED)) {
  throw new Error("AVANTIQO_VOICE_STT_IMAGE_AUTH_REPAIR_AND_BOOT_PROOF_APPROVED=YES_REQUIRED");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const queueKey = text(process.env.RUNPOD_API_KEY) || managementKey;
let endpointId = null;
let scalingAttempted = false;
let failure = null;
let cleaned = null;

try {
  console.log(JSON.stringify({ event: `${CONTRACT}_BEGIN`, endpoint_name: ENDPOINT_NAME, tts_touched: false, transcription_requested: false, inference_requested: false, production_deploy_performed: false, pricing_activation_performed: false, secrets_printed: false }));

  const repair = spawnSync(process.execPath, [REPAIR_SCRIPT, "--apply"], {
    cwd: process.cwd(),
    env: { ...process.env, AVANTIQO_VOICE_STT_GHCR_AUTH_REPAIR_APPROVED: "YES" },
    stdio: "inherit",
    encoding: "utf8",
  });
  if (repair.error) throw repair.error;
  if (repair.status !== 0) throw new Error(`${CONTRACT}_REPAIR_FAILED:exit=${repair.status}`);

  endpointId = await resolveEndpoint(managementKey);
  const initialJobs = jobs(await health(endpointId, queueKey));
  if (initialJobs.queued !== 0 || initialJobs.progress !== 0) {
    throw new Error(`${CONTRACT}_QUEUE_NOT_CLEAN:${initialJobs.queued}/${initialJobs.progress}`);
  }

  scalingAttempted = true;
  await patchScaling(endpointId, 1, managementKey);
  await sleep(5000);

  const proof = spawnSync(process.execPath, [PROBE_SCRIPT], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RUNPOD_API_KEY: queueKey,
      RUNPOD_MANAGEMENT_API_KEY: managementKey,
      AVANTIQO_VOICE_STT_OFFLINE_RUNTIME_PROBE_APPROVED: "YES",
      AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE: "YES",
      AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT: "AVANTIQO_RUNPOD_SAFE_LEASE_V2",
      AVANTIQO_RUNPOD_SAFE_LEASE_LANE: "voice-stt",
      AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID: endpointId,
      AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT: new Date(Date.now() + 5 * 60_000).toISOString(),
    },
    stdio: "inherit",
    encoding: "utf8",
  });
  if (proof.error) throw proof.error;
  if (proof.status !== 0) throw new Error(`${CONTRACT}_BOOT_PROOF_FAILED:exit=${proof.status}`);
} catch (error) {
  failure = error;
} finally {
  if (endpointId && scalingAttempted) {
    try {
      cleaned = await cleanup(endpointId, managementKey, queueKey);
    } catch (cleanupError) {
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
  image_auth_repaired: true,
  runtime_boot_proved: true,
  transcription_requested: false,
  inference_requested: false,
  permanent_rest_state: cleaned,
  tts_touched: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
}, null, 2));
console.log("AVANTIQO_VOICE_STT_IMAGE_AUTH_REPAIR_AND_BOOT_PROOF=PASS");
