const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const TARGET_MODEL = "Qwen/Qwen-Image-2512";
const CACHE_COMPLETION_CONTRACT = "AVANTIQO_IMAGE_CACHE_COMPLETION_V1";
const PRIMARY_VOLUME_NAME = "avantiqo-image-model-cache";
const SECONDARY_VOLUME_PREFIX = "avantiqo-image-model-cache-ha-";
const MIN_VOLUME_GB = 80;
const CACHE_EXECUTION_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const GENERATION_EXECUTION_TIMEOUT_MS = 20 * 60 * 1000;
const POLL_MS = 10_000;
const MAX_WAIT_MS = 110 * 60 * 1000;

const APPROVED_GENERATION_GPU_TYPES = new Set([
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
  "NVIDIA B200",
  "NVIDIA H200",
  "NVIDIA H200 NVL",
  "NVIDIA H100 80GB HBM3",
  "NVIDIA H100 PCIe",
  "NVIDIA H100 NVL",
  "NVIDIA A100-SXM4-80GB",
  "NVIDIA A100 80GB PCIe",
]);

const CACHE_GPU_NAME_PATTERN = /(RTX\s*(?:PRO\s*)?6000|RTX\s*4090|RTX\s*3090|A5000|A6000|6000\s*Ada|\bA40\b|\bL4\b|\bL40S?\b|\bA100\b|\bH100\b|\bH200\b|\bB200\b)/i;

