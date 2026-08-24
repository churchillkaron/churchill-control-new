const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const TARGET_MODEL = "Qwen/Qwen-Image-2512";
const CACHE_COMPLETION_CONTRACT = "AVANTIQO_IMAGE_CACHE_COMPLETION_V1";
const DEFAULT_SECONDARY_VOLUME_SIZE_GB = 80;
const STORAGE_USD_PER_GB_MONTH = 0.07;
const TEMP_EXECUTION_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const CACHE_POLL_MS = 10_000;
const CACHE_MAX_WAIT_MS = 110 * 60 * 1000;

const APPROVED_GPU_TYPES = [
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
];

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
function approved(value) {
  return ["YES", "TRUE", "1", "APPROVED"].includes(text(value).toUpperCase());
}
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}
function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function parseDataCenters(value) {
  if (Array.isArray(value)) return unique(value);
  return unique(text(value).split(","));
}
function endpointVolumeIds(endpoint = {}) {
  return unique([
    endpoint.networkVolumeId,
    ...list(endpoint.networkVolumeIds),
  ]);
}
function stockScore(status) {
  const value = text(status).toUpperCase();
  if (value === "HIGH") return 500;
  if (value === "MEDIUM") return 400;
  if (value === "LOW") return 300;
  if (value && value !== "NONE" && value !== "UNAVAILABLE") return 100;
  return 0;
}
function regionPreference(id) {
  const order = [
    "AP-JP-1",
    "OC-AU-1",
    "EU-CZ-1",
    "US-WA-1",
    "US-CA-2",
    "EU-NL-1",
    "EU-SE-1",
    "US-GA-2",
    "US-IL-1",
    "US-KS-2",
    "US-NC-1",
  ];
  const index = order.indexOf(text(id));
  return index < 0 ? 0 : order.length - index;
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
function safeEndpoint(endpoint = {}) {
  return {
    id_present: Boolean(text(endpoint.id)),
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId) || null,
    network_volume_ids: endpointVolumeIds(endpoint),
    data_center_ids: parseDataCenters(endpoint.dataCenterIds),
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
  };
}
function safeVolume(volume = {}) {
  return {
    id: text(volume.id) || null,
    name: text(volume.name) || null,
    size_gb: finite(volume.size),
    data_center_id: text(volume.dataCenterId) || null,
  };
}
function staleJobIdFromArgs() {
  const arg = process.argv.find((value) => value.startsWith("--stale-job-id="));
  return text(arg ? arg.slice("--stale-job-id=".length) : process.env.AVANTIQO_IMAGE_STALE_JOB_ID);
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

async function queueRequest(endpointId, path, inferenceKey, options = {}) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${inferenceKey}`,
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
    if (response.status === 404 && options.allowNotFound === true) {
      return { __not_found: true };
    }
    const detail = text(body?.error || body?.message || raw).slice(0, 1200);
    throw new Error(`RUNPOD_QUEUE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function discoverDatacenters(managementKey) {
  const query = `
    query AvantiqoImageMultiRegion($input: GpuAvailabilityInput) {
      dataCenters {
        id
        name
        location
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
    const detail = text(body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw).slice(0, 1200);
    throw new Error(`RUNPOD_DATACENTER_DISCOVERY_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  return body.data.dataCenters;
}

function datacenterCandidates(dataCenters, primaryDc, gpuPool) {
  return dataCenters
    .filter((dc) => dc?.storageSupport === true && text(dc?.id) && text(dc?.id) !== primaryDc)
    .map((dc) => {
      const compatible = list(dc?.gpuAvailability)
        .filter((gpu) => gpuPool.includes(text(gpu?.gpuTypeId)))
        .map((gpu) => ({
          gpu_type_id: text(gpu?.gpuTypeId),
          gpu_name: text(gpu?.gpuTypeDisplayName || gpu?.displayName) || null,
          stock_status: text(gpu?.stockStatus) || null,
          score: stockScore(gpu?.stockStatus),
        }))
        .filter((gpu) => gpu.gpu_type_id && gpu.score > 0)
        .sort((a, b) => b.score - a.score);
      const best = compatible[0] || null;
      return {
        id: text(dc?.id),
        name: text(dc?.name) || null,
        location: text(dc?.location) || null,
        best_gpu: best,
        compatible_gpu_count: compatible.length,
        score: (best?.score || 0) * 100 + regionPreference(dc?.id),
      };
    })
    .filter((dc) => dc.best_gpu)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

const apply = process.argv.includes("--apply");
const staleJobId = staleJobIdFromArgs();
const staleCancelApproved = approved(process.env.AVANTIQO_IMAGE_STALE_JOB_CANCEL_APPROVED);
const storageSpendApproved = approved(process.env.AVANTIQO_IMAGE_MULTI_REGION_STORAGE_SPEND_APPROVED);
const cacheSpendApproved = approved(process.env.AVANTIQO_IMAGE_MULTI_REGION_CACHE_SPEND_APPROVED);
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const secondarySizeGb = Math.max(
  DEFAULT_SECONDARY_VOLUME_SIZE_GB,
  Math.floor(finite(process.env.AVANTIQO_IMAGE_MULTI_REGION_VOLUME_SIZE_GB, DEFAULT_SECONDARY_VOLUME_SIZE_GB)),
);
const monthlyUsd = Number((secondarySizeGb * STORAGE_USD_PER_GB_MONTH).toFixed(2));

console.log(`AVANTIQO_IMAGE_MULTI_REGION_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log("AVANTIQO_IMAGE_MULTI_REGION_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_MULTI_REGION_NEW_IMAGE_GENERATION=false");
console.log("AVANTIQO_IMAGE_MULTI_REGION_TEMPLATE_MUTATION=false");
console.log("AVANTIQO_IMAGE_MULTI_REGION_SECRETS_PRINTED=false");
console.log(`AVANTIQO_IMAGE_MULTI_REGION_SECONDARY_VOLUME_GB=${secondarySizeGb}`);
console.log(`AVANTIQO_IMAGE_MULTI_REGION_ESTIMATED_EXTRA_MONTHLY_USD=${monthlyUsd.toFixed(2)}`);

const endpoints = await restRequest("/endpoints?includeTemplate=false&includeWorkers=false", managementKey);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
const endpointMatches = endpoints.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
if (endpointMatches.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_ENDPOINT_RESOLUTION_FAILED:matches=${endpointMatches.length}`);
}
const endpointId = text(endpointMatches[0]?.id);
if (!endpointId) throw new Error("AVANTIQO_IMAGE_MULTI_REGION_ENDPOINT_ID_MISSING");

let [endpoint, volumes, dataCenters, health] = await Promise.all([
  restRequest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  restRequest("/networkvolumes", managementKey),
  discoverDatacenters(managementKey),
  queueRequest(endpointId, "/health", inferenceKey),
]);
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");
if (text(endpoint?.name) !== IMAGE_ENDPOINT_NAME) throw new Error("AVANTIQO_IMAGE_MULTI_REGION_ENDPOINT_NAME_MISMATCH");

const attachedIds = endpointVolumeIds(endpoint);
if (attachedIds.length < 1) throw new Error("AVANTIQO_IMAGE_MULTI_REGION_PRIMARY_VOLUME_REQUIRED");
if (attachedIds.length > 2) throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_UNEXPECTED_VOLUME_COUNT:${attachedIds.length}`);
const attachedVolumes = attachedIds
  .map((id) => volumes.find((volume) => text(volume?.id) === id))
  .filter(Boolean);
if (attachedVolumes.length !== attachedIds.length) throw new Error("AVANTIQO_IMAGE_MULTI_REGION_ATTACHED_VOLUME_LOOKUP_FAILED");
const primaryVolume = attachedVolumes[0];
const primaryDc = text(primaryVolume?.dataCenterId);
if (!primaryDc) throw new Error("AVANTIQO_IMAGE_MULTI_REGION_PRIMARY_DATACENTER_REQUIRED");

const gpuPool = list(endpoint?.gpuTypeIds).map(text).filter(Boolean);
if (!gpuPool.length) throw new Error("AVANTIQO_IMAGE_MULTI_REGION_GPU_POOL_REQUIRED");
const unapprovedGpuTypes = gpuPool.filter((id) => !APPROVED_GPU_TYPES.includes(id));
if (unapprovedGpuTypes.length) {
  throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_UNAPPROVED_GPU_TYPES:${unapprovedGpuTypes.join("|")}`);
}

