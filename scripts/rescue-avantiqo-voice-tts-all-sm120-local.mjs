import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const CONTROL = "https://api.runpod.io/v2";
const GQL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_VOICE_TTS_ALL_SM120_RESCUE_V1";
const LOCK_PATH = "audits/results/avantiqo-voice-tts-controlled-generation.json";
const LOCK_CONTRACT = "AVANTIQO_VOICE_TTS_CONTROLLED_GENERATION_V1";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1";
const REQUIRED_CUDA = "12.8";
const CERTIFIED_IMAGE = "ghcr.io/churchillkaron/avantiqo-voice-tts-worker@sha256:c9ce291cc27bb7de119cf1120a92dd6466962b6d79fd5728a1266a743bad1a06";
const ALLOWED_BEFORE = [
  ["NVIDIA GeForce RTX 5090", "NVIDIA RTX PRO 6000 Blackwell Server Edition"],
  [
    "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
    "NVIDIA GeForce RTX 5090",
    "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  ],
];
const ALL_SM120 = Object.freeze([
  "NVIDIA GeForce RTX 5080",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
  "NVIDIA GeForce RTX 5090",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
]);
const OBSERVE_MS = Math.max(
  60_000,
  Math.min(8 * 60_000, Number(process.env.AVANTIQO_VOICE_TTS_ALL_SM120_RESCUE_OBSERVE_MS || 240_000)),
);
const POLL_MS = 5_000;

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
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sameMembers(a, b) {
  return JSON.stringify([...list(a)].sort()) === JSON.stringify([...list(b)].sort());
}
function allowedBefore(pool) {
  return ALLOWED_BEFORE.some((candidate) => sameMembers(pool, candidate)) || sameMembers(pool, ALL_SM120);
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
  }), "RUNPOD_ALL_SM120_REST");
}
async function queueRead(endpointId, key, path) {
  const candidates = [text(process.env.RUNPOD_API_KEY), key].filter(Boolean);
  let last = null;
  for (const credential of [...new Set(candidates)]) {
    try {
      return await readJson(await fetch(`${QUEUE}/${encodeURIComponent(endpointId)}${path}`, {
        headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      }), "RUNPOD_ALL_SM120_QUEUE");
    } catch (error) {
      last = error;
      if (![401, 403].includes(Number(error?.httpStatus))) throw error;
    }
  }
  throw last || new Error("RUNPOD_ALL_SM120_QUEUE_CREDENTIAL_REQUIRED");
}
async function controlWorkers(endpointId, key) {
  return readJson(await fetch(`${CONTROL}/serverless/${encodeURIComponent(endpointId)}/workers`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_ALL_SM120_CONTROL");
}
async function endpointBoundTemplates(key) {
  const raw = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    key,
  );
  const templates = normalizeListResponse(raw, ["templates"]);
  if (!templates) throw new Error("RUNPOD_ALL_SM120_TEMPLATE_LIST_INVALID");
  return templates;
}
function resolveTemplate(endpoint, templates) {
  const id = text(endpoint?.templateId || endpoint?.template?.id);
  const matches = templates.filter((template) => text(template?.id) === id);
  if (!id || matches.length !== 1) {
    throw new Error(`RUNPOD_ALL_SM120_TEMPLATE_RESOLUTION_FAILED:${id || "missing"}:${matches.length}`);
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
function safeWorkers(body = {}) {
  return list(body?.workers).map((worker) => ({
    id_present: Boolean(text(worker?.id)),
    status: text(worker?.status).toUpperCase() || null,
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
async function account(key) {
  const query = `query AvantiqoVoiceAllSm120Account { myself { underBalance maxServerlessConcurrency } }`;
  const response = await fetch(GQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
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
    const detail = text(body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw).slice(0, 1000);
    throw new Error(`RUNPOD_ALL_SM120_ACCOUNT_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  return {
    under_balance: body.data.myself.underBalance === true,
    max_serverless_concurrency: finite(body.data.myself.maxServerlessConcurrency, null),
  };
}
async function capacity(key) {
  const query = `
    query AvantiqoVoiceAllSm120Capacity($input: GpuAvailabilityInput) {
      dataCenters {
        id
        location
        gpuAvailability(input: $input) { available stockStatus gpuTypeId }
      }
    }
  `;
  const response = await fetch(`${GQL}?api_key=${encodeURIComponent(key)}`, {
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
    const detail = text(body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw).slice(0, 1000);
    throw new Error(`RUNPOD_ALL_SM120_CAPACITY_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  const rows = [];
  for (const dc of body.data.dataCenters) {
    for (const gpu of list(dc?.gpuAvailability)) {
      const id = text(gpu?.gpuTypeId);
      if (!ALL_SM120.includes(id)) continue;
      rows.push({
        data_center_id: text(dc?.id) || null,
        location: text(dc?.location) || null,
        gpu_type_id: id,
        available: gpu?.available === true,
        stock_status: text(gpu?.stockStatus).toUpperCase() || "UNKNOWN",
      });
    }
  }
  return rows;
}
async function readState(endpointId, jobId, key) {
  const [endpoint, templates, statusRaw, healthRaw, workersRaw] = await Promise.all([
    rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, key),
    endpointBoundTemplates(key),
    queueRead(endpointId, key, `/status/${encodeURIComponent(jobId)}`),
    queueRead(endpointId, key, "/health"),
    controlWorkers(endpointId, key),
  ]);
  const template = resolveTemplate(endpoint, templates);
  return {
    endpoint: safeEndpoint(endpoint, template),
    status: text(statusRaw?.status).toUpperCase() || "UNKNOWN",
    health: healthSummary(healthRaw),
    workers_raw: workersRaw,
    workers: safeWorkers(workersRaw),
  };
}
function assertStable(state, endpointId) {
  const e = state.endpoint;
  if (e.id !== endpointId || e.name !== ENDPOINT_NAME) throw new Error("RUNPOD_ALL_SM120_ENDPOINT_MISMATCH");
  if (e.template_image !== CERTIFIED_IMAGE) throw new Error("RUNPOD_ALL_SM120_IMAGE_MISMATCH");
  if (e.min_cuda_version !== REQUIRED_CUDA) throw new Error("RUNPOD_ALL_SM120_CUDA_MISMATCH");
  if (e.gpu_count !== 1 || e.workers_max !== 1) throw new Error("RUNPOD_ALL_SM120_SCALING_MISMATCH");
  if (e.data_center_ids.length || e.network_volume_id || e.network_volume_ids.length) {
    throw new Error("RUNPOD_ALL_SM120_GLOBAL_PLACEMENT_REQUIRED");
  }
  if (!allowedBefore(e.gpu_type_ids)) {
    throw new Error(`RUNPOD_ALL_SM120_UNEXPECTED_GPU_POOL:${e.gpu_type_ids.join(",")}`);
  }
  if (e.workers_min !== 0) {
    throw new Error(`RUNPOD_ALL_SM120_REQUIRES_PREVIOUS_RESCUE_FINISHED:workersMin=${e.workers_min}`);
  }
}

const lock = JSON.parse(await readFile(LOCK_PATH, "utf8"));
if (lock?.contract !== LOCK_CONTRACT) throw new Error("RUNPOD_ALL_SM120_LOCK_CONTRACT_MISMATCH");
if (lock?.generation_submitted !== true || Number(lock?.accepted_generation_count) !== 1) {
  throw new Error("RUNPOD_ALL_SM120_ONE_ACCEPTED_GENERATION_REQUIRED");
}
if (lock?.new_generation_allowed !== false || lock?.stt_submitted !== false) {
  throw new Error("RUNPOD_ALL_SM120_GENERATION_LOCK_REQUIRED");
}
if (text(lock?.endpoint_name) !== ENDPOINT_NAME || text(lock?.immutable_image_reference) !== CERTIFIED_IMAGE) {
  throw new Error("RUNPOD_ALL_SM120_LOCK_BINDING_MISMATCH");
}
const endpointId = text(lock?.endpoint_id);
const jobId = text(lock?.job_id);
if (!endpointId || !jobId) throw new Error("RUNPOD_ALL_SM120_LOCK_IDS_REQUIRED");

const key = required("RUNPOD_MANAGEMENT_API_KEY");
const apply = process.argv.includes("--apply");
const approved = text(process.env.AVANTIQO_VOICE_TTS_ALL_SM120_RESCUE_APPROVED).toUpperCase() === "YES";
if (apply && !approved) throw new Error("AVANTIQO_VOICE_TTS_ALL_SM120_RESCUE_APPROVED=YES_REQUIRED");

const [initial, accountState, capacityRows] = await Promise.all([
  readState(endpointId, jobId, key),
  account(key),
  capacity(key),
]);
assertStable(initial, endpointId);
const live = capacityRows.filter((row) => row.available);
const liveTypes = [...new Set(live.map((row) => row.gpu_type_id))];

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
  control_workers_before: initial.workers,
  account: accountState,
  all_sm120_pool: ALL_SM120,
  live_sm120_types: liveTypes,
  live_sm120_capacity: live,
};

if (initial.status !== "IN_QUEUE") {
  console.log(JSON.stringify({ ...base, next_action: "RESUME_EXISTING_ACCEPTED_JOB_ONLY" }, null, 2));
  process.exit(0);
}
if (activeWorkerCount(initial.workers_raw) > 0 || Object.values(initial.health.workers).some((value) => value > 0)) {
  console.log(JSON.stringify({ ...base, next_action: "WORKER_ALREADY_EXISTS_RESUME_EXISTING_ACCEPTED_JOB_ONLY" }, null, 2));
  process.exit(0);
}
if (accountState.under_balance) throw new Error("RUNPOD_ALL_SM120_ACCOUNT_UNDER_BALANCE");
if (!liveTypes.length) {
  console.log(JSON.stringify({
    ...base,
    diagnosis: "NO_LIVE_SM120_CAPACITY",
    next_action: "DO_NOT_MUTATE_ESCALATE_RUNPOD_CAPACITY",
  }, null, 2));
  process.exit(0);
}
if (!apply) {
  console.log(JSON.stringify({
    ...base,
    diagnosis: "LIVE_SM120_FALLBACKS_AVAILABLE",
    next_action: "APPLY_ALL_SM120_RESCUE_TO_EXISTING_JOB_ONLY",
  }, null, 2));
  process.exit(0);
}

await rest(`/endpoints/${encodeURIComponent(endpointId)}`, key, {
  method: "PATCH",
  body: { gpuTypeIds: ALL_SM120, workersMin: 1 },
});
const afterPatch = await readState(endpointId, jobId, key);
if (!sameMembers(afterPatch.endpoint.gpu_type_ids, ALL_SM120)) {
  throw new Error(`RUNPOD_ALL_SM120_GPU_VERIFY_FAILED:${afterPatch.endpoint.gpu_type_ids.join(",")}`);
}
if (afterPatch.endpoint.workers_min !== 1) {
  throw new Error(`RUNPOD_ALL_SM120_WORKERS_MIN_VERIFY_FAILED:${afterPatch.endpoint.workers_min}`);
}

let observed = afterPatch;
let workerObserved = activeWorkerCount(observed.workers_raw) > 0 || Object.values(observed.health.workers).some((value) => value > 0);
const deadline = Date.now() + OBSERVE_MS;
while (Date.now() < deadline && observed.status === "IN_QUEUE") {
  await sleep(POLL_MS);
  observed = await readState(endpointId, jobId, key);
  workerObserved = workerObserved || activeWorkerCount(observed.workers_raw) > 0 || Object.values(observed.health.workers).some((value) => value > 0);
  console.log(JSON.stringify({
    event: "AVANTIQO_VOICE_TTS_ALL_SM120_RESCUE_PROGRESS",
    job_id: jobId,
    status: observed.status,
    worker_observed: workerObserved,
    health_workers: observed.health.workers,
    control_workers: observed.workers,
    secrets_printed: false,
  }));
}

let restored = false;
let restoreError = null;
try {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, key, {
    method: "PATCH",
    body: { workersMin: 0 },
  });
  observed = await readState(endpointId, jobId, key);
  restored = observed.endpoint.workers_min === 0;
} catch (error) {
  restoreError = text(error?.message || error).slice(0, 800);
}

let diagnosis = "ALL_VALID_SM120_POOL_DID_NOT_CREATE_WORKER";
let nextAction = "RUNPOD_ENDPOINT_CONTROL_PLANE_FAILURE_CONFIRMED_NO_NEW_JOB";
if (observed.status !== "IN_QUEUE") {
  diagnosis = "EXISTING_ACCEPTED_JOB_LEFT_QUEUE_AFTER_ALL_SM120_RESCUE";
  nextAction = "RESUME_EXISTING_ACCEPTED_JOB_ONLY";
} else if (workerObserved) {
  diagnosis = "SM120_WORKER_PROVISIONING_OBSERVED_FOR_EXISTING_JOB";
  nextAction = "RESUME_EXISTING_ACCEPTED_JOB_ONLY";
}

console.log(JSON.stringify({
  ...base,
  endpoint_mutation_performed: true,
  job_status_after: observed.status,
  endpoint_after: observed.endpoint,
  health_after: observed.health,
  control_workers_after: observed.workers,
  worker_provisioning_observed: workerObserved,
  workers_min_restored_to_zero: restored,
  workers_min_restore_error: restoreError,
  diagnosis,
  safe_to_submit_duplicate_job: false,
  next_action: nextAction,
}, null, 2));
