const CONTRACT = "AVANTIQO_VIDEO_RUNPOD_US_NC2_STOCK_PREFLIGHT_V20";
const REST_BASE = "https://rest.runpod.io/v1";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CINEMA_NAME = "avantiqo-cinema-v1";
const VOLUME_ID = "7pcdebhpga";
const VOLUME_NAME = "avantiqo-shared-image-video-cache";
const REQUIRED_DC = "US-NC-2";
const MIN_MEMORY_GB = 80;
const ORIGINAL_BLACKWELL_POOL = [
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
];
const PREVIOUS_PORTABLE_POOL = [
  "NVIDIA H200",
  "NVIDIA H100 80GB HBM3",
  "NVIDIA A100-SXM4-80GB",
];
const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${redact(body?.message || body?.error || raw).slice(0, 800)}`);
  return body ?? {};
}

async function rest(pathname, key) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_V20_REST");
}

async function graphql(query, key) {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await readJson(response, "AVANTIQO_VIDEO_V20_GRAPHQL");
  if (Array.isArray(body.errors) && body.errors.length) {
    throw new Error(`AVANTIQO_VIDEO_V20_GRAPHQL_ERROR:${redact(body.errors[0]?.message).slice(0, 800)}`);
  }
  return body.data || {};
}

function endpointList(body) {
  if (Array.isArray(body)) return body;
  for (const key of ["endpoints", "data", "items", "results"]) {
    if (Array.isArray(body?.[key])) return body[key];
  }
  return [];
}

function volumeList(body) {
  if (Array.isArray(body)) return body;
  for (const key of ["networkVolumes", "volumes", "data", "items", "results"]) {
    if (Array.isArray(body?.[key])) return body[key];
  }
  return [];
}

function stockRank(value) {
  const normalized = text(value).toLowerCase();
  if (normalized === "high") return 4;
  if (normalized === "medium") return 3;
  if (normalized === "low") return 2;
  if (!normalized || ["none", "unavailable", "out of stock", "no stock"].includes(normalized)) return 0;
  return 1;
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_V20_NODE24_REQUIRED:${process.version}`);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const [endpointRaw, volumeRaw, gpuData] = await Promise.all([
  rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
  graphql(`query AvantiqoVideoStockV20 {
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
      gpuAvailability {
        gpuTypeId
        displayName
        stockStatus
      }
    }
  }`, managementKey),
]);

