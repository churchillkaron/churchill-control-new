#!/usr/bin/env node

const CONTRACT = "AVANTIQO_VIDEO_OWNED_40_79GB_CAPACITY_INSPECTION_V67";
const REST = "https://rest.runpod.io/v1";
const GQL = "https://api.runpod.io/graphql";
const MIN_MEMORY_GB = 40;
const MAX_MEMORY_GB_EXCLUSIVE = 80;

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function rank(value) {
  const normalized = text(value).toUpperCase();
  if (normalized === "HIGH") return 4;
  if (normalized === "MEDIUM") return 3;
  if (normalized === "LOW") return 2;
  if (normalized === "AVAILABLE") return 1;
  return 0;
}
function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
async function json(response, label) {
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 500)}`);
  }
  return body;
}
async function rest(path, key) {
  return json(await fetch(`${REST}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  }), "AVANTIQO_VIDEO_V67_REST");
}
async function graphql(key) {
  const query = `
    query AvantiqoVideoLowerMemoryCapacity($input: GpuAvailabilityInput) {
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
  const response = await fetch(`${GQL}?api_key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: {
        input: { gpuCount: 1, minDisk: 5, minMemoryInGb: MIN_MEMORY_GB, secureCloud: true },
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await json(response, "AVANTIQO_VIDEO_V67_GRAPHQL");
  const errors = list(body.errors).map((entry) => text(entry?.message)).filter(Boolean);
  if (errors.length) {
    throw new Error(`AVANTIQO_VIDEO_V67_GRAPHQL_ERROR:${errors.join(" | ").slice(0, 500)}`);
  }
  return body.data || {};
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const productionEndpointId = required("RUNPOD_AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_ID");

const [endpoint, volumes, capacity] = await Promise.all([
  rest(`/endpoints/${encodeURIComponent(productionEndpointId)}?includeTemplate=false&includeWorkers=true`, managementKey),
  rest("/networkvolumes", managementKey),
  graphql(managementKey),
]);

const attachedVolumeIds = [...new Set([
  text(endpoint.networkVolumeId),
  ...list(endpoint.networkVolumeIds).map(text),
].filter(Boolean))];
const attachedVolumes = list(volumes)
  .filter((volume) => attachedVolumeIds.includes(text(volume?.id)))
  .map((volume) => ({
    id: text(volume.id),
    name: text(volume.name) || null,
    data_center_id: text(volume.dataCenterId ?? volume.data_center_id) || null,
    size_gb: finite(volume.size ?? volume.sizeGb, null),
  }));
const attachedDcIds = new Set(attachedVolumes.map((volume) => volume.data_center_id).filter(Boolean));
const gpuMeta = new Map(list(capacity.gpuTypes).map((gpu) => [text(gpu.id), gpu]));
const currentPool = list(endpoint.gpuTypeIds).map(text).filter(Boolean);

const rows = [];
for (const dc of list(capacity.dataCenters)) {
  const dcId = text(dc.id);
  for (const availability of list(dc.gpuAvailability)) {
    const gpuTypeId = text(availability.gpuTypeId);
    const meta = gpuMeta.get(gpuTypeId) || {};
    const displayName = text(
      availability.gpuTypeDisplayName || availability.displayName || meta.displayName,
    ) || gpuTypeId;
    const memoryGb = finite(meta.memoryInGb, null);
    if (meta.secureCloud !== true) continue;
    if (!(memoryGb >= MIN_MEMORY_GB && memoryGb < MAX_MEMORY_GB_EXCLUSIVE)) continue;
    if (availability.available !== true) continue;

    rows.push({
      data_center_id: dcId,
      data_center_name: text(dc.name) || null,
      data_center_location: text(dc.location) || null,
      storage_support: dc.storageSupport === true,
      attached_video_cache_region: attachedDcIds.has(dcId),
      gpu_type_id: gpuTypeId,
      display_name: displayName,
      memory_gb: memoryGb,
      stock_status: text(availability.stockStatus).toUpperCase() || "AVAILABLE",
      stock_rank: rank(availability.stockStatus),
      in_current_endpoint_pool: currentPool.includes(gpuTypeId),
    });
  }
}

rows.sort((a, b) =>
  b.stock_rank - a.stock_rank ||
  Number(b.storage_support) - Number(a.storage_support) ||
  Number(b.attached_video_cache_region) - Number(a.attached_video_cache_region) ||
  b.memory_gb - a.memory_gb ||
  a.data_center_id.localeCompare(b.data_center_id) ||
  a.gpu_type_id.localeCompare(b.gpu_type_id)
);

const mediumOrHighRows = rows.filter((row) => row.stock_rank >= 3);
const mediumOrHighStorageRows = mediumOrHighRows.filter((row) => row.storage_support);
const attachedMediumOrHighRows = mediumOrHighRows.filter((row) => row.attached_video_cache_region);
const candidateGpuTypes = [...new Map(
  mediumOrHighRows.map((row) => [row.gpu_type_id, {
    gpu_type_id: row.gpu_type_id,
    display_name: row.display_name,
    memory_gb: row.memory_gb,
    best_stock_rank: Math.max(
      ...mediumOrHighRows
        .filter((candidate) => candidate.gpu_type_id === row.gpu_type_id)
        .map((candidate) => candidate.stock_rank),
    ),
    storage_supported_regions: mediumOrHighStorageRows
      .filter((candidate) => candidate.gpu_type_id === row.gpu_type_id)
      .map((candidate) => ({
        data_center_id: candidate.data_center_id,
        stock_status: candidate.stock_status,
      })),
  }]),
).values()];

candidateGpuTypes.sort((a, b) =>
  b.best_stock_rank - a.best_stock_rank ||
  b.memory_gb - a.memory_gb ||
  a.gpu_type_id.localeCompare(b.gpu_type_id)
);

let recommendation = "NO_MEDIUM_HIGH_40_79GB_SECURE_CAPACITY_VISIBLE";
if (attachedMediumOrHighRows.length) {
  recommendation = "OPTIMIZE_WAN22_FOR_LOWER_MEMORY_GPU_IN_EXISTING_CACHE_REGION";
} else if (mediumOrHighStorageRows.length) {
  recommendation = "OPTIMIZE_WAN22_FOR_LOWER_MEMORY_GPU_AND_ADD_OWNED_CACHE_VOLUME";
} else if (mediumOrHighRows.length) {
  recommendation = "LOWER_MEMORY_CAPACITY_EXISTS_ONLY_WITHOUT_NETWORK_STORAGE_SUPPORT";
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  production_endpoint: {
    id: text(endpoint.id),
    name: text(endpoint.name),
    workers_min: finite(endpoint.workersMin, null),
    workers_max: finite(endpoint.workersMax, null),
    current_gpu_type_ids: currentPool,
    network_volume_ids: attachedVolumeIds,
  },
  attached_video_cache_volumes: attachedVolumes,
  candidate_contract: {
    minimum_memory_gb: MIN_MEMORY_GB,
    maximum_memory_gb_exclusive: MAX_MEMORY_GB_EXCLUSIVE,
    secure_cloud_required: true,
    gpu_count: 1,
    foundation_model_unchanged: "WAN_2_2_A14B_DIFFUSERS",
    candidate_only_not_certified: true,
    runtime_optimization_required_before_endpoint_use: true,
  },
  candidate_gpu_types: candidateGpuTypes,
  medium_or_high_rows: mediumOrHighRows,
  medium_or_high_storage_rows: mediumOrHighStorageRows,
  attached_medium_or_high_rows: attachedMediumOrHighRows,
  all_available_40_79gb_rows: rows,
  recommendation,
  video_job_submitted: false,
  runpod_endpoint_mutation_performed: false,
  runpod_worker_mutation_performed: false,
  paid_external_provider_contacted: false,
  paid_external_provider_generation_performed: false,
  image_endpoint_mutated: false,
  secrets_printed: false,
}, null, 2));

console.log(`${CONTRACT}=PASS`);
