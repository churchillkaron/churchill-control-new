const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const TARGET_MODEL = "Qwen/Qwen-Image-2512";
const MIN_VOLUME_GB = 64;
const POLL_MS = 10_000;
const DEFAULT_WAIT_MS = 90 * 60 * 1000;

const ORIGINAL_GPU_TYPES = [
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
];

// Temporary cache-bootstrap fallbacks only. All are NVIDIA GPUs with at least
// 80 GB VRAM, so an unrelated Image request cannot be silently pushed onto a
// small-memory worker while the cache bootstrap is in progress.
const CACHE_FALLBACK_GPU_TYPES = [
  "NVIDIA B200",
  "NVIDIA H200",
  "NVIDIA H200 NVL",
  "NVIDIA H100 80GB HBM3",
  "NVIDIA H100 PCIe",
  "NVIDIA H100 NVL",
  "NVIDIA A100-SXM4-80GB",
  "NVIDIA A100 80GB PCIe",
];

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isBaselinePrefix(gpuTypes) {
  return ORIGINAL_GPU_TYPES.every((gpu, index) => gpuTypes[index] === gpu);
}

function recognizedRepairPool(gpuTypes) {
  if (!isBaselinePrefix(gpuTypes)) return false;
  return gpuTypes
    .slice(ORIGINAL_GPU_TYPES.length)
    .every((gpu) => CACHE_FALLBACK_GPU_TYPES.includes(gpu));
}

function jobIdFromArgs() {
  const arg = process.argv.find((value) => value.startsWith("--job-id="));
  return text(arg ? arg.slice("--job-id=".length) : process.env.AVANTIQO_IMAGE_CACHE_JOB_ID);
}

function stockScore(status) {
  const value = text(status).toUpperCase();
  if (value === "HIGH") return 4;
  if (value === "MEDIUM") return 3;
  if (value === "LOW") return 2;
  if (value && value !== "NONE" && value !== "UNAVAILABLE") return 1;
  return 0;
}

