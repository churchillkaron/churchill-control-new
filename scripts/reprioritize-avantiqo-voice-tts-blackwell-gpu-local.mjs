import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTROL_BASE = "https://api.runpod.io/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_VOICE_TTS_BLACKWELL_GPU_REPRIORITIZATION_V1";
const LOCK_CONTRACT = "AVANTIQO_VOICE_TTS_CONTROLLED_GENERATION_V1";
const LOCK_PATH = "audits/results/avantiqo-voice-tts-controlled-generation.json";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1";
const REQUIRED_CUDA = "12.8";
const CERTIFIED_IMAGE = "ghcr.io/churchillkaron/avantiqo-voice-tts-worker@sha256:c9ce291cc27bb7de119cf1120a92dd6466962b6d79fd5728a1266a743bad1a06";
const DESIRED_GPU_TYPE_IDS = Object.freeze([
  "NVIDIA RTX PRO 4500 Blackwell",
  "NVIDIA GeForce RTX 5090",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
]);
const REQUIRED_PRIMARY_STOCK_RANK = 3;
const OBSERVE_MS = Math.max(
  30_000,
  Math.min(3 * 60_000, Number(process.env.AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_OBSERVE_MS || 90_000)),
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

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function sameOrder(left, right) {
  const a = list(left).map(text).filter(Boolean);
  const b = list(right).map(text).filter(Boolean);
  return JSON.stringify(a) === JSON.stringify(b);
}

function normalizeListResponse(value, candidateKeys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...candidateKeys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalized = normalizeListResponse(value[key], candidateKeys, depth + 1);
    if (normalized) return normalized;
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stockRank(value) {
  const status = text(value).toUpperCase();
  if (status === "HIGH") return 4;
  if (status === "MEDIUM") return 3;
  if (status === "LOW") return 2;
  return 0;
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
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 900);
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
  }), "RUNPOD_VOICE_TTS_GPU_REPRIORITIZE_REST");
}

async function queue(endpointId, inferenceKey, pathname) {
  return readJsonResponse(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    headers: {
      Authorization: `Bearer ${inferenceKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_GPU_REPRIORITIZE_QUEUE");
}

async function controlWorkers(endpointId, managementKey) {
  return readJsonResponse(await fetch(
    `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`,
    {
      headers: {
        Authorization: `Bearer ${managementKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    },
  ), "RUNPOD_VOICE_TTS_GPU_REPRIORITIZE_CONTROL");
}

async function endpointBoundTemplates(managementKey) {
  const raw = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  );
  const templates = normalizeListResponse(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_TEMPLATE_LIST_INVALID");
  return templates;
}

