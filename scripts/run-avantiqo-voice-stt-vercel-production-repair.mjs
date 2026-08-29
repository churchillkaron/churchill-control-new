import crypto from "node:crypto";
import { readFileSync } from "node:fs";

const CONTRACT = "AVANTIQO_VOICE_STT_VERCEL_PRODUCTION_REPAIR_V1";
const ENDPOINT_NAME = "avantiqo-voice-stt-v1";
const TARGET_IMAGE = "registry.runpod.net/churchillkaron-churchill-control-new-main-services-avantiqo-voice-stt-dockerfile:ff11761b2";
const EXPECTED = Object.freeze({
  handler: ["services/avantiqo-voice-stt/handler.py", "d9d24ff5e2cde494cebde0d2df0a333d74ad0d91"],
  dockerfile: ["services/avantiqo-voice-stt/Dockerfile", "fe1ceb09e246a3ad1d851bbba3aaa3f5822e9d2d"],
  requirements: ["services/avantiqo-voice-stt/requirements.txt", "9b1f4d662a7b13b65d192493ed738998d2172698"],
});
const REST = "https://rest.runpod.io/v1";
const CONTROL = "https://api.runpod.io/v2";
const QUEUE = "https://api.runpod.ai/v2";
const POLL_MS = 2000;
const COMPLETE_TIMEOUT_MS = 240000;
const CLEANUP_TIMEOUT_MS = 180000;
const IDLE_TIMEOUT = 5;
const TERMINAL = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${CONTRACT}_${name}_REQUIRED`);
  return value;
}

function blobSha(path) {
  const body = readFileSync(path);
  const header = Buffer.from(`blob ${body.length}\0`, "utf8");
  return crypto.createHash("sha1").update(header).update(body).digest("hex");
}

function verifyCheckedOutSource() {
  const verified = {};
  for (const [key, [path, expected]] of Object.entries(EXPECTED)) {
    const actual = blobSha(path);
    if (actual !== expected) throw new Error(`${CONTRACT}_${key.toUpperCase()}_SOURCE_MISMATCH:${actual}`);
    verified[key] = actual;
  }
  return verified;
}

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30000),
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok) {
    throw new Error(`${CONTRACT}_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0,500)}`);
  }
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

async function inventory(managementKey, queueKey) {
  const endpointsRaw = await requestJson(`${REST}/endpoints?includeTemplate=true&includeWorkers=true`, managementKey);
  const templatesRaw = await requestJson(`${REST}/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false`, managementKey);
  const endpoints = normalizeList(endpointsRaw, ["endpoints", "serverlessEndpoints"]) || [];
  const templates = normalizeList(templatesRaw, ["templates"]) || [];
  const matches = endpoints.filter((row) => text(row?.name) === ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  const endpoint = matches[0];
  const endpointId = text(endpoint?.id);
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  const template = templates.find((row) => text(row?.id) === templateId);
  if (!endpointId || !templateId || !template) throw new Error(`${CONTRACT}_ENDPOINT_TEMPLATE_REQUIRED`);
  const health = await requestJson(`${QUEUE}/${encodeURIComponent(endpointId)}/health`, queueKey);
  const workersRaw = await requestJson(`${CONTROL}/serverless/${encodeURIComponent(endpointId)}/workers`, managementKey);
  return { endpoint, endpointId, template, templateId, health, workers: list(workersRaw?.workers) };
}

function assertResting(state) {
  const jobs = object(state.health?.jobs);
  const activeWorkers = state.workers.filter((worker) => {
    if (worker?.isStale === true) return false;
    const status = text(worker?.status || worker?.workerStatus || worker?.runtimeStatus || worker?.desiredStatus).toUpperCase();
    return status && !TERMINAL.has(status);
  });
  if (finite(state.endpoint?.workersMin, -1) !== 0 || finite(state.endpoint?.workersMax, -1) !== 0) {
    throw new Error(`${CONTRACT}_REST_STATE_REQUIRED`);
  }
  if (finite(jobs.inQueue ?? jobs.in_queue, 0) !== 0 || finite(jobs.inProgress ?? jobs.in_progress, 0) !== 0) {
    throw new Error(`${CONTRACT}_QUEUE_NOT_EMPTY`);
  }
  if (activeWorkers.length) throw new Error(`${CONTRACT}_ACTIVE_WORKER_PRESENT`);
}

function templateBody(template, authValue) {
  const env = Array.isArray(template?.env)
    ? Object.fromEntries(template.env.map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")]).filter(([key]) => Boolean(key)))
    : Object.fromEntries(Object.entries(object(template?.env)).map(([key, value]) => [key, String(value ?? "")]));
  return {
    containerDiskInGb: Math.max(1, finite(template?.containerDiskInGb, 30)),
    containerRegistryAuthId: authValue,
    dockerEntrypoint: [],
    dockerStartCmd: [],
    env,
    imageName: TARGET_IMAGE,
    isPublic: template?.isPublic === true,
    name: text(template?.name),
    ports: list(template?.ports),
    readme: text(template?.readme),
    volumeInGb: Math.max(0, finite(template?.volumeInGb, 0)),
    volumeMountPath: text(template?.volumeMountPath) || "/workspace",
  };
}

async function rebind(state, managementKey, queueKey) {
  for (const authValue of [null, ""]) {
    try {
      await requestJson(`${REST}/templates/${encodeURIComponent(state.templateId)}/update`, managementKey, {
        method: "POST",
        body: templateBody(state.template, authValue),
      });
      const verified = await inventory(managementKey, queueKey);
      assertResting(verified);
      if (
        text(verified.template?.imageName) === TARGET_IMAGE &&
        !text(verified.template?.containerRegistryAuthId) &&
        list(verified.template?.dockerEntrypoint).length === 0 &&
        list(verified.template?.dockerStartCmd).length === 0
      ) return verified;
    } catch {}
  }
  throw new Error(`${CONTRACT}_REBIND_FAILED`);
}

async function patchScaling(endpointId, max, managementKey) {
  await requestJson(`${CONTROL}/serverless/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workers: { min: 0, max, idleTimeout: IDLE_TIMEOUT } },
  });
}

