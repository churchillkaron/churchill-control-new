#!/usr/bin/env node

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_MUSIC_RUNPOD_SCHEDULABILITY_V1";
const AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1";
const SHARED_VOLUME_NAME = "avantiqo-shared-audio-voice-cache";
const MIN_SHARED_VOLUME_GB = 80;
const MIN_GPU_MEMORY_GB = 24;
const MIN_SINGLE_GPU_STOCK_RANK = 3;

const GPU_PREFERENCES = Object.freeze([
  { pattern: /\bL4\b/i, score: 1000 },
  { pattern: /RTX\s*A5000/i, score: 980 },
  { pattern: /RTX.*3090/i, score: 960 },
  { pattern: /RTX.*4090/i, score: 950 },
  { pattern: /\bA40\b/i, score: 940 },
  { pattern: /RTX\s*A6000/i, score: 930 },
  { pattern: /\bL40S\b/i, score: 920 },
  { pattern: /\bL40\b/i, score: 910 },
  { pattern: /RTX.*6000.*Ada|Ada.*RTX.*6000/i, score: 900 },
  { pattern: /\bA100\b/i, score: 700 },
  { pattern: /\bH100\b/i, score: 600 },
  { pattern: /\bH200\b/i, score: 500 },
]);

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function endpointVolumeIds(endpoint = {}) {
  return unique([
    endpoint.networkVolumeId ?? endpoint.network_volume_id,
    ...list(endpoint.networkVolumeIds ?? endpoint.network_volume_ids),
  ]);
}

function stockRank(value) {
  const status = text(value).toUpperCase();
  if (status === "HIGH") return 4;
  if (status === "MEDIUM") return 3;
  if (status === "LOW") return 2;
  if (status && status !== "NONE" && status !== "UNAVAILABLE") return 1;
  return 0;
}

function regionPreference(id) {
  const order = [
    "AP-JP-1",
    "OC-AU-1",
    "US-WA-1",
    "US-CA-2",
    "EU-NL-1",
    "EU-RO-1",
    "EU-CZ-1",
    "EU-SE-1",
    "US-GA-2",
    "US-KS-2",
  ];
  const index = order.indexOf(text(id));
  return index < 0 ? 0 : order.length - index;
}

function gpuPreference(gpu = {}) {
  const label = [gpu?.gpuTypeId, gpu?.gpuTypeDisplayName, gpu?.displayName]
    .map(text)
    .filter(Boolean)
    .join(" ");
  if (!label || /\bMIG\b/i.test(label)) return 0;
  return GPU_PREFERENCES.find(({ pattern }) => pattern.test(label))?.score || 0;
}