function text(value) {
  return String(value ?? "").trim();
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}
function approved(value) {
  return ["YES", "TRUE", "1", "APPROVED"].includes(text(value).toUpperCase());
}
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function parseDataCenters(value) {
  if (Array.isArray(value)) return unique(value);
  return unique(text(value).split(","));
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function stockScore(value) {
  const status = text(value).toUpperCase();
  if (status === "HIGH") return 4;
  if (status === "MEDIUM") return 3;
  if (status === "LOW") return 2;
  if (status && status !== "NONE" && status !== "UNAVAILABLE") return 1;
  return 0;
}
function terminalFailure(status) {
  return ["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status);
}
function cacheJobIdFromArgs() {
  const arg = process.argv.find((value) => value.startsWith("--cache-job-id="));
  return text(arg ? arg.slice("--cache-job-id=".length) : process.env.AVANTIQO_IMAGE_MULTI_REGION_CACHE_JOB_ID);
}
function queueCounts(health = {}) {
  const jobs = health?.jobs || {};
  return {
    queued: finite(jobs.inQueue ?? jobs.in_queue, 0),
    in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
  };
}
function strictCacheValid(job = {}) {
  const output = job?.output || {};
  const integrity = output.cache_integrity || {};
  return (
    text(output.target_model) === TARGET_MODEL &&
    output.cache_ready === true &&
    output.inference_performed === false &&
    text(output.foundation_model_source) === "runpod-cache" &&
    text(integrity.contract) === CACHE_COMPLETION_CONTRACT &&
    integrity.completion_marker_valid === true &&
    Array.isArray(integrity.missing_required_files) &&
    integrity.missing_required_files.length === 0
  );
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
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1200);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function queueRequest(endpointId, path, credential, options = {}) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`, {
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
    if (response.status === 404 && options.allowNotFound === true) return { __not_found: true };
    const detail = text(body?.error || body?.message || raw).slice(0, 1200);
    throw new Error(`RUNPOD_QUEUE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function discoverCacheGpuPool(managementKey, dataCenterId) {
  const query = `
    query AvantiqoImageCacheBootstrapGpuPool($input: GpuAvailabilityInput) {
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
        input: { gpuCount: 1, minDisk: 5, minMemoryInGb: 16, secureCloud: true },
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
    const detail = text(body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw).slice(0, 1200);
    throw new Error(`RUNPOD_CACHE_GPU_DISCOVERY_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  const dc = body.data.dataCenters.find((entry) => text(entry?.id) === dataCenterId);
  if (!dc) throw new Error(`RUNPOD_CACHE_GPU_DATACENTER_NOT_FOUND:${dataCenterId}`);
  const candidates = list(dc.gpuAvailability)
    .map((gpu) => {
      const id = text(gpu?.gpuTypeId);
      const name = text(gpu?.gpuTypeDisplayName || gpu?.displayName || id);
      return {
        id,
        name,
        stock_status: text(gpu?.stockStatus) || "UNKNOWN",
        score: stockScore(gpu?.stockStatus),
      };
    })
    .filter((gpu) => gpu.id && gpu.score > 0 && CACHE_GPU_NAME_PATTERN.test(`${gpu.id} ${gpu.name}`))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  if (!candidates.length) {
    throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_NO_CACHE_BOOTSTRAP_GPU_STOCK:${dataCenterId}`);
  }
  return candidates;
}

async function waitForJob(endpointId, jobId, inferenceKey) {
  const deadline = Date.now() + MAX_WAIT_MS;
  let lastPrinted = 0;
  while (Date.now() < deadline) {
    const body = await queueRequest(endpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey);
    const status = text(body?.status).toUpperCase();
    if (status === "COMPLETED") return body;
    if (terminalFailure(status)) {
      throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_CACHE_${status}:${text(body?.error || body?.output?.error)}`);
    }
    if (Date.now() - lastPrinted >= 30_000) {
      const health = await queueRequest(endpointId, "/health", inferenceKey);
      const counts = queueCounts(health);
      console.log(
        `AVANTIQO_IMAGE_MULTI_REGION_RESUME_PROGRESS status=${status || "UNKNOWN"} queued=${counts.queued} in_progress=${counts.in_progress}`,
      );
      lastPrinted = Date.now();
    }
    await sleep(POLL_MS);
  }
  const current = await queueRequest(endpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey);
  const status = text(current?.status).toUpperCase();
  if (!["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
    const cancelled = await queueRequest(endpointId, `/cancel/${encodeURIComponent(jobId)}`, inferenceKey, { method: "POST" });
    console.log(`AVANTIQO_IMAGE_MULTI_REGION_RESUME_CANCELLED_ON_TIMEOUT=${text(cancelled?.status).toUpperCase()}`);
  }
  throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_CACHE_WAIT_TIMEOUT:${jobId}:${status || "UNKNOWN"}`);
}

const apply = process.argv.includes("--apply");
if (!apply) throw new Error("AVANTIQO_IMAGE_MULTI_REGION_RESUME_APPLY_REQUIRED");
if (!approved(process.env.AVANTIQO_IMAGE_STALE_JOB_CANCEL_APPROVED)) {
  throw new Error("AVANTIQO_IMAGE_STALE_JOB_CANCEL_APPROVAL_REQUIRED");
}
if (!approved(process.env.AVANTIQO_IMAGE_MULTI_REGION_CACHE_SPEND_APPROVED)) {
  throw new Error("AVANTIQO_IMAGE_MULTI_REGION_CACHE_SPEND_APPROVAL_REQUIRED");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const existingCacheJobId = cacheJobIdFromArgs();
if (!existingCacheJobId) throw new Error("AVANTIQO_IMAGE_MULTI_REGION_CACHE_JOB_ID_REQUIRED");

console.log("AVANTIQO_IMAGE_MULTI_REGION_RESUME_MODE=APPLY");
console.log("AVANTIQO_IMAGE_MULTI_REGION_RESUME_NEW_IMAGE_GENERATION=false");
console.log("AVANTIQO_IMAGE_MULTI_REGION_RESUME_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_MULTI_REGION_RESUME_NEW_STORAGE=false");
console.log("AVANTIQO_IMAGE_MULTI_REGION_RESUME_SECRETS_PRINTED=false");

const endpoints = await restRequest("/endpoints?includeTemplate=false&includeWorkers=false", managementKey);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
const matches = endpoints.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
if (matches.length !== 1) throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
const endpointId = text(matches[0]?.id);
if (!endpointId) throw new Error("AVANTIQO_IMAGE_MULTI_REGION_ENDPOINT_ID_MISSING");

const [endpoint, volumes] = await Promise.all([
  restRequest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  restRequest("/networkvolumes", managementKey),
]);
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");

const primaryMatches = volumes.filter((volume) => text(volume?.name) === PRIMARY_VOLUME_NAME);
if (primaryMatches.length !== 1) throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_PRIMARY_VOLUME_RESOLUTION_FAILED:${primaryMatches.length}`);
const primary = primaryMatches[0];
const primaryId = text(primary?.id);
const primaryDc = text(primary?.dataCenterId);
if (!primaryId || !primaryDc || finite(primary?.size, 0) < MIN_VOLUME_GB) {
  throw new Error("AVANTIQO_IMAGE_MULTI_REGION_PRIMARY_VOLUME_INVALID");
}

const secondaryMatches = volumes.filter(
  (volume) =>
    text(volume?.name).startsWith(SECONDARY_VOLUME_PREFIX) &&
    text(volume?.dataCenterId) &&
    text(volume?.dataCenterId) !== primaryDc,
);
if (secondaryMatches.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_SECONDARY_VOLUME_RESOLUTION_FAILED:${secondaryMatches.length}`);
}
const secondary = secondaryMatches[0];
const secondaryId = text(secondary?.id);
const secondaryDc = text(secondary?.dataCenterId);
if (!secondaryId || !secondaryDc || finite(secondary?.size, 0) < MIN_VOLUME_GB) {
  throw new Error("AVANTIQO_IMAGE_MULTI_REGION_SECONDARY_VOLUME_INVALID");
}

const generationPool = list(endpoint?.gpuTypeIds).map(text).filter(Boolean);
if (!generationPool.length || generationPool.some((gpu) => !APPROVED_GENERATION_GPU_TYPES.has(gpu))) {
  throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_GENERATION_GPU_POOL_INVALID:${generationPool.join("|")}`);
}
const originalTemplateId = text(endpoint?.templateId);
const originalTimeoutMs = finite(endpoint?.executionTimeoutMs, GENERATION_EXECUTION_TIMEOUT_MS);

