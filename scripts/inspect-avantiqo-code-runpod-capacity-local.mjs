import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

const CONTRACT = "AVANTIQO_CODE_RUNPOD_CAPACITY_INSPECTOR_V1";
const CODE_ENDPOINT_NAME = "avantiqo-code-v1";
const REST = "https://rest.runpod.io/v1";
const SERVERLESS = "https://api.runpod.ai/v2";
const GRAPHQL = "https://api.runpod.io/graphql";
const MIN_GPU_MEMORY_GB = 80;

const GPU_PROFILES = Object.freeze([
  Object.freeze({ key: "RTX_PRO_6000_96GB", match: /RTX\s*(?:PRO\s*6000|6000\s*PRO)/i, exclude: /\bMIG\b/i, vram_gb: 96, usd_per_hour_reference: 3.49, preference: 6000 }),
  Object.freeze({ key: "H100_NVL_94GB", match: /H100.*NVL|NVL.*H100/i, exclude: null, vram_gb: 94, usd_per_hour_reference: 4.79, preference: 5600 }),
  Object.freeze({ key: "H100_80GB", match: /\bH100\b/i, exclude: /NVL|\bMIG\b/i, vram_gb: 80, usd_per_hour_reference: 4.79, preference: 5500 }),
  Object.freeze({ key: "H200_141GB", match: /\bH200\b/i, exclude: /\bMIG\b/i, vram_gb: 141, usd_per_hour_reference: 5.93, preference: 5300 }),
  Object.freeze({ key: "B200_180GB", match: /\bB200\b/i, exclude: /\bMIG\b/i, vram_gb: 180, usd_per_hour_reference: 8.64, preference: 5100 }),
]);

function text(value) {
  return String(value ?? "").trim();
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function stringList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (!text(value)) return [];
  return text(value).split(",").map((entry) => entry.trim()).filter(Boolean);
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function upper(value) {
  return text(value).toUpperCase();
}

function stockRank(value) {
  return ({ HIGH: 4, MEDIUM: 3, LOW: 2 }[upper(value)] || 0);
}

function loadLocalEnvironment() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return false;
  loadEnvFile(path);
  return true;
}

function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...stringList(endpoint.networkVolumeIds)]);
}

function endpointDataCenters(endpoint = {}) {
  return stringList(endpoint.dataCenterIds);
}

function endpointGpuTypes(endpoint = {}) {
  return stringList(endpoint.gpuTypeIds);
}

function gpuProfile(gpu = {}) {
  const label = [gpu?.gpuTypeId, gpu?.gpuTypeDisplayName, gpu?.displayName]
    .map(text)
    .filter(Boolean)
    .join(" ");
  if (/\bMIG\b/i.test(label)) return null;
  return GPU_PROFILES.find(
    (profile) => profile.match.test(label) && !(profile.exclude && profile.exclude.test(label)),
  ) || null;
}

function capacityRow(dataCenter = {}, gpu = {}) {
  const profile = gpuProfile(gpu);
  return {
    data_center_id: text(dataCenter?.id) || null,
    data_center_name: text(dataCenter?.name) || null,
    location: text(dataCenter?.location) || null,
    storage_support: dataCenter?.storageSupport === true,
    gpu_type_id: text(gpu?.gpuTypeId) || null,
    gpu_name: text(gpu?.gpuTypeDisplayName || gpu?.displayName || gpu?.gpuTypeId) || null,
    profile: profile?.key || null,
    vram_gb: profile?.vram_gb || null,
    native_fp8: Boolean(profile),
    available: gpu?.available === true,
    stock_status: text(gpu?.stockStatus) || "UNAVAILABLE",
    stock_rank: stockRank(gpu?.stockStatus),
    usd_per_hour_reference: profile?.usd_per_hour_reference ?? null,
    preference: profile?.preference || 0,
  };
}

function rankRows(rows) {
  return [...rows].sort((left, right) =>
    right.stock_rank - left.stock_rank ||
    left.usd_per_hour_reference - right.usd_per_hour_reference ||
    right.preference - left.preference ||
    String(left.gpu_type_id).localeCompare(String(right.gpu_type_id)),
  );
}

function healthCounters(health = {}) {
  const jobs = health.jobs || {};
  const workers = health.workers || {};
  return {
    jobs: {
      in_queue: number(jobs.inQueue ?? jobs.in_queue),
      in_progress: number(jobs.inProgress ?? jobs.in_progress),
      completed: number(jobs.completed),
      failed: number(jobs.failed),
      retried: number(jobs.retried),
    },
    workers: {
      idle: number(workers.idle),
      initializing: number(workers.initializing),
      ready: number(workers.ready),
      running: number(workers.running),
      throttled: number(workers.throttled),
      unhealthy: number(workers.unhealthy),
    },
  };
}

