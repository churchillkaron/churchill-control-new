const CONTRACT = "AVANTIQO_VIDEO_RUNPOD_SCHEDULABILITY_V25";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CINEMA_NAME = "avantiqo-cinema-v1";
const REQUIRED_VOLUME_ID = "7pcdebhpga";
const REQUIRED_DC = "US-NC-2";
const MIN_MEMORY_GB = 80;
const SELECTED_GPU = "NVIDIA RTX PRO 6000 Blackwell Server Edition";
const CERTIFIED_BLACKWELL_POOL = [
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
];

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

function normalizeList(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const found = normalizeList(value[key], keys, depth + 1);
    if (found) return found;
  }
  return null;
}

function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}

function stockRank(value) {
  const normalized = text(value).toLowerCase();
  if (normalized === "high") return 4;
  if (normalized === "medium") return 3;
  if (normalized === "low") return 2;
  if (!normalized || ["none", "unavailable", "out of stock", "no stock"].includes(normalized)) return 0;
  return 1;
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw).slice(0, 900)}`);
  }
  return body ?? {};
}

async function rest(pathname, key) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_V25_REST");
}

async function queue(endpointId, key) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_V25_QUEUE");
}

async function queueCredentialWorks(endpointId, key) {
  if (!key) return false;
  try {
    const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    await response.arrayBuffer();
    return response.ok;
  } catch {
    return false;
  }
}

async function selectQueueCredential(endpointId, managementKey) {
  const candidates = [
    ["RUNPOD_AVANTIQO_VIDEO_API_KEY", text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY)],
    ["RUNPOD_API_KEY", text(process.env.RUNPOD_API_KEY)],
    ["RUNPOD_MANAGEMENT_API_KEY", managementKey],
  ];
  const seen = new Set();
  for (const [source, key] of candidates) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (await queueCredentialWorks(endpointId, key)) return { source, key };
  }
  throw new Error("AVANTIQO_VIDEO_V25_QUEUE_CREDENTIAL_NOT_FOUND");
}

function healthSummary(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  const workerCounts = {
    idle: finite(workers.idle, 0),
    initializing: finite(workers.initializing, 0),
    ready: finite(workers.ready, 0),
    running: finite(workers.running, 0),
    throttled: finite(workers.throttled, 0),
    unhealthy: finite(workers.unhealthy, 0),
  };
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers: workerCounts,
    worker_total: Object.values(workerCounts).reduce((sum, value) => sum + value, 0),
  };
}

async function gpuInventory(managementKey, minDiskGb) {
  const queryText = `
    query AvantiqoVideoSchedulabilityV25($secureInput: GpuAvailabilityInput, $constrainedInput: GpuAvailabilityInput) {
      gpuTypes {
        id
        displayName
        memoryInGb
        secureCloud
        communityCloud
      }
      dataCenters {
        id
        name
        location
        secureFiltered: gpuAvailability(input: $secureInput) {
          gpuTypeId
          gpuTypeDisplayName
          displayName
          stockStatus
        }
        constrained: gpuAvailability(input: $constrainedInput) {
          gpuTypeId
          gpuTypeDisplayName
          displayName
          stockStatus
        }
        unfiltered: gpuAvailability {
          gpuTypeId
          gpuTypeDisplayName
          displayName
          stockStatus
        }
      }
    }
  `;
  const variables = {
    secureInput: {
      gpuCount: 1,
      minDisk: Math.max(5, minDiskGb),
      minMemoryInGb: MIN_MEMORY_GB,
      secureCloud: true,
    },
    constrainedInput: {
      gpuCount: 1,
      minDisk: Math.max(5, minDiskGb),
      minMemoryInGb: MIN_MEMORY_GB,
    },
  };
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: queryText, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await readJson(response, "AVANTIQO_VIDEO_V25_GRAPHQL");
  if (Array.isArray(body.errors) && body.errors.length) {
    throw new Error(`AVANTIQO_VIDEO_V25_GRAPHQL_ERROR:${redact(body.errors.map((entry) => entry?.message).filter(Boolean).join(" | ")).slice(0, 1200)}`);
  }
  return body.data || {};
}

function stockMap(entries = []) {
  return new Map(list(entries).map((entry) => [text(entry?.gpuTypeId), {
    gpu_type_id: text(entry?.gpuTypeId),
    display_name: text(entry?.gpuTypeDisplayName || entry?.displayName || entry?.gpuTypeId) || null,
    stock_status: text(entry?.stockStatus) || "none",
    stock_rank: stockRank(entry?.stockStatus),
  }]));
}

function poolRows(pool, gpuTypes, secureMap, constrainedMap, unfilteredMap) {
  return pool.map((gpuTypeId) => {
    const meta = gpuTypes.get(gpuTypeId) || {};
    const secure = secureMap.get(gpuTypeId);
    const constrained = constrainedMap.get(gpuTypeId);
    const unfiltered = unfilteredMap.get(gpuTypeId);
    return {
      gpu_type_id: gpuTypeId,
      display_name: text(meta.displayName) || secure?.display_name || constrained?.display_name || unfiltered?.display_name || null,
      memory_gb: finite(meta.memoryInGb, null),
      gpu_type_supports_secure_cloud: meta.secureCloud === true,
      gpu_type_supports_community_cloud: meta.communityCloud === true,
      secure_filtered_stock: secure?.stock_status || "not-listed",
      secure_filtered_stock_rank: secure?.stock_rank || 0,
      constrained_stock: constrained?.stock_status || "not-listed",
      constrained_stock_rank: constrained?.stock_rank || 0,
      unfiltered_stock: unfiltered?.stock_status || "not-listed",
      unfiltered_stock_rank: unfiltered?.stock_rank || 0,
    };
  });
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_V25_NODE24_REQUIRED:${process.version}`);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const [endpointRaw, volumesRaw, templatesRaw] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
]);
const endpoints = normalizeList(endpointRaw, ["endpoints", "serverlessEndpoints"]);
const volumes = normalizeList(volumesRaw, ["networkVolumes", "volumes"]);
const templates = normalizeList(templatesRaw, ["templates"]);
if (!endpoints || !volumes || !templates) throw new Error("AVANTIQO_VIDEO_V25_INVENTORY_INVALID");

