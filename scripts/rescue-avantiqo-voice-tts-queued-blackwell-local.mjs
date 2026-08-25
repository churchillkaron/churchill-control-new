import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_TTS_QUEUED_BLACKWELL_RESCUE_V1";
const LOCK_CONTRACT = "AVANTIQO_VOICE_TTS_CONTROLLED_GENERATION_V1";
const LOCK_PATH = "audits/results/avantiqo-voice-tts-controlled-generation.json";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1";
const REQUIRED_CUDA = "12.8";
const CERTIFIED_IMAGE = "ghcr.io/churchillkaron/avantiqo-voice-tts-worker@sha256:c9ce291cc27bb7de119cf1120a92dd6466962b6d79fd5728a1266a743bad1a06";
const CERTIFIED_GPU_TYPE_IDS = Object.freeze([
  "NVIDIA GeForce RTX 5090",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
]);
const MIN_QUEUE_AGE_MS = Math.max(
  5 * 60_000,
  Number(process.env.AVANTIQO_VOICE_TTS_QUEUE_RESCUE_MIN_AGE_MS || 5 * 60_000),
);
const OBSERVE_AFTER_PATCH_MS = Math.max(
  30_000,
  Math.min(3 * 60_000, Number(process.env.AVANTIQO_VOICE_TTS_QUEUE_RESCUE_OBSERVE_MS || 90_000)),
);
const POLL_MS = 5000;

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function sameSet(left, right) {
  const a = [...new Set(list(left).map(text).filter(Boolean))].sort();
  const b = [...new Set(list(right).map(text).filter(Boolean))].sort();
  return JSON.stringify(a) === JSON.stringify(b);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJsonResponse(response, label) {
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

async function rest(pathname, managementKey, options = {}) {
  return readJsonResponse(await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_QUEUE_RESCUE_REST");
}

async function queue(endpointId, inferenceKey, pathname) {
  return readJsonResponse(await fetch(
    `${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`,
    {
      headers: {
        Authorization: `Bearer ${inferenceKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    },
  ), "RUNPOD_VOICE_TTS_QUEUE_RESCUE_QUEUE");
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

function workerCount(health) {
  return Object.values(health.workers).reduce((sum, value) => sum + Math.max(0, finite(value, 0)), 0);
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    template_image: text(endpoint.template?.imageName) || null,
    min_cuda_version: text(endpoint.minCudaVersion) || null,
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    data_center_ids: list(endpoint.dataCenterIds).map(text).filter(Boolean),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    flashboot: endpoint.flashboot === true,
  };
}

const lock = JSON.parse(await readFile(LOCK_PATH, "utf8"));
if (lock?.contract !== LOCK_CONTRACT) throw new Error("AVANTIQO_VOICE_TTS_QUEUE_RESCUE_LOCK_CONTRACT_MISMATCH");
if (lock?.generation_submitted !== true || Number(lock?.accepted_generation_count) !== 1) {
  throw new Error("AVANTIQO_VOICE_TTS_QUEUE_RESCUE_ONE_ACCEPTED_GENERATION_REQUIRED");
}
if (lock?.new_generation_allowed !== false) throw new Error("AVANTIQO_VOICE_TTS_QUEUE_RESCUE_GENERATION_LOCK_REQUIRED");
if (lock?.stt_submitted !== false) throw new Error("AVANTIQO_VOICE_TTS_QUEUE_RESCUE_STT_MUST_BE_FALSE");

const endpointId = text(lock.endpoint_id);
const jobId = text(lock.job_id);
if (!endpointId || !jobId) throw new Error("AVANTIQO_VOICE_TTS_QUEUE_RESCUE_LOCK_IDS_REQUIRED");
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID);
if (configuredEndpointId && configuredEndpointId !== endpointId) {
  throw new Error("AVANTIQO_VOICE_TTS_QUEUE_RESCUE_ENDPOINT_ENV_MISMATCH");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = required("RUNPOD_API_KEY");
const apply = process.argv.includes("--apply");
const approved = text(process.env.AVANTIQO_VOICE_TTS_QUEUE_RESCUE_APPROVED).toUpperCase() === "YES";
if (apply && !approved) throw new Error("AVANTIQO_VOICE_TTS_QUEUE_RESCUE_APPROVED=YES_REQUIRED");

const [endpoint, statusRaw, healthRaw] = await Promise.all([
  rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  queue(endpointId, inferenceKey, `/status/${encodeURIComponent(jobId)}`),
  queue(endpointId, inferenceKey, "/health"),
]);
const status = text(statusRaw.status).toUpperCase();
const health = healthSummary(healthRaw);
const safe = safeEndpoint(endpoint);
const lockObservedMs = Date.parse(text(lock.observed_at));
const queueAgeMs = Number.isFinite(lockObservedMs) ? Math.max(0, Date.now() - lockObservedMs) : null;

if (safe.id !== endpointId || safe.name !== ENDPOINT_NAME) {
  throw new Error("AVANTIQO_VOICE_TTS_QUEUE_RESCUE_ENDPOINT_BINDING_MISMATCH");
}
if (safe.template_image !== CERTIFIED_IMAGE) {
  throw new Error("AVANTIQO_VOICE_TTS_QUEUE_RESCUE_IMAGE_MISMATCH");
}
if (safe.min_cuda_version !== REQUIRED_CUDA) {
  throw new Error("AVANTIQO_VOICE_TTS_QUEUE_RESCUE_CUDA_MISMATCH");
}
if (!sameSet(safe.gpu_type_ids, CERTIFIED_GPU_TYPE_IDS)) {
  throw new Error("AVANTIQO_VOICE_TTS_QUEUE_RESCUE_GPU_POOL_MISMATCH");
}
if (safe.workers_min !== 0 || safe.workers_max !== 1) {
  throw new Error("AVANTIQO_VOICE_TTS_QUEUE_RESCUE_SCALING_MISMATCH");
}

const terminal = ["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status);
const queueStalled =
  status === "IN_QUEUE" &&
  health.jobs.in_queue >= 1 &&
  health.jobs.in_progress === 0 &&
  workerCount(health) === 0 &&
  Number.isFinite(queueAgeMs) &&
  queueAgeMs >= MIN_QUEUE_AGE_MS;
const regionalPinPresent = safe.data_center_ids.length > 0;
const mutationRequired = queueStalled && regionalPinPresent;

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint: safe,
  job_id: jobId,
  job_status: status || null,
  health,
  queue_age_seconds: Number.isFinite(queueAgeMs) ? Math.round(queueAgeMs / 1000) : null,
  queue_stalled_without_worker: queueStalled,
  regional_pin_present: regionalPinPresent,
  regional_pin_count: safe.data_center_ids.length,
  current_data_center_ids: safe.data_center_ids,
  desired_data_center_ids: [],
  mutation_required: mutationRequired,
  mutation_performed: false,
  accepted_generation_count: 1,
  new_generation_submitted: false,
  new_generation_allowed: false,
  queue_purged: false,
  job_cancelled: false,
  stt_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
  next_action: terminal
    ? "RESUME_TERMINAL_JOB_RESULT_ONLY"
    : mutationRequired
      ? "CLEAR_STALE_DATACENTER_PINNING_FOR_EXISTING_JOB"
      : regionalPinPresent
        ? "KEEP_OBSERVING_EXISTING_JOB_UNTIL_STALL_THRESHOLD"
        : "GLOBAL_PLACEMENT_ALREADY_ENABLED_DIAGNOSE_BLACKWELL_CAPACITY",
};

if (!apply || !mutationRequired) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

const [freshEndpoint, freshStatusRaw, freshHealthRaw] = await Promise.all([
  rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  queue(endpointId, inferenceKey, `/status/${encodeURIComponent(jobId)}`),
  queue(endpointId, inferenceKey, "/health"),
]);
const fresh = safeEndpoint(freshEndpoint);
const freshStatus = text(freshStatusRaw.status).toUpperCase();
const freshHealth = healthSummary(freshHealthRaw);
if (fresh.id !== endpointId || fresh.name !== ENDPOINT_NAME) throw new Error("AVANTIQO_VOICE_TTS_QUEUE_RESCUE_ENDPOINT_CHANGED");
if (freshStatus !== "IN_QUEUE") throw new Error(`AVANTIQO_VOICE_TTS_QUEUE_RESCUE_JOB_CHANGED:${freshStatus || "UNKNOWN"}`);
if (freshHealth.jobs.in_progress !== 0 || workerCount(freshHealth) !== 0) {
  throw new Error("AVANTIQO_VOICE_TTS_QUEUE_RESCUE_WORKER_STARTED_REPLAN_REQUIRED");
}
if (!sameSet(fresh.gpu_type_ids, CERTIFIED_GPU_TYPE_IDS) || fresh.min_cuda_version !== REQUIRED_CUDA) {
  throw new Error("AVANTIQO_VOICE_TTS_QUEUE_RESCUE_ENDPOINT_RUNTIME_CHANGED");
}
if (fresh.data_center_ids.length === 0) {
  console.log(JSON.stringify({ ...plan, mode: "APPLY", mutation_required: false, next_action: "GLOBAL_PLACEMENT_ALREADY_ENABLED_DIAGNOSE_BLACKWELL_CAPACITY" }, null, 2));
  process.exit(0);
}

await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
  method: "PATCH",
  body: { dataCenterIds: [] },
});

const deadline = Date.now() + OBSERVE_AFTER_PATCH_MS;
let finalEndpoint = null;
let finalStatus = freshStatus;
let finalHealth = freshHealth;
let workerStarted = false;
while (Date.now() < deadline) {
  const [endpointRead, statusRead, healthRead] = await Promise.all([
    rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
    queue(endpointId, inferenceKey, `/status/${encodeURIComponent(jobId)}`),
    queue(endpointId, inferenceKey, "/health"),
  ]);
  finalEndpoint = safeEndpoint(endpointRead);
  finalStatus = text(statusRead.status).toUpperCase();
  finalHealth = healthSummary(healthRead);
  if (finalEndpoint.data_center_ids.length !== 0) {
    await sleep(POLL_MS);
    continue;
  }
  workerStarted =
    finalStatus !== "IN_QUEUE" ||
    finalHealth.jobs.in_progress > 0 ||
    workerCount(finalHealth) > 0;
  if (workerStarted) break;
  await sleep(POLL_MS);
}

if (!finalEndpoint || finalEndpoint.data_center_ids.length !== 0) {
  throw new Error("AVANTIQO_VOICE_TTS_QUEUE_RESCUE_DATACENTER_CLEAR_VERIFY_FAILED");
}

console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  endpoint: finalEndpoint,
  job_status_after: finalStatus,
  health_after: finalHealth,
  mutation_performed: true,
  regional_pin_cleared: true,
  worker_started_after_rescue: workerStarted,
  accepted_generation_count: 1,
  new_generation_submitted: false,
  new_generation_allowed: false,
  queue_purged: false,
  job_cancelled: false,
  stt_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
  next_action: workerStarted
    ? "RESUME_EXISTING_JOB_TO_TERMINAL_RESULT"
    : "GLOBAL_PLACEMENT_ENABLED_BUT_CAPACITY_STILL_PENDING",
}, null, 2));