async function jsonRequest(url, { key, method = "GET", body = null } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    throw new Error(
      `RUNPOD_HTTP_${response.status}:${text(parsed?.message || parsed?.error || raw).slice(0, 700)}`,
    );
  }
  return parsed;
}

async function resolveEndpoint(managementKey, configuredId) {
  const endpoints = await jsonRequest(`${REST}/endpoints?includeTemplate=true&includeWorkers=true`, {
    key: managementKey,
  });
  if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
  const matches = configuredId
    ? endpoints.filter((endpoint) => text(endpoint?.id) === configuredId)
    : endpoints.filter((endpoint) => text(endpoint?.name) === CODE_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`RUNPOD_CODE_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  if (text(matches[0]?.name) !== CODE_ENDPOINT_NAME) {
    throw new Error(`RUNPOD_CODE_ENDPOINT_NAME_MISMATCH:${text(matches[0]?.name) || "missing"}`);
  }
  return matches[0];
}

async function discoverDatacenters(managementKey) {
  const query = `
    query AvantiqoCodeCapacityInspection($input: GpuAvailabilityInput) {
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
  const response = await fetch(`${GRAPHQL}?api_key=${encodeURIComponent(managementKey)}`, {
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
    throw new Error(
      `RUNPOD_GPU_AVAILABILITY_FAILED:${response.status}:${text(
        body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw,
      ).slice(0, 900)}`,
    );
  }
  return body.data.dataCenters;
}

const localEnvLoaded = loadLocalEnvironment();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
const apiKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY) || text(process.env.RUNPOD_API_KEY);
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
const optionalJobId = text(process.argv[2]);

if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
if (!apiKey) throw new Error("RUNPOD_AVANTIQO_CODE_API_KEY_OR_RUNPOD_API_KEY_REQUIRED");

const [endpoint, volumes, dataCenters] = await Promise.all([
  resolveEndpoint(managementKey, configuredEndpointId),
  jsonRequest(`${REST}/networkvolumes`, { key: managementKey }),
  discoverDatacenters(managementKey),
]);
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");

const endpointId = text(endpoint?.id);
if (!endpointId) throw new Error("RUNPOD_CODE_ENDPOINT_ID_REQUIRED_AFTER_RESOLUTION");

const [healthRaw, optionalJob] = await Promise.all([
  jsonRequest(`${SERVERLESS}/${encodeURIComponent(endpointId)}/health`, { key: apiKey }),
  optionalJobId
    ? jsonRequest(`${SERVERLESS}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(optionalJobId)}`, { key: apiKey })
    : Promise.resolve(null),
]);
const health = healthCounters(healthRaw || {});

const attachedVolumeIds = endpointVolumeIds(endpoint);
const attachedVolumes = volumes
  .filter((volume) => attachedVolumeIds.includes(text(volume?.id)))
  .map((volume) => ({
    id: text(volume?.id) || null,
    name: text(volume?.name) || null,
    size_gb: number(volume?.size ?? volume?.sizeGb, null),
    data_center_id: text(volume?.dataCenterId) || null,
  }));
const volumeDataCenters = unique(attachedVolumes.map((volume) => volume.data_center_id));
const explicitDataCenters = endpointDataCenters(endpoint);
const effectiveDataCenters = volumeDataCenters.length ? volumeDataCenters : explicitDataCenters;
if (!effectiveDataCenters.length) throw new Error("RUNPOD_CODE_EFFECTIVE_DATACENTER_REQUIRED");

const boundGpuTypeIds = endpointGpuTypes(endpoint);
const allRows = dataCenters
  .flatMap((dataCenter) => array(dataCenter?.gpuAvailability).map((gpu) => capacityRow(dataCenter, gpu)))
  .filter((row) => row.storage_support && row.profile && row.vram_gb >= MIN_GPU_MEMORY_GB && row.gpu_type_id);

const currentRegionRows = allRows.filter((row) => effectiveDataCenters.includes(row.data_center_id));
const approvedCurrentRegionCapacity = rankRows(currentRegionRows);
const boundCurrentRegionCapacity = rankRows(
  currentRegionRows.filter((row) => boundGpuTypeIds.includes(row.gpu_type_id)),
);
const availableCurrentRegion = approvedCurrentRegionCapacity.filter(
  (row) => row.available && row.stock_rank > 0,
);
const availableBoundCurrentRegion = boundCurrentRegionCapacity.filter(
  (row) => row.available && row.stock_rank > 0,
);
const unboundAvailableCurrentRegion = availableCurrentRegion.filter(
  (row) => !boundGpuTypeIds.includes(row.gpu_type_id),
);
const boundBestRank = Math.max(0, ...availableBoundCurrentRegion.map((row) => row.stock_rank));
const currentBestRank = Math.max(0, ...availableCurrentRegion.map((row) => row.stock_rank));
const recommendedCurrentPool = unique(availableCurrentRegion.map((row) => row.gpu_type_id));

const stockedRegions = dataCenters
  .filter((dataCenter) => dataCenter?.storageSupport === true)
  .map((dataCenter) => {
    const rows = rankRows(
      allRows.filter(
        (row) => row.data_center_id === text(dataCenter?.id) && row.available && row.stock_rank > 0,
      ),
    );
    return {
      data_center_id: text(dataCenter?.id) || null,
      data_center_name: text(dataCenter?.name) || null,
      location: text(dataCenter?.location) || null,
      best_gpu: rows[0] || null,
      approved_available_gpu_pool: rows.slice(0, 5),
    };
  })
  .filter((region) => region.data_center_id && region.best_gpu)
  .sort((left, right) =>
    right.best_gpu.stock_rank - left.best_gpu.stock_rank ||
    left.best_gpu.usd_per_hour_reference - right.best_gpu.usd_per_hour_reference ||
    right.best_gpu.preference - left.best_gpu.preference ||
    left.data_center_id.localeCompare(right.data_center_id),
  );

const strictlyBetterRegions = stockedRegions.filter(
  (region) =>
    !effectiveDataCenters.includes(region.data_center_id) &&
    region.best_gpu.stock_rank > currentBestRank,
);

let recommendedAction = "NO_STRICTLY_BETTER_LIVE_CAPACITY_WAIT_AND_RECHECK";
if (unboundAvailableCurrentRegion.length) {
  recommendedAction = "EXPAND_CURRENT_REGION_TO_FULL_APPROVED_GPU_POOL_BEFORE_RELOCATION";
} else if (strictlyBetterRegions.length) {
  recommendedAction = "RELOCATE_CODE_VOLUME_TO_STRICTLY_BETTER_STOCKED_REGION";
} else if (currentBestRank >= 3) {
  recommendedAction = "KEEP_CURRENT_REGION_MEDIUM_OR_HIGH_STOCK_AVAILABLE";
} else if (currentBestRank === 0 && stockedRegions.length) {
  recommendedAction = "RELOCATE_CODE_VOLUME_TO_BEST_AVAILABLE_STOCKED_REGION";
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  local_env_loaded: localEnvLoaded,
  provider_job_submitted: false,
  endpoint_mutation_performed: false,
  queue_mutation_performed: false,
  storage_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
  endpoint: {
    id: endpointId,
    name: text(endpoint?.name) || null,
    gpu_type_ids: boundGpuTypeIds,
    explicit_data_center_ids: explicitDataCenters,
    effective_data_center_ids: effectiveDataCenters,
    effective_placement_source: volumeDataCenters.length
      ? "NETWORK_VOLUME_DATACENTER"
      : "ENDPOINT_DATACENTER_RESTRICTION",
    attached_network_volumes: attachedVolumes,
    workers_min: number(endpoint?.workersMin),
    workers_max: number(endpoint?.workersMax),
  },
  health,
  inspected_job: optionalJob
    ? {
        id: optionalJobId,
        status: upper(optionalJob?.status) || "UNKNOWN",
        delay_ms: number(optionalJob?.delayTime, null),
        execution_ms: number(optionalJob?.executionTime, null),
      }
    : null,
  policy: {
    minimum_gpu_memory_gb: MIN_GPU_MEMORY_GB,
    nvidia_only: true,
    native_fp8_required: true,
    sub_80gb_gpu_allowed: false,
    approved_profiles: GPU_PROFILES.map((profile) => ({
      profile: profile.key,
      vram_gb: profile.vram_gb,
      usd_per_hour_reference: profile.usd_per_hour_reference,
    })),
  },
  current_region: {
    bound_best_stock_rank: boundBestRank,
    approved_best_stock_rank: currentBestRank,
    bound_gpu_capacity: boundCurrentRegionCapacity,
    full_approved_gpu_capacity: approvedCurrentRegionCapacity,
    unbound_available_approved_gpus: unboundAvailableCurrentRegion,
    recommended_gpu_type_ids_if_expanded: recommendedCurrentPool,
  },
  strictly_better_regions: strictlyBetterRegions.slice(0, 12),
  all_stocked_regions: stockedRegions.slice(0, 12),
  recommended_action: recommendedAction,
}, null, 2));