const configuredId = text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID);
const endpointMatches = configuredId
  ? endpoints.filter((entry) => text(entry?.id) === configuredId && text(entry?.name) === CINEMA_NAME)
  : endpoints.filter((entry) => text(entry?.name) === CINEMA_NAME);
if (endpointMatches.length !== 1) throw new Error(`AVANTIQO_VIDEO_V25_CINEMA_RESOLUTION_FAILED:${endpointMatches.length}`);
const endpoint = endpointMatches[0];
const endpointId = text(endpoint.id);
const templateId = text(endpoint.templateId || endpoint.template?.id);
const templateMatches = templates.filter((entry) => text(entry?.id) === templateId);
if (templateMatches.length !== 1) throw new Error(`AVANTIQO_VIDEO_V25_TEMPLATE_RESOLUTION_FAILED:${templateMatches.length}`);
const template = templateMatches[0];

const volumeMatches = volumes.filter((entry) => text(entry?.id) === REQUIRED_VOLUME_ID);
if (volumeMatches.length !== 1) throw new Error(`AVANTIQO_VIDEO_V25_VOLUME_RESOLUTION_FAILED:${volumeMatches.length}`);
const volume = volumeMatches[0];
if (text(volume.dataCenterId) !== REQUIRED_DC) {
  throw new Error(`AVANTIQO_VIDEO_V25_VOLUME_DC_CHANGED:${text(volume.dataCenterId)}`);
}
const boundVolumes = endpointVolumeIds(endpoint);
if (!boundVolumes.includes(REQUIRED_VOLUME_ID)) {
  throw new Error(`AVANTIQO_VIDEO_V25_VOLUME_BINDING_MISSING:${JSON.stringify(boundVolumes)}`);
}

const queueCredential = await selectQueueCredential(endpointId, managementKey);
const health = healthSummary(await queue(endpointId, queueCredential.key));
if (finite(endpoint.workersMin, -1) !== 0 || finite(endpoint.workersMax, -1) !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V25_CINEMA_NOT_RESTING_0_0:${finite(endpoint.workersMin)}/${finite(endpoint.workersMax)}`);
}
if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0 || health.worker_total !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V25_CINEMA_NOT_QUIESCENT:${JSON.stringify(health)}`);
}

