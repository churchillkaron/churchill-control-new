import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTROL_BASE = "https://api.runpod.io/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_VOICE_TTS_BLACKWELL_POOL_RESCUE_V1";
const LOCK_PATH = "audits/results/avantiqo-voice-tts-controlled-generation.json";
const LOCK_CONTRACT = "AVANTIQO_VOICE_TTS_CONTROLLED_GENERATION_V1";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1";
const REQUIRED_CUDA = "12.8";
const CERTIFIED_IMAGE = "ghcr.io/churchillkaron/avantiqo-voice-tts-worker@sha256:c9ce291cc27bb7de119cf1120a92dd6466962b6d79fd5728a1266a743bad1a06";
const CURRENT_POOL = Object.freeze([
  "NVIDIA GeForce RTX 5090",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
]);
const DESIRED_POOL = Object.freeze([
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
  "NVIDIA GeForce RTX 5090",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
]);
const WORKSTATION_GPU = DESIRED_POOL[0];
const OBSERVE_MS = Math.max(
  60_000,
  Math.min(8 * 60_000, Number(process.env.AVANTIQO_VOICE_TTS_BLACKWELL_POOL_RESCUE_OBSERVE_MS || 240_000)),
);
const POLL_MS = 5_000;

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

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function readJsonResponse(response, label) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1200);
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
  }), "RUNPOD_VOICE_TTS_BLACKWELL_POOL_RESCUE_REST");
}

