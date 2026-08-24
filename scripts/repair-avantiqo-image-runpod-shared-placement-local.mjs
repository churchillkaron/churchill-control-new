import {
  classifyManagedVolumeName,
  groupCacheVolumes,
  resolveReusableGroupVolume,
  sharedVolumeGroup,
  sharedVolumePolicySummary,
} from "./lib/avantiqo-runpod-shared-volumes.mjs";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const SHARED_GROUP = sharedVolumeGroup("IMAGE_VIDEO");
const MIN_GPU_MEMORY_GB = 80;
const MIN_SHARED_VOLUME_GB = 80;
const QUIESCENCE_TIMEOUT_MS = Math.max(
  30_000,
  Number(process.env.AVANTIQO_IMAGE_SHARED_PLACEMENT_QUIESCENCE_MS || 5 * 60 * 1000),
);
const POLL_MS = 5_000;
const CONTRACT = "AVANTIQO_IMAGE_SHARED_CAPACITY_PLACEMENT_V1";

const GPU_PROFILES = Object.freeze([
  Object.freeze({
    key: "RTX_PRO_6000_96GB",
    match: /RTX\s*PRO\s*6000/i,
    vram_gb: 96,
    usd_per_hour_reference: 3.49,
    preference: 5000,
  }),
  Object.freeze({
    key: "H100_NVL_94GB",
    match: /H100.*NVL|NVL.*H100/i,
    vram_gb: 94,
    usd_per_hour_reference: 4.79,
    preference: 4800,
  }),
  Object.freeze({
    key: "H100_80GB",
    match: /\bH100\b/i,
    exclude: /NVL/i,
    vram_gb: 80,
    usd_per_hour_reference: 4.79,
    preference: 4700,
  }),
  Object.freeze({
    key: "H200_141GB",
    match: /\bH200\b/i,
    vram_gb: 141,
    usd_per_hour_reference: 5.93,
    preference: 4600,
  }),
  Object.freeze({
    key: "B200_180GB",
    match: /\bB200\b/i,
    vram_gb: 180,
    usd_per_hour_reference: 8.64,
    preference: 4500,
  }),
]);