const containerDiskGb = Math.max(5, finite(template.containerDiskInGb, 50));
const gpuData = await gpuInventory(managementKey, containerDiskGb);
const dcMatches = list(gpuData.dataCenters).filter((entry) => text(entry?.id) === REQUIRED_DC);
if (dcMatches.length !== 1) throw new Error(`AVANTIQO_VIDEO_V25_DATACENTER_RESOLUTION_FAILED:${dcMatches.length}`);
const dc = dcMatches[0];
const gpuTypes = new Map(list(gpuData.gpuTypes).map((entry) => [text(entry?.id), entry]));
const secureMap = stockMap(dc.secureFiltered);
const constrainedMap = stockMap(dc.constrained);
const unfilteredMap = stockMap(dc.unfiltered);
const pool = poolRows(CERTIFIED_BLACKWELL_POOL, gpuTypes, secureMap, constrainedMap, unfilteredMap);
const secureStocked = pool.filter((entry) => entry.secure_filtered_stock_rank > 0);
const constrainedStocked = pool.filter((entry) => entry.constrained_stock_rank > 0);
const unfilteredStocked = pool.filter((entry) => entry.unfiltered_stock_rank > 0);
const selected = pool.find((entry) => entry.gpu_type_id === SELECTED_GPU) || null;

let diagnosis = "NO_CERTIFIED_BLACKWELL_STOCK_IN_US_NC2";
let recommendation = "DO_NOT_OPEN_ANOTHER_VIDEO_GPU_LEASE";
if (secureStocked.length > 0) {
  diagnosis = "CERTIFIED_BLACKWELL_SECURE_STOCK_EXISTS_BUT_SINGLE_GPU_NARROWING_WAS_NOT_SCHEDULABLE";
  recommendation = "RETRY_SAFE_LEASE_WITH_FULL_CERTIFIED_BLACKWELL_POOL_NO_SINGLE_GPU_NARROWING";
} else if (constrainedStocked.length > 0 || unfilteredStocked.length > 0) {
  diagnosis = "VISIBLE_STOCK_IS_NOT_SECURE_FILTERED_SCHEDULABLE_FOR_US_NC2_VOLUME";
  recommendation = "DO_NOT_RETRY_US_NC2_LEASE_PLAN_SECOND_VIDEO_VOLUME_IN_STOCKED_S3_DATACENTER";
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  cinema: {
    id: endpointId,
    name: CINEMA_NAME,
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    gpu_count: finite(endpoint.gpuCount, 1),
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    data_center_ids: list(endpoint.dataCenterIds).map(text).filter(Boolean),
    allowed_cuda_versions: list(endpoint.allowedCudaVersions).map(text).filter(Boolean),
    min_cuda_version: text(endpoint.minCudaVersion) || null,
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    network_volume_ids: boundVolumes,
  },
  template: {
    id: templateId,
    image: text(template.imageName) || null,
    container_disk_gb: containerDiskGb,
    volume_mount_path: text(template.volumeMountPath) || null,
  },
  network_volume: {
    id: text(volume.id),
    name: text(volume.name) || null,
    data_center_id: text(volume.dataCenterId),
    size_gb: finite(volume.size ?? volume.sizeGb, null),
  },
  queue: {
    credential_source: queueCredential.source,
    ...health,
  },
  stock_query_basis: {
    data_center_id: REQUIRED_DC,
    gpu_count: 1,
    minimum_memory_gb: MIN_MEMORY_GB,
    minimum_disk_gb: containerDiskGb,
    secure_cloud_filter_applied: true,
    compares_secure_filtered_constrained_and_unfiltered_stock: true,
  },
  certified_blackwell_pool: pool,
  secure_filtered_stocked_blackwell: secureStocked,
  constrained_stocked_blackwell: constrainedStocked,
  unfiltered_stocked_blackwell: unfilteredStocked,
  previously_selected_single_gpu: selected,
  diagnosis,
  recommendation,
  provider_mutation_performed: false,
  endpoint_capacity_changed: false,
  runpod_job_submitted: false,
  gpu_compute_used: false,
  production_web_deploy: false,
  secrets_printed: false,
}, null, 2));
console.log(`AVANTIQO_VIDEO_RUNPOD_SCHEDULABILITY_V25=${diagnosis}`);
