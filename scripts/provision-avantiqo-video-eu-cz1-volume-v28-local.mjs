const CONTRACT = "AVANTIQO_VIDEO_EU_CZ1_VOLUME_PROVISION_V28";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const APPROVAL_ENV = "AVANTIQO_VIDEO_EU_CZ1_VOLUME_CREATE_APPROVED";
const CINEMA_NAME = "avantiqo-cinema-v1";
const CURRENT_VOLUME_ID = "7pcdebhpga";
const CURRENT_DC = "US-NC-2";
const TARGET_DC = "EU-CZ-1";
const TARGET_S3_ENDPOINT = "https://s3api-eu-cz-1.runpod.io/";
const TARGET_VOLUME_NAME = "avantiqo-video-cache-eu-cz-1";
const TARGET_VOLUME_SIZE_GB = 400;
const TARGET_GPU = "NVIDIA RTX PRO 6000 Blackwell Server Edition";
const MIN_MEMORY_GB = 80;

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
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

function stockAvailable(value) {
  const normalized = text(value).toLowerCase();
  return Boolean(normalized) && !["none", "unavailable", "out of stock", "no stock"].includes(normalized);
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

async function rest(pathname, key, options = {}) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  }), "AVANTIQO_VIDEO_V28_REST");
}

async function queueHealth(endpointId, key) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_V28_QUEUE");
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
  throw new Error("AVANTIQO_VIDEO_V28_QUEUE_CREDENTIAL_NOT_FOUND");
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