const endpoints = endpointList(endpointRaw);
const cinemaMatches = endpoints.filter((entry) => text(entry?.name) === CINEMA_NAME);
if (cinemaMatches.length !== 1) throw new Error(`AVANTIQO_VIDEO_V20_CINEMA_RESOLUTION_FAILED:${cinemaMatches.length}`);
const cinema = cinemaMatches[0];
if (finite(cinema.workersMin, -1) !== 0 || finite(cinema.workersMax, -1) !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V20_CINEMA_MUST_REST_0_0:${finite(cinema.workersMin)}/${finite(cinema.workersMax)}`);
}
const activeWorkers = list(cinema.workers).filter((worker) => {
  const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
  const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
  const terminal = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
  return (status && !terminal.has(status)) || (desired && !terminal.has(desired)) || (!status && !desired);
});
if (activeWorkers.length) throw new Error(`AVANTIQO_VIDEO_V20_CINEMA_ACTIVE_WORKERS_PRESENT:${activeWorkers.length}`);

const volumes = volumeList(volumeRaw);
const volumeMatches = volumes.filter((entry) => text(entry?.id) === VOLUME_ID || text(entry?.name) === VOLUME_NAME);
if (volumeMatches.length !== 1) throw new Error(`AVANTIQO_VIDEO_V20_VOLUME_RESOLUTION_FAILED:${volumeMatches.length}`);
const volume = volumeMatches[0];
if (text(volume.id) !== VOLUME_ID || text(volume.name) !== VOLUME_NAME || text(volume.dataCenterId) !== REQUIRED_DC) {
  throw new Error(`AVANTIQO_VIDEO_V20_VOLUME_CONTRACT_CHANGED:${JSON.stringify({ id: volume.id || null, name: volume.name || null, data_center_id: volume.dataCenterId || null })}`);
}
const endpointVolumeIds = [...new Set([text(cinema.networkVolumeId), ...list(cinema.networkVolumeIds).map(text)].filter(Boolean))];
if (!endpointVolumeIds.includes(VOLUME_ID)) throw new Error(`AVANTIQO_VIDEO_V20_CINEMA_VOLUME_BINDING_MISSING:${JSON.stringify(endpointVolumeIds)}`);

const dcMatches = list(gpuData.dataCenters).filter((entry) => text(entry?.id) === REQUIRED_DC);
if (dcMatches.length !== 1) throw new Error(`AVANTIQO_VIDEO_V20_DATACENTER_RESOLUTION_FAILED:${dcMatches.length}`);
const dc = dcMatches[0];
const gpuTypes = new Map(list(gpuData.gpuTypes).map((gpu) => [text(gpu?.id), gpu]));
const availability = list(dc.gpuAvailability).map((entry) => {
  const gpuTypeId = text(entry?.gpuTypeId);
  const gpu = gpuTypes.get(gpuTypeId) || {};
  return {
    gpu_type_id: gpuTypeId,
    display_name: text(entry?.displayName || gpu?.displayName) || null,
    memory_gb: finite(gpu?.memoryInGb, null),
    stock_status: text(entry?.stockStatus) || "none",
    stock_rank: stockRank(entry?.stockStatus),
    secure_cloud: gpu?.secureCloud === true,
    community_cloud: gpu?.communityCloud === true,
  };
});

const largeMemory = availability
  .filter((entry) => finite(entry.memory_gb, 0) >= MIN_MEMORY_GB)
  .sort((a, b) => b.stock_rank - a.stock_rank || finite(b.memory_gb, 0) - finite(a.memory_gb, 0) || a.gpu_type_id.localeCompare(b.gpu_type_id));
const viable = largeMemory.filter((entry) => entry.stock_rank > 0);
const currentPool = list(cinema.gpuTypeIds).map(text).filter(Boolean);
const relevantIds = [...new Set([...currentPool, ...ORIGINAL_BLACKWELL_POOL, ...PREVIOUS_PORTABLE_POOL])];
const relevant = relevantIds.map((gpuTypeId) => {
  const found = availability.find((entry) => entry.gpu_type_id === gpuTypeId);
  const gpu = gpuTypes.get(gpuTypeId) || {};
  return found || {
    gpu_type_id: gpuTypeId,
    display_name: text(gpu?.displayName) || null,
    memory_gb: finite(gpu?.memoryInGb, null),
    stock_status: "not-listed-in-us-nc-2",
    stock_rank: 0,
    secure_cloud: gpu?.secureCloud === true,
    community_cloud: gpu?.communityCloud === true,
  };
});

const recommendation = viable.length
  ? "SAFE_LEASE_RUNTIME_PROBE_MAY_PROCEED_WITH_STOCKED_80GB_PLUS_POOL"
  : "DO_NOT_RETRY_US_NC2_CINEMA_LEASE_NO_STOCKED_80GB_PLUS_GPU";

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  read_only: true,
  provider_mutation_performed: false,
  runpod_job_submitted: false,
  endpoint_capacity_changed: false,
  gpu_compute_used: false,
  production_web_deploy: false,
  secrets_printed: false,
  cinema: {
    id: text(cinema.id),
    name: text(cinema.name),
    workers_min: finite(cinema.workersMin),
    workers_max: finite(cinema.workersMax),
    active_workers: activeWorkers.length,
    gpu_type_ids: currentPool,
    data_center_ids: list(cinema.dataCenterIds).map(text).filter(Boolean),
    network_volume_ids: endpointVolumeIds,
  },
  network_volume: {
    id: text(volume.id),
    name: text(volume.name),
    data_center_id: text(volume.dataCenterId),
    size_gb: finite(volume.size ?? volume.sizeGb, null),
  },
  stock_basis: {
    data_center_id: REQUIRED_DC,
    minimum_gpu_memory_gb: MIN_MEMORY_GB,
    source: "RUNPOD_GRAPHQL_DATA_CENTERS_GPU_AVAILABILITY",
  },
  current_and_previous_pool_stock: relevant,
  stocked_80gb_plus_gpu_types: viable,
  all_80gb_plus_gpu_types_in_us_nc2: largeMemory,
  viable_gpu_count: viable.length,
  recommendation,
}, null, 2));
console.log(`AVANTIQO_VIDEO_RUNPOD_US_NC2_STOCK_PREFLIGHT_V20=${viable.length ? "VIABLE" : "NO_STOCK"}`);