function resolveTemplate(endpoint, templates) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  if (!templateId) throw new Error("AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_TEMPLATE_ID_REQUIRED");
  const matches = templates.filter((template) => text(template?.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_TEMPLATE_RESOLUTION_FAILED:id=${templateId}:matches=${matches.length}`,
    );
  }
  return matches[0];
}

async function readEndpointState(endpointId, managementKey) {
  const [endpoint, templates] = await Promise.all([
    rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
    endpointBoundTemplates(managementKey),
  ]);
  return { endpoint, template: resolveTemplate(endpoint, templates) };
}

async function discoverCapacity(managementKey) {
  const queryText = `
    query AvantiqoVoiceTtsGpuPriorityCapacity($input: GpuAvailabilityInput) {
      dataCenters {
        id
        name
        location
        gpuAvailability(input: $input) {
          available
          stockStatus
          gpuTypeId
          gpuTypeDisplayName
          displayName
        }
      }
    }
  `;
  const response = await fetch(`${GRAPHQL_URL}?api_key=${encodeURIComponent(managementKey)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      query: queryText,
      variables: {
        input: {
          gpuCount: 1,
          minDisk: 5,
          minMemoryInGb: 20,
          secureCloud: true,
        },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok || body?.errors?.length || !Array.isArray(body?.data?.dataCenters)) {
    const detail = text(
      body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw,
    ).slice(0, 900);
    throw new Error(`AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_CAPACITY_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  return body.data.dataCenters;
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

function safeControlWorkers(body = {}) {
  return list(body?.workers).map((worker) => ({
    id_present: Boolean(text(worker?.id)),
    status: text(worker?.status).toUpperCase() || null,
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    image_matches_certified: !text(worker?.image) || text(worker?.image) === CERTIFIED_IMAGE,
    is_stale: worker?.isStale === true,
  }));
}

function activeControlWorkers(body = {}) {
  return safeControlWorkers(body).filter(
    (worker) => !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(worker.status),
  );
}

function safeEndpoint(endpoint = {}, template = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    template_image: text(template.imageName) || null,
    min_cuda_version: text(endpoint.minCudaVersion) || null,
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    data_center_ids: list(endpoint.dataCenterIds).map(text).filter(Boolean),
    network_volume_id: text(endpoint.networkVolumeId) || null,
    network_volume_ids: list(endpoint.networkVolumeIds).map(text).filter(Boolean),
    gpu_count: finite(endpoint.gpuCount),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs),
    flashboot: endpoint.flashboot === true,
  };
}

const lock = JSON.parse(await readFile(LOCK_PATH, "utf8"));
if (lock?.contract !== LOCK_CONTRACT) throw new Error("AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_LOCK_CONTRACT_MISMATCH");
if (lock?.generation_submitted !== true || Number(lock?.accepted_generation_count) !== 1) {
  throw new Error("AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_ONE_ACCEPTED_GENERATION_REQUIRED");
}
if (lock?.new_generation_allowed !== false) throw new Error("AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_GENERATION_LOCK_REQUIRED");
if (lock?.stt_submitted !== false) throw new Error("AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_STT_MUST_BE_FALSE");

const endpointId = text(lock.endpoint_id);
const jobId = text(lock.job_id);
if (!endpointId || !jobId) throw new Error("AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_LOCK_IDS_REQUIRED");

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = required("RUNPOD_API_KEY");
const apply = process.argv.includes("--apply");
const approved = text(process.env.AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_APPROVED).toUpperCase() === "YES";
if (apply && !approved) {
  throw new Error("AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_APPROVED=YES_REQUIRED");
}

const [state, statusRaw, healthRaw, workersRaw, capacity] = await Promise.all([
  readEndpointState(endpointId, managementKey),
  queue(endpointId, inferenceKey, `/status/${encodeURIComponent(jobId)}`),
  queue(endpointId, inferenceKey, "/health"),
  controlWorkers(endpointId, managementKey),
  discoverCapacity(managementKey),
]);
const current = safeEndpoint(state.endpoint, state.template);
const status = text(statusRaw.status).toUpperCase();
const health = healthSummary(healthRaw);
const activeWorkers = activeControlWorkers(workersRaw);

if (current.id !== endpointId || current.name !== ENDPOINT_NAME) {
  throw new Error("AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_ENDPOINT_BINDING_MISMATCH");
}
if (current.template_image !== CERTIFIED_IMAGE) {
  throw new Error("AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_IMAGE_MISMATCH");
}
if (current.min_cuda_version !== REQUIRED_CUDA) {
  throw new Error("AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_CUDA_MISMATCH");
}
if (current.gpu_count !== 1 || current.workers_min !== 0 || current.workers_max !== 1) {
  throw new Error("AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_SCALING_MISMATCH");
}
if (current.data_center_ids.length || current.network_volume_id || current.network_volume_ids.length) {
  throw new Error("AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_GLOBAL_PLACEMENT_REQUIRED");
}
if (status !== "IN_QUEUE" || health.jobs.in_queue < 1 || health.jobs.in_progress !== 0) {
  throw new Error(`AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_JOB_NOT_STALLED_QUEUE:${status || "UNKNOWN"}`);
}
if (activeWorkers.length !== 0 || Object.values(health.workers).some((value) => value > 0)) {
  throw new Error("AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_WORKER_ALREADY_EXISTS_REPLAN_REQUIRED");
}

const primaryRows = capacity
  .flatMap((dc) => list(dc?.gpuAvailability).map((gpu) => ({
    data_center_id: text(dc?.id) || null,
    data_center_name: text(dc?.name) || null,
    location: text(dc?.location) || null,
    gpu_type_id: text(gpu?.gpuTypeId) || null,
    gpu_name: text(gpu?.gpuTypeDisplayName || gpu?.displayName || gpu?.gpuTypeId) || null,
    available: gpu?.available === true,
    stock_status: text(gpu?.stockStatus) || "UNAVAILABLE",
    stock_rank: stockRank(gpu?.stockStatus),
  })))
  .filter((row) => row.gpu_type_id === DESIRED_GPU_TYPE_IDS[0])
  .filter((row) => row.available && row.stock_rank > 0)
  .sort((left, right) => right.stock_rank - left.stock_rank || String(left.data_center_id).localeCompare(String(right.data_center_id)));
const bestPrimaryStockRank = primaryRows[0]?.stock_rank || 0;
if (bestPrimaryStockRank < REQUIRED_PRIMARY_STOCK_RANK) {
  throw new Error(`AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_PRIMARY_LIVE_STOCK_NOT_MEDIUM_OR_HIGH:rank=${bestPrimaryStockRank}`);
}

const mutationRequired = !sameOrder(current.gpu_type_ids, DESIRED_GPU_TYPE_IDS);
const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint_before: current,
  job_id: jobId,
  job_status_before: status,
  health_before: health,
  control_workers_before: safeControlWorkers(workersRaw),
  primary_live_capacity: primaryRows.slice(0, 12),
  best_primary_stock_rank: bestPrimaryStockRank,
  desired_gpu_type_ids: [...DESIRED_GPU_TYPE_IDS],
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
};

if (!apply || !mutationRequired) {
  console.log(JSON.stringify({
    ...plan,
    next_action: mutationRequired
      ? "APPLY_BLACKWELL_GPU_PRIORITY_TO_EXISTING_QUEUED_JOB"
      : "GPU_PRIORITY_ALREADY_APPLIED_RESUME_EXISTING_JOB",
  }, null, 2));
  process.exit(0);
}

const [freshState, freshStatusRaw, freshHealthRaw, freshWorkersRaw] = await Promise.all([
  readEndpointState(endpointId, managementKey),
  queue(endpointId, inferenceKey, `/status/${encodeURIComponent(jobId)}`),
  queue(endpointId, inferenceKey, "/health"),
  controlWorkers(endpointId, managementKey),
]);
const fresh = safeEndpoint(freshState.endpoint, freshState.template);
const freshStatus = text(freshStatusRaw.status).toUpperCase();
const freshHealth = healthSummary(freshHealthRaw);
if (fresh.template_image !== CERTIFIED_IMAGE || fresh.min_cuda_version !== REQUIRED_CUDA) {
  throw new Error("AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_ENDPOINT_CHANGED_REPLAN_REQUIRED");
}
if (freshStatus !== "IN_QUEUE" || freshHealth.jobs.in_progress !== 0) {
  throw new Error(`AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_JOB_CHANGED_REPLAN_REQUIRED:${freshStatus || "UNKNOWN"}`);
}
if (activeControlWorkers(freshWorkersRaw).length !== 0 || Object.values(freshHealth.workers).some((value) => value > 0)) {
  throw new Error("AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_WORKER_STARTED_REPLAN_REQUIRED");
}
if (fresh.data_center_ids.length || fresh.network_volume_id || fresh.network_volume_ids.length) {
  throw new Error("AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_PLACEMENT_CHANGED_REPLAN_REQUIRED");
}

await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
  method: "PATCH",
  body: {
    gpuTypeIds: [...DESIRED_GPU_TYPE_IDS],
    minCudaVersion: REQUIRED_CUDA,
    workersMin: 0,
    workersMax: 1,
  },
});

const deadline = Date.now() + OBSERVE_MS;
let endpointAfter = null;
let statusAfter = freshStatus;
let healthAfter = freshHealth;
let workersAfter = freshWorkersRaw;
let workerStarted = false;
while (Date.now() < deadline) {
  const [afterState, afterStatusRaw, afterHealthRaw, afterWorkersRaw] = await Promise.all([
    readEndpointState(endpointId, managementKey),
    queue(endpointId, inferenceKey, `/status/${encodeURIComponent(jobId)}`),
    queue(endpointId, inferenceKey, "/health"),
    controlWorkers(endpointId, managementKey),
  ]);
  endpointAfter = safeEndpoint(afterState.endpoint, afterState.template);
  statusAfter = text(afterStatusRaw.status).toUpperCase();
  healthAfter = healthSummary(afterHealthRaw);
  workersAfter = afterWorkersRaw;
  if (endpointAfter.template_image !== CERTIFIED_IMAGE || endpointAfter.min_cuda_version !== REQUIRED_CUDA) {
    throw new Error("AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_VERIFY_RUNTIME_CHANGED");
  }
  if (!sameOrder(endpointAfter.gpu_type_ids, DESIRED_GPU_TYPE_IDS)) {
    await sleep(POLL_MS);
    continue;
  }
  const activeAfter = activeControlWorkers(afterWorkersRaw);
  workerStarted =
    activeAfter.length > 0 ||
    Object.values(healthAfter.workers).some((value) => value > 0) ||
    healthAfter.jobs.in_progress > 0 ||
    statusAfter !== "IN_QUEUE";
  if (workerStarted) break;
  await sleep(POLL_MS);
}

if (!endpointAfter || !sameOrder(endpointAfter.gpu_type_ids, DESIRED_GPU_TYPE_IDS)) {
  throw new Error("AVANTIQO_VOICE_TTS_GPU_REPRIORITIZE_VERIFY_GPU_PRIORITY_FAILED");
}

console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  endpoint_after: endpointAfter,
  job_status_after: statusAfter,
  health_after: healthAfter,
  control_workers_after: safeControlWorkers(workersAfter),
  mutation_performed: true,
  gpu_priority_changed: true,
  worker_started_after_reprioritization: workerStarted,
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
    : "GPU_PRIORITY_FIXED_BUT_RUNPOD_CONTROL_PLANE_STILL_NOT_CREATING_WORKER",
}, null, 2));
