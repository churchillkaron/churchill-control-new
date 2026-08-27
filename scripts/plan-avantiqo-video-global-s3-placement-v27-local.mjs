const CONTRACT = "AVANTIQO_VIDEO_GLOBAL_S3_PLACEMENT_PLAN_V27";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CINEMA_NAME = "avantiqo-cinema-v1";
const CURRENT_VOLUME_ID = "7pcdebhpga";
const CURRENT_DC = "US-NC-2";
const MIN_MEMORY_GB = 80;
const MIN_DISK_GB = 5;
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
const S3_SUPPORTED_DCS = new Map([
  ["EU-CZ-1", "https://s3api-eu-cz-1.runpod.io/"],
  ["EU-RO-1", "https://s3api-eu-ro-1.runpod.io/"],
  ["EUR-IS-1", "https://s3api-eur-is-1.runpod.io/"],
  ["EUR-NO-1", "https://s3api-eur-no-1.runpod.io/"],
  ["US-CA-2", "https://s3api-us-ca-2.runpod.io/"],
  ["US-GA-2", "https://s3api-us-ga-2.runpod.io/"],
  ["US-IL-1", "https://s3api-us-il-1.runpod.io/"],
  ["US-KS-2", "https://s3api-us-ks-2.runpod.io/"],
  ["US-MD-1", "https://s3api-us-md-1.runpod.io/"],
  ["US-MO-1", "https://s3api-us-mo-1.runpod.io/"],
  ["US-MO-2", "https://s3api-us-mo-2.runpod.io/"],
  ["US-NC-1", "https://s3api-us-nc-1.runpod.io/"],
  ["US-NC-2", "https://s3api-us-nc-2.runpod.io/"],
  ["US-NE-1", "https://s3api-us-ne-1.runpod.io/"],
  ["US-WA-1", "https://s3api-us-wa-1.runpod.io/"],
]);

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
  if (!normalized || ["none", "not-listed", "unavailable", "out of stock", "no stock"].includes(normalized)) return 0;
  return 1;
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
    throw new Error(`${label}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw).slice(0, 900)}`);
  }
  return body ?? {};
}

async function rest(pathname, key) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_V27_REST");
}

async function queueHealth(endpointId, key) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_V27_QUEUE");
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
  throw new Error("AVANTIQO_VIDEO_V27_QUEUE_CREDENTIAL_NOT_FOUND");
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

