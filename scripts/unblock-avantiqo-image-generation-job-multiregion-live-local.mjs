const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const TARGET_MODEL = "Qwen/Qwen-Image-2512";
const MIN_VOLUME_GB = 64;
const POLL_MS = 10_000;
const MAX_WAIT_MS = Math.max(
  POLL_MS,
  Number(process.env.AVANTIQO_IMAGE_GENERATION_UNBLOCK_WAIT_MS || 45 * 60 * 1000),
);

const BASELINE_GPU_TYPES = [
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
];

const FALLBACK_GPU_TYPES = [
  "NVIDIA A100 80GB PCIe",
  "NVIDIA A100-SXM4-80GB",
  "NVIDIA H100 PCIe",
  "NVIDIA H100 80GB HBM3",
  "NVIDIA H100 NVL",
  "NVIDIA H200 NVL",
  "NVIDIA H200",
  "NVIDIA B200",
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
function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}
function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
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
  const entry = process.argv.find((value) => value.startsWith("--job-id="));
  return text(entry ? entry.slice("--job-id=".length) : process.env.AVANTIQO_IMAGE_GENERATION_JOB_ID);
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function recognizedPool(pool) {
  const values = unique(pool);
  return (
    BASELINE_GPU_TYPES.every((gpu) => values.includes(gpu)) &&
    values.every((gpu) => BASELINE_GPU_TYPES.includes(gpu) || FALLBACK_GPU_TYPES.includes(gpu))
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
function healthSummary(health = {}) {
  const jobs = health?.jobs && typeof health.jobs === "object" ? health.jobs : {};
  const workers = health?.workers && typeof health.workers === "object" ? health.workers : {};
  return {
    queued: finite(jobs.inQueue ?? jobs.in_queue, 0),
    in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    initializing: finite(workers.initializing, 0),
    ready: finite(workers.ready, 0),
    running: finite(workers.running, 0),
    idle: finite(workers.idle, 0),
    throttled: finite(workers.throttled, 0),
    unhealthy: finite(workers.unhealthy, 0),
  };
}
function activeJobCount(health) {
  const summary = healthSummary(health);
  return summary.queued + summary.in_progress;
}
function generationOutputValid(job = {}) {
  const output = job?.output || {};
  const guidance = output?.generation_guidance || {};
  return (
    text(job?.status).toUpperCase() === "COMPLETED" &&
    text(output.capability) === "ai.image.generate" &&
    text(output.foundation_model) === TARGET_MODEL &&
    text(output.foundation_model_source) === "runpod-cache" &&
    text(output.runtime_revision) === "AVANTIQO_IMAGE_QWEN_2512_QUALITY_V1" &&
    Number(output.width) === 1328 &&
    Number(output.height) === 1328 &&
    Number(output.inference_steps) === 50 &&
    Number(output.size_bytes) > 10000 &&
    text(guidance.mode).toUpperCase() === "TRUE_CFG" &&
    Number(guidance.scale) === 4 &&
    guidance.negative_prompt_supplied === true &&
    guidance.negative_prompt_has_content === true &&
    text(guidance.quality_policy) === "QWEN_IMAGE_2512_REALISM_V1" &&
    output.raw_reasoning_persisted === false
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

async function queueRequest(endpointId, path, inferenceKey) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`, {
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
    const detail = text(body?.error || body?.message || raw).slice(0, 1200);
    throw new Error(`RUNPOD_QUEUE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function discoverGpuAvailability(managementKey) {
  const query = `
    query AvantiqoImageMultiRegionGenerationGpuAvailability($input: GpuAvailabilityInput) {
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
  if (!response.ok || body?.errors?.length || !Array.isArray(body?.data?.dataCenters)) {
    const detail = text(
      body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw,
    ).slice(0, 1200);
    throw new Error(`RUNPOD_GPU_AVAILABILITY_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  return body.data.dataCenters;
}

const jobId = jobIdFromArgs();
if (!jobId) {
  throw new Error("AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_JOB_ID_REQUIRED_USE_--job-id=<existing-job-id>");
}
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");

console.log("AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_MODE=EXISTING_JOB_ONLY");
console.log(`AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_JOB=${jobId}`);
console.log("AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_NEW_JOB_SUBMITTED=false");
console.log("AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_VOLUME_MUTATION=false");
console.log("AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_TEMPLATE_MUTATION=false");
console.log("AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_SECRETS_PRINTED=false");

const endpoints = await restRequest("/endpoints?includeTemplate=false&includeWorkers=false", managementKey);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
const endpointMatches = endpoints.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
if (endpointMatches.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_ENDPOINT_RESOLUTION_FAILED:matches=${endpointMatches.length}`);
}
const endpointId = text(endpointMatches[0]?.id);
if (!endpointId) throw new Error("AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_ENDPOINT_ID_MISSING");

const [endpoint, volumes, availability, initialJob, initialHealth] = await Promise.all([
  restRequest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  restRequest("/networkvolumes", managementKey),
  discoverGpuAvailability(managementKey),
  queueRequest(endpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey),
  queueRequest(endpointId, "/health", inferenceKey),
]);
if (text(endpoint?.name) !== IMAGE_ENDPOINT_NAME) {
  throw new Error("AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_ENDPOINT_NAME_MISMATCH");
}
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");

const volumeIds = endpointVolumeIds(endpoint);
if (volumeIds.length < 1 || volumeIds.length > 3) {
  throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_VOLUME_COUNT_INVALID:${volumeIds.length}`);
}
const attachedVolumes = volumeIds.map((id) => volumes.find((volume) => text(volume?.id) === id));
if (attachedVolumes.some((volume) => !volume)) {
  throw new Error("AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_ATTACHED_VOLUME_NOT_FOUND");
}
for (const volume of attachedVolumes) {
  if (finite(volume?.size, 0) < MIN_VOLUME_GB) {
    throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_VOLUME_TOO_SMALL:${text(volume?.id)}:${finite(volume?.size, 0)}`);
  }
}
const dataCenterIds = unique(attachedVolumes.map((volume) => volume?.dataCenterId));
if (dataCenterIds.length !== attachedVolumes.length) {
  throw new Error("AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_ONE_VOLUME_PER_DATACENTER_REQUIRED");
}

const templateId = text(endpoint?.templateId || endpoint?.template?.id);
if (!templateId) throw new Error("AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_TEMPLATE_ID_MISSING");
const currentPool = unique(list(endpoint?.gpuTypeIds));
if (!recognizedPool(currentPool)) {
  throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_UNRECOGNIZED_GPU_POOL:${currentPool.join("|")}`);
}

const terminalStatuses = new Set(["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"]);
let status = text(initialJob?.status).toUpperCase();
if (!["IN_QUEUE", "IN_PROGRESS", ...terminalStatuses].includes(status)) {
  throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_UNEXPECTED_JOB_STATUS:${status || "UNKNOWN"}`);
}
const initialActiveJobs = activeJobCount(initialHealth);
if (!terminalStatuses.has(status) && initialActiveJobs !== 1) {
  throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_ACTIVE_JOB_COUNT_UNSAFE:${initialActiveJobs}`);
}

const dcAvailability = new Map(
  availability
    .filter((dc) => dataCenterIds.includes(text(dc?.id)))
    .map((dc) => [text(dc?.id), list(dc?.gpuAvailability)]),
);
if (dcAvailability.size !== dataCenterIds.length) {
  throw new Error("AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_DATACENTER_AVAILABILITY_INCOMPLETE");
}

const fallbackEvidence = FALLBACK_GPU_TYPES.map((gpuId) => {
  const regions = dataCenterIds
    .map((dataCenterId) => {
      const candidate = list(dcAvailability.get(dataCenterId)).find(
        (entry) => text(entry?.gpuTypeId) === gpuId,
      );
      return {
        data_center_id: dataCenterId,
        stock: text(candidate?.stockStatus) || "UNAVAILABLE",
        score: stockScore(candidate?.stockStatus),
      };
    })
    .filter((entry) => entry.score > 0);
  return {
    gpu_type_id: gpuId,
    regions,
    best_score: Math.max(0, ...regions.map((entry) => entry.score)),
  };
}).filter((entry) => entry.best_score > 0);

fallbackEvidence.sort((left, right) => {
  const preference = (id) => FALLBACK_GPU_TYPES.indexOf(id);
  return right.best_score - left.best_score || preference(left.gpu_type_id) - preference(right.gpu_type_id);
});
const repairPool = unique([
  ...BASELINE_GPU_TYPES,
  ...fallbackEvidence.map((entry) => entry.gpu_type_id),
]);

console.log(`AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_INITIAL_STATUS=${status}`);
console.log(`AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_ATTACHED_DATACENTERS=${dataCenterIds.join("|")}`);
console.log(`AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_INITIAL_HEALTH=${JSON.stringify(healthSummary(initialHealth))}`);
console.log(`AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_FALLBACK_COUNT=${fallbackEvidence.length}`);
console.log(`AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_FALLBACK_STOCK=${JSON.stringify(fallbackEvidence)}`);

let repairApplied = !sameSet(currentPool, BASELINE_GPU_TYPES);

async function restoreBaseline(reason) {
  const live = await restRequest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
  );
  if (text(live?.templateId || live?.template?.id) !== templateId) {
    throw new Error("AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_REFUSE_RESTORE_TEMPLATE_CHANGED");
  }
  if (!sameSet(endpointVolumeIds(live), volumeIds)) {
    throw new Error("AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_REFUSE_RESTORE_VOLUMES_CHANGED");
  }
  const livePool = unique(list(live?.gpuTypeIds));
  if (!recognizedPool(livePool)) {
    throw new Error("AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_REFUSE_RESTORE_GPU_POOL_CHANGED");
  }
  if (!sameSet(livePool, BASELINE_GPU_TYPES)) {
    await restRequest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
      method: "PATCH",
      body: { gpuTypeIds: BASELINE_GPU_TYPES },
    });
    const verified = await restRequest(
      `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
      managementKey,
    );
    if (text(verified?.templateId || verified?.template?.id) !== templateId) {
      throw new Error("AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_RESTORE_TEMPLATE_VERIFY_FAILED");
    }
    if (!sameSet(endpointVolumeIds(verified), volumeIds)) {
      throw new Error("AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_RESTORE_VOLUME_VERIFY_FAILED");
    }
    if (!sameSet(unique(list(verified?.gpuTypeIds)), BASELINE_GPU_TYPES)) {
      throw new Error("AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_GPU_RESTORE_VERIFY_FAILED");
    }
    console.log(`AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_GPU_POOL_RESTORED=${reason}`);
  }
}

if (status === "IN_QUEUE" && fallbackEvidence.length > 0) {
  const [beforeWrite, jobBeforeWrite, healthBeforeWrite] = await Promise.all([
    restRequest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
    queueRequest(endpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey),
    queueRequest(endpointId, "/health", inferenceKey),
  ]);
  status = text(jobBeforeWrite?.status).toUpperCase();
  if (status === "IN_QUEUE") {
    if (activeJobCount(healthBeforeWrite) !== 1) {
      throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_ACTIVE_JOB_COUNT_CHANGED:${activeJobCount(healthBeforeWrite)}`);
    }
    if (text(beforeWrite?.templateId || beforeWrite?.template?.id) !== templateId) {
      throw new Error("AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_TEMPLATE_CHANGED_BEFORE_WRITE");
    }
    if (!sameSet(endpointVolumeIds(beforeWrite), volumeIds)) {
      throw new Error("AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_VOLUMES_CHANGED_BEFORE_WRITE");
    }
    const beforePool = unique(list(beforeWrite?.gpuTypeIds));
    if (!recognizedPool(beforePool)) {
      throw new Error("AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_GPU_POOL_CHANGED_BEFORE_WRITE");
    }
    if (!sameSet(beforePool, repairPool)) {
      await restRequest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
        method: "PATCH",
        body: { gpuTypeIds: repairPool },
      });
      repairApplied = true;
      const verified = await restRequest(
        `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
        managementKey,
      );
      if (!sameSet(unique(list(verified?.gpuTypeIds)), repairPool)) {
        throw new Error("AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_GPU_POOL_VERIFY_FAILED");
      }
      if (!sameSet(endpointVolumeIds(verified), volumeIds)) {
        throw new Error("AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_VOLUME_CHANGED_DURING_WRITE");
      }
      if (text(verified?.templateId || verified?.template?.id) !== templateId) {
        throw new Error("AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_TEMPLATE_CHANGED_DURING_WRITE");
      }
      console.log(`AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_GPU_POOL_WIDENED=${repairPool.length - BASELINE_GPU_TYPES.length}`);
    }
  }
}

let body = initialJob;
const deadline = Date.now() + MAX_WAIT_MS;
let lastStatus = "";
let lastPrintedAt = 0;
try {
  while (!terminalStatuses.has(status)) {
    if (Date.now() >= deadline) {
      throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_WAIT_TIMEOUT:${jobId}:status=${status}`);
    }
    body = await queueRequest(endpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey);
    status = text(body?.status).toUpperCase();
    const now = Date.now();
    if (status !== lastStatus || now - lastPrintedAt >= 30_000) {
      const health = await queueRequest(endpointId, "/health", inferenceKey);
      console.log(
        `AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_PROGRESS status=${status || "UNKNOWN"} health=${JSON.stringify(healthSummary(health))}`,
      );
      lastStatus = status;
      lastPrintedAt = now;
    }
    if (!terminalStatuses.has(status)) await sleep(POLL_MS);
  }
} finally {
  if (repairApplied) {
    await restoreBaseline(`TERMINAL_${status || "UNKNOWN"}`);
  }
}

const success = status === "COMPLETED" && generationOutputValid(body);
console.log(`AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_TERMINAL_STATUS=${status}`);
console.log(`AVANTIQO_IMAGE_MULTI_REGION_UNBLOCK_GENERATION_OUTPUT_VALID=${success}`);
console.log(JSON.stringify({
  success,
  contract: "AVANTIQO_IMAGE_MULTI_REGION_EXISTING_JOB_UNBLOCK_V1",
  job_id: jobId,
  final_status: status,
  new_job_submitted: false,
  attached_data_centers: dataCenterIds,
  fallback_gpu_types_used: repairApplied ? repairPool.slice(BASELINE_GPU_TYPES.length) : [],
  canonical_gpu_pool_restored: true,
  generation_output_valid: success,
  production_deploy: false,
}, null, 2));

if (!success) process.exitCode = 2;