async function queueRead(endpointId, managementKey, pathname) {
  const inferenceKey = text(process.env.RUNPOD_API_KEY);
  const candidates = unique([inferenceKey, managementKey]);
  let lastError = null;
  for (const credential of candidates) {
    try {
      return await readJsonResponse(await fetch(
        `${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`,
        {
          headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
          signal: AbortSignal.timeout(30_000),
        },
      ), "RUNPOD_VOICE_TTS_BLACKWELL_POOL_RESCUE_QUEUE");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("RUNPOD_VOICE_TTS_BLACKWELL_POOL_RESCUE_QUEUE_CREDENTIAL_REQUIRED");
}

async function controlWorkers(endpointId, managementKey) {
  return readJsonResponse(await fetch(
    `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`,
    {
      headers: { Authorization: `Bearer ${managementKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    },
  ), "RUNPOD_VOICE_TTS_BLACKWELL_POOL_RESCUE_CONTROL");
}

async function endpointBoundTemplates(managementKey) {
  const raw = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  );
  const templates = normalizeListResponse(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VOICE_TTS_BLACKWELL_POOL_RESCUE_TEMPLATE_LIST_INVALID");
  return templates;
}

function resolveTemplate(endpoint, templates) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  const matches = templates.filter((template) => text(template?.id) === templateId);
  if (!templateId || matches.length !== 1) {
    throw new Error(
      `AVANTIQO_VOICE_TTS_BLACKWELL_POOL_RESCUE_TEMPLATE_RESOLUTION_FAILED:${templateId || "missing"}:${matches.length}`,
    );
  }
  return matches[0];
}

async function accountEligibility(managementKey) {
  const query = `
    query AvantiqoVoiceTtsBlackwellPoolRescueAccount {
      myself {
        underBalance
        maxServerlessConcurrency
      }
    }
  `;
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || body?.errors?.length || !body?.data?.myself) {
    const detail = text(body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw).slice(0, 1200);
    throw new Error(`AVANTIQO_VOICE_TTS_BLACKWELL_POOL_RESCUE_ACCOUNT_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  return {
    under_balance: body.data.myself.underBalance === true,
    max_serverless_concurrency: finite(body.data.myself.maxServerlessConcurrency, null),
  };
}

async function workstationAvailability(managementKey) {
  const query = `
    query AvantiqoVoiceTtsBlackwellWorkstationAvailability($input: GpuAvailabilityInput) {
      dataCenters {
        id
        location
        gpuAvailability(input: $input) {
          available
          stockStatus
          gpuTypeId
        }
      }
    }
  `;
  const response = await fetch(`${GRAPHQL_URL}?api_key=${encodeURIComponent(managementKey)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: { input: { gpuCount: 1, minDisk: 5, minMemoryInGb: 1, secureCloud: true } },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || body?.errors?.length || !Array.isArray(body?.data?.dataCenters)) {
    const detail = text(body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw).slice(0, 1200);
    throw new Error(`AVANTIQO_VOICE_TTS_BLACKWELL_POOL_RESCUE_AVAILABILITY_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  const rows = [];
  for (const dc of body.data.dataCenters) {
    for (const gpu of list(dc?.gpuAvailability)) {
      if (text(gpu?.gpuTypeId) !== WORKSTATION_GPU) continue;
      rows.push({
        data_center_id: text(dc?.id) || null,
        location: text(dc?.location) || null,
        available: gpu?.available === true,
        stock_status: text(gpu?.stockStatus).toUpperCase() || "UNKNOWN",
      });
    }
  }
  return rows;
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
    desired_status: text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase() || null,
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    is_stale: worker?.isStale === true,
  }));
}

function activeControlWorkerCount(body = {}) {
  return safeControlWorkers(body).filter(
    (worker) => !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(worker.status),
  ).length;
}

function endpointWorkerCount(endpoint = {}) {
  return list(endpoint?.workers).filter((worker) => {
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    return desired !== "EXITED" && !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(status);
  }).length;
}

function samePool(left, right) {
  return JSON.stringify(list(left)) === JSON.stringify(list(right));
}

function sameMembers(left, right) {
  const a = [...list(left)].sort();
  const b = [...list(right)].sort();
  return JSON.stringify(a) === JSON.stringify(b);
}

function safeEndpoint(endpoint = {}, template = {}) {
  return {
    id: text(endpoint?.id) || null,
    name: text(endpoint?.name) || null,
    version: finite(endpoint?.version),
    template_id: text(endpoint?.templateId || endpoint?.template?.id) || null,
    template_image: text(template?.imageName) || null,
    min_cuda_version: text(endpoint?.minCudaVersion) || null,
    gpu_type_ids: list(endpoint?.gpuTypeIds).map(text).filter(Boolean),
    data_center_ids: list(endpoint?.dataCenterIds).map(text).filter(Boolean),
    network_volume_id: text(endpoint?.networkVolumeId) || null,
    network_volume_ids: list(endpoint?.networkVolumeIds).map(text).filter(Boolean),
    gpu_count: finite(endpoint?.gpuCount),
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    scaler_type: text(endpoint?.scalerType) || null,
    scaler_value: finite(endpoint?.scalerValue),
    idle_timeout_seconds: finite(endpoint?.idleTimeout),
    execution_timeout_ms: finite(endpoint?.executionTimeoutMs),
    flashboot: endpoint?.flashboot === true,
  };
}

async function readState(endpointId, jobId, managementKey) {
  const [endpoint, templates, statusRaw, healthRaw, controlRaw] = await Promise.all([
    rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
    endpointBoundTemplates(managementKey),
    queueRead(endpointId, managementKey, `/status/${encodeURIComponent(jobId)}`),
    queueRead(endpointId, managementKey, "/health"),
    controlWorkers(endpointId, managementKey),
  ]);
  const template = resolveTemplate(endpoint, templates);
  return {
    endpoint: safeEndpoint(endpoint, template),
    status: text(statusRaw?.status).toUpperCase() || "UNKNOWN",
    health: healthSummary(healthRaw),
    control_raw: controlRaw,
    control_workers: safeControlWorkers(controlRaw),
  };
}

async function accountWorkerSnapshot(managementKey) {
  const endpointsRaw = await rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey);
  const endpoints = normalizeListResponse(endpointsRaw, ["endpoints"]) || [];
  const rows = [];
  for (const endpoint of endpoints) {
    let control = null;
    try {
      control = await controlWorkers(text(endpoint?.id), managementKey);
    } catch {
      control = null;
    }
    rows.push({
      endpoint_id: text(endpoint?.id) || null,
      endpoint_name: text(endpoint?.name) || null,
      active_control_workers: control ? activeControlWorkerCount(control) : endpointWorkerCount(endpoint),
    });
  }
  return {
    endpoint_count: rows.length,
    total_active_workers: rows.reduce((sum, row) => sum + Number(row.active_control_workers || 0), 0),
    endpoints_with_active_workers: rows.filter((row) => Number(row.active_control_workers) > 0),
  };
}

function assertStable(state, endpointId) {
  const endpoint = state.endpoint;
  if (endpoint.id !== endpointId || endpoint.name !== ENDPOINT_NAME) {
    throw new Error("AVANTIQO_VOICE_TTS_BLACKWELL_POOL_RESCUE_ENDPOINT_MISMATCH");
  }
  if (endpoint.template_image !== CERTIFIED_IMAGE) {
    throw new Error("AVANTIQO_VOICE_TTS_BLACKWELL_POOL_RESCUE_IMAGE_MISMATCH");
  }
  if (endpoint.min_cuda_version !== REQUIRED_CUDA) {
    throw new Error("AVANTIQO_VOICE_TTS_BLACKWELL_POOL_RESCUE_CUDA_MISMATCH");
  }
  if (endpoint.gpu_count !== 1 || endpoint.workers_max !== 1) {
    throw new Error("AVANTIQO_VOICE_TTS_BLACKWELL_POOL_RESCUE_SCALING_MISMATCH");
  }
  if (endpoint.data_center_ids.length || endpoint.network_volume_id || endpoint.network_volume_ids.length) {
    throw new Error("AVANTIQO_VOICE_TTS_BLACKWELL_POOL_RESCUE_GLOBAL_PLACEMENT_REQUIRED");
  }
  if (!sameMembers(endpoint.gpu_type_ids, CURRENT_POOL) && !sameMembers(endpoint.gpu_type_ids, DESIRED_POOL)) {
    throw new Error(`AVANTIQO_VOICE_TTS_BLACKWELL_POOL_RESCUE_UNEXPECTED_GPU_POOL:${endpoint.gpu_type_ids.join(",")}`);
  }
  if (![0, 1].includes(endpoint.workers_min)) {
    throw new Error(`AVANTIQO_VOICE_TTS_BLACKWELL_POOL_RESCUE_UNEXPECTED_WORKERS_MIN:${endpoint.workers_min}`);
  }
}

const lock = JSON.parse(await readFile(LOCK_PATH, "utf8"));
if (lock?.contract !== LOCK_CONTRACT) throw new Error("AVANTIQO_VOICE_TTS_BLACKWELL_POOL_RESCUE_LOCK_CONTRACT_MISMATCH");
if (lock?.generation_submitted !== true || Number(lock?.accepted_generation_count) !== 1) {
  throw new Error("AVANTIQO_VOICE_TTS_BLACKWELL_POOL_RESCUE_ONE_ACCEPTED_GENERATION_REQUIRED");
}
if (lock?.new_generation_allowed !== false || lock?.stt_submitted !== false) {
  throw new Error("AVANTIQO_VOICE_TTS_BLACKWELL_POOL_RESCUE_GENERATION_LOCK_REQUIRED");
}
if (text(lock?.endpoint_name) !== ENDPOINT_NAME || text(lock?.immutable_image_reference) !== CERTIFIED_IMAGE) {
  throw new Error("AVANTIQO_VOICE_TTS_BLACKWELL_POOL_RESCUE_LOCK_BINDING_MISMATCH");
}

const endpointId = text(lock?.endpoint_id);
const jobId = text(lock?.job_id);
if (!endpointId || !jobId) throw new Error("AVANTIQO_VOICE_TTS_BLACKWELL_POOL_RESCUE_LOCK_IDS_REQUIRED");

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const apply = process.argv.includes("--apply");
const approved = text(process.env.AVANTIQO_VOICE_TTS_BLACKWELL_POOL_RESCUE_APPROVED).toUpperCase() === "YES";
if (apply && !approved) {
  throw new Error("AVANTIQO_VOICE_TTS_BLACKWELL_POOL_RESCUE_APPROVED=YES_REQUIRED");
}

const [initial, eligibility, workerSnapshot, workstationCapacity] = await Promise.all([
  readState(endpointId, jobId, managementKey),
  accountEligibility(managementKey),
  accountWorkerSnapshot(managementKey),
  workstationAvailability(managementKey),
]);
assertStable(initial, endpointId);

const liveWorkstationCapacity = workstationCapacity.filter((row) => row.available);
const concurrencyRemaining = eligibility.max_serverless_concurrency === null
  ? null
  : eligibility.max_serverless_concurrency - workerSnapshot.total_active_workers;

const base = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  accepted_generation_count: 1,
  generation_submitted: false,
  new_generation_allowed: false,
  endpoint_mutation_performed: false,
  queue_mutation_performed: false,
  queue_purged: false,
  job_cancelled: false,
  stt_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
  endpoint_id: endpointId,
  job_id: jobId,
  job_status_before: initial.status,
  endpoint_before: initial.endpoint,
  health_before: initial.health,
  control_workers_before: initial.control_workers,
  account: {
    under_balance: eligibility.under_balance,
    max_serverless_concurrency: eligibility.max_serverless_concurrency,
    active_workers: workerSnapshot.total_active_workers,
    concurrency_remaining: concurrencyRemaining,
  },
  workstation_capacity: workstationCapacity,
  live_workstation_capacity_count: liveWorkstationCapacity.length,
  desired_gpu_pool: DESIRED_POOL,
  wake_workers_min: 1,
};

if (initial.status !== "IN_QUEUE") {
  console.log(JSON.stringify({ ...base, next_action: "RESUME_EXISTING_ACCEPTED_JOB_ONLY" }, null, 2));
  process.exit(0);
}
if (activeControlWorkerCount(initial.control_raw) > 0 || Object.values(initial.health.workers).some((value) => value > 0)) {
  console.log(JSON.stringify({ ...base, next_action: "WORKER_ALREADY_EXISTS_RESUME_EXISTING_ACCEPTED_JOB_ONLY" }, null, 2));
  process.exit(0);
}
if (eligibility.under_balance) {
  throw new Error("AVANTIQO_VOICE_TTS_BLACKWELL_POOL_RESCUE_ACCOUNT_UNDER_BALANCE");
}
if (concurrencyRemaining !== null && concurrencyRemaining <= 0) {
  throw new Error("AVANTIQO_VOICE_TTS_BLACKWELL_POOL_RESCUE_NO_SERVERLESS_CONCURRENCY_AVAILABLE");
}
if (!liveWorkstationCapacity.length) {
  console.log(JSON.stringify({
    ...base,
    diagnosis: "NO_LIVE_BLACKWELL_WORKSTATION_CAPACITY",
    next_action: "DO_NOT_MUTATE_RECHECK_BLACKWELL_CAPACITY_LATER",
  }, null, 2));
  process.exit(0);
}

if (!apply) {
  console.log(JSON.stringify({
    ...base,
    diagnosis: "BLACKWELL_WORKSTATION_FALLBACK_AVAILABLE",
    next_action: "APPLY_EXISTING_JOB_BLACKWELL_POOL_RESCUE",
  }, null, 2));
  process.exit(0);
}

const currentPoolAlreadyDesired = samePool(initial.endpoint.gpu_type_ids, DESIRED_POOL);
const patchBody = {
  ...(currentPoolAlreadyDesired ? {} : { gpuTypeIds: DESIRED_POOL }),
  workersMin: 1,
};
await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
  method: "PATCH",
  body: patchBody,
});