async function rest(path, credential) {
  const response = await fetch(`${REST_BASE}${path}`, {
    headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 900);
    throw new Error(`RUNPOD_REST_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function discoverDatacenters(credential) {
  const query = `
    query AvantiqoMusicSchedulability($input: GpuAvailabilityInput) {
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
  const response = await fetch(`${GRAPHQL_URL}?api_key=${encodeURIComponent(credential)}`, {
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
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || body?.errors?.length) {
    const detail = text(
      body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw,
    ).slice(0, 1200);
    throw new Error(`RUNPOD_GPU_AVAILABILITY_FAILED:${response.status}:${detail || "EMPTY_BODY"}`);
  }
  if (!Array.isArray(body?.data?.dataCenters)) {
    throw new Error("RUNPOD_GPU_AVAILABILITY_INVALID_RESPONSE");
  }
  return body.data.dataCenters;
}

function safeGpu(gpu = {}) {
  const gpuTypeId = text(gpu?.gpuTypeId);
  const preference = gpuPreference(gpu);
  return {
    gpu_type_id: gpuTypeId || null,
    gpu_name: text(gpu?.gpuTypeDisplayName || gpu?.displayName) || null,
    approved_24gb_plus: preference > 0,
    preference,
    available: gpu?.available === true,
    stock_status: text(gpu?.stockStatus) || null,
    stock_rank: stockRank(gpu?.stockStatus),
  };
}

function approvedCapacity(dataCenter = {}) {
  return list(dataCenter?.gpuAvailability)
    .map(safeGpu)
    .filter((gpu) => gpu.gpu_type_id && gpu.approved_24gb_plus)
    .sort(
      (left, right) =>
        Number(right.available) - Number(left.available) ||
        right.stock_rank - left.stock_rank ||
        right.preference - left.preference ||
        left.gpu_type_id.localeCompare(right.gpu_type_id),
    );
}

function liveApprovedGpuTypes(dataCenter = {}) {
  return approvedCapacity(dataCenter)
    .filter((gpu) => gpu.available && gpu.stock_rank > 0)
    .map((gpu) => gpu.gpu_type_id);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID);

const [endpoints, volumes, dataCenters] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
  discoverDatacenters(managementKey),
]);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");

const endpointMatches = endpoints.filter((endpoint) =>
  configuredEndpointId
    ? text(endpoint?.id) === configuredEndpointId && text(endpoint?.name) === AUDIO_ENDPOINT_NAME
    : text(endpoint?.name) === AUDIO_ENDPOINT_NAME,
);
if (endpointMatches.length !== 1) {
  throw new Error(`AVANTIQO_MUSIC_ENDPOINT_RESOLUTION_FAILED:matches=${endpointMatches.length}`);
}
const endpoint = endpointMatches[0];
const endpointId = text(endpoint?.id);
const endpointGpuTypes = unique(list(endpoint?.gpuTypeIds));
const volumeIds = endpointVolumeIds(endpoint);
if (volumeIds.length !== 1) {
  throw new Error(`AVANTIQO_MUSIC_SINGLE_SHARED_VOLUME_REQUIRED:count=${volumeIds.length}`);
}
const volume = volumes.find((entry) => text(entry?.id) === volumeIds[0]);
if (!volume) throw new Error("AVANTIQO_MUSIC_SHARED_VOLUME_LOOKUP_FAILED");
if (text(volume?.name) !== SHARED_VOLUME_NAME) {
  throw new Error(`AVANTIQO_MUSIC_SHARED_VOLUME_NAME_MISMATCH:${text(volume?.name) || "MISSING"}`);
}
const volumeSizeGb = finite(volume?.size, -1);
if (volumeSizeGb < MIN_SHARED_VOLUME_GB) {
  throw new Error(`AVANTIQO_MUSIC_SHARED_VOLUME_TOO_SMALL:${volumeSizeGb}`);
}
const dataCenterId = text(volume?.dataCenterId);
if (!dataCenterId) throw new Error("AVANTIQO_MUSIC_SHARED_VOLUME_DATACENTER_REQUIRED");
const currentDataCenter = dataCenters.find((entry) => text(entry?.id) === dataCenterId);
if (!currentDataCenter) {
  throw new Error(`AVANTIQO_MUSIC_SHARED_VOLUME_DATACENTER_NOT_FOUND:${dataCenterId}`);
}

const currentRegionCapacity = approvedCapacity(currentDataCenter);
const currentRegionLiveGpuTypes = liveApprovedGpuTypes(currentDataCenter);
const schedulableGpuTypes = endpointGpuTypes.filter((gpuTypeId) =>
  currentRegionLiveGpuTypes.includes(gpuTypeId),
);
const inPlaceExpansionGpuTypes = currentRegionLiveGpuTypes.filter(
  (gpuTypeId) => !endpointGpuTypes.includes(gpuTypeId),
);
const endpointLiveCapacity = currentRegionCapacity.filter(
  (gpu) => gpu.available && gpu.stock_rank > 0 && schedulableGpuTypes.includes(gpu.gpu_type_id),
);
const highestEndpointStockRank = endpointLiveCapacity.reduce(
  (max, gpu) => Math.max(max, gpu.stock_rank),
  0,
);

const migrationCandidates = dataCenters
  .filter((entry) => entry?.storageSupport === true && text(entry?.id) !== dataCenterId)
  .map((entry) => {
    const liveGpuTypes = liveApprovedGpuTypes(entry);
    const capacity = approvedCapacity(entry);
    const highestStockRank = capacity
      .filter((gpu) => gpu.available && gpu.stock_rank > 0)
      .reduce((max, gpu) => Math.max(max, gpu.stock_rank), 0);
    const highestPreference = capacity
      .filter((gpu) => gpu.available && gpu.stock_rank > 0)
      .reduce((max, gpu) => Math.max(max, gpu.preference), 0);
    return {
      data_center_id: text(entry?.id) || null,
      name: text(entry?.name) || null,
      location: text(entry?.location) || null,
      live_approved_gpu_types: liveGpuTypes,
      highest_stock_rank: highestStockRank,
      highest_gpu_preference: highestPreference,
      region_preference: regionPreference(entry?.id),
    };
  })
  .filter((entry) => entry.data_center_id && entry.live_approved_gpu_types.length)
  .sort(
    (left, right) =>
      right.highest_stock_rank - left.highest_stock_rank ||
      right.highest_gpu_preference - left.highest_gpu_preference ||
      right.live_approved_gpu_types.length - left.live_approved_gpu_types.length ||
      right.region_preference - left.region_preference ||
      left.data_center_id.localeCompare(right.data_center_id),
  );

const capacitySufficient = schedulableGpuTypes.length > 0;
const resilienceReady =
  schedulableGpuTypes.length >= 2 || highestEndpointStockRank >= MIN_SINGLE_GPU_STOCK_RANK;
const resilienceExpansionRecommended =
  capacitySufficient && !resilienceReady && inPlaceExpansionGpuTypes.length > 0;
const inPlaceRepairPossible =
  (!capacitySufficient || resilienceExpansionRecommended) && inPlaceExpansionGpuTypes.length > 0;
const migrationRequired =
  (!capacitySufficient && !inPlaceRepairPossible) ||
  (capacitySufficient && !resilienceReady && inPlaceExpansionGpuTypes.length === 0);
const recommendedInPlaceGpuPool = inPlaceRepairPossible
  ? unique([...endpointGpuTypes, ...inPlaceExpansionGpuTypes])
  : endpointGpuTypes;
const readyForControlledBenchmark = capacitySufficient && resilienceReady;

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  capacity_sufficient: capacitySufficient,
  resilience_ready: resilienceReady,
  ready_for_controlled_benchmark: readyForControlledBenchmark,
  capacity_policy: "KNOWN_NON_MIG_CUDA_24GB_PLUS_LIVE_STOCK",
  resilience_policy: "TWO_LIVE_ENDPOINT_GPU_TYPES_OR_SINGLE_MEDIUM_PLUS_STOCK",
  endpoint: {
    id: endpointId,
    name: AUDIO_ENDPOINT_NAME,
    gpu_type_ids: endpointGpuTypes,
    workers_min: finite(endpoint?.workersMin, -1),
    workers_max: finite(endpoint?.workersMax, -1),
  },
  shared_cache: {
    id: text(volume?.id),
    name: text(volume?.name),
    size_gb: volumeSizeGb,
    data_center_id: dataCenterId,
  },
  current_region: {
    data_center_id: dataCenterId,
    storage_support: currentDataCenter?.storageSupport === true,
    approved_capacity: currentRegionCapacity,
    live_approved_gpu_types: currentRegionLiveGpuTypes,
    endpoint_schedulable_gpu_types: schedulableGpuTypes,
    endpoint_highest_stock_rank: highestEndpointStockRank,
  },
  repair: {
    in_place_gpu_pool_expansion_possible: inPlaceRepairPossible,
    resilience_expansion_recommended: resilienceExpansionRecommended,
    in_place_gpu_types_to_add: inPlaceExpansionGpuTypes,
    recommended_in_place_gpu_pool: recommendedInPlaceGpuPool,
    shared_cache_region_migration_required: migrationRequired,
    recommended_migration_target: migrationCandidates[0] || null,
  },
  safety: {
    read_only: true,
    endpoint_mutation_performed: false,
    network_volume_mutation_performed: false,
    generation_submitted: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  },
}, null, 2));