async function cleanup(endpointId, managementKey, queueKey) {
  try { await requestJson(`${QUEUE}/${encodeURIComponent(endpointId)}/purge-queue`, queueKey, { method: "POST" }); } catch {}
  await patchScaling(endpointId, 0, managementKey);
  const deadline = Date.now() + CLEANUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const state = await inventory(managementKey, queueKey);
    try { assertResting(state); return state; } catch {}
    await sleep(POLL_MS);
  }
  throw new Error(`${CONTRACT}_CLEANUP_TIMEOUT`);
}

async function runtimeProbe(endpointId, queueKey) {
  const submitted = await requestJson(`${QUEUE}/${encodeURIComponent(endpointId)}/run`, queueKey, {
    method: "POST",
    body: { input: {
      contract: "AVANTIQO_VOICE_ENGINE_V1",
      capability: "ai.speech.to.text",
      foundation_model: "openai/whisper-large-v3-turbo",
      operation: "runtime_probe",
    } },
    timeoutMs: 120000,
  });
  const jobId = text(submitted?.id);
  if (!jobId) throw new Error(`${CONTRACT}_PROBE_JOB_ID_REQUIRED`);
  const deadline = Date.now() + COMPLETE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const status = await requestJson(`${QUEUE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`, queueKey);
    const state = text(status?.status).toUpperCase();
    if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(state)) throw new Error(`${CONTRACT}_PROBE_${state}`);
    if (state === "COMPLETED") {
      const output = object(status?.output);
      if (
        text(output?.probe_contract) !== "AVANTIQO_VOICE_STT_RUNTIME_PROBE_V1" ||
        text(output?.runtime_revision) !== "AVANTIQO_VOICE_STT_HANDLER_RUNTIME_PROBE_V1" ||
        output?.transcription_requested !== false ||
        output?.inference_performed !== false
      ) throw new Error(`${CONTRACT}_PROBE_OUTPUT_INVALID`);
      return { job_id_present: true, output };
    }
  }
  throw new Error(`${CONTRACT}_PROBE_TIMEOUT`);
}

if (text(process.env.AVANTIQO_VOICE_STT_VERCEL_PRODUCTION_REPAIR_APPROVED).toUpperCase() !== "YES") {
  throw new Error(`${CONTRACT}_APPROVAL_REQUIRED`);
}
const source = verifyCheckedOutSource();
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const queueKey = required("RUNPOD_API_KEY", managementKey);
let endpointId = null;
let probe = null;
try {
  const initial = await inventory(managementKey, queueKey);
  assertResting(initial);
  endpointId = initial.endpointId;
  const rebound = await rebind(initial, managementKey, queueKey);
  await patchScaling(endpointId, 1, managementKey);
  await sleep(5000);
  probe = await runtimeProbe(endpointId, queueKey);
  const cleaned = await cleanup(endpointId, managementKey, queueKey);
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    endpoint_name: ENDPOINT_NAME,
    endpoint_id_present: true,
    target_image: TARGET_IMAGE,
    source,
    rebind_verified: text(rebound.template?.imageName) === TARGET_IMAGE,
    runtime_probe_passed: true,
    transcription_requested: false,
    inference_performed: false,
    workers_restored_0_0: finite(cleaned.endpoint?.workersMin) === 0 && finite(cleaned.endpoint?.workersMax) === 0,
    tts_touched: false,
    secrets_printed: false,
  }, null, 2));
  console.log(`${CONTRACT}=PASS`);
} catch (error) {
  if (endpointId) await cleanup(endpointId, managementKey, queueKey).catch(() => null);
  throw error;
}
