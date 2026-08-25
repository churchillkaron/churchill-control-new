import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTROL_BASE = "https://api.runpod.io/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_VOICE_TTS_POST_GPU_PATCH_INSPECTION_V1";
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
const UNSUPPORTED_GENERAL_CAPACITY_GPU_ID = "NVIDIA RTX PRO 4500 Blackwell";

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

async function rest(pathname, managementKey) {
  return readJsonResponse(await fetch(`${REST_BASE}${pathname}`, {
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_POST_PATCH_REST");
}

async function queue(endpointId, inferenceKey, pathname) {
  return readJsonResponse(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    headers: {
      Authorization: `Bearer ${inferenceKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_POST_PATCH_QUEUE");
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
  ), "RUNPOD_VOICE_TTS_POST_PATCH_CONTROL");
}

async function endpointBoundTemplates(managementKey) {
  const raw = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  );
  const templates = normalizeListResponse(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VOICE_TTS_POST_PATCH_TEMPLATE_LIST_INVALID");
  return templates;
}

function resolveTemplate(endpoint, templates) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  const matches = templates.filter((template) => text(template?.id) === templateId);
  if (!templateId || matches.length !== 1) {
    throw new Error(`AVANTIQO_VOICE_TTS_POST_PATCH_TEMPLATE_RESOLUTION_FAILED:${templateId || "missing"}:${matches.length}`);
  }
  return matches[0];
}

async function discoverCapacity(managementKey) {
  const queryText = `
    query AvantiqoVoiceTtsPostPatchCapacity($input: GpuAvailabilityInput) {
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
          minMemoryInGb: 16,
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
    throw new Error(`AVANTIQO_VOICE_TTS_POST_PATCH_CAPACITY_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
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

function safeWorkers(body = {}) {
  return list(body?.workers).map((worker) => ({
    id_present: Boolean(text(worker?.id)),
    status: text(worker?.status).toUpperCase() || null,
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    image_matches_certified: !text(worker?.image) || text(worker?.image) === CERTIFIED_IMAGE,
    is_stale: worker?.isStale === true,
  }));
}

const lock = JSON.parse(await readFile(LOCK_PATH, "utf8"));
if (lock?.contract !== LOCK_CONTRACT) throw new Error("AVANTIQO_VOICE_TTS_POST_PATCH_LOCK_CONTRACT_MISMATCH");
if (lock?.generation_submitted !== true || Number(lock?.accepted_generation_count) !== 1) {
  throw new Error("AVANTIQO_VOICE_TTS_POST_PATCH_ONE_ACCEPTED_GENERATION_REQUIRED");
}
if (lock?.new_generation_allowed !== false || lock?.stt_submitted !== false) {
  throw new Error("AVANTIQO_VOICE_TTS_POST_PATCH_GENERATION_LOCK_REQUIRED");
}

const endpointId = text(lock.endpoint_id);
const jobId = text(lock.job_id);
if (!endpointId || !jobId) throw new Error("AVANTIQO_VOICE_TTS_POST_PATCH_LOCK_IDS_REQUIRED");

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = required("RUNPOD_API_KEY");

const [endpoint, templates, statusRaw, healthRaw, workersRaw, capacity] = await Promise.all([
  rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  endpointBoundTemplates(managementKey),
  queue(endpointId, inferenceKey, `/status/${encodeURIComponent(jobId)}`),
  queue(endpointId, inferenceKey, "/health"),
  controlWorkers(endpointId, managementKey),
  discoverCapacity(managementKey),
]);

const template = resolveTemplate(endpoint, templates);
const endpointGpuIds = list(endpoint?.gpuTypeIds).map(text).filter(Boolean);
const endpointImage = text(template?.imageName);
const status = text(statusRaw?.status).toUpperCase() || "UNKNOWN";
const health = healthSummary(healthRaw);

const capacityRows = capacity
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
  .filter((row) => row.gpu_type_id);

const serverlessSm120Rows = capacityRows
  .filter((row) => SERVERLESS_SM120_GPU_IDS.includes(row.gpu_type_id))
  .filter((row) => row.available && row.stock_rank > 0)
  .sort((a, b) =>
    b.stock_rank - a.stock_rank ||
    SERVERLESS_SM120_GPU_IDS.indexOf(a.gpu_type_id) - SERVERLESS_SM120_GPU_IDS.indexOf(b.gpu_type_id) ||
    String(a.data_center_id).localeCompare(String(b.data_center_id)),
  );

const unsupported4500Rows = capacityRows
  .filter((row) => row.gpu_type_id === UNSUPPORTED_GENERAL_CAPACITY_GPU_ID)
  .filter((row) => row.available && row.stock_rank > 0)
  .sort((a, b) => b.stock_rank - a.stock_rank);

const activeWorkerCount = safeWorkers(workersRaw).filter(
  (worker) => !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(worker.status),
).length;

let diagnosis = "POST_PATCH_STATE_REQUIRES_REVIEW";
if (status !== "IN_QUEUE") {
  diagnosis = "JOB_LEFT_QUEUE_RESUME_EXACT_JOB";
} else if (activeWorkerCount > 0 || Object.values(health.workers).some((value) => value > 0)) {
  diagnosis = "WORKER_NOW_EXISTS_RESUME_EXACT_JOB";
} else if (endpointGpuIds.includes(UNSUPPORTED_GENERAL_CAPACITY_GPU_ID)) {
  diagnosis = "UNSUPPORTED_4500_WAS_PERSISTED_UNEXPECTEDLY";
} else if (endpointGpuIds.length === 0) {
  diagnosis = "POST_PATCH_GPU_POOL_EMPTY_REPAIR_REQUIRED";
} else if (serverlessSm120Rows.length === 0) {
  diagnosis = "NO_LIVE_SERVERLESS_SUPPORTED_SM120_CAPACITY_REPORTED";
} else {
  diagnosis = "SUPPORTED_SM120_CAPACITY_EXISTS_BUT_SCHEDULER_HAS_ZERO_WORKERS";
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  generation_submitted: false,
  accepted_generation_count: 1,
  new_generation_allowed: false,
  queue_mutation_performed: false,
  endpoint_mutation_performed: false,
  job_cancelled: false,
  queue_purged: false,
  stt_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
  job: {
    id: jobId,
    status,
    delay_ms: finite(statusRaw?.delayTime),
    execution_ms: finite(statusRaw?.executionTime),
  },
  health,
  control_workers: safeWorkers(workersRaw),
  endpoint: {
    id: text(endpoint?.id) || null,
    name: text(endpoint?.name) || null,
    version: finite(endpoint?.version),
    template_id: text(endpoint?.templateId || endpoint?.template?.id) || null,
    template_image: endpointImage,
    image_matches_certified: endpointImage === CERTIFIED_IMAGE,
    min_cuda_version: text(endpoint?.minCudaVersion) || null,
    cuda_matches_required: text(endpoint?.minCudaVersion) === REQUIRED_CUDA,
    gpu_type_ids: endpointGpuIds,
    data_center_ids: list(endpoint?.dataCenterIds).map(text).filter(Boolean),
    network_volume_id: text(endpoint?.networkVolumeId) || null,
    network_volume_ids: list(endpoint?.networkVolumeIds).map(text).filter(Boolean),
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    scaler_type: text(endpoint?.scalerType) || null,
    scaler_value: finite(endpoint?.scalerValue),
    flashboot: endpoint?.flashboot === true,
  },
  serverless_sm120_policy: {
    supported_gpu_type_ids: [...SERVERLESS_SM120_GPU_IDS],
    unsupported_general_capacity_gpu_id: UNSUPPORTED_GENERAL_CAPACITY_GPU_ID,
  },
  live_serverless_supported_sm120_capacity: serverlessSm120Rows.slice(0, 80),
  unsupported_4500_general_capacity: unsupported4500Rows.slice(0, 20),
  diagnosis,
  safe_to_submit_duplicate_job: false,
  next_action:
    diagnosis === "JOB_LEFT_QUEUE_RESUME_EXACT_JOB" || diagnosis === "WORKER_NOW_EXISTS_RESUME_EXACT_JOB"
      ? "RESUME_EXISTING_ACCEPTED_JOB_ONLY"
      : diagnosis === "POST_PATCH_GPU_POOL_EMPTY_REPAIR_REQUIRED"
        ? "RESTORE_SERVERLESS_SUPPORTED_SM120_GPU_POOL_WITHOUT_NEW_JOB"
        : "REPLAN_EXISTING_ENDPOINT_ONLY_NO_NEW_GENERATION",
}, null, 2));