async function patchEndpoint({ volumeIds, dataCenterIds, gpuTypeIds, executionTimeoutMs }) {
  await restRequest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: {
      networkVolumeId: volumeIds[0],
      networkVolumeIds: volumeIds,
      dataCenterIds,
      gpuTypeIds,
      executionTimeoutMs,
    },
  });
}

async function verifyEndpoint({ volumeIds, dataCenterIds, gpuTypeIds }) {
  const current = await restRequest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=false`,
    managementKey,
  );
  if (text(current?.templateId) !== originalTemplateId) {
    throw new Error("AVANTIQO_IMAGE_MULTI_REGION_TEMPLATE_CHANGED");
  }
  if (!sameSet(endpointVolumeIds(current), volumeIds)) {
    throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_VOLUME_VERIFY_FAILED:${endpointVolumeIds(current).join("|")}`);
  }
  const actualDcs = parseDataCenters(current?.dataCenterIds);
  if (!dataCenterIds.every((dc) => actualDcs.includes(dc))) {
    throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_DATACENTER_VERIFY_FAILED:${actualDcs.join("|")}`);
  }
  if (!sameSet(list(current?.gpuTypeIds), gpuTypeIds)) {
    throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_GPU_POOL_VERIFY_FAILED:${list(current?.gpuTypeIds).join("|")}`);
  }
  return current;
}

