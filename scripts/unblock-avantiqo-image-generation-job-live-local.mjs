const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const TARGET_MODEL = "Qwen/Qwen-Image-2512";
const MIN_VOLUME_GB = 64;
const POLL_MS = 10_000;
const MAX_WAIT_MS = 45 * 60 * 1000;

const ORIGINAL_GPU_TYPES = [
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
];

const GENERATION_FALLBACK_GPU_TYPES = [
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
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function jobIdFromArgs() {
  const arg = process.argv.find((value) => value.startsWith("--job-id="));
  return text(arg ? arg.slice("--job-id=".length) : process.env.AVANTIQO_IMAGE_GENERATION_JOB_ID);
}
function isBaselinePrefix(gpuTypes) {
  return ORIGINAL_GPU_TYPES.every((gpu, index) => gpuTypes[index] === gpu);
}
function recognizedRepairPool(gpuTypes) {
  return (
    isBaselinePrefix(gpuTypes) &&
    gpuTypes
      .slice(ORIGINAL_GPU_TYPES.length)
      .every((gpu) => GENERATION_FALLBACK_GPU_TYPES.includes(gpu))
  );
}
function stockScore(value) {
  const status = text(value).toUpperCase();
  if (status === "HIGH") return 4;
  if (status === "MEDIUM") return 3;
  if (status === "LOW") return 2;
  if (status && status !== "NONE" && status !== "UNAVAILABLE") return 1;
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
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function queueRequest(endpointId, path, inferenceKey) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`, {
    headers: { Authorization: `Bearer ${inferenceKey}`, Accept: "application/json" },
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
    throw new Error(`RUNPOD_QUEUE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function discoverGpuAvailability(managementKey) {
  const query = `
    query AvantiqoImageGenerationGpuAvailability($input: GpuAvailabilityInput) {
      dataCenters {
        id
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
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: {
        input: { gpuCount: 1, minDisk: 5, minMemoryInGb: 80, secureCloud: true },
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
    ).slice(0, 1200);
    throw new Error(`RUNPOD_GPU_AVAILABILITY_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  return body.data.dataCenters;
}

function endpointVolumeIds(endpoint = {}) {
  return [text(endpoint.networkVolumeId), ...list(endpoint.networkVolumeIds).map(text)].filter(Boolean);
}
function healthSummary(health = {}) {
  const jobs = health?.jobs || {};
  const workers = health?.workers || {};
  return {
    queued: finite(jobs.inQueue ?? jobs.in_queue, 0),
    in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    initializing: finite(workers.initializing, 0),
    running: finite(workers.running, 0),
    throttled: finite(workers.throttled, 0),
    unhealthy: finite(workers.unhealthy, 0),
  };
}
function generationOutputValid(job = {}) {
  const output = job?.output || {};
  return (
    text(output.capability) === "ai.image.generate" &&
    text(output.foundation_model) === TARGET_MODEL &&
    text(output.foundation_model_source) === "runpod-cache" &&
    Number(output.width) === 1328 &&
    Number(output.height) === 1328 &&
    Number(output.inference_steps) === 50 &&
    Number(output.size_bytes) > 10000 &&
    output.raw_reasoning_persisted === false
  );
}

const jobId = jobIdFromArgs();
if (!jobId) throw new Error("AVANTIQO_IMAGE_GENERATION_JOB_ID_REQUIRED_USE_--job-id=<existing-job-id>");

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");

console.log("AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_MODE=APPLY_EXISTING_JOB_ONLY");
console.log(`AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_JOB=${jobId}`);
console.log("AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_NEW_JOB_SUBMITTED=false");
console.log("AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_VOLUME_MUTATION=false");
console.log("AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_TEMPLATE_MUTATION=false");
console.log("AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_SECRETS_PRINTED=false");

const endpoints = await restRequest("/endpoints?includeTemplate=false&includeWorkers=false", managementKey);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
const matches = endpoints.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
if (matches.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
}
const endpointId = text(matches[0]?.id);
if (!endpointId) throw new Error("AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_ENDPOINT_ID_MISSING");
console.log("AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_ENDPOINT_RESOLUTION=EXACT_NAME");

const [endpoint, volumes, availability, initialJob, initialHealth] = await Promise.all([
  restRequest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  restRequest("/networkvolumes", managementKey),
  discoverGpuAvailability(managementKey),
  queueRequest(endpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey),
  queueRequest(endpointId, "/health", inferenceKey),
]);

if (text(endpoint?.name) !== IMAGE_ENDPOINT_NAME) {
  throw new Error("AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_ENDPOINT_NAME_MISMATCH");
}
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");
const volumeIds = endpointVolumeIds(endpoint);
if (volumeIds.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_VOLUME_COUNT_INVALID:${volumeIds.length}`);
}
const volume = volumes.find((entry) => text(entry?.id) === volumeIds[0]);
if (!volume) throw new Error("AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_VOLUME_NOT_FOUND");
if (finite(volume?.size, 0) < MIN_VOLUME_GB) {
  throw new Error(`AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_VOLUME_TOO_SMALL:${finite(volume?.size, 0)}`);
}
const dataCenterId = text(volume?.dataCenterId);
if (!dataCenterId) throw new Error("AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_VOLUME_DATACENTER_MISSING");

const currentGpuTypes = list(endpoint?.gpuTypeIds).map(text).filter(Boolean);
if (!sameArray(currentGpuTypes, ORIGINAL_GPU_TYPES) && !recognizedRepairPool(currentGpuTypes)) {
  throw new Error(`AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_CONCURRENT_GPU_CHANGE:${currentGpuTypes.join("|")}`);
}

const initialStatus = text(initialJob?.status).toUpperCase();
const terminalStatuses = ["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"];
if (!["IN_QUEUE", "IN_PROGRESS", ...terminalStatuses].includes(initialStatus)) {
  throw new Error(`AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_UNEXPECTED_JOB_STATUS:${initialStatus || "UNKNOWN"}`);
}

const dc = availability.find((entry) => text(entry?.id) === dataCenterId);
if (!dc) throw new Error(`AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_DATACENTER_NOT_FOUND:${dataCenterId}`);
const available = list(dc?.gpuAvailability)
  .map((gpu) => ({
    id: text(gpu?.gpuTypeId),
    stock: text(gpu?.stockStatus) || null,
    score: stockScore(gpu?.stockStatus),
  }))
  .filter((gpu) => gpu.id && gpu.score > 0);
const fallbacks = GENERATION_FALLBACK_GPU_TYPES
  .map((id) => ({ id, availability: available.find((entry) => entry.id === id) || null }))
  .filter((entry) => entry.availability)
  .sort((left, right) => right.availability.score - left.availability.score);
const repairPool = [...ORIGINAL_GPU_TYPES, ...fallbacks.map((entry) => entry.id)];

console.log(`AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_INITIAL_STATUS=${initialStatus}`);
console.log(`AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_FALLBACK_COUNT=${fallbacks.length}`);
console.log(`AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_HEALTH=${JSON.stringify(healthSummary(initialHealth))}`);

let repairApplied = !sameArray(currentGpuTypes, ORIGINAL_GPU_TYPES);

async function restoreBaseline(reason) {
  const live = await restRequest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
  );
  if (!endpointVolumeIds(live).includes(text(volume?.id))) {
    throw new Error("AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_REFUSE_RESTORE_VOLUME_CHANGED");
  }
  if (text(live?.templateId) !== text(endpoint?.templateId)) {
    throw new Error("AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_REFUSE_RESTORE_TEMPLATE_CHANGED");
  }
  const liveGpuTypes = list(live?.gpuTypeIds).map(text).filter(Boolean);
  if (!sameArray(liveGpuTypes, ORIGINAL_GPU_TYPES)) {
    if (!recognizedRepairPool(liveGpuTypes)) {
      throw new Error("AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_REFUSE_RESTORE_GPU_CHANGED");
    }
    await restRequest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
      method: "PATCH",
      body: { gpuTypeIds: ORIGINAL_GPU_TYPES },
    });
    const verified = await restRequest(
      `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=false`,
      managementKey,
    );
    if (!sameArray(list(verified?.gpuTypeIds).map(text).filter(Boolean), ORIGINAL_GPU_TYPES)) {
      throw new Error("AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_GPU_RESTORE_VERIFY_FAILED");
    }
    console.log(`AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_GPU_POOL_RESTORED=${reason}`);
  }
}

let status = initialStatus;
let body = initialJob;

if (status === "IN_QUEUE") {
  if (fallbacks.length === 0 && sameArray(currentGpuTypes, ORIGINAL_GPU_TYPES)) {
    throw new Error(`AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_NO_80GB_FALLBACK_STOCK_IN_${dataCenterId}`);
  }
  const [beforeWrite, jobBeforeWrite] = await Promise.all([
    restRequest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
    queueRequest(endpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey),
  ]);
  status = text(jobBeforeWrite?.status).toUpperCase();
  body = jobBeforeWrite;
  const beforeGpuTypes = list(beforeWrite?.gpuTypeIds).map(text).filter(Boolean);
  if (!endpointVolumeIds(beforeWrite).includes(text(volume?.id))) {
    throw new Error("AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_VOLUME_CHANGED_BEFORE_WRITE");
  }
  if (text(beforeWrite?.templateId) !== text(endpoint?.templateId)) {
    throw new Error("AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_TEMPLATE_CHANGED_BEFORE_WRITE");
  }
  if (!sameArray(beforeGpuTypes, ORIGINAL_GPU_TYPES) && !recognizedRepairPool(beforeGpuTypes)) {
    throw new Error("AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_GPU_CHANGED_BEFORE_WRITE");
  }
  if (status === "IN_QUEUE" && !sameArray(beforeGpuTypes, repairPool)) {
    await restRequest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
      method: "PATCH",
      body: { gpuTypeIds: repairPool },
    });
    repairApplied = true;
    console.log(`AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_GPU_POOL_WIDENED=${repairPool.length - ORIGINAL_GPU_TYPES.length}`);
  }
}

const deadline = Date.now() + MAX_WAIT_MS;
let lastPrintedAt = 0;
try {
  while (!terminalStatuses.includes(status)) {
    if (Date.now() >= deadline) {
      throw new Error(`AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_WAIT_TIMEOUT:${jobId}:status=${status}`);
    }
    if (Date.now() - lastPrintedAt >= 30_000) {
      const health = await queueRequest(endpointId, "/health", inferenceKey);
      console.log(`AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_PROGRESS status=${status} ${JSON.stringify(healthSummary(health))}`);
      lastPrintedAt = Date.now();
    }
    await sleep(POLL_MS);
    body = await queueRequest(endpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey);
    status = text(body?.status).toUpperCase();
  }
} finally {
  await restoreBaseline(`JOB_${status || "UNKNOWN"}`);
}

if (status !== "COMPLETED") {
  throw new Error(`AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_JOB_${status}:${text(body?.error || body?.output?.error)}`);
}

const valid = generationOutputValid(body);
console.log(`AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK_OUTPUT_VALID=${valid ? "YES" : "NO"}`);
console.log("AVANTIQO_IMAGE_GENERATION_LIVE_UNBLOCK=COMPLETE");
console.log(JSON.stringify({
  job_id: jobId,
  final_status: status,
  fallback_gpu_pool_applied: repairApplied,
  original_gpu_pool_restored: true,
  output: body?.output || null,
}, null, 2));
if (!valid) process.exitCode = 2;
