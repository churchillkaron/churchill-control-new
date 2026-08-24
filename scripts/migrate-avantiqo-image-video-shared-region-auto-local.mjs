import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const ENDPOINT_NAME = "avantiqo-image-v1";
const MIGRATION_SCRIPT = "scripts/migrate-avantiqo-image-video-shared-region-local.mjs";
const CONTRACT = "AVANTIQO_IMAGE_VIDEO_SHARED_REGION_AUTO_SELECTOR_V2";

const APPROVED_GPU_PROFILES = Object.freeze([
  Object.freeze({ key: "RTX_PRO_6000_96GB", match: /RTX\s*PRO\s*6000/i, exclude: null, vram_gb: 96, preference: 0 }),
  Object.freeze({ key: "H100_NVL_94GB", match: /H100.*NVL|NVL.*H100/i, exclude: null, vram_gb: 94, preference: 1 }),
  Object.freeze({ key: "H100_80GB", match: /\bH100\b/i, exclude: /NVL/i, vram_gb: 80, preference: 2 }),
  Object.freeze({ key: "H200_141GB", match: /\bH200\b/i, exclude: null, vram_gb: 141, preference: 3 }),
  Object.freeze({ key: "B200_180GB", match: /\bB200\b/i, exclude: null, vram_gb: 180, preference: 4 }),
]);