function text(value) {
  return String(value ?? "").trim();
}
function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (!text(value)) return [];
  return text(value).split(",").map((entry) => entry.trim()).filter(Boolean);
}
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}
function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function upper(value) {
  return text(value).toUpperCase();
}
function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(upper(value));
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function endpointDatacenterCompatible(endpoint, requiredDataCenterId) {
  const ids = list(endpoint?.dataCenterIds);
  // RunPod may omit dataCenterIds when a network volume is attached. In that
  // case the network volume's data center is the authoritative placement
  // constraint, matching the Code runtime diagnostic's effective placement.
  return ids.length === 0 || ids.includes(requiredDataCenterId);
}
function profileForGpu(gpu = {}) {
  const label = [gpu?.gpuTypeId, gpu?.gpuTypeDisplayName, gpu?.displayName]
    .map(text)
    .filter(Boolean)
    .join(" ");
  return GPU_PROFILES.find(
    (profile) => profile.match.test(label) && !(profile.exclude && profile.exclude.test(label)),
  ) || null;
}
function stockRank(status) {
  return ({ HIGH: 4, MEDIUM: 3, LOW: 2 }[upper(status)] || 0);
}
function safeGpu(gpu = {}) {
  const profile = profileForGpu(gpu);
  return {
    gpu_type_id: text(gpu?.gpuTypeId) || null,
    gpu_name: text(gpu?.gpuTypeDisplayName || gpu?.displayName) || null,
    profile: profile?.key || null,
    vram_gb: profile?.vram_gb || null,
    usd_per_hour_reference: profile?.usd_per_hour_reference ?? null,
    preference: profile?.preference || 0,
    available: gpu?.available === true,
    stock_status: text(gpu?.stockStatus) || null,
    stock_rank: stockRank(gpu?.stockStatus),
  };
}
function rankedGpuObjects(dataCenter = {}) {
  return (Array.isArray(dataCenter?.gpuAvailability) ? dataCenter.gpuAvailability : [])
    .map(safeGpu)
    .filter((gpu) => gpu.profile && gpu.vram_gb >= MIN_GPU_MEMORY_GB)
    .filter((gpu) => gpu.available === true && gpu.stock_rank > 0 && gpu.gpu_type_id)
    .sort((left, right) =>
      right.stock_rank - left.stock_rank ||
      left.usd_per_hour_reference - right.usd_per_hour_reference ||
      right.preference - left.preference ||
      left.gpu_type_id.localeCompare(right.gpu_type_id)
    );
}
function healthCounters(body = {}) {
  const jobs = body?.jobs && typeof body.jobs === "object" ? body.jobs : {};
  const workers = body?.workers && typeof body.workers === "object" ? body.workers : {};
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
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
function activeJobs(counters) {
  return counters.jobs.in_queue + counters.jobs.in_progress;
}
function activeWorkers(counters) {
  return Object.values(counters.workers).reduce((sum, value) => sum + finite(value, 0), 0);
}
function safeEndpoint(endpoint = {}) {
  return {
    id_present: Boolean(text(endpoint?.id)),
    name: text(endpoint?.name) || null,
    template_id_present: Boolean(text(endpoint?.templateId || endpoint?.template?.id)),
    network_volume_ids: endpointVolumeIds(endpoint),
    data_center_ids: list(endpoint?.dataCenterIds),
    gpu_type_ids: list(endpoint?.gpuTypeIds),
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    execution_timeout_ms: finite(endpoint?.executionTimeoutMs),
  };
}
function safeVolume(volume = {}) {
  return {
    id: text(volume?.id) || null,
    name: text(volume?.name) || null,
    size_gb: finite(volume?.size),
    data_center_id: text(volume?.dataCenterId) || null,
    group: classifyManagedVolumeName(volume?.name)?.id || null,
  };
}
function cancelJobArg() {
  const arg = process.argv.find((value) => value.startsWith("--cancel-stuck-job="));
  return text(arg ? arg.slice("--cancel-stuck-job=".length) : "");
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
  return body;
}
async function rest(path, key, options = {}) {
  const response = await fetch(`${REST_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  return readJsonResponse(response, "RUNPOD_REST");
}
async function serverless(endpointId, path, key, options = {}) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  return readJsonResponse(response, "RUNPOD_SERVERLESS");
}
async function discoverDatacenters(key) {
  const query = `
    query AvantiqoImageSharedCapacityPlacement($input: GpuAvailabilityInput) {
      dataCenters {
        id
        name
        location
        storageSupport
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
  const response = await fetch(`${GRAPHQL_URL}?api_key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: {
        input: {
          gpuCount: 1,
          minDisk: 5,
          minMemoryInGb: MIN_GPU_MEMORY_GB,
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
function resolveEndpoint(endpoints, configuredId) {
  if (configuredId) {
    const matches = endpoints.filter((endpoint) => text(endpoint?.id) === configuredId);
    if (matches.length !== 1 || text(matches[0]?.name) !== IMAGE_ENDPOINT_NAME) {
      throw new Error(`AVANTIQO_IMAGE_SHARED_CONFIGURED_ENDPOINT_INVALID:matches=${matches.length}`);
    }
    return { endpoint: matches[0], resolution: "ENV_VERIFIED" };
  }
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_IMAGE_SHARED_ENDPOINT_EXACT_NAME_REQUIRED:matches=${matches.length}`);
  }
  return { endpoint: matches[0], resolution: "EXACT_NAME" };
}
async function waitForQuiescence(endpointId, inferenceKey) {
  const deadline = Date.now() + QUIESCENCE_TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    const health = await serverless(endpointId, "/health", inferenceKey);
    last = healthCounters(health);
    if (activeJobs(last) === 0 && activeWorkers(last) === 0) return last;
    console.log(`AVANTIQO_IMAGE_SHARED_QUIESCENCE_WAIT=${JSON.stringify(last)}`);
    await sleep(POLL_MS);
  }
  throw new Error(`AVANTIQO_IMAGE_SHARED_QUIESCENCE_TIMEOUT:${JSON.stringify(last)}`);
}

const apply = process.argv.includes("--apply");
const approved = yes(process.env.AVANTIQO_IMAGE_SHARED_PLACEMENT_APPROVED);
if (apply && !approved) {
  throw new Error("AVANTIQO_IMAGE_SHARED_PLACEMENT_APPROVED=YES_REQUIRED");
}
const cancelJobId = cancelJobArg();
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);

console.log(`AVANTIQO_IMAGE_SHARED_PLACEMENT_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log(`AVANTIQO_IMAGE_SHARED_PLACEMENT_GROUP=${SHARED_GROUP.id}`);
console.log(`AVANTIQO_IMAGE_SHARED_PLACEMENT_CANONICAL_VOLUME=${SHARED_GROUP.canonical_name}`);
console.log(`AVANTIQO_IMAGE_SHARED_PLACEMENT_MIN_GPU_GB=${MIN_GPU_MEMORY_GB}`);
console.log("AVANTIQO_IMAGE_SHARED_PLACEMENT_PER_ENGINE_VOLUME_CREATION=false");
console.log("AVANTIQO_IMAGE_SHARED_PLACEMENT_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_IMAGE_SHARED_PLACEMENT_MODEL_DOWNLOAD_SUBMITTED=false");
console.log("AVANTIQO_IMAGE_SHARED_PLACEMENT_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_SHARED_PLACEMENT_SECRETS_PRINTED=false");

const [endpoints, volumes, dataCenters] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
  discoverDatacenters(managementKey),
]);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");

const resolved = resolveEndpoint(endpoints, configuredEndpointId);
const endpoint = resolved.endpoint;
const endpointId = text(endpoint.id);
const templateId = text(endpoint?.templateId || endpoint?.template?.id);
if (!templateId) throw new Error("AVANTIQO_IMAGE_SHARED_TEMPLATE_ID_REQUIRED");

const reusable = resolveReusableGroupVolume(volumes, SHARED_GROUP);
const sharedVolume = reusable.volume;
if (!sharedVolume) {
  throw new Error(
    `AVANTIQO_IMAGE_SHARED_VOLUME_REQUIRED:create_once_via_shared_volume_policy:name=${SHARED_GROUP.canonical_name}`,
  );
}
if (finite(sharedVolume?.size, 0) < MIN_SHARED_VOLUME_GB) {
  throw new Error(
    `AVANTIQO_IMAGE_SHARED_VOLUME_TOO_SMALL:id=${text(sharedVolume?.id)}:size_gb=${finite(sharedVolume?.size, 0)}:minimum_gb=${MIN_SHARED_VOLUME_GB}`,
  );
}
const sharedVolumeId = text(sharedVolume.id);
const sharedDataCenterId = text(sharedVolume.dataCenterId);
if (!sharedVolumeId || !sharedDataCenterId) {
  throw new Error("AVANTIQO_IMAGE_SHARED_VOLUME_ID_AND_DATACENTER_REQUIRED");
}

const sharedDc = dataCenters.find((dc) => text(dc?.id) === sharedDataCenterId) || null;
if (!sharedDc || sharedDc.storageSupport !== true) {
  throw new Error(`AVANTIQO_IMAGE_SHARED_DATACENTER_INVALID:${sharedDataCenterId}`);
}
const sharedDcCandidates = rankedGpuObjects(sharedDc);
const globalCapacity = dataCenters
  .filter((dc) => dc?.storageSupport === true)
  .map((dc) => ({
    data_center_id: text(dc?.id) || null,
    data_center_name: text(dc?.name) || null,
    location: text(dc?.location) || null,
    candidates: rankedGpuObjects(dc),
  }))
  .filter((dc) => dc.data_center_id && dc.candidates.length)
  .sort((left, right) => {
    const a = left.candidates[0];
    const b = right.candidates[0];
    return (
      b.stock_rank - a.stock_rank ||
      a.usd_per_hour_reference - b.usd_per_hour_reference ||
      left.data_center_id.localeCompare(right.data_center_id)
    );
  });

const currentHealth = healthCounters(await serverless(endpointId, "/health", inferenceKey));
const attachedIds = endpointVolumeIds(endpoint);
const attachedVolumes = volumes.filter((volume) => attachedIds.includes(text(volume?.id)));
const legacyGroupVolumes = groupCacheVolumes(volumes, SHARED_GROUP).filter(
  (volume) => text(volume?.id) !== sharedVolumeId,
);
const targetGpuTypes = unique(sharedDcCandidates.slice(0, 4).map((gpu) => gpu.gpu_type_id));
const placementReady =
  sameSet(attachedIds, [sharedVolumeId]) &&
  endpointDatacenterCompatible(endpoint, sharedDataCenterId) &&
  targetGpuTypes.length > 0 &&
  sameSet(list(endpoint?.gpuTypeIds), targetGpuTypes) &&
  finite(endpoint?.workersMin) === 0 &&
  finite(endpoint?.workersMax) === 1;

const report = {
  success: sharedDcCandidates.length > 0,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint_resolution: resolved.resolution,
  endpoint: safeEndpoint(endpoint),
  effective_placement: {
    data_center_id: sharedDataCenterId,
    source: "NETWORK_VOLUME_DATACENTER",
    endpoint_data_center_ids_omitted_is_valid: true,
  },
  shared_volume_group: SHARED_GROUP.id,
  shared_volume_policy: sharedVolumePolicySummary(volumes),
  shared_volume_resolution: reusable.resolution,
  shared_volume: safeVolume(sharedVolume),
  currently_attached_volumes: attachedVolumes.map(safeVolume),
  detached_legacy_group_volumes_after_apply: legacyGroupVolumes.map(safeVolume),
  shared_datacenter: {
    id: sharedDataCenterId,
    name: text(sharedDc?.name) || null,
    location: text(sharedDc?.location) || null,
    approved_stocked_gpus: sharedDcCandidates,
  },
  target_gpu_type_ids: targetGpuTypes,
  global_approved_capacity: globalCapacity.slice(0, 12),
  current_health: currentHealth,
  placement_ready: placementReady,
  mutation_performed: false,
  stuck_job_cancelled: false,
  new_job_submitted: false,
  model_download_submitted: false,
  production_deploy: false,
  next_action: sharedDcCandidates.length
    ? placementReady
      ? "PROBE_SHARED_IMAGE_CACHE"
      : apply
        ? "ALIGN_IMAGE_ENDPOINT_TO_SHARED_VOLUME_AND_CAPACITY"
        : "APPROVE_SHARED_IMAGE_PLACEMENT"
    : "RELOCATE_IMAGE_VIDEO_SHARED_VOLUME_TO_STOCKED_80GB_PLUS_DATACENTER",
};

if (!sharedDcCandidates.length) {
  console.log("AVANTIQO_IMAGE_SHARED_PLACEMENT_BLOCKED_NO_GPU_STOCK_IN_SHARED_VOLUME_DC=true");
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 2;
  process.exit(0);
}
if (!apply || placementReady) {
  console.log(`AVANTIQO_IMAGE_SHARED_PLACEMENT_PLAN=${placementReady ? "ALREADY_READY" : "READY"}`);
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

// Refetch endpoint + health immediately before mutation.
let freshEndpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
if (!Array.isArray(freshEndpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID_BEFORE_WRITE");
let fresh = resolveEndpoint(freshEndpoints, endpointId).endpoint;
if (text(fresh?.templateId || fresh?.template?.id) !== templateId) {
  throw new Error("AVANTIQO_IMAGE_SHARED_TEMPLATE_CHANGED_REPLAN_REQUIRED");
}
let freshHealth = healthCounters(await serverless(endpointId, "/health", inferenceKey));
let stuckJobCancelled = false;

if (activeJobs(freshHealth) > 0) {
  if (!cancelJobId) {
    throw new Error(
      `AVANTIQO_IMAGE_SHARED_LIVE_JOB_BLOCKED:in_queue=${freshHealth.jobs.in_queue}:in_progress=${freshHealth.jobs.in_progress}:use_--cancel-stuck-job=<id>_only_for_the_known_stuck_queued_job`,
    );
  }
  if (freshHealth.jobs.in_queue !== 1 || freshHealth.jobs.in_progress !== 0) {
    throw new Error(
      `AVANTIQO_IMAGE_SHARED_CANCEL_UNSAFE:in_queue=${freshHealth.jobs.in_queue}:in_progress=${freshHealth.jobs.in_progress}`,
    );
  }
  const job = await serverless(endpointId, `/status/${encodeURIComponent(cancelJobId)}`, inferenceKey);
  if (upper(job?.status) !== "IN_QUEUE") {
    throw new Error(`AVANTIQO_IMAGE_SHARED_CANCEL_JOB_NOT_QUEUED:status=${upper(job?.status) || "UNKNOWN"}`);
  }
  await serverless(endpointId, `/cancel/${encodeURIComponent(cancelJobId)}`, inferenceKey, {
    method: "POST",
  });
  stuckJobCancelled = true;
  console.log(`AVANTIQO_IMAGE_SHARED_STUCK_JOB_CANCELLED=${cancelJobId}`);
}

// Stop new worker allocation while the old placement drains.
await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
  method: "PATCH",
  body: { workersMin: 0, workersMax: 0 },
});
await waitForQuiescence(endpointId, inferenceKey);

// Refetch again after drain. Preserve template and refuse to overwrite concurrent placement changes.
freshEndpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
fresh = resolveEndpoint(freshEndpoints, endpointId).endpoint;
if (text(fresh?.templateId || fresh?.template?.id) !== templateId) {
  throw new Error("AVANTIQO_IMAGE_SHARED_TEMPLATE_CHANGED_AFTER_DRAIN_REPLAN_REQUIRED");
}

await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
  method: "PATCH",
  body: {
    networkVolumeId: sharedVolumeId,
    networkVolumeIds: [sharedVolumeId],
    dataCenterIds: [sharedDataCenterId],
    gpuTypeIds: targetGpuTypes,
    workersMin: 0,
    workersMax: 1,
  },
});

const verified = await rest(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
if (text(verified?.templateId || verified?.template?.id) !== templateId) {
  throw new Error("AVANTIQO_IMAGE_SHARED_TEMPLATE_CHANGED_DURING_APPLY");
}
if (!sameSet(endpointVolumeIds(verified), [sharedVolumeId])) {
  throw new Error(`AVANTIQO_IMAGE_SHARED_VOLUME_VERIFY_FAILED:${endpointVolumeIds(verified).join("|")}`);
}
if (!endpointDatacenterCompatible(verified, sharedDataCenterId)) {
  throw new Error(`AVANTIQO_IMAGE_SHARED_DATACENTER_VERIFY_FAILED:${list(verified?.dataCenterIds).join("|")}`);
}
if (!sameSet(list(verified?.gpuTypeIds), targetGpuTypes)) {
  throw new Error(`AVANTIQO_IMAGE_SHARED_GPU_POOL_VERIFY_FAILED:${list(verified?.gpuTypeIds).join("|")}`);
}
if (finite(verified?.workersMin) !== 0 || finite(verified?.workersMax) !== 1) {
  throw new Error(
    `AVANTIQO_IMAGE_SHARED_SCALING_VERIFY_FAILED:min=${finite(verified?.workersMin)}:max=${finite(verified?.workersMax)}`,
  );
}

console.log("AVANTIQO_IMAGE_SHARED_PLACEMENT_APPLY=COMPLETE");
console.log(JSON.stringify({
  ...report,
  success: true,
  mode: "APPLY",
  endpoint: safeEndpoint(verified),
  effective_placement: {
    data_center_id: sharedDataCenterId,
    source: "NETWORK_VOLUME_DATACENTER",
    endpoint_data_center_ids_omitted_is_valid: list(verified?.dataCenterIds).length === 0,
  },
  mutation_performed: true,
  stuck_job_cancelled: stuckJobCancelled,
  new_job_submitted: false,
  model_download_submitted: false,
  production_deploy: false,
  next_action: "PROBE_SHARED_IMAGE_CACHE",
}, null, 2));