const afterPatch = await readState(endpointId, jobId, managementKey);
assertStable(afterPatch, endpointId);
if (!sameMembers(afterPatch.endpoint.gpu_type_ids, DESIRED_POOL)) {
  throw new Error(`AVANTIQO_VOICE_TTS_BLACKWELL_POOL_RESCUE_GPU_VERIFY_FAILED:${afterPatch.endpoint.gpu_type_ids.join(",")}`);
}
if (afterPatch.endpoint.workers_min !== 1) {
  throw new Error(`AVANTIQO_VOICE_TTS_BLACKWELL_POOL_RESCUE_WORKERS_MIN_VERIFY_FAILED:${afterPatch.endpoint.workers_min}`);
}

const deadline = Date.now() + OBSERVE_MS;
let observed = afterPatch;
let workerObserved = activeControlWorkerCount(afterPatch.control_raw) > 0 || Object.values(afterPatch.health.workers).some((value) => value > 0);
while (Date.now() < deadline && observed.status === "IN_QUEUE") {
  if (workerObserved) {
    await sleep(POLL_MS);
  } else {
    await sleep(POLL_MS);
  }
  observed = await readState(endpointId, jobId, managementKey);
  assertStable(observed, endpointId);
  workerObserved = workerObserved || activeControlWorkerCount(observed.control_raw) > 0 || Object.values(observed.health.workers).some((value) => value > 0);
  console.log(JSON.stringify({
    event: "AVANTIQO_VOICE_TTS_BLACKWELL_POOL_RESCUE_PROGRESS",
    job_id: jobId,
    status: observed.status,
    worker_observed: workerObserved,
    health_workers: observed.health.workers,
    control_workers: observed.control_workers,
    secrets_printed: false,
  }));
}