async function discoverTarget(managementKey) {
  const queryText = `
    query AvantiqoVideoVolumeV28($input: GpuAvailabilityInput) {
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
        storageSupport
        gpuAvailability(input: $input) {
          gpuTypeId
          gpuTypeDisplayName
          displayName
          stockStatus
        }
      }
    }
  `;
  const variables = {
    input: {
      gpuCount: 1,
      minDisk: 5,
      minMemoryInGb: MIN_MEMORY_GB,
      secureCloud: true,
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
  const body = await readJson(response, "AVANTIQO_VIDEO_V28_GRAPHQL");
  if (Array.isArray(body.errors) && body.errors.length) {
    throw new Error(`AVANTIQO_VIDEO_V28_GRAPHQL_ERROR:${redact(body.errors.map((entry) => entry?.message).filter(Boolean).join(" | ")).slice(0, 1200)}`);
  }
  const data = body.data || {};
  const dc = list(data.dataCenters).find((entry) => text(entry?.id) === TARGET_DC);
  if (!dc) throw new Error(`AVANTIQO_VIDEO_V28_TARGET_DC_NOT_FOUND:${TARGET_DC}`);
  if (dc.storageSupport !== true) throw new Error(`AVANTIQO_VIDEO_V28_TARGET_DC_STORAGE_UNSUPPORTED:${TARGET_DC}`);
  const gpu = list(data.gpuTypes).find((entry) => text(entry?.id) === TARGET_GPU) || {};
  const stock = list(dc.gpuAvailability).find((entry) => text(entry?.gpuTypeId) === TARGET_GPU) || {};
  if (finite(gpu.memoryInGb, 0) < MIN_MEMORY_GB) {
    throw new Error(`AVANTIQO_VIDEO_V28_TARGET_GPU_MEMORY_INVALID:${finite(gpu.memoryInGb, 0)}`);
  }
  if (gpu.secureCloud !== true) throw new Error("AVANTIQO_VIDEO_V28_TARGET_GPU_SECURE_CLOUD_REQUIRED");
  if (!stockAvailable(stock.stockStatus)) {
    throw new Error(`AVANTIQO_VIDEO_V28_TARGET_GPU_NOT_IN_SECURE_STOCK:${text(stock.stockStatus) || "not-listed"}`);
  }
  return {
    data_center_id: TARGET_DC,
    data_center_name: text(dc.name) || TARGET_DC,
    location: text(dc.location) || null,
    storage_support: true,
    s3_endpoint: TARGET_S3_ENDPOINT,
    gpu_type_id: TARGET_GPU,
    gpu_display_name: text(stock.gpuTypeDisplayName || stock.displayName || gpu.displayName) || null,
    memory_gb: finite(gpu.memoryInGb, null),
    secure_cloud_supported: true,
    stock_status: text(stock.stockStatus),
  };
}

function safeVolume(volume = {}) {
  return {
    id: text(volume.id) || null,
    name: text(volume.name) || null,
    size_gb: finite(volume.size ?? volume.sizeGb, null),
    data_center_id: text(volume.dataCenterId) || null,
  };
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_V28_NODE24_REQUIRED:${process.version}`);
}

const apply = process.argv.includes("--apply");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const [endpointRaw, volumesRaw, target] = await Promise.all([
  rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
  discoverTarget(managementKey),
]);
const endpoints = normalizeList(endpointRaw, ["endpoints", "serverlessEndpoints"]);
const volumes = normalizeList(volumesRaw, ["networkVolumes", "volumes"]);
if (!endpoints || !volumes) throw new Error("AVANTIQO_VIDEO_V28_INVENTORY_INVALID");

const configuredId = text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID);
const matches = configuredId
  ? endpoints.filter((entry) => text(entry?.id) === configuredId && text(entry?.name) === CINEMA_NAME)
  : endpoints.filter((entry) => text(entry?.name) === CINEMA_NAME);
if (matches.length !== 1) throw new Error(`AVANTIQO_VIDEO_V28_CINEMA_RESOLUTION_FAILED:${matches.length}`);
const cinema = matches[0];
const cinemaId = text(cinema.id);
if (finite(cinema.workersMin, -1) !== 0 || finite(cinema.workersMax, -1) !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V28_CINEMA_NOT_RESTING_0_0:${finite(cinema.workersMin)}/${finite(cinema.workersMax)}`);
}
if (!endpointVolumeIds(cinema).includes(CURRENT_VOLUME_ID)) {
  throw new Error(`AVANTIQO_VIDEO_V28_CURRENT_SHARED_VOLUME_BINDING_MISSING:${JSON.stringify(endpointVolumeIds(cinema))}`);
}

const currentVolumeMatches = volumes.filter((entry) => text(entry?.id) === CURRENT_VOLUME_ID);
if (currentVolumeMatches.length !== 1) throw new Error(`AVANTIQO_VIDEO_V28_CURRENT_VOLUME_RESOLUTION_FAILED:${currentVolumeMatches.length}`);
const currentVolume = currentVolumeMatches[0];
if (text(currentVolume.dataCenterId) !== CURRENT_DC) {
  throw new Error(`AVANTIQO_VIDEO_V28_CURRENT_VOLUME_DC_CHANGED:${text(currentVolume.dataCenterId)}`);
}

const queueCredential = await selectQueueCredential(cinemaId, managementKey);
const health = healthSummary(await queueHealth(cinemaId, queueCredential.key));
if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0 || health.worker_total !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V28_CINEMA_NOT_QUIESCENT:${JSON.stringify(health)}`);
}

const sameName = volumes.filter((entry) => text(entry?.name) === TARGET_VOLUME_NAME);
const wrongDc = sameName.filter((entry) => text(entry?.dataCenterId) !== TARGET_DC);
if (wrongDc.length) {
  throw new Error(`AVANTIQO_VIDEO_V28_TARGET_NAME_EXISTS_IN_WRONG_DC:${JSON.stringify(wrongDc.map(safeVolume))}`);
}
const correctDc = sameName.filter((entry) => text(entry?.dataCenterId) === TARGET_DC);
if (correctDc.length > 1) throw new Error(`AVANTIQO_VIDEO_V28_DUPLICATE_TARGET_VOLUMES:${correctDc.length}`);
let existing = correctDc[0] || null;
if (existing && finite(existing.size ?? existing.sizeGb, 0) < TARGET_VOLUME_SIZE_GB) {
  throw new Error(`AVANTIQO_VIDEO_V28_EXISTING_TARGET_TOO_SMALL:id=${text(existing.id)}:size_gb=${finite(existing.size ?? existing.sizeGb, 0)}`);
}

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  target,
  current_cinema: {
    id: cinemaId,
    name: CINEMA_NAME,
    workers_min: 0,
    workers_max: 0,
    queue_and_workers_zero: true,
    network_volume_ids: endpointVolumeIds(cinema),
  },
  current_shared_volume: {
    ...safeVolume(currentVolume),
    preserved_untouched: true,
  },
  target_volume: existing ? safeVolume(existing) : {
    id: null,
    name: TARGET_VOLUME_NAME,
    size_gb: TARGET_VOLUME_SIZE_GB,
    data_center_id: TARGET_DC,
  },
  existing_target_volume_reusable: Boolean(existing),
  mutation_if_apply: existing ? "NONE_REUSE_EXISTING" : "CREATE_NEW_VIDEO_ONLY_NETWORK_VOLUME",
  endpoint_rebind_performed: false,
  current_volume_mutation_performed: false,
  current_volume_delete_performed: false,
  runpod_job_submitted: false,
  gpu_compute_used: false,
  storage_data_copy_performed: false,
  production_web_deploy: false,
  secrets_printed: false,
};
console.log(JSON.stringify(plan, null, 2));

if (!apply) {
  console.log("AVANTIQO_VIDEO_EU_CZ1_VOLUME_PROVISION_V28_APPLIED=false");
  process.exit(0);
}
if (!approved(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);

if (!existing) {
  const freshEndpoint = await rest(`/endpoints/${encodeURIComponent(cinemaId)}?includeTemplate=false&includeWorkers=true`, managementKey);
  if (finite(freshEndpoint.workersMin, -1) !== 0 || finite(freshEndpoint.workersMax, -1) !== 0) {
    throw new Error("AVANTIQO_VIDEO_V28_CONCURRENT_CINEMA_CAPACITY_CHANGE");
  }
  if (!endpointVolumeIds(freshEndpoint).includes(CURRENT_VOLUME_ID)) {
    throw new Error("AVANTIQO_VIDEO_V28_CONCURRENT_CINEMA_VOLUME_CHANGE");
  }
  const freshHealth = healthSummary(await queueHealth(cinemaId, queueCredential.key));
  if (freshHealth.jobs.in_queue !== 0 || freshHealth.jobs.in_progress !== 0 || freshHealth.worker_total !== 0) {
    throw new Error(`AVANTIQO_VIDEO_V28_CONCURRENT_CINEMA_ACTIVITY:${JSON.stringify(freshHealth)}`);
  }
  const freshTarget = await discoverTarget(managementKey);
  if (!stockAvailable(freshTarget.stock_status)) throw new Error("AVANTIQO_VIDEO_V28_TARGET_STOCK_DISAPPEARED");

  const freshVolumesRaw = await rest("/networkvolumes", managementKey);
  const freshVolumes = normalizeList(freshVolumesRaw, ["networkVolumes", "volumes"]);
  if (!freshVolumes) throw new Error("AVANTIQO_VIDEO_V28_FRESH_VOLUME_LIST_INVALID");
  const concurrentTarget = freshVolumes.filter((entry) => text(entry?.name) === TARGET_VOLUME_NAME);
  if (concurrentTarget.length) {
    throw new Error(`AVANTIQO_VIDEO_V28_CONCURRENT_TARGET_VOLUME_CREATED:${JSON.stringify(concurrentTarget.map(safeVolume))}`);
  }

  existing = await rest("/networkvolumes", managementKey, {
    method: "POST",
    body: {
      dataCenterId: TARGET_DC,
      name: TARGET_VOLUME_NAME,
      size: TARGET_VOLUME_SIZE_GB,
    },
  });
}

const volumeId = text(existing?.id);
if (!volumeId) throw new Error("AVANTIQO_VIDEO_V28_TARGET_VOLUME_ID_MISSING");
const verified = await rest(`/networkvolumes/${encodeURIComponent(volumeId)}`, managementKey);
if (
  text(verified.id) !== volumeId ||
  text(verified.name) !== TARGET_VOLUME_NAME ||
  text(verified.dataCenterId) !== TARGET_DC ||
  finite(verified.size ?? verified.sizeGb, 0) < TARGET_VOLUME_SIZE_GB
) {
  throw new Error(`AVANTIQO_VIDEO_V28_TARGET_VOLUME_VERIFY_FAILED:${JSON.stringify(safeVolume(verified))}`);
}

const finalCinema = await rest(`/endpoints/${encodeURIComponent(cinemaId)}?includeTemplate=false&includeWorkers=true`, managementKey);
if (!endpointVolumeIds(finalCinema).includes(CURRENT_VOLUME_ID)) throw new Error("AVANTIQO_VIDEO_V28_CURRENT_VOLUME_NO_LONGER_BOUND");
if (endpointVolumeIds(finalCinema).includes(volumeId)) throw new Error("AVANTIQO_VIDEO_V28_TARGET_VOLUME_MUST_NOT_BE_BOUND_YET");
if (finite(finalCinema.workersMin, -1) !== 0 || finite(finalCinema.workersMax, -1) !== 0) {
  throw new Error("AVANTIQO_VIDEO_V28_FINAL_CINEMA_MUST_REST_0_0");
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "APPLY",
  target_volume: safeVolume(verified),
  target_s3_endpoint: TARGET_S3_ENDPOINT,
  exact_certified_gpu_destination: target,
  current_shared_volume: {
    ...safeVolume(currentVolume),
    preserved_untouched: true,
  },
  cinema_still_bound_to_current_volume_only: true,
  endpoint_rebind_performed: false,
  current_volume_mutation_performed: false,
  current_volume_delete_performed: false,
  runpod_job_submitted: false,
  gpu_compute_used: false,
  storage_data_copy_performed: false,
  production_web_deploy: false,
  secrets_printed: false,
}, null, 2));
console.log("AVANTIQO_VIDEO_EU_CZ1_VOLUME_PROVISION_V28=PASS");
console.log("AVANTIQO_VIDEO_EU_CZ1_VOLUME_PROVISION_V28_APPLIED=true");
