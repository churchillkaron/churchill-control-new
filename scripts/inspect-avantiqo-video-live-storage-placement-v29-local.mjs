const CONTRACT = "AVANTIQO_VIDEO_LIVE_STORAGE_PLACEMENT_V29";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CINEMA_NAME = "avantiqo-cinema-v1";
const CURRENT_VOLUME_ID = "7pcdebhpga";
const CURRENT_DC = "US-NC-2";
const MIN_MEMORY_GB = 80;
const CERTIFIED_BLACKWELL_POOL = [
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
];
const COMPATIBILITY_REQUIRED_POOL = [
  "NVIDIA B200",
  "NVIDIA H200",
  "NVIDIA H100 80GB HBM3",
  "NVIDIA A100-SXM4-80GB",
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
  const normalized = text(value).toUpperCase();
  if (normalized === "HIGH") return 4;
  if (normalized === "MEDIUM") return 3;
  if (normalized === "LOW") return 2;
  return 0;
}

function riskPenalty(gpuTypeId) {
  if (CERTIFIED_BLACKWELL_POOL.includes(gpuTypeId)) return 0;
  if (gpuTypeId === "NVIDIA B200") return 20;
  if (gpuTypeId === "NVIDIA H200") return 30;
  if (gpuTypeId === "NVIDIA H100 80GB HBM3") return 40;
  if (gpuTypeId === "NVIDIA A100-SXM4-80GB") return 50;
  return 100;
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw).slice(0, 1000)}`);
  }
  return body ?? {};
}

async function rest(pathname, key) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_V29_REST");
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
  throw new Error("AVANTIQO_VIDEO_V29_QUEUE_CREDENTIAL_NOT_FOUND");
}

async function queueHealth(endpointId, key) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_V29_QUEUE");
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

async function discoverDatacenters(managementKey) {
  const queryText = `
    query AvantiqoVideoLiveStorageV29($input: GpuAvailabilityInput) {
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
        input: { gpuCount: 1, minDisk: 5, minMemoryInGb: MIN_MEMORY_GB, secureCloud: true },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await readJson(response, "AVANTIQO_VIDEO_V29_GRAPHQL");
  if (Array.isArray(body.errors) && body.errors.length) {
    throw new Error(`AVANTIQO_VIDEO_V29_GRAPHQL_ERROR:${redact(body.errors.map((entry) => entry?.message).filter(Boolean).join(" | ")).slice(0, 1200)}`);
  }
  return body.data || {};
}

function rankRows(gpuData) {
  const gpuTypes = new Map(list(gpuData.gpuTypes).map((entry) => [text(entry?.id), entry]));
  const allowed = new Set([...CERTIFIED_BLACKWELL_POOL, ...COMPATIBILITY_REQUIRED_POOL]);
  const rows = [];
  for (const dc of list(gpuData.dataCenters)) {
    const dcId = text(dc?.id);
    if (!dcId || dcId === CURRENT_DC || dc?.storageSupport !== true) continue;
    for (const availability of list(dc?.gpuAvailability)) {
      const gpuTypeId = text(availability?.gpuTypeId);
      if (!allowed.has(gpuTypeId)) continue;
      const meta = gpuTypes.get(gpuTypeId) || {};
      const rank = stockRank(availability?.stockStatus);
      if (availability?.available !== true || rank <= 0 || finite(meta?.memoryInGb, 0) < MIN_MEMORY_GB) continue;
      const certified = CERTIFIED_BLACKWELL_POOL.includes(gpuTypeId);
      rows.push({
        data_center_id: dcId,
        data_center_name: text(dc?.name) || dcId,
        location: text(dc?.location) || null,
        storage_support: true,
        gpu_type_id: gpuTypeId,
        display_name: text(availability?.gpuTypeDisplayName || availability?.displayName || meta?.displayName) || null,
        memory_gb: finite(meta?.memoryInGb, null),
        secure_cloud_supported: meta?.secureCloud === true,
        community_cloud_supported: meta?.communityCloud === true,
        provider_available: true,
        stock_status: text(availability?.stockStatus),
        stock_rank: rank,
        immutable_video_image_certified_for_this_gpu_family: certified,
        compatibility_probe_required_before_use: !certified,
        derived_s3_endpoint: `https://s3api-${dcId.toLowerCase()}.runpod.io/`,
        score: (certified ? 1000 : 0) + rank * 100 + finite(meta?.memoryInGb, 0) - riskPenalty(gpuTypeId),
      });
    }
  }
  return rows.sort((a, b) => b.score - a.score || b.stock_rank - a.stock_rank || b.memory_gb - a.memory_gb || a.data_center_id.localeCompare(b.data_center_id));
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_V29_NODE24_REQUIRED:${process.version}`);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const [endpointRaw, volumesRaw, gpuData] = await Promise.all([
  rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
  discoverDatacenters(managementKey),
]);
const endpoints = normalizeList(endpointRaw, ["endpoints", "serverlessEndpoints"]);
const volumes = normalizeList(volumesRaw, ["networkVolumes", "volumes"]);
if (!endpoints || !volumes) throw new Error("AVANTIQO_VIDEO_V29_INVENTORY_INVALID");

const configuredId = text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID);
const matches = configuredId
  ? endpoints.filter((entry) => text(entry?.id) === configuredId && text(entry?.name) === CINEMA_NAME)
  : endpoints.filter((entry) => text(entry?.name) === CINEMA_NAME);
if (matches.length !== 1) throw new Error(`AVANTIQO_VIDEO_V29_CINEMA_RESOLUTION_FAILED:${matches.length}`);
const cinema = matches[0];
const cinemaId = text(cinema.id);
if (finite(cinema.workersMin, -1) !== 0 || finite(cinema.workersMax, -1) !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V29_CINEMA_NOT_RESTING_0_0:${finite(cinema.workersMin)}/${finite(cinema.workersMax)}`);
}
if (!endpointVolumeIds(cinema).includes(CURRENT_VOLUME_ID)) {
  throw new Error(`AVANTIQO_VIDEO_V29_CURRENT_VOLUME_BINDING_MISSING:${JSON.stringify(endpointVolumeIds(cinema))}`);
}