async function restRequest(path, credential, options = {}) {
  const response = await fetch(`${REST_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function queueRequest(endpointId, jobId, inferenceKey) {
  const response = await fetch(
    `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`,
    {
      headers: {
        Authorization: `Bearer ${inferenceKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.error || body?.message || raw).slice(0, 1000);
    throw new Error(`RUNPOD_QUEUE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function healthRequest(endpointId, inferenceKey) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: {
      Authorization: `Bearer ${inferenceKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.error || body?.message || raw).slice(0, 1000);
    throw new Error(`RUNPOD_HEALTH_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function discoverGpuAvailability(managementKey) {
  const query = `
    query AvantiqoImageCacheGpuAvailability($input: GpuAvailabilityInput) {
      dataCenters {
        id
        storageSupport
        gpuAvailability(input: $input) {
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
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: {
        input: {
          gpuCount: 1,
          minDisk: 5,
          minMemoryInGb: 80,
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
  if (!response.ok || body?.errors?.length) {
    const detail = text(
      body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw,
    ).slice(0, 1200);
    throw new Error(`RUNPOD_GPU_AVAILABILITY_FAILED:${response.status}:${detail || "EMPTY_BODY"}`);
  }
  if (!Array.isArray(body?.data?.dataCenters)) {
    throw new Error("RUNPOD_GPU_AVAILABILITY_INVALID_RESPONSE");
  }
  return body.data.dataCenters;
}

function endpointVolumeIds(endpoint = {}) {
  return [
    text(endpoint.networkVolumeId),
    ...array(endpoint.networkVolumeIds).map(text),
  ].filter(Boolean);
}

function safeHealth(body = {}) {
  const jobs = body?.jobs || {};
  const workers = body?.workers || {};
  return {
    jobs: {
      completed: finite(jobs.completed, 0),
      failed: finite(jobs.failed, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
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

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    version: finite(endpoint.version),
    template_id: text(endpoint.templateId) || null,
    network_volume_ids: endpointVolumeIds(endpoint),
    gpu_type_ids: array(endpoint.gpuTypeIds).map(text).filter(Boolean),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
  };
}

function validateCacheOutput(job) {
  const output = job?.output || {};
  return {
    valid:
      text(output.target_model) === TARGET_MODEL &&
      output.cache_ready === true &&
      output.inference_performed === false &&
      text(output.foundation_model_source) === "runpod-cache",
    output,
  };
}

const apply = process.argv.includes("--apply");
const jobId = jobIdFromArgs();
if (!jobId) {
  throw new Error("AVANTIQO_IMAGE_CACHE_JOB_ID_REQUIRED_USE_--job-id=<existing-job-id>");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID");
const waitMs = Math.max(
  POLL_MS,
  finite(process.env.AVANTIQO_IMAGE_CACHE_UNBLOCK_WAIT_MS, DEFAULT_WAIT_MS),
);

console.log(`AVANTIQO_IMAGE_CACHE_UNBLOCK_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log(`AVANTIQO_IMAGE_CACHE_UNBLOCK_JOB=${jobId}`);
console.log("AVANTIQO_IMAGE_CACHE_UNBLOCK_NEW_JOB_SUBMITTED=false");
console.log("AVANTIQO_IMAGE_CACHE_UNBLOCK_PRODUCTION_DEPLOY_PERFORMED=false");
console.log("AVANTIQO_IMAGE_CACHE_UNBLOCK_SECRETS_PRINTED=false");

const [endpoint, volumes, availability, initialJob, initialHealth] = await Promise.all([
  restRequest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  restRequest("/networkvolumes", managementKey),
  discoverGpuAvailability(managementKey),
  queueRequest(endpointId, jobId, inferenceKey),
  healthRequest(endpointId, inferenceKey),
]);

if (text(endpoint?.id) !== endpointId) throw new Error("AVANTIQO_IMAGE_CACHE_UNBLOCK_ENDPOINT_ID_MISMATCH");
if (text(endpoint?.name) !== IMAGE_ENDPOINT_NAME) {
  throw new Error(`AVANTIQO_IMAGE_CACHE_UNBLOCK_ENDPOINT_NAME_MISMATCH:${text(endpoint?.name) || "MISSING"}`);
}
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");

const attachedVolumeIds = endpointVolumeIds(endpoint);
if (attachedVolumeIds.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_CACHE_UNBLOCK_EXACTLY_ONE_NETWORK_VOLUME_REQUIRED:count=${attachedVolumeIds.length}`);
}
const volume = volumes.find((entry) => text(entry?.id) === attachedVolumeIds[0]);
if (!volume) throw new Error("AVANTIQO_IMAGE_CACHE_UNBLOCK_ATTACHED_VOLUME_NOT_FOUND");
if (finite(volume?.size, 0) < MIN_VOLUME_GB) {
  throw new Error(`AVANTIQO_IMAGE_CACHE_UNBLOCK_VOLUME_TOO_SMALL:size_gb=${finite(volume?.size, 0)}`);
}
const volumeDataCenterId = text(volume?.dataCenterId);
if (!volumeDataCenterId) throw new Error("AVANTIQO_IMAGE_CACHE_UNBLOCK_VOLUME_DATACENTER_REQUIRED");

const currentGpuTypes = array(endpoint?.gpuTypeIds).map(text).filter(Boolean);
if (!sameArray(currentGpuTypes, ORIGINAL_GPU_TYPES) && !recognizedRepairPool(currentGpuTypes)) {
  throw new Error(
    `AVANTIQO_IMAGE_CACHE_UNBLOCK_CONCURRENT_GPU_CONFIGURATION_CHANGE:${currentGpuTypes.join("|")}`,
  );
}

const dc = availability.find((entry) => text(entry?.id) === volumeDataCenterId);
if (!dc) {
  throw new Error(`AVANTIQO_IMAGE_CACHE_UNBLOCK_VOLUME_DATACENTER_NOT_IN_AVAILABILITY:${volumeDataCenterId}`);
}
const stock = array(dc?.gpuAvailability)
  .map((gpu) => ({
    gpu_type_id: text(gpu?.gpuTypeId),
    display_name: text(gpu?.gpuTypeDisplayName || gpu?.displayName) || null,
    stock_status: text(gpu?.stockStatus) || null,
    stock_score: stockScore(gpu?.stockStatus),
  }))
  .filter((gpu) => gpu.gpu_type_id && gpu.stock_score > 0);
const availableFallbacks = CACHE_FALLBACK_GPU_TYPES
  .map((gpuType) => ({
    gpu_type_id: gpuType,
    availability: stock.find((entry) => entry.gpu_type_id === gpuType) || null,
  }))
  .filter((entry) => entry.availability)
  .sort((a, b) => b.availability.stock_score - a.availability.stock_score);
const proposedGpuTypes = [
  ...ORIGINAL_GPU_TYPES,
  ...availableFallbacks.map((entry) => entry.gpu_type_id),
];

const initialStatus = text(initialJob?.status).toUpperCase();
const plan = {
  success: true,
  contract: "AVANTIQO_IMAGE_CACHE_WORKER_UNBLOCK_V1",
  mode: apply ? "APPLY" : "PLAN",
  endpoint: safeEndpoint(endpoint),
  network_volume: {
    id: text(volume?.id) || null,
    name: text(volume?.name) || null,
    size_gb: finite(volume?.size),
    data_center_id: volumeDataCenterId,
  },
  existing_cache_job: {
    id: jobId,
    status: initialStatus || null,
  },
  health: safeHealth(initialHealth),
  original_gpu_type_ids: ORIGINAL_GPU_TYPES,
  available_cache_fallbacks: availableFallbacks,
  proposed_gpu_type_ids: proposedGpuTypes,
  mutation_required:
    initialStatus === "IN_QUEUE" && !sameArray(currentGpuTypes, proposedGpuTypes),
  safety: {
    existing_job_only: true,
    new_job_submitted: false,
    image_endpoint_only: true,
    network_volume_mutation_allowed: false,
    template_mutation_allowed: false,
    worker_minimum_mutation_allowed: false,
    production_deploy_performed: false,
    restore_original_gpu_pool_after_terminal_job: true,
  },
};

if (initialStatus === "COMPLETED") {
  const validation = validateCacheOutput(initialJob);
  if (!validation.valid) {
    console.log("AVANTIQO_IMAGE_CACHE_READY=NO");
    console.log(JSON.stringify({ ...plan, cache_output: validation.output }, null, 2));
    process.exit(2);
  }
  if (!sameArray(currentGpuTypes, ORIGINAL_GPU_TYPES)) {
    if (!apply) {
      console.log("AVANTIQO_IMAGE_CACHE_UNBLOCK_PLAN=RESTORE_GPU_POOL");
      console.log(JSON.stringify(plan, null, 2));
      process.exit(0);
    }
    await restRequest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
      method: "PATCH",
      body: { gpuTypeIds: ORIGINAL_GPU_TYPES },
    });
  }
  console.log("AVANTIQO_IMAGE_CACHE_READY=YES");
  console.log("AVANTIQO_IMAGE_CACHE_UNBLOCK=COMPLETE");
  console.log(JSON.stringify({ ...plan, cache_output: validation.output }, null, 2));
  process.exit(0);
}

if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(initialStatus)) {
  if (!sameArray(currentGpuTypes, ORIGINAL_GPU_TYPES) && apply) {
    await restRequest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
      method: "PATCH",
      body: { gpuTypeIds: ORIGINAL_GPU_TYPES },
    });
  }
  throw new Error(
    `AVANTIQO_IMAGE_CACHE_EXISTING_JOB_${initialStatus}:${text(initialJob?.error || initialJob?.output?.error)}`,
  );
}

if (!["IN_QUEUE", "IN_PROGRESS"].includes(initialStatus)) {
  throw new Error(`AVANTIQO_IMAGE_CACHE_UNBLOCK_UNEXPECTED_JOB_STATUS:${initialStatus || "UNKNOWN"}`);
}

if (initialStatus === "IN_QUEUE" && availableFallbacks.length === 0 && sameArray(currentGpuTypes, ORIGINAL_GPU_TYPES)) {
  throw new Error(
    `AVANTIQO_IMAGE_CACHE_UNBLOCK_NO_80GB_FALLBACK_STOCK_IN_${volumeDataCenterId}`,
  );
}

if (!apply) {
  console.log("AVANTIQO_IMAGE_CACHE_UNBLOCK_PLAN=READY");
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

// Re-read the exact endpoint and existing job immediately before the only mutation.
const [endpointBeforeWrite, jobBeforeWrite] = await Promise.all([
  restRequest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  queueRequest(endpointId, jobId, inferenceKey),
]);
if (!endpointVolumeIds(endpointBeforeWrite).includes(text(volume?.id))) {
  throw new Error("AVANTIQO_IMAGE_CACHE_UNBLOCK_CONCURRENT_VOLUME_CHANGE_DETECTED");
}
if (text(endpointBeforeWrite?.templateId) !== text(endpoint?.templateId)) {
  throw new Error("AVANTIQO_IMAGE_CACHE_UNBLOCK_CONCURRENT_TEMPLATE_CHANGE_DETECTED");
}
const beforeWriteGpuTypes = array(endpointBeforeWrite?.gpuTypeIds).map(text).filter(Boolean);
if (!sameArray(beforeWriteGpuTypes, ORIGINAL_GPU_TYPES) && !recognizedRepairPool(beforeWriteGpuTypes)) {
  throw new Error("AVANTIQO_IMAGE_CACHE_UNBLOCK_CONCURRENT_GPU_CHANGE_DETECTED");
}

let status = text(jobBeforeWrite?.status).toUpperCase();
let mutationPerformed = false;
if (status === "IN_QUEUE" && !sameArray(beforeWriteGpuTypes, proposedGpuTypes)) {
  await restRequest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { gpuTypeIds: proposedGpuTypes },
  });
  mutationPerformed = true;
  console.log(
    `AVANTIQO_IMAGE_CACHE_UNBLOCK_GPU_POOL_WIDENED fallback_count=${proposedGpuTypes.length - ORIGINAL_GPU_TYPES.length}`,
  );
}

const deadline = Date.now() + waitMs;
let body = jobBeforeWrite;
let lastStatus = null;
let lastHealthAt = 0;
while (!["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
  if (Date.now() >= deadline) {
    if (status === "IN_QUEUE" && !sameArray(array(endpointBeforeWrite?.gpuTypeIds).map(text).filter(Boolean), ORIGINAL_GPU_TYPES)) {
      await restRequest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
        method: "PATCH",
        body: { gpuTypeIds: ORIGINAL_GPU_TYPES },
      });
      console.log("AVANTIQO_IMAGE_CACHE_UNBLOCK_GPU_POOL_RESTORED_AFTER_QUEUE_TIMEOUT=true");
    }
    throw new Error(`AVANTIQO_IMAGE_CACHE_UNBLOCK_WAIT_TIMEOUT:${jobId}:status=${status}`);
  }

  if (status !== lastStatus || Date.now() - lastHealthAt >= 30_000) {
    const health = safeHealth(await healthRequest(endpointId, inferenceKey));
    console.log(
      `AVANTIQO_IMAGE_CACHE_UNBLOCK_PROGRESS status=${status} queued=${health.jobs.in_queue} in_progress=${health.jobs.in_progress} initializing=${health.workers.initializing} running=${health.workers.running} throttled=${health.workers.throttled}`,
    );
    lastStatus = status;
    lastHealthAt = Date.now();
  }

  await sleep(POLL_MS);
  body = await queueRequest(endpointId, jobId, inferenceKey);
  status = text(body?.status).toUpperCase();
}

// The worker has finished the exact cache job, so restoring the original GPU pool
// can no longer interrupt it.
const endpointAfterJob = await restRequest(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
const afterJobGpuTypes = array(endpointAfterJob?.gpuTypeIds).map(text).filter(Boolean);
if (!sameArray(afterJobGpuTypes, ORIGINAL_GPU_TYPES)) {
  if (!recognizedRepairPool(afterJobGpuTypes)) {
    throw new Error("AVANTIQO_IMAGE_CACHE_UNBLOCK_REFUSE_RESTORE_AFTER_CONCURRENT_GPU_CHANGE");
  }
  await restRequest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { gpuTypeIds: ORIGINAL_GPU_TYPES },
  });
  console.log("AVANTIQO_IMAGE_CACHE_UNBLOCK_GPU_POOL_RESTORED=true");
}

if (status !== "COMPLETED") {
  throw new Error(
    `AVANTIQO_IMAGE_CACHE_EXISTING_JOB_${status}:${text(body?.error || body?.output?.error)}`,
  );
}

const validation = validateCacheOutput(body);
console.log(`AVANTIQO_IMAGE_CACHE_READY=${validation.valid ? "YES" : "NO"}`);
console.log("AVANTIQO_IMAGE_CACHE_UNBLOCK=COMPLETE");
console.log(
  JSON.stringify(
    {
      ...plan,
      mode: "APPLY",
      mutation_performed: mutationPerformed,
      final_job_status: status,
      cache_output: validation.output,
      original_gpu_pool_restored: true,
      next_action: validation.valid ? "RUN_ONE_QWEN_IMAGE_2512_QUALITY_TEST" : "INSPECT_CACHE_OUTPUT",
    },
    null,
    2,
  ),
);
if (!validation.valid) process.exitCode = 2;