let finalConfigured = false;
let activeCacheJobId = existingCacheJobId;
try {
  let existingJob = await queueRequest(
    endpointId,
    `/status/${encodeURIComponent(existingCacheJobId)}`,
    inferenceKey,
    { allowNotFound: true },
  );
  let existingStatus = existingJob?.__not_found ? "NOT_FOUND" : text(existingJob?.status).toUpperCase();
  console.log(`AVANTIQO_IMAGE_MULTI_REGION_RESUME_EXISTING_JOB_STATUS=${existingStatus || "UNKNOWN"}`);

  if (existingStatus === "COMPLETED") {
    if (!strictCacheValid(existingJob)) {
      throw new Error("AVANTIQO_IMAGE_MULTI_REGION_EXISTING_CACHE_COMPLETION_INVALID");
    }
    console.log("AVANTIQO_IMAGE_MULTI_REGION_RESUME_EXISTING_CACHE_READY=YES");
  } else if (existingStatus === "IN_PROGRESS") {
    console.log("AVANTIQO_IMAGE_MULTI_REGION_RESUME_EXISTING_CACHE_ALREADY_RUNNING=true");
    existingJob = await waitForJob(endpointId, existingCacheJobId, inferenceKey);
    if (!strictCacheValid(existingJob)) {
      throw new Error("AVANTIQO_IMAGE_MULTI_REGION_RUNNING_CACHE_COMPLETION_INVALID");
    }
    console.log("AVANTIQO_IMAGE_MULTI_REGION_RESUME_EXISTING_CACHE_READY=YES");
  } else {
    if (existingStatus === "IN_QUEUE") {
      const cancelled = await queueRequest(
        endpointId,
        `/cancel/${encodeURIComponent(existingCacheJobId)}`,
        inferenceKey,
        { method: "POST" },
      );
      const cancelledStatus = text(cancelled?.status).toUpperCase();
      if (!["CANCELLED", "CANCELED"].includes(cancelledStatus)) {
        throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_EXISTING_CACHE_CANCEL_FAILED:${cancelledStatus || "UNKNOWN"}`);
      }
      console.log(`AVANTIQO_IMAGE_MULTI_REGION_RESUME_EXISTING_CACHE_CANCELLED=${existingCacheJobId}`);
    } else if (!["NOT_FOUND", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(existingStatus)) {
      throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_EXISTING_CACHE_STATUS_UNSAFE:${existingStatus || "UNKNOWN"}`);
    }

    const healthAfterCancel = await queueRequest(endpointId, "/health", inferenceKey);
    const countsAfterCancel = queueCounts(healthAfterCancel);
    if (countsAfterCancel.queued || countsAfterCancel.in_progress) {
      throw new Error(
        `AVANTIQO_IMAGE_MULTI_REGION_QUEUE_NOT_IDLE_AFTER_CANCEL:queued=${countsAfterCancel.queued}:in_progress=${countsAfterCancel.in_progress}`,
      );
    }

    const cacheCandidates = await discoverCacheGpuPool(managementKey, secondaryDc);
    const cacheGpuPool = unique(cacheCandidates.map((candidate) => candidate.id));
    console.log(`AVANTIQO_IMAGE_MULTI_REGION_CACHE_GPU_POOL_COUNT=${cacheGpuPool.length}`);
    console.log(
      `AVANTIQO_IMAGE_MULTI_REGION_CACHE_GPU_STOCK=${JSON.stringify(cacheCandidates.map((gpu) => ({ name: gpu.name, stock: gpu.stock_status })))}`,
    );

    await patchEndpoint({
      volumeIds: [secondaryId],
      dataCenterIds: [secondaryDc],
      gpuTypeIds: cacheGpuPool,
      executionTimeoutMs: CACHE_EXECUTION_TIMEOUT_MS,
    });
    await verifyEndpoint({
      volumeIds: [secondaryId],
      dataCenterIds: [secondaryDc],
      gpuTypeIds: cacheGpuPool,
    });
    console.log("AVANTIQO_IMAGE_MULTI_REGION_CACHE_BOOTSTRAP_POOL_APPLIED=YES");

    const submitted = await queueRequest(endpointId, "/run", inferenceKey, {
      method: "POST",
      body: {
        input: {
          contract: "AVANTIQO_IMAGE_ENGINE_V1",
          operation: "cache_foundation_model",
          target_model: TARGET_MODEL,
        },
      },
    });
    activeCacheJobId = text(submitted?.id);
    if (!activeCacheJobId) throw new Error("AVANTIQO_IMAGE_MULTI_REGION_RESUME_CACHE_JOB_ID_MISSING");
    console.log(`AVANTIQO_IMAGE_MULTI_REGION_RESUME_CACHE_JOB=${activeCacheJobId}`);
    const completed = await waitForJob(endpointId, activeCacheJobId, inferenceKey);
    if (!strictCacheValid(completed)) {
      throw new Error("AVANTIQO_IMAGE_MULTI_REGION_RESUME_CACHE_VALIDATION_FAILED");
    }
    console.log("AVANTIQO_IMAGE_MULTI_REGION_SECONDARY_CACHE_READY=YES");
  }

  await patchEndpoint({
    volumeIds: [primaryId, secondaryId],
    dataCenterIds: [primaryDc, secondaryDc],
    gpuTypeIds: generationPool,
    executionTimeoutMs: originalTimeoutMs,
  });
  const verified = await verifyEndpoint({
    volumeIds: [primaryId, secondaryId],
    dataCenterIds: [primaryDc, secondaryDc],
    gpuTypeIds: generationPool,
  });
  finalConfigured = true;

  console.log("AVANTIQO_IMAGE_MULTI_REGION_RESUME=COMPLETE");
  console.log(JSON.stringify({
    success: true,
    contract: "AVANTIQO_IMAGE_MULTI_REGION_CACHE_RESUME_V1",
    primary: { id: primaryId, data_center_id: primaryDc, size_gb: finite(primary?.size) },
    secondary: { id: secondaryId, data_center_id: secondaryDc, size_gb: finite(secondary?.size) },
    completed_cache_job_id: activeCacheJobId,
    final_network_volume_ids: endpointVolumeIds(verified),
    final_data_center_ids: parseDataCenters(verified?.dataCenterIds),
    final_gpu_type_ids: list(verified?.gpuTypeIds),
    per_job_unblock_command_required: false,
    next_action: "RUN_ONE_IMAGE_QUALITY_TEST_AFTER_MULTI_REGION_READY",
  }, null, 2));
} catch (error) {
  if (!finalConfigured) {
    try {
      await patchEndpoint({
        volumeIds: [primaryId],
        dataCenterIds: [primaryDc],
        gpuTypeIds: generationPool,
        executionTimeoutMs: originalTimeoutMs,
      });
      await verifyEndpoint({
        volumeIds: [primaryId],
        dataCenterIds: [primaryDc],
        gpuTypeIds: generationPool,
      });
      console.error("AVANTIQO_IMAGE_MULTI_REGION_RESUME_PRIMARY_RESTORED=YES");
    } catch (restoreError) {
      console.error(`AVANTIQO_IMAGE_MULTI_REGION_RESUME_RESTORE_FAILED=${text(restoreError?.message || restoreError)}`);
    }
  }
  throw error;
}