const candidates = datacenterCandidates(dataCenters, primaryDc, gpuPool);
if (!candidates.length && attachedIds.length < 2) {
  throw new Error("AVANTIQO_IMAGE_MULTI_REGION_NO_SECONDARY_DATACENTER_WITH_COMPATIBLE_GPU_STOCK");
}
const selectedDc = attachedIds.length >= 2
  ? { id: text(attachedVolumes[1]?.dataCenterId), existing: true }
  : candidates[0];
const secondaryName = `avantiqo-image-model-cache-ha-${text(selectedDc.id).toLowerCase()}`;
let secondaryVolume = attachedIds.length >= 2
  ? attachedVolumes[1]
  : volumes.find(
      (volume) =>
        text(volume?.name) === secondaryName &&
        text(volume?.dataCenterId) === text(selectedDc.id),
    ) || null;
if (secondaryVolume && finite(secondaryVolume?.size, 0) < secondarySizeGb) {
  throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_EXISTING_SECONDARY_TOO_SMALL:${finite(secondaryVolume?.size, 0)}`);
}

let counts = queueCounts(health);
let staleJob = null;
if (staleJobId) {
  staleJob = await queueRequest(endpointId, `/status/${encodeURIComponent(staleJobId)}`, inferenceKey, { allowNotFound: true });
}
const staleStatus = staleJob?.__not_found ? "NOT_FOUND" : text(staleJob?.status).toUpperCase() || null;

const plan = {
  success: true,
  contract: "AVANTIQO_IMAGE_MULTI_REGION_V1",
  mode: apply ? "APPLY" : "PLAN",
  endpoint: safeEndpoint(endpoint),
  primary_volume: safeVolume(primaryVolume),
  secondary_volume: secondaryVolume ? safeVolume(secondaryVolume) : {
    name: secondaryName,
    size_gb: secondarySizeGb,
    data_center_id: text(selectedDc.id),
    estimated_extra_monthly_usd: monthlyUsd,
  },
  selected_secondary_datacenter: selectedDc,
  candidate_datacenters: candidates.slice(0, 8),
  queue: counts,
  stale_job: staleJobId ? { id: staleJobId, status: staleStatus } : null,
  approvals: {
    stale_job_cancel_required_if_queued: true,
    storage_spend_approved: storageSpendApproved,
    cache_compute_spend_approved: cacheSpendApproved,
  },
  target: {
    one_endpoint: true,
    two_datacenters: true,
    one_network_volume_per_datacenter: true,
    qwen_cache_required_on_both_volumes: true,
    provider_runtime_change_required: false,
    per_job_unblock_command_required: false,
  },
};

if (!apply) {
  console.log("AVANTIQO_IMAGE_MULTI_REGION_PLAN=READY");
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

if (!storageSpendApproved) {
  throw new Error("AVANTIQO_IMAGE_MULTI_REGION_STORAGE_SPEND_APPROVAL_REQUIRED");
}
if (!cacheSpendApproved) {
  throw new Error("AVANTIQO_IMAGE_MULTI_REGION_CACHE_SPEND_APPROVAL_REQUIRED");
}

if (counts.queued || counts.in_progress) {
  if (
    counts.queued === 1 &&
    counts.in_progress === 0 &&
    staleJobId &&
    staleStatus === "IN_QUEUE" &&
    staleCancelApproved
  ) {
    const cancel = await queueRequest(endpointId, `/cancel/${encodeURIComponent(staleJobId)}`, inferenceKey, { method: "POST" });
    const cancelStatus = text(cancel?.status).toUpperCase();
    if (!["CANCELLED", "CANCELED"].includes(cancelStatus)) {
      throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_STALE_JOB_CANCEL_FAILED:${cancelStatus || "UNKNOWN"}`);
    }
    console.log(`AVANTIQO_IMAGE_MULTI_REGION_STALE_JOB_CANCELLED=${staleJobId}`);
    health = await queueRequest(endpointId, "/health", inferenceKey);
    counts = queueCounts(health);
  }
}
if (counts.queued || counts.in_progress) {
  throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_QUEUE_NOT_IDLE:queued=${counts.queued}:in_progress=${counts.in_progress}`);
}

const originalEndpoint = await restRequest(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
const original = safeEndpoint(originalEndpoint);
const originalVolumeIds = endpointVolumeIds(originalEndpoint);
if (!originalVolumeIds.includes(text(primaryVolume?.id))) {
  throw new Error("AVANTIQO_IMAGE_MULTI_REGION_PRIMARY_VOLUME_CHANGED_BEFORE_WRITE");
}
if (text(originalEndpoint?.templateId) !== text(endpoint?.templateId)) {
  throw new Error("AVANTIQO_IMAGE_MULTI_REGION_TEMPLATE_CHANGED_BEFORE_WRITE");
}
if (!sameSet(list(originalEndpoint?.gpuTypeIds), gpuPool)) {
  throw new Error("AVANTIQO_IMAGE_MULTI_REGION_GPU_POOL_CHANGED_BEFORE_WRITE");
}

let volumeCreated = false;
let endpointTemporarilyRebound = false;
let cacheJobId = null;
let cacheCompleted = false;

async function patchEndpointVolumes({ volumeIds, dataCenterIds, timeoutMs }) {
  await restRequest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: {
      networkVolumeId: volumeIds[0],
      networkVolumeIds: volumeIds,
      dataCenterIds,
      executionTimeoutMs: timeoutMs,
    },
  });
}

async function restorePrimaryOnly(reason) {
  if (!endpointTemporarilyRebound) return;
  await patchEndpointVolumes({
    volumeIds: originalVolumeIds,
    dataCenterIds: parseDataCenters(originalEndpoint?.dataCenterIds).length
      ? parseDataCenters(originalEndpoint?.dataCenterIds)
      : [primaryDc],
    timeoutMs: original.execution_timeout_ms,
  });
  const restored = await restRequest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=false`,
    managementKey,
  );
  if (!sameSet(endpointVolumeIds(restored), originalVolumeIds)) {
    throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_RESTORE_FAILED:${reason}`);
  }
  endpointTemporarilyRebound = false;
  console.log(`AVANTIQO_IMAGE_MULTI_REGION_PRIMARY_CONFIGURATION_RESTORED=${reason}`);
}

try {
  if (!secondaryVolume) {
    secondaryVolume = await restRequest("/networkvolumes", managementKey, {
      method: "POST",
      body: {
        name: secondaryName,
        size: secondarySizeGb,
        dataCenterId: text(selectedDc.id),
      },
    });
    volumeCreated = true;
    console.log("AVANTIQO_IMAGE_MULTI_REGION_SECONDARY_VOLUME_CREATED=true");
  } else {
    console.log("AVANTIQO_IMAGE_MULTI_REGION_SECONDARY_VOLUME_REUSED=true");
  }

  const secondaryId = text(secondaryVolume?.id);
  const secondaryDc = text(secondaryVolume?.dataCenterId);
  if (!secondaryId || !secondaryDc) throw new Error("AVANTIQO_IMAGE_MULTI_REGION_SECONDARY_VOLUME_INVALID");
  if (secondaryDc === primaryDc) throw new Error("AVANTIQO_IMAGE_MULTI_REGION_SECONDARY_MUST_BE_DIFFERENT_DATACENTER");

  // Bind only the new volume while populating it so the cache job cannot land on the already-cached primary volume.
  await patchEndpointVolumes({
    volumeIds: [secondaryId],
    dataCenterIds: [secondaryDc],
    timeoutMs: TEMP_EXECUTION_TIMEOUT_MS,
  });
  endpointTemporarilyRebound = true;
  const rebound = await restRequest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=false`,
    managementKey,
  );
  if (!sameSet(endpointVolumeIds(rebound), [secondaryId])) {
    throw new Error("AVANTIQO_IMAGE_MULTI_REGION_SECONDARY_BIND_VERIFY_FAILED");
  }
  console.log(`AVANTIQO_IMAGE_MULTI_REGION_CACHE_DATACENTER=${secondaryDc}`);

  const submit = await queueRequest(endpointId, "/run", inferenceKey, {
    method: "POST",
    body: {
      input: {
        contract: "AVANTIQO_IMAGE_ENGINE_V1",
        operation: "cache_foundation_model",
        target_model: TARGET_MODEL,
      },
    },
  });
  cacheJobId = text(submit?.id);
  let cacheStatus = text(submit?.status).toUpperCase();
  let cacheBody = submit;
  if (!cacheJobId && cacheStatus !== "COMPLETED") {
    throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_CACHE_JOB_ID_MISSING:${cacheStatus || "UNKNOWN"}`);
  }
  console.log(`AVANTIQO_IMAGE_MULTI_REGION_CACHE_JOB=${cacheJobId || "completed-immediately"}`);

  const deadline = Date.now() + CACHE_MAX_WAIT_MS;
  let lastPrinted = 0;
  while (cacheStatus !== "COMPLETED") {
    if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(cacheStatus)) {
      throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_CACHE_${cacheStatus}:${text(cacheBody?.error || cacheBody?.output?.error)}`);
    }
    if (Date.now() >= deadline) {
      if (cacheJobId) {
        const cancel = await queueRequest(endpointId, `/cancel/${encodeURIComponent(cacheJobId)}`, inferenceKey, { method: "POST" });
        console.log(`AVANTIQO_IMAGE_MULTI_REGION_CACHE_CANCELLED_ON_WAIT_TIMEOUT=${text(cancel?.status).toUpperCase()}`);
      }
      throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_CACHE_WAIT_TIMEOUT:${cacheJobId || "UNKNOWN"}`);
    }
    if (Date.now() - lastPrinted >= 30_000) {
      const cacheHealth = await queueRequest(endpointId, "/health", inferenceKey);
      const progress = queueCounts(cacheHealth);
      console.log(`AVANTIQO_IMAGE_MULTI_REGION_CACHE_PROGRESS status=${cacheStatus || "UNKNOWN"} queued=${progress.queued} in_progress=${progress.in_progress}`);
      lastPrinted = Date.now();
    }
    await sleep(CACHE_POLL_MS);
    cacheBody = await queueRequest(endpointId, `/status/${encodeURIComponent(cacheJobId)}`, inferenceKey);
    cacheStatus = text(cacheBody?.status).toUpperCase();
  }

  if (!strictCacheValid(cacheBody)) {
    console.log(JSON.stringify(cacheBody?.output || {}, null, 2));
    throw new Error("AVANTIQO_IMAGE_MULTI_REGION_SECONDARY_CACHE_VALIDATION_FAILED");
  }
  cacheCompleted = true;
  console.log("AVANTIQO_IMAGE_MULTI_REGION_SECONDARY_CACHE_READY=YES");

  const finalVolumeIds = [text(primaryVolume?.id), secondaryId];
  const finalDataCenters = [primaryDc, secondaryDc];
  await patchEndpointVolumes({
    volumeIds: finalVolumeIds,
    dataCenterIds: finalDataCenters,
    timeoutMs: original.execution_timeout_ms,
  });

  const verified = await restRequest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=false`,
    managementKey,
  );
  if (!sameSet(endpointVolumeIds(verified), finalVolumeIds)) {
    throw new Error("AVANTIQO_IMAGE_MULTI_REGION_FINAL_VOLUME_VERIFY_FAILED");
  }
  const verifiedDcs = parseDataCenters(verified?.dataCenterIds);
  if (!finalDataCenters.every((dc) => verifiedDcs.includes(dc))) {
    throw new Error(`AVANTIQO_IMAGE_MULTI_REGION_FINAL_DATACENTER_VERIFY_FAILED:${verifiedDcs.join("|")}`);
  }
  if (!sameSet(list(verified?.gpuTypeIds), gpuPool)) {
    throw new Error("AVANTIQO_IMAGE_MULTI_REGION_FINAL_GPU_POOL_CHANGED");
  }
  endpointTemporarilyRebound = false;

  console.log("AVANTIQO_IMAGE_MULTI_REGION=COMPLETE");
  console.log(JSON.stringify({
    ...plan,
    mode: "APPLY",
    mutation_performed: true,
    secondary_volume_created: volumeCreated,
    secondary_cache_job_id: cacheJobId,
    secondary_cache_ready: cacheCompleted,
    final_endpoint: safeEndpoint(verified),
    final_volumes: [safeVolume(primaryVolume), safeVolume(secondaryVolume)],
    next_action: "RUN_ONE_IMAGE_QUALITY_TEST_WITH_MULTI_REGION_SCHEDULING",
  }, null, 2));
} catch (error) {
  try {
    await restorePrimaryOnly("MIGRATION_FAILURE");
  } catch (restoreError) {
    console.error(`AVANTIQO_IMAGE_MULTI_REGION_RESTORE_ERROR=${text(restoreError?.message || restoreError)}`);
  }
  console.error(`AVANTIQO_IMAGE_MULTI_REGION_SECONDARY_VOLUME_LEFT_INTACT=${secondaryVolume ? text(secondaryVolume?.id) : "NONE"}`);
  throw error;
}
