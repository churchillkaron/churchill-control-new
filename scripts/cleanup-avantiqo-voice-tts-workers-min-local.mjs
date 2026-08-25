import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const CONTROL = "https://api.runpod.io/v2";
const CONTRACT = "AVANTIQO_VOICE_TTS_WORKERS_MIN_CLEANUP_V1";
const LOCK_PATH = "audits/results/avantiqo-voice-tts-controlled-generation.json";
const LOCK_CONTRACT = "AVANTIQO_VOICE_TTS_CONTROLLED_GENERATION_V1";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function finite(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function unique(values) { return [...new Set(values.map(text).filter(Boolean))]; }

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1200);
    const error = new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
    error.httpStatus = response.status;
    throw error;
  }
  return body || {};
}

async function rest(path, key, options = {}) {
  return readJson(await fetch(`${REST}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_WORKERS_MIN_CLEANUP_REST");
}

async function queueRead(endpointId, managementKey, path) {
  const credentials = unique([text(process.env.RUNPOD_API_KEY), managementKey]);
  let lastError = null;
  for (const credential of credentials) {
    try {
      return await readJson(await fetch(`${QUEUE}/${encodeURIComponent(endpointId)}${path}`, {
        headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      }), "RUNPOD_VOICE_TTS_WORKERS_MIN_CLEANUP_QUEUE");
    } catch (error) {
      lastError = error;
      if (![401, 403].includes(Number(error?.httpStatus))) throw error;
    }
  }
  throw lastError || new Error("RUNPOD_VOICE_TTS_WORKERS_MIN_CLEANUP_QUEUE_CREDENTIAL_REQUIRED");
}

async function controlWorkers(endpointId, key) {
  return readJson(await fetch(`${CONTROL}/serverless/${encodeURIComponent(endpointId)}/workers`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_WORKERS_MIN_CLEANUP_CONTROL");
}

function healthSummary(body = {}) {
  const jobs = body?.jobs && typeof body.jobs === "object" ? body.jobs : {};
  const workers = body?.workers && typeof body.workers === "object" ? body.workers : {};
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
      completed: finite(jobs.completed, 0),
      failed: finite(jobs.failed, 0),
      retried: finite(jobs.retried, 0),
    },
    workers: {
      idle: finite(workers.idle, 0),
      initializing: finite(workers.initializing, 0),
      ready: finite(workers.ready, 0),
      running: finite(workers.running, 0),
      throttled: finite(workers.throttled, 0),
      unhealthy: finite(workers.unhealthy, 0),
    },
  };
}

function safeWorkers(body = {}) {
  return list(body?.workers).map((worker) => ({
    id_present: Boolean(text(worker?.id)),
    status: text(worker?.status).toUpperCase() || null,
    desired_status: text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase() || null,
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    is_stale: worker?.isStale === true,
  }));
}

function activeWorkerCount(body = {}) {
  return safeWorkers(body).filter((worker) =>
    !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(worker.status)
  ).length;
}

function anyHealthWorker(health) {
  return Object.values(health?.workers || {}).some((value) => Number(value) > 0);
}

async function readState(endpointId, jobId, key) {
  const [endpoint, statusRaw, healthRaw, controlRaw] = await Promise.all([
    rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, key),
    queueRead(endpointId, key, `/status/${encodeURIComponent(jobId)}`),
    queueRead(endpointId, key, "/health"),
    controlWorkers(endpointId, key),
  ]);
  return {
    endpoint: {
      id: text(endpoint?.id) || null,
      name: text(endpoint?.name) || null,
      version: finite(endpoint?.version),
      workers_min: finite(endpoint?.workersMin),
      workers_max: finite(endpoint?.workersMax),
      gpu_count: finite(endpoint?.gpuCount),
      min_cuda_version: text(endpoint?.minCudaVersion) || null,
      gpu_type_ids: list(endpoint?.gpuTypeIds).map(text).filter(Boolean),
      data_center_ids: list(endpoint?.dataCenterIds).map(text).filter(Boolean),
      network_volume_id: text(endpoint?.networkVolumeId) || null,
      network_volume_ids: list(endpoint?.networkVolumeIds).map(text).filter(Boolean),
    },
    status: text(statusRaw?.status).toUpperCase() || "UNKNOWN",
    health: healthSummary(healthRaw),
    control_raw: controlRaw,
    control_workers: safeWorkers(controlRaw),
  };
}

const lock = JSON.parse(await readFile(LOCK_PATH, "utf8"));
if (lock?.contract !== LOCK_CONTRACT) throw new Error("VOICE_TTS_WORKERS_MIN_CLEANUP_LOCK_CONTRACT_MISMATCH");
if (lock?.generation_submitted !== true || Number(lock?.accepted_generation_count) !== 1) {
  throw new Error("VOICE_TTS_WORKERS_MIN_CLEANUP_ONE_ACCEPTED_GENERATION_REQUIRED");
}
if (lock?.new_generation_allowed !== false || lock?.stt_submitted !== false) {
  throw new Error("VOICE_TTS_WORKERS_MIN_CLEANUP_GENERATION_LOCK_REQUIRED");
}

const endpointId = text(lock?.endpoint_id);
const jobId = text(lock?.job_id);
if (!endpointId || !jobId || text(lock?.endpoint_name) !== ENDPOINT_NAME) {
  throw new Error("VOICE_TTS_WORKERS_MIN_CLEANUP_LOCK_BINDING_MISMATCH");
}

const key = required("RUNPOD_MANAGEMENT_API_KEY");
const apply = process.argv.includes("--apply");
const approved = text(process.env.AVANTIQO_VOICE_TTS_WORKERS_MIN_CLEANUP_APPROVED).toUpperCase() === "YES";
if (apply && !approved) {
  throw new Error("AVANTIQO_VOICE_TTS_WORKERS_MIN_CLEANUP_APPROVED=YES_REQUIRED");
}

const before = await readState(endpointId, jobId, key);
if (before.endpoint.id !== endpointId || before.endpoint.name !== ENDPOINT_NAME) {
  throw new Error("VOICE_TTS_WORKERS_MIN_CLEANUP_ENDPOINT_MISMATCH");
}
if (before.endpoint.workers_max !== 1 || before.endpoint.gpu_count !== 1) {
  throw new Error("VOICE_TTS_WORKERS_MIN_CLEANUP_ENDPOINT_SHAPE_MISMATCH");
}

const base = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  accepted_generation_count: 1,
  generation_submitted: false,
  new_generation_allowed: false,
  endpoint_mutation_performed: false,
  gpu_pool_mutation_performed: false,
  queue_mutation_performed: false,
  queue_purged: false,
  job_cancelled: false,
  stt_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
  endpoint_id: endpointId,
  job_id: jobId,
  job_status_before: before.status,
  endpoint_before: before.endpoint,
  health_before: before.health,
  control_workers_before: before.control_workers,
};

if (before.endpoint.workers_min === 0) {
  console.log(JSON.stringify({
    ...base,
    diagnosis: "WORKERS_MIN_ALREADY_ZERO",
    next_action: before.status === "IN_QUEUE"
      ? "OPEN_RUNPOD_SUPPORT_WITH_ENDPOINT_EVIDENCE_NO_NEW_JOB"
      : "RESUME_EXISTING_ACCEPTED_JOB_ONLY",
  }, null, 2));
  process.exit(0);
}

if (before.endpoint.workers_min !== 1) {
  throw new Error(`VOICE_TTS_WORKERS_MIN_CLEANUP_UNEXPECTED_WORKERS_MIN:${before.endpoint.workers_min}`);
}

if (activeWorkerCount(before.control_raw) > 0 || anyHealthWorker(before.health)) {
  console.log(JSON.stringify({
    ...base,
    diagnosis: "ACTIVE_WORKER_EXISTS_DO_NOT_CHANGE_WORKERS_MIN",
    next_action: "RESUME_EXISTING_ACCEPTED_JOB_ONLY",
  }, null, 2));
  process.exit(0);
}

if (!apply) {
  console.log(JSON.stringify({
    ...base,
    diagnosis: "STUCK_ACTIVE_WORKER_REQUEST_SAFE_TO_CLEAR",
    next_action: "APPLY_WORKERS_MIN_ZERO_ONLY",
  }, null, 2));
  process.exit(0);
}

await rest(`/endpoints/${encodeURIComponent(endpointId)}`, key, {
  method: "PATCH",
  body: { workersMin: 0 },
});

const after = await readState(endpointId, jobId, key);
if (after.endpoint.workers_min !== 0) {
  throw new Error(`VOICE_TTS_WORKERS_MIN_CLEANUP_VERIFY_FAILED:${after.endpoint.workers_min}`);
}

console.log(JSON.stringify({
  ...base,
  endpoint_mutation_performed: true,
  workers_min_mutation_performed: true,
  endpoint_after: after.endpoint,
  job_status_after: after.status,
  health_after: after.health,
  control_workers_after: after.control_workers,
  diagnosis: after.status === "IN_QUEUE"
    ? "STUCK_ACTIVE_WORKER_REQUEST_CLEARED_CONTROL_PLANE_FAILURE_PERSISTS"
    : "STUCK_ACTIVE_WORKER_REQUEST_CLEARED_JOB_STATE_CHANGED",
  safe_to_submit_duplicate_job: false,
  next_action: after.status === "IN_QUEUE"
    ? "OPEN_RUNPOD_SUPPORT_WITH_ENDPOINT_EVIDENCE_NO_NEW_JOB"
    : "RESUME_EXISTING_ACCEPTED_JOB_ONLY",
}, null, 2));