function text(value) {
  return String(value ?? "").trim();
}
function array(value) {
  return Array.isArray(value) ? value : [];
}
function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value) ? text(value).split(",").map((entry) => entry.trim()).filter(Boolean) : [];
}
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}
function stockRank(value) {
  return ({ HIGH: 4, MEDIUM: 3, LOW: 2 }[text(value).toUpperCase()] || 0);
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function endpointGpuTypes(endpoint = {}) {
  return unique(list(endpoint.gpuTypeIds));
}
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function gpuProfile(gpu = {}) {
  const label = [gpu?.gpuTypeId, gpu?.gpuTypeDisplayName, gpu?.displayName]
    .map(text)
    .filter(Boolean)
    .join(" ");
  return APPROVED_GPU_PROFILES.find(
    (profile) => profile.match.test(label) && !(profile.exclude && profile.exclude.test(label)),
  ) || null;
}
function safeVolume(volume = {}) {
  return {
    id: text(volume?.id) || null,
    name: text(volume?.name) || null,
    size_gb: finite(volume?.size ?? volume?.sizeGb),
    data_center_id: text(volume?.dataCenterId) || null,
  };
}
function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint?.id) || null,
    name: text(endpoint?.name) || null,
    network_volume_ids: endpointVolumeIds(endpoint),
    gpu_type_ids: endpointGpuTypes(endpoint),
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
  };
}
function safeCapacityRow(dataCenter, gpu) {
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
    preference: profile?.preference ?? 99,
    available: gpu?.available === true,
    stock_status: text(gpu?.stockStatus) || null,
    stock_rank: stockRank(gpu?.stockStatus),
  };
}
async function readJson(response, label) {
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
async function rest(path, key) {
  return readJson(await fetch(`${REST_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_REST");
}
async function discoverDatacenters(key) {
  const query = `
    query AvantiqoImageVideoAutoRegionV2($input: GpuAvailabilityInput) {
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
          minMemoryInGb: 80,
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
function resolveEndpoint(endpoints) {
  const configuredId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
  if (configuredId) {
    const matches = endpoints.filter((endpoint) => text(endpoint?.id) === configuredId);
    if (matches.length !== 1 || text(matches[0]?.name) !== ENDPOINT_NAME) {
      throw new Error(`AVANTIQO_IMAGE_VIDEO_AUTO_CONFIGURED_ENDPOINT_INVALID:matches=${matches.length}`);
    }
    return { endpoint: matches[0], source: "ENV_VERIFIED" };
  }
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_IMAGE_VIDEO_AUTO_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return { endpoint: matches[0], source: "EXACT_NAME" };
}
function rankCandidate(left, right, sourceLocation, currentGpuTypes) {
  if (right.stock_rank !== left.stock_rank) return right.stock_rank - left.stock_rank;
  const leftCurrentGpu = currentGpuTypes.includes(left.gpu_type_id) ? 1 : 0;
  const rightCurrentGpu = currentGpuTypes.includes(right.gpu_type_id) ? 1 : 0;
  if (rightCurrentGpu !== leftCurrentGpu) return rightCurrentGpu - leftCurrentGpu;
  const leftSameLocation = left.location === sourceLocation ? 1 : 0;
  const rightSameLocation = right.location === sourceLocation ? 1 : 0;
  if (rightSameLocation !== leftSameLocation) return rightSameLocation - leftSameLocation;
  if (left.preference !== right.preference) return left.preference - right.preference;
  const dc = String(left.data_center_id).localeCompare(String(right.data_center_id));
  if (dc !== 0) return dc;
  return String(left.gpu_type_id).localeCompare(String(right.gpu_type_id));
}
function runMigration(target, apply) {
  const args = [
    MIGRATION_SCRIPT,
    `--target-datacenter=${target.data_center_id}`,
    `--target-gpu-types=${target.gpu_type_id}`,
  ];
  if (apply) args.push("--apply");
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exitCode = result.status || 1;
}

const apply = process.argv.includes("--apply");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");

console.log(`AVANTIQO_IMAGE_VIDEO_AUTO_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log(`AVANTIQO_IMAGE_VIDEO_AUTO_CONTRACT=${CONTRACT}`);
console.log("AVANTIQO_IMAGE_VIDEO_AUTO_APPROVED_GPU_POOL=RTX_PRO_6000_96GB|H100_NVL_94GB|H100_80GB|H200_141GB|B200_180GB");
console.log("AVANTIQO_IMAGE_VIDEO_AUTO_MIN_VRAM_GB=80");
console.log("AVANTIQO_IMAGE_VIDEO_AUTO_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_IMAGE_VIDEO_AUTO_VOLUME_MUTATION=false");
console.log("AVANTIQO_IMAGE_VIDEO_AUTO_JOB_SUBMISSION=false");
console.log("AVANTIQO_IMAGE_VIDEO_AUTO_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_VIDEO_AUTO_SECRETS_PRINTED=false");

const [endpoints, volumes, dataCenters] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
  discoverDatacenters(managementKey),
]);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");

const resolved = resolveEndpoint(endpoints);
const endpoint = resolved.endpoint;
const volumeIds = endpointVolumeIds(endpoint);
if (volumeIds.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_VIDEO_AUTO_EXACTLY_ONE_VOLUME_REQUIRED:count=${volumeIds.length}`);
}
const volume = volumes.find((entry) => text(entry?.id) === volumeIds[0]);
if (!volume) throw new Error("AVANTIQO_IMAGE_VIDEO_AUTO_ATTACHED_VOLUME_NOT_FOUND");
const sourceDataCenterId = text(volume?.dataCenterId);
if (!sourceDataCenterId) throw new Error("AVANTIQO_IMAGE_VIDEO_AUTO_SOURCE_DATACENTER_REQUIRED");

const currentGpuTypes = endpointGpuTypes(endpoint);
if (!currentGpuTypes.length) throw new Error("AVANTIQO_IMAGE_VIDEO_AUTO_GPU_TYPES_REQUIRED");
const sourceDataCenter = dataCenters.find((entry) => text(entry?.id) === sourceDataCenterId);
if (!sourceDataCenter) throw new Error(`AVANTIQO_IMAGE_VIDEO_AUTO_SOURCE_DATACENTER_NOT_FOUND:${sourceDataCenterId}`);
const sourceLocation = text(sourceDataCenter?.location);

const approvedCapacityRows = dataCenters
  .flatMap((dataCenter) => array(dataCenter?.gpuAvailability).map((gpu) => safeCapacityRow(dataCenter, gpu)))
  .filter((row) => row.storage_support === true)
  .filter((row) => row.profile && finite(row.vram_gb, 0) >= 80 && row.gpu_type_id);
const sourceRows = approvedCapacityRows.filter(
  (row) => row.data_center_id === sourceDataCenterId && currentGpuTypes.includes(row.gpu_type_id),
);
const sourceBestRank = Math.max(
  0,
  ...sourceRows.filter((row) => row.available).map((row) => row.stock_rank),
);
const candidates = approvedCapacityRows
  .filter((row) => row.data_center_id !== sourceDataCenterId)
  .filter((row) => row.available === true)
  .filter((row) => row.stock_rank > sourceBestRank)
  .sort((left, right) => rankCandidate(left, right, sourceLocation, currentGpuTypes));

const best = candidates[0] || null;
const report = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint_resolution: resolved.source,
  endpoint: safeEndpoint(endpoint),
  source_volume: safeVolume(volume),
  source_location: sourceLocation || null,
  source_capacity_for_bound_gpu_types: sourceRows,
  source_best_stock_rank: sourceBestRank,
  approved_80gb_plus_capacity_rows: approvedCapacityRows,
  strictly_better_candidates: candidates,
  selected_target: best,
  selected_target_same_gpu_type: best ? currentGpuTypes.includes(best.gpu_type_id) : null,
  fallback_gpu_generation_certified: false,
  selector_mutation_performed: false,
  selector_job_submitted: false,
  selector_production_deploy: false,
  next_action: best
    ? apply
      ? "DELEGATE_SELECTED_REGION_AND_GPU_TO_GUARDED_MIGRATION_APPLY"
      : "DELEGATE_SELECTED_REGION_AND_GPU_TO_GUARDED_MIGRATION_PLAN"
    : "KEEP_CURRENT_REGION_NO_STRICTLY_BETTER_APPROVED_80GB_PLUS_LIVE_STOCK",
};

if (!best) {
  console.log("AVANTIQO_IMAGE_VIDEO_AUTO_SELECTION=NO_STRICTLY_BETTER_APPROVED_80GB_PLUS_REGION");
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log(`AVANTIQO_IMAGE_VIDEO_AUTO_SELECTED_DATACENTER=${best.data_center_id}`);
console.log(`AVANTIQO_IMAGE_VIDEO_AUTO_SELECTED_GPU=${best.gpu_type_id}`);
console.log(`AVANTIQO_IMAGE_VIDEO_AUTO_SELECTED_PROFILE=${best.profile}`);
console.log(`AVANTIQO_IMAGE_VIDEO_AUTO_SELECTED_STOCK=${best.stock_status}`);
console.log(`AVANTIQO_IMAGE_VIDEO_AUTO_SOURCE_STOCK_RANK=${sourceBestRank}`);
console.log(`AVANTIQO_IMAGE_VIDEO_AUTO_SELECTED_STOCK_RANK=${best.stock_rank}`);
console.log(JSON.stringify(report, null, 2));
console.log("AVANTIQO_IMAGE_VIDEO_AUTO_DELEGATING=true");
runMigration(best, apply);