async function globalSecureAvailability(managementKey, minDiskGb) {
  const queryText = `
    query AvantiqoVideoGlobalPlacementV27($input: GpuAvailabilityInput) {
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
      minDisk: Math.max(MIN_DISK_GB, minDiskGb),
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
  const body = await readJson(response, "AVANTIQO_VIDEO_V27_GRAPHQL");
  if (Array.isArray(body.errors) && body.errors.length) {
    throw new Error(`AVANTIQO_VIDEO_V27_GRAPHQL_ERROR:${redact(body.errors.map((entry) => entry?.message).filter(Boolean).join(" | ")).slice(0, 1200)}`);
  }
  return body.data || {};
}

function candidateRows(gpuData, minDiskGb) {
  const gpuTypes = new Map(list(gpuData.gpuTypes).map((entry) => [text(entry?.id), entry]));
  const allowedIds = new Set([...CERTIFIED_BLACKWELL_POOL, ...COMPATIBILITY_REQUIRED_POOL]);
  const rows = [];
  for (const dc of list(gpuData.dataCenters)) {
    const dataCenterId = text(dc?.id);
    if (!S3_SUPPORTED_DCS.has(dataCenterId) || dataCenterId === CURRENT_DC) continue;
    for (const availability of list(dc?.gpuAvailability)) {
      const gpuTypeId = text(availability?.gpuTypeId);
      if (!allowedIds.has(gpuTypeId)) continue;
      const meta = gpuTypes.get(gpuTypeId) || {};
      const stockStatus = text(availability?.stockStatus) || "none";
      const rank = stockRank(stockStatus);
      if (rank <= 0 || finite(meta?.memoryInGb, 0) < MIN_MEMORY_GB) continue;
      const certified = CERTIFIED_BLACKWELL_POOL.includes(gpuTypeId);
      rows.push({
        data_center_id: dataCenterId,
        data_center_name: text(dc?.name) || dataCenterId,
        location: text(dc?.location) || null,
        s3_endpoint: S3_SUPPORTED_DCS.get(dataCenterId),
        gpu_type_id: gpuTypeId,
        display_name: text(availability?.gpuTypeDisplayName || availability?.displayName || meta?.displayName) || null,
        memory_gb: finite(meta?.memoryInGb, null),
        secure_cloud_supported: meta?.secureCloud === true,
        community_cloud_supported: meta?.communityCloud === true,
        stock_status: stockStatus,
        stock_rank: rank,
        immutable_video_image_certified_for_this_gpu_family: certified,
        compatibility_probe_required_before_use: !certified,
        minimum_disk_gb: Math.max(MIN_DISK_GB, minDiskGb),
        score: (certified ? 1000 : 0) + rank * 100 + finite(meta?.memoryInGb, 0) - riskPenalty(gpuTypeId),
      });
    }
  }
  return rows.sort((a, b) => b.score - a.score || b.stock_rank - a.stock_rank || b.memory_gb - a.memory_gb || a.data_center_id.localeCompare(b.data_center_id));
}

function aggregateDestinations(rows) {
  const byDc = new Map();
  for (const row of rows) {
    if (!byDc.has(row.data_center_id)) {
      byDc.set(row.data_center_id, {
        data_center_id: row.data_center_id,
        data_center_name: row.data_center_name,
        location: row.location,
        s3_endpoint: row.s3_endpoint,
        exact_certified_blackwell_candidates: [],
        compatibility_required_candidates: [],
        best_score: row.score,
      });
    }
    const dc = byDc.get(row.data_center_id);
    dc.best_score = Math.max(dc.best_score, row.score);
    if (row.immutable_video_image_certified_for_this_gpu_family) dc.exact_certified_blackwell_candidates.push(row);
    else dc.compatibility_required_candidates.push(row);
  }
  return [...byDc.values()].sort((a, b) => b.best_score - a.best_score || a.data_center_id.localeCompare(b.data_center_id));
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_V27_NODE24_REQUIRED:${process.version}`);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const [endpointRaw, volumeRaw, templateRaw] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
]);
const endpoints = normalizeList(endpointRaw, ["endpoints", "serverlessEndpoints"]);
const volumes = normalizeList(volumeRaw, ["networkVolumes", "volumes"]);
const templates = normalizeList(templateRaw, ["templates"]);
if (!endpoints || !volumes || !templates) throw new Error("AVANTIQO_VIDEO_V27_INVENTORY_INVALID");

const configuredId = text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID);
const cinemaMatches = configuredId
  ? endpoints.filter((entry) => text(entry?.id) === configuredId && text(entry?.name) === CINEMA_NAME)
  : endpoints.filter((entry) => text(entry?.name) === CINEMA_NAME);
if (cinemaMatches.length !== 1) throw new Error(`AVANTIQO_VIDEO_V27_CINEMA_RESOLUTION_FAILED:${cinemaMatches.length}`);
const cinema = cinemaMatches[0];
const cinemaId = text(cinema.id);
const queueCredential = await selectQueueCredential(cinemaId, managementKey);
const health = healthSummary(await queueHealth(cinemaId, queueCredential.key));
if (finite(cinema.workersMin, -1) !== 0 || finite(cinema.workersMax, -1) !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V27_CINEMA_NOT_RESTING_0_0:${finite(cinema.workersMin)}/${finite(cinema.workersMax)}`);
}
if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0 || health.worker_total !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V27_CINEMA_NOT_QUIESCENT:${JSON.stringify(health)}`);
}

const currentVolumeMatches = volumes.filter((entry) => text(entry?.id) === CURRENT_VOLUME_ID);
if (currentVolumeMatches.length !== 1) throw new Error(`AVANTIQO_VIDEO_V27_CURRENT_VOLUME_RESOLUTION_FAILED:${currentVolumeMatches.length}`);
const currentVolume = currentVolumeMatches[0];
if (text(currentVolume.dataCenterId) !== CURRENT_DC) {
  throw new Error(`AVANTIQO_VIDEO_V27_CURRENT_VOLUME_DC_CHANGED:${text(currentVolume.dataCenterId)}`);
}
if (!endpointVolumeIds(cinema).includes(CURRENT_VOLUME_ID)) {
  throw new Error(`AVANTIQO_VIDEO_V27_CURRENT_VOLUME_BINDING_MISSING:${JSON.stringify(endpointVolumeIds(cinema))}`);
}

