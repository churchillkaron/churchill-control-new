import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTROL_BASE = "https://api.runpod.io/v2";
const CONTRACT = "AVANTIQO_VOICE_TTS_EXISTING_JOB_WAKE_V1";
const LOCK_PATH = "audits/results/avantiqo-voice-tts-controlled-generation.json";
const LOCK_CONTRACT = "AVANTIQO_VOICE_TTS_CONTROLLED_GENERATION_V1";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1";
const REQUIRED_CUDA = "12.8";
const CERTIFIED_IMAGE = "ghcr.io/churchillkaron/avantiqo-voice-tts-worker@sha256:c9ce291cc27bb7de119cf1120a92dd6466962b6d79fd5728a1266a743bad1a06";
const SERVERLESS_SM120_GPU_IDS = Object.freeze([
  "NVIDIA GeForce RTX 5090",
  "NVIDIA GeForce RTX 5080",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
]);
const OBSERVE_MS = Math.max(
  60_000,
  Math.min(5 * 60_000, Number(process.env.AVANTIQO_VOICE_TTS_EXISTING_JOB_WAKE_OBSERVE_MS || 180_000)),
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

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
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
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
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
  }), "RUNPOD_VOICE_TTS_EXISTING_JOB_WAKE_REST");
}

async function queue(endpointId, inferenceKey, pathname) {
  return readJsonResponse(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    headers: {
      Authorization: `Bearer ${inferenceKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_EXISTING_JOB_WAKE_QUEUE");
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
  ), "RUNPOD_VOICE_TTS_EXISTING_JOB_WAKE_CONTROL");
}

async function endpointBoundTemplates(managementKey) {
  const raw = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  );
  const templates = normalizeListResponse(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VOICE_TTS_EXISTING_JOB_WAKE_TEMPLATE_LIST_INVALID");
  return templates;
}

function resolveTemplate(endpoint, templates) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  const matches = templates.filter((template) => text(template?.id) === templateId);
  if (!templateId || matches.length !== 1) {
    throw new Error(
      `AVANTIQO_VOICE_TTS_EXISTING_JOB_WAKE_TEMPLATE_RESOLUTION_FAILED:${templateId || "missing"}:${matches.length}`,
    );
  }
  return matches[0];
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

function workerCountFromManagementEndpoint(endpoint = {}) {
  const workers = list(endpoint?.workers);
  return workers.filter((worker) => {
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    return desired !== "EXITED" && !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(status);
  }).length;
}

function quotaSnapshot(endpointsRaw) {
  const endpoints = normalizeListResponse(endpointsRaw, ["endpoints"]) || [];
  const rows = endpoints.map((endpoint) => ({
    name: text(endpoint?.name) || null,
    workers_min: finite(endpoint?.workersMin, 0),
    workers_max: finite(endpoint?.workersMax, 0),
    management_non_exited_workers: workerCountFromManagementEndpoint(endpoint),
  }));
  return {
    endpoint_count: rows.length,
    configured_workers_min_total: rows.reduce((sum, row) => sum + Number(row.workers_min || 0), 0),
    configured_workers_max_total: rows.reduce((sum, row) => sum + Number(row.workers_max || 0), 0),
    current_management_non_exited_worker_count: rows.reduce(
      (sum, row) => sum + row.management_non_exited_workers,
      0,
    ),
    endpoints_with_non_exited_workers: rows.filter((row) => row.management_non_exited_workers > 0),
    note: "Runpod account balance controls the actual combined flex plus active worker quota; this snapshot does not infer the account-specific quota.",
  };
}

async function readState(endpointId, jobId, managementKey, inferenceKey) {
  const [endpoint, templates, statusRaw, healthRaw, workersRaw, endpointsRaw] = await Promise.all([
    rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
    endpointBoundTemplates(managementKey),
    queue(endpointId, inferenceKey, `/status/${encodeURIComponent(jobId)}`),
    queue(endpointId, inferenceKey, "/health"),
    controlWorkers(endpointId, managementKey),
    rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey),
  ]);
  const template = resolveTemplate(endpoint, templates);
  return {
    endpoint: safeEndpoint(endpoint, template),
    status_raw: statusRaw,
    status: text(statusRaw?.status).toUpperCase() || "UNKNOWN",
    health: healthSummary(healthRaw),
    workers_raw: workersRaw,
    workers: safeControlWorkers(workersRaw),
    quota: quotaSnapshot(endpointsRaw),
  };
}

function anyHealthWorker(health) {
  return Object.values(health?.workers || {}).some((value) => Number(value) > 0);
}

function assertEndpointStableForWake(state, endpointId) {
  const endpoint = state.endpoint;
  if (endpoint.id !== endpointId || endpoint.name !== ENDPOINT_NAME) {
    throw new Error("AVANTIQO_VOICE_TTS_EXISTING_JOB_WAKE_ENDPOINT_BINDING_MISMATCH");
  }
  if (endpoint.template_image !== CERTIFIED_IMAGE) {
    throw new Error("AVANTIQO_VOICE_TTS_EXISTING_JOB_WAKE_IMAGE_MISMATCH");
  }
  if (endpoint.min_cuda_version !== REQUIRED_CUDA) {
    throw new Error("AVANTIQO_VOICE_TTS_EXISTING_JOB_WAKE_CUDA_MISMATCH");
  }
  if (endpoint.gpu_count !== 1 || endpoint.workers_max !== 1) {
    throw new Error("AVANTIQO_VOICE_TTS_EXISTING_JOB_WAKE_SCALING_MISMATCH");
  }
  if (endpoint.data_center_ids.length || endpoint.network_volume_id || endpoint.network_volume_ids.length) {
    throw new Error("AVANTIQO_VOICE_TTS_EXISTING_JOB_WAKE_GLOBAL_PLACEMENT_REQUIRED");
  }
  if (!endpoint.gpu_type_ids.length) {
    throw new Error("AVANTIQO_VOICE_TTS_EXISTING_JOB_WAKE_GPU_POOL_REQUIRED");
  }
  const unsupported = endpoint.gpu_type_ids.filter((id) => !SERVERLESS_SM120_GPU_IDS.includes(id));
  if (unsupported.length) {
    throw new Error(`AVANTIQO_VOICE_TTS_EXISTING_JOB_WAKE_UNSUPPORTED_GPU_POOL:${unsupported.join(",")}`);
  }
}

async function setWorkersMin(endpointId, managementKey, workersMin) {
  return rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMin },
  });
}

const lock = JSON.parse(await readFile(LOCK_PATH, "utf8"));
if (lock?.contract !== LOCK_CONTRACT) throw new Error("AVANTIQO_VOICE_TTS_EXISTING_JOB_WAKE_LOCK_CONTRACT_MISMATCH");
if (lock?.generation_submitted !== true || Number(lock?.accepted_generation_count) !== 1) {
  throw new Error("AVANTIQO_VOICE_TTS_EXISTING_JOB_WAKE_ONE_ACCEPTED_GENERATION_REQUIRED");
}
if (lock?.new_generation_allowed !== false || lock?.stt_submitted !== false) {
  throw new Error("AVANTIQO_VOICE_TTS_EXISTING_JOB_WAKE_GENERATION_LOCK_REQUIRED");
}

const endpointId = text(lock.endpoint_id);
const jobId = text(lock.job_id);
if (!endpointId || !jobId) throw new Error("AVANTIQO_VOICE_TTS_EXISTING_JOB_WAKE_LOCK_IDS_REQUIRED");

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = required("RUNPOD_API_KEY");
const apply = process.argv.includes("--apply");
const approved = text(process.env.AVANTIQO_VOICE_TTS_EXISTING_JOB_WAKE_APPROVED).toUpperCase() === "YES";
if (apply && !approved) {
  throw new Error("AVANTIQO_VOICE_TTS_EXISTING_JOB_WAKE_APPROVED=YES_REQUIRED");
}

const initial = await readState(endpointId, jobId, managementKey, inferenceKey);
assertEndpointStableForWake(initial, endpointId);

const base = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  accepted_generation_count: 1,
  new_generation_submitted: false,
  new_generation_allowed: false,
  queue_purged: false,
  job_cancelled: false,
  stt_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
  job_id: jobId,
  job_status_before: initial.status,
  endpoint_before: initial.endpoint,
  health_before: initial.health,
  control_workers_before: initial.workers,
  account_worker_snapshot_before: initial.quota,
  endpoint_mutation_performed: false,
  wake_workers_min_requested: 1,
};

if (initial.status !== "IN_QUEUE") {
  console.log(JSON.stringify({
    ...base,
    next_action: "RESUME_EXISTING_ACCEPTED_JOB_ONLY",
  }, null, 2));
  process.exit(0);
}

if (activeControlWorkers(initial.workers_raw).length > 0 || anyHealthWorker(initial.health)) {
  console.log(JSON.stringify({
    ...base,
    next_action: "WORKER_ALREADY_EXISTS_RESUME_EXISTING_ACCEPTED_JOB_ONLY",
  }, null, 2));
  process.exit(0);
}

if (initial.endpoint.workers_min === 1) {
  console.log(JSON.stringify({
    ...base,
    diagnosis: "ACTIVE_WORKER_ALREADY_REQUESTED_BUT_CONTROL_PLANE_HAS_ZERO_WORKERS",
    next_action: "RUNPOD_ACCOUNT_OR_CONTROL_PLANE_BLOCKER_CONFIRMED",
  }, null, 2));
  process.exit(0);
}

if (initial.endpoint.workers_min !== 0) {
  throw new Error(`AVANTIQO_VOICE_TTS_EXISTING_JOB_WAKE_UNEXPECTED_WORKERS_MIN:${initial.endpoint.workers_min}`);
}

if (!apply) {
  console.log(JSON.stringify({
    ...base,
    next_action: "APPLY_ONE_ACTIVE_WORKER_TO_WAKE_EXISTING_JOB",
  }, null, 2));
  process.exit(0);
}

const fresh = await readState(endpointId, jobId, managementKey, inferenceKey);
assertEndpointStableForWake(fresh, endpointId);
if (fresh.status !== "IN_QUEUE" || fresh.health.jobs.in_progress > 0) {
  console.log(JSON.stringify({
    ...base,
    mode: "APPLY",
    job_status_after_recheck: fresh.status,
    endpoint_after_recheck: fresh.endpoint,
    health_after_recheck: fresh.health,
    next_action: "JOB_CHANGED_BEFORE_WAKE_RESUME_EXISTING_ACCEPTED_JOB_ONLY",
  }, null, 2));
  process.exit(0);
}
if (activeControlWorkers(fresh.workers_raw).length > 0 || anyHealthWorker(fresh.health)) {
  console.log(JSON.stringify({
    ...base,
    mode: "APPLY",
    job_status_after_recheck: fresh.status,
    endpoint_after_recheck: fresh.endpoint,
    health_after_recheck: fresh.health,
    control_workers_after_recheck: fresh.workers,
    next_action: "WORKER_STARTED_BEFORE_WAKE_RESUME_EXISTING_ACCEPTED_JOB_ONLY",
  }, null, 2));
  process.exit(0);
}

try {
  await setWorkersMin(endpointId, managementKey, 1);
} catch (error) {
  console.log(JSON.stringify({
    ...base,
    success: false,
    mode: "APPLY",
    endpoint_mutation_performed: false,
    wake_patch_rejected: true,
    wake_patch_error: text(error?.message || error).slice(0, 1200),
    diagnosis: "RUNPOD_REJECTED_ONE_ACTIVE_WORKER_REQUEST",
    next_action: "INSPECT_ACCOUNT_WORKER_QUOTA_OR_RUNPOD_CONTROL_PLANE",
  }, null, 2));
  process.exitCode = 1;
  process.exit();
}

let last = await readState(endpointId, jobId, managementKey, inferenceKey);
let workerProvisioningObserved = false;
const deadline = Date.now() + OBSERVE_MS;
while (Date.now() < deadline) {
  assertEndpointStableForWake(last, endpointId);
  workerProvisioningObserved =
    last.status !== "IN_QUEUE" ||
    last.health.jobs.in_progress > 0 ||
    activeControlWorkers(last.workers_raw).length > 0 ||
    anyHealthWorker(last.health);
  if (workerProvisioningObserved) break;
  await sleep(POLL_MS);
  last = await readState(endpointId, jobId, managementKey, inferenceKey);
}

let workersMinRestoredToZero = false;
let restoreAttempted = false;
let restoreError = null;
const jobHasStartedOrFinished = last.status !== "IN_QUEUE" || last.health.jobs.in_progress > 0;
const noWorkerAfterObservation =
  last.status === "IN_QUEUE" &&
  last.health.jobs.in_progress === 0 &&
  activeControlWorkers(last.workers_raw).length === 0 &&
  !anyHealthWorker(last.health);

if (jobHasStartedOrFinished || noWorkerAfterObservation) {
  const beforeRestore = await readState(endpointId, jobId, managementKey, inferenceKey);
  assertEndpointStableForWake(beforeRestore, endpointId);
  const safeToRestore =
    beforeRestore.endpoint.workers_min === 1 &&
    (
      beforeRestore.status !== "IN_QUEUE" ||
      beforeRestore.health.jobs.in_progress > 0 ||
      (
        beforeRestore.status === "IN_QUEUE" &&
        beforeRestore.health.jobs.in_progress === 0 &&
        activeControlWorkers(beforeRestore.workers_raw).length === 0 &&
        !anyHealthWorker(beforeRestore.health)
      )
    );
  if (safeToRestore) {
    restoreAttempted = true;
    try {
      await setWorkersMin(endpointId, managementKey, 0);
      const restored = await readState(endpointId, jobId, managementKey, inferenceKey);
      assertEndpointStableForWake(restored, endpointId);
      workersMinRestoredToZero = restored.endpoint.workers_min === 0;
      last = restored;
    } catch (error) {
      restoreError = text(error?.message || error).slice(0, 1200);
    }
  }
}

let diagnosis = "FORCED_ACTIVE_WORKER_REQUEST_DID_NOT_CREATE_WORKER";
let nextAction = "RUNPOD_ACCOUNT_OR_CONTROL_PLANE_BLOCKER_CONFIRMED";
if (last.status !== "IN_QUEUE" || last.health.jobs.in_progress > 0) {
  diagnosis = "EXISTING_ACCEPTED_JOB_LEFT_QUEUE_AFTER_ACTIVE_WORKER_WAKE";
  nextAction = "RESUME_EXISTING_ACCEPTED_JOB_ONLY";
} else if (activeControlWorkers(last.workers_raw).length > 0 || anyHealthWorker(last.health)) {
  diagnosis = "WORKER_PROVISIONING_STARTED_FOR_EXISTING_ACCEPTED_JOB";
  nextAction = "RESUME_EXISTING_ACCEPTED_JOB_ONLY";
}

console.log(JSON.stringify({
  ...base,
  mode: "APPLY",
  endpoint_mutation_performed: true,
  wake_patch_accepted: true,
  worker_provisioning_observed: workerProvisioningObserved,
  job_status_after: last.status,
  endpoint_after: last.endpoint,
  health_after: last.health,
  control_workers_after: last.workers,
  account_worker_snapshot_after: last.quota,
  workers_min_restore_attempted: restoreAttempted,
  workers_min_restored_to_zero: workersMinRestoredToZero,
  workers_min_restore_error: restoreError,
  accepted_generation_count: 1,
  new_generation_submitted: false,
  new_generation_allowed: false,
  queue_purged: false,
  job_cancelled: false,
  stt_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
  diagnosis,
  next_action: nextAction,
}, null, 2));