const currentVolumeMatches = volumes.filter((entry) => text(entry?.id) === CURRENT_VOLUME_ID);
if (currentVolumeMatches.length !== 1) throw new Error(`AVANTIQO_VIDEO_V29_CURRENT_VOLUME_RESOLUTION_FAILED:${currentVolumeMatches.length}`);
const currentVolume = currentVolumeMatches[0];
if (text(currentVolume.dataCenterId) !== CURRENT_DC) {
  throw new Error(`AVANTIQO_VIDEO_V29_CURRENT_VOLUME_DC_CHANGED:${text(currentVolume.dataCenterId)}`);
}

const queueCredential = await selectQueueCredential(cinemaId, managementKey);
const health = healthSummary(await queueHealth(cinemaId, queueCredential.key));
if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0 || health.worker_total !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V29_CINEMA_NOT_QUIESCENT:${JSON.stringify(health)}`);
}

const rows = rankRows(gpuData);
const exact = rows.filter((row) => row.immutable_video_image_certified_for_this_gpu_family);
const compatibility = rows.filter((row) => row.compatibility_probe_required_before_use);
const selected = exact[0] || null;
const storageBackedDcs = list(gpuData.dataCenters)
  .filter((dc) => dc?.storageSupport === true)
  .map((dc) => ({ id: text(dc?.id), name: text(dc?.name) || null, location: text(dc?.location) || null }))
  .filter((dc) => dc.id);

let diagnosis = "NO_LIVE_STORAGE_BACKED_EXACT_BLACKWELL_DESTINATION";
let recommendation = "DO_NOT_CREATE_OR_REBIND_VIDEO_VOLUME";
if (selected) {
  diagnosis = "LIVE_STORAGE_BACKED_EXACT_BLACKWELL_DESTINATION_FOUND";
  recommendation = "CREATE_NEW_400GB_VIDEO_ONLY_VOLUME_IN_SELECTED_DATACENTER_THEN_REPLICATE_VERIFIED_T2V_I2V_CACHE";
} else if (compatibility.length) {
  diagnosis = "ONLY_STORAGE_BACKED_COMPATIBILITY_REQUIRED_DESTINATIONS_FOUND";
  recommendation = "COMPATIBILITY_CERTIFY_GPU_FAMILY_BEFORE_VOLUME_CREATION_OR_REBIND";
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  corrected_from_v27: {
    hardcoded_s3_datacenter_list_used: false,
    live_storage_support_required: true,
    provider_available_required: true,
    secure_cloud_query_applied: true,
    eu_cz1_storage_support_failure_respected: true,
  },
  current_cinema: {
    id: cinemaId,
    name: CINEMA_NAME,
    workers_min: 0,
    workers_max: 0,
    queue_and_workers_zero: true,
    network_volume_ids: endpointVolumeIds(cinema),
  },
  current_volume: {
    id: text(currentVolume.id),
    name: text(currentVolume.name) || null,
    size_gb: finite(currentVolume.size ?? currentVolume.sizeGb, null),
    data_center_id: text(currentVolume.dataCenterId),
    preserved_untouched: true,
  },
  live_storage_supported_datacenters: storageBackedDcs,
  exact_certified_blackwell_candidates: exact,
  compatibility_required_candidates: compatibility,
  selected_destination: selected,
  diagnosis,
  recommendation,
  provider_mutation_performed: false,
  endpoint_capacity_changed: false,
  network_volume_created: false,
  network_volume_deleted: false,
  runpod_job_submitted: false,
  gpu_compute_used: false,
  storage_mutation_performed: false,
  production_web_deploy: false,
  secrets_printed: false,
}, null, 2));
console.log(`AVANTIQO_VIDEO_LIVE_STORAGE_PLACEMENT_V29=${diagnosis}`);