const templateId = text(cinema.templateId || cinema.template?.id);
const templateMatches = templates.filter((entry) => text(entry?.id) === templateId);
if (templateMatches.length !== 1) throw new Error(`AVANTIQO_VIDEO_V27_TEMPLATE_RESOLUTION_FAILED:${templateMatches.length}`);
const template = templateMatches[0];
const minDiskGb = Math.max(MIN_DISK_GB, finite(template.containerDiskInGb, MIN_DISK_GB));
const gpuData = await globalSecureAvailability(managementKey, minDiskGb);
const rows = candidateRows(gpuData, minDiskGb);
const destinations = aggregateDestinations(rows);
const exactDestinations = destinations.filter((entry) => entry.exact_certified_blackwell_candidates.length > 0);
const compatibilityDestinations = destinations.filter((entry) => entry.compatibility_required_candidates.length > 0);

let diagnosis = "NO_S3_SUPPORTED_GLOBAL_80GB_PLUS_DESTINATION_FOUND";
let recommendation = "DO_NOT_MUTATE_CURRENT_VIDEO_ENDPOINT_OR_VOLUME";
let selectedDestination = null;
if (exactDestinations.length > 0) {
  selectedDestination = exactDestinations[0];
  diagnosis = "EXACT_CERTIFIED_BLACKWELL_S3_DESTINATION_FOUND";
  recommendation = "CREATE_SECOND_VIDEO_400GB_VOLUME_THEN_REPLICATE_T2V_I2V_OVER_S3_BEFORE_ENDPOINT_REBIND";
} else if (compatibilityDestinations.length > 0) {
  selectedDestination = compatibilityDestinations[0];
  diagnosis = "ONLY_COMPATIBILITY_REQUIRED_S3_DESTINATIONS_FOUND";
  recommendation = "VERIFY_IMMUTABLE_VIDEO_IMAGE_ON_DESTINATION_GPU_FAMILY_BEFORE_VOLUME_PROVISION_OR_ENDPOINT_REBIND";
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  current_us_nc2_exhaustion_evidence: {
    full_certified_blackwell_pool_runtime_probe_unscheduled_zero_workers_180s: true,
    failed_datacenter_excluded_from_new_destination: CURRENT_DC,
  },
  current_cinema: {
    id: cinemaId,
    name: CINEMA_NAME,
    workers_min: finite(cinema.workersMin),
    workers_max: finite(cinema.workersMax),
    gpu_type_ids: list(cinema.gpuTypeIds).map(text).filter(Boolean),
    network_volume_ids: endpointVolumeIds(cinema),
    queue_credential_source: queueCredential.source,
    queue_and_workers_zero: true,
  },
  current_volume: {
    id: text(currentVolume.id),
    name: text(currentVolume.name) || null,
    data_center_id: text(currentVolume.dataCenterId),
    size_gb: finite(currentVolume.size ?? currentVolume.sizeGb, null),
    preserved_untouched: true,
  },
  current_template: {
    id: templateId,
    image: text(template.imageName) || null,
    container_disk_gb: minDiskGb,
    volume_mount_path: text(template.volumeMountPath) || null,
  },
  placement_contract: {
    minimum_gpu_memory_gb: MIN_MEMORY_GB,
    secure_cloud_only: true,
    s3_supported_datacenter_required: true,
    exact_certified_blackwell_preferred: CERTIFIED_BLACKWELL_POOL,
    compatibility_required_gpu_families: COMPATIBILITY_REQUIRED_POOL,
    existing_us_nc2_excluded: true,
    current_volume_never_deleted_or_modified: true,
  },
  s3_supported_datacenters_considered: [...S3_SUPPORTED_DCS.keys()].filter((id) => id !== CURRENT_DC),
  exact_certified_blackwell_destinations: exactDestinations,
  compatibility_required_destinations: compatibilityDestinations,
  all_ranked_candidates: rows,
  selected_destination: selectedDestination,
  diagnosis,
  recommendation,
  next_mutation_if_exact_destination_found: {
    create_new_network_volume_only: true,
    proposed_size_gb: 400,
    proposed_name: selectedDestination ? `avantiqo-video-cache-${selectedDestination.data_center_id.toLowerCase()}` : null,
    target_data_center_id: selectedDestination?.data_center_id || null,
    target_s3_endpoint: selectedDestination?.s3_endpoint || null,
    replicate_only_verified_t2v_i2v_cache: true,
    attach_or_rebind_endpoint_deferred_until_replication_verifies: true,
  },
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
console.log(`AVANTIQO_VIDEO_GLOBAL_S3_PLACEMENT_V27=${diagnosis}`);