let workersMinRestoreAttempted = false;
let workersMinRestoredToZero = false;
let workersMinRestoreError = null;
try {
  workersMinRestoreAttempted = true;
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMin: 0 },
  });
  const restored = await readState(endpointId, jobId, managementKey);
  workersMinRestoredToZero = restored.endpoint.workers_min === 0;
  observed = restored;
} catch (error) {
  workersMinRestoreError = text(error?.message || error).slice(0, 800);
}

let diagnosis = "BLACKWELL_WORKSTATION_POOL_RESTORED_BUT_WORKER_NOT_OBSERVED";
let nextAction = "RUNPOD_ENDPOINT_SCHEDULER_FAILURE_PERSISTS_NO_NEW_JOB";
if (observed.status !== "IN_QUEUE") {
  diagnosis = "EXISTING_ACCEPTED_JOB_LEFT_QUEUE_AFTER_BLACKWELL_POOL_RESCUE";
  nextAction = "RESUME_EXISTING_ACCEPTED_JOB_ONLY";
} else if (workerObserved) {
  diagnosis = "BLACKWELL_WORKER_PROVISIONING_OBSERVED_FOR_EXISTING_JOB";
  nextAction = "RESUME_EXISTING_ACCEPTED_JOB_ONLY";
}

console.log(JSON.stringify({
  ...base,
  endpoint_mutation_performed: true,
  gpu_pool_patch_performed: !currentPoolAlreadyDesired,
  workers_min_patch_performed: true,
  job_status_after: observed.status,
  endpoint_after: observed.endpoint,
  health_after: observed.health,
  control_workers_after: observed.control_workers,
  worker_provisioning_observed: workerObserved,
  workers_min_restore_attempted: workersMinRestoreAttempted,
  workers_min_restored_to_zero: workersMinRestoredToZero,
  workers_min_restore_error: workersMinRestoreError,
  diagnosis,
  safe_to_submit_duplicate_job: false,
  next_action: nextAction,
}, null, 2));
