const CONTRACT = "AVANTIQO_VIDEO_COMPATIBLE_GPU_FALLBACK_DIAGNOSIS_V44";
const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const GQL = "https://api.runpod.io/graphql";
const ENDPOINT_ID = "r0bzqq9zoi92h7";
const ENDPOINT_NAME = "avantiqo-cinema-v1";
const MIN_MEMORY_GB = 80;
const MAX_GPU_TYPES = 3;
const REQUIRED_VOLUMES = ["7pcdebhpga", "t4erb6kxi1"];
const REQUIRED_CUDA = ["12.8", "12.9", "13.0"];
const COMPATIBLE_FAMILY_PATTERNS = [
  /RTX PRO 6000 Blackwell/i,
  /H200/i,
  /H100/i,
  /A100/i,
  /B200/i,
];

const text = (v) => String(v ?? "").trim();
const list = (v) => Array.isArray(v) ? v : [];
const finite = (v, fallback = null) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const unique = (v) => [...new Set(v.map(text).filter(Boolean))];
const object = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};

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
    const nested = normalizeList(value[key], keys, depth + 1);
    if (nested) return nested;
  }
  return null;
}
function sameSet(a, b) {
  const left = [...unique(a)].sort();
  const right = [...unique(b)].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function stockRank(value) {
  const v = text(value).toUpperCase();
  if (v === "HIGH") return 4;
  if (v === "MEDIUM") return 3;
  if (v === "LOW") return 2;
  if (v === "AVAILABLE") return 1;
  return 0;
}
function compatibleFamily(id, displayName) {
  const haystack = `${text(id)} ${text(displayName)}`;
  return COMPATIBLE_FAMILY_PATTERNS.some((pattern) => pattern.test(haystack));
}
async function json(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw).slice(0, 900)}`);
  return body ?? {};
}
async function rest(path, key) {
  return json(await fetch(`${REST}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_V44_REST");
}
async function queue(path, key) {
  return json(await fetch(`${QUEUE}/${ENDPOINT_ID}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_V44_QUEUE");
}
async function queueKey(managementKey) {
  const candidates = [
    ["RUNPOD_AVANTIQO_VIDEO_API_KEY", text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY)],
    ["RUNPOD_API_KEY", text(process.env.RUNPOD_API_KEY)],
    ["RUNPOD_MANAGEMENT_API_KEY", managementKey],
  ];
  const seen = new Set();
  for (const [source, key] of candidates) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    try { await queue("/health", key); return { source, key }; } catch {}
  }
  throw new Error("AVANTIQO_VIDEO_V44_QUEUE_KEY_NOT_FOUND");
}
function healthSummary(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  const wc = {
    idle: finite(workers.idle, 0),
    initializing: finite(workers.initializing, 0),
    ready: finite(workers.ready, 0),
    running: finite(workers.running, 0),
    throttled: finite(workers.throttled, 0),
    unhealthy: finite(workers.unhealthy, 0),
  };
  return {
    jobs: { in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0), in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0) },
    workers: wc,
    worker_total: Object.values(wc).reduce((sum, value) => sum + value, 0),
  };
}
async function capacity(managementKey, gpuCount, diskGb) {
  const query = `
    query AvantiqoVideoV44($input: GpuAvailabilityInput) {
      gpuTypes { id displayName memoryInGb secureCloud communityCloud }
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
  const response = await fetch(`${GQL}?api_key=${encodeURIComponent(managementKey)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { input: { gpuCount, minDisk: diskGb, minMemoryInGb: MIN_MEMORY_GB, secureCloud: true } } }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok || list(body?.errors).length || !Array.isArray(body?.data?.dataCenters)) {
    throw new Error(`AVANTIQO_VIDEO_V44_GRAPHQL_FAILED:${response.status}:${redact(list(body?.errors).map((e) => e?.message).filter(Boolean).join(" | ") || raw).slice(0, 900)}`);
  }
  return body.data;
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(nodeMajor) || nodeMajor < 20) throw new Error(`AVANTIQO_VIDEO_V44_NODE20_REQUIRED:${process.version}`);

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const [endpoint, templatesRaw, volumesRaw] = await Promise.all([
  rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  rest("/networkvolumes", managementKey),
]);
if (text(endpoint.id) !== ENDPOINT_ID || text(endpoint.name) !== ENDPOINT_NAME) throw new Error("AVANTIQO_VIDEO_V44_ENDPOINT_ID_NAME_INVALID");

const templates = normalizeList(templatesRaw, ["templates"]);
const volumes = normalizeList(volumesRaw, ["networkVolumes", "volumes"]);
if (!templates || !volumes) throw new Error("AVANTIQO_VIDEO_V44_INVENTORY_INVALID");

const templateId = text(endpoint.templateId || endpoint.template?.id);
const template = text(endpoint.template?.id) === templateId && Object.keys(object(endpoint.template)).length
  ? endpoint.template
  : templates.find((row) => text(row?.id) === templateId);
if (!template) throw new Error(`AVANTIQO_VIDEO_V44_TEMPLATE_NOT_FOUND:${templateId || "NONE"}`);

const volumeIds = endpointVolumeIds(endpoint);
const attached = volumeIds.map((id) => {
  const v = volumes.find((row) => text(row?.id) === id) || {};
  return {
    id,
    name: text(v.name) || null,
    data_center_id: text(v.dataCenterId) || null,
    size_gb: finite(v.size ?? v.sizeGb, null),
    resolves: Boolean(text(v.id)),
  };
});
const effectiveDcs = unique(attached.map((v) => v.data_center_id));
const gpuCount = Math.max(1, finite(endpoint.gpuCount, 1));
const diskGb = Math.max(5, finite(template.containerDiskInGb, 50));
const credential = await queueKey(managementKey);
const [healthRaw, cap] = await Promise.all([
  queue("/health", credential.key),
  capacity(managementKey, gpuCount, diskGb),
]);
const health = healthSummary(healthRaw);

if (finite(endpoint.workersMin, -1) !== 0 || finite(endpoint.workersMax, -1) !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V44_CINEMA_NOT_RESTING_0_0:${finite(endpoint.workersMin)}/${finite(endpoint.workersMax)}`);
}
if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0 || health.worker_total !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V44_CINEMA_NOT_QUIESCENT:${JSON.stringify(health)}`);
}
if (!sameSet(volumeIds, REQUIRED_VOLUMES)) {
  throw new Error(`AVANTIQO_VIDEO_V44_VOLUME_BINDING_CHANGED:${JSON.stringify(volumeIds)}`);
}
if (!sameSet(list(endpoint.allowedCudaVersions), REQUIRED_CUDA)) {
  throw new Error(`AVANTIQO_VIDEO_V44_CUDA_ELIGIBILITY_CHANGED:${JSON.stringify(unique(list(endpoint.allowedCudaVersions)))}`);
}
if (gpuCount !== 1) throw new Error(`AVANTIQO_VIDEO_V44_GPU_COUNT_CHANGED:${gpuCount}`);

const metadata = new Map(list(cap.gpuTypes).map((row) => [text(row.id), row]));
const currentPool = unique(list(endpoint.gpuTypeIds));
const rows = [];
for (const dcId of effectiveDcs) {
  const dc = list(cap.dataCenters).find((row) => text(row.id) === dcId) || {};
  for (const availability of list(dc.gpuAvailability)) {
    const gpuTypeId = text(availability.gpuTypeId);
    const meta = metadata.get(gpuTypeId) || {};
    const displayName = text(availability.gpuTypeDisplayName || availability.displayName || meta.displayName) || null;
    const memoryGb = finite(meta.memoryInGb, null);
    rows.push({
      data_center_id: dcId,
      data_center_storage_support: dc.storageSupport === true,
      gpu_type_id: gpuTypeId,
      display_name: displayName,
      memory_gb: memoryGb,
      secure_cloud_supported: meta.secureCloud === true,
      community_cloud_supported: meta.communityCloud === true,
      available: availability.available === true,
      stock_status: text(availability.stockStatus).toUpperCase() || "NOT_LISTED",
      stock_rank: stockRank(availability.stockStatus),
      compatible_family: compatibleFamily(gpuTypeId, displayName),
      in_current_pool: currentPool.includes(gpuTypeId),
    });
  }
}

const compatibleRows = rows.filter((row) =>
  row.compatible_family &&
  row.secure_cloud_supported &&
  row.memory_gb >= MIN_MEMORY_GB &&
  row.available &&
  row.stock_rank > 0
);

const byGpu = new Map();
for (const row of compatibleRows) {
  const current = byGpu.get(row.gpu_type_id) || {
    gpu_type_id: row.gpu_type_id,
    display_name: row.display_name,
    memory_gb: row.memory_gb,
    in_current_pool: row.in_current_pool,
    available_datacenters: [],
    best_stock_rank: 0,
    best_stock_status: "NOT_LISTED",
  };
  current.available_datacenters.push({
    data_center_id: row.data_center_id,
    stock_status: row.stock_status,
    stock_rank: row.stock_rank,
  });
  if (row.stock_rank > current.best_stock_rank) {
    current.best_stock_rank = row.stock_rank;
    current.best_stock_status = row.stock_status;
  }
  byGpu.set(row.gpu_type_id, current);
}

const candidates = [...byGpu.values()]
  .map((row) => ({
    ...row,
    available_datacenters: row.available_datacenters.sort((a, b) => b.stock_rank - a.stock_rank || a.data_center_id.localeCompare(b.data_center_id)),
    available_datacenter_count: row.available_datacenters.length,
  }))
  .sort((a, b) =>
    b.best_stock_rank - a.best_stock_rank ||
    b.available_datacenter_count - a.available_datacenter_count ||
    b.memory_gb - a.memory_gb ||
    Number(b.in_current_pool) - Number(a.in_current_pool) ||
    a.gpu_type_id.localeCompare(b.gpu_type_id)
  );

const preferred = candidates.filter((row) => row.best_stock_rank >= 3);
const nonCurrentPreferred = preferred.filter((row) => !row.in_current_pool);
const recommendedSource = preferred.length ? preferred : candidates;
const recommendedPool = recommendedSource.slice(0, MAX_GPU_TYPES).map((row) => row.gpu_type_id);
const currentRows = candidates.filter((row) => row.in_current_pool);
const currentBestStockRank = currentRows.reduce((max, row) => Math.max(max, row.best_stock_rank), 0);
const recommendedBestStockRank = recommendedSource.reduce((max, row) => Math.max(max, row.best_stock_rank), 0);

let diagnosis = "NO_COMPATIBLE_80GB_SECURE_GPU_VISIBLE_IN_ATTACHED_VIDEO_REGIONS";
if (nonCurrentPreferred.length) diagnosis = "BETTER_COMPATIBLE_GPU_FALLBACKS_AVAILABLE_IN_ATTACHED_VIDEO_REGIONS";
else if (preferred.length) diagnosis = "ONLY_CURRENT_OR_EQUIVALENT_HIGH_MEDIUM_GPU_CAPACITY_VISIBLE";
else if (candidates.length > 1) diagnosis = "ONLY_LOW_STOCK_COMPATIBLE_GPU_FALLBACKS_VISIBLE";
else if (candidates.length === 1) diagnosis = "SINGLE_LOW_STOCK_COMPATIBLE_GPU_REMAINS_ONLY_OPTION";

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  diagnosis,
  endpoint: {
    id: ENDPOINT_ID,
    name: ENDPOINT_NAME,
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    gpu_count: gpuCount,
    current_gpu_type_ids: currentPool,
    allowed_cuda_versions: unique(list(endpoint.allowedCudaVersions)),
    network_volume_ids: volumeIds,
    effective_data_center_ids: effectiveDcs,
  },
  template: {
    id: templateId || null,
    name: text(template.name) || null,
    image_name: text(template.imageName) || null,
    container_disk_gb: diskGb,
  },
  attached_network_volumes: attached,
  queue: { credential_source: credential.source, ...health },
  compatibility_contract: {
    minimum_memory_gb: MIN_MEMORY_GB,
    secure_cloud_required: true,
    gpu_count: 1,
    runtime_image_basis: "PYTORCH_2_7_1_CUDA_12_8_CUDNN9",
    inference_dtype_basis: "BFLOAT16",
    model_family: "WAN_2_2_A14B_DIFFUSERS",
    compatible_families: ["RTX_PRO_6000_BLACKWELL", "H200", "H100", "A100", "B200"],
    custom_blackwell_only_extension_required: false,
  },
  all_capacity_rows_in_attached_datacenters: rows,
  compatible_schedulable_capacity: compatibleRows,
  compatible_gpu_candidates_ranked: candidates,
  high_or_medium_compatible_candidates: preferred,
  high_or_medium_non_current_candidates: nonCurrentPreferred,
  current_best_stock_rank: currentBestStockRank,
  recommended_best_stock_rank: recommendedBestStockRank,
  recommended_gpu_pool_max_three: recommendedPool,
  recommended_next_action:
    diagnosis === "BETTER_COMPATIBLE_GPU_FALLBACKS_AVAILABLE_IN_ATTACHED_VIDEO_REGIONS"
      ? "PATCH_CINEMA_GPU_TYPES_TO_RECOMMENDED_POOL_THEN_RUN_ONE_SHORT_WORKER_ALLOCATION_PROOF"
      : diagnosis === "ONLY_LOW_STOCK_COMPATIBLE_GPU_FALLBACKS_VISIBLE"
        ? "CONSIDER_WIDENING_GPU_POOL_IF_MULTIPLE_DISTINCT_LOW_STOCK_TYPES_EXIST_OTHERWISE_ADD_VIDEO_CACHE_REGION"
        : diagnosis === "SINGLE_LOW_STOCK_COMPATIBLE_GPU_REMAINS_ONLY_OPTION"
          ? "ADD_VIDEO_CACHE_REGION_WITH_HIGHER_80GB_PLUS_SECURE_GPU_CAPACITY"
          : "DO_NOT_MUTATE_CINEMA_UNTIL_CAPACITY_PATH_IMPROVES",
  endpoint_mutation_performed: false,
  queue_mutation_performed: false,
  generation_submitted: false,
  gpu_compute_requested: false,
  image_endpoint_mutation: false,
  secrets_printed: false,
}, null, 2));
console.log(`AVANTIQO_VIDEO_V44_DIAGNOSIS=${diagnosis}`);
