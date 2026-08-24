import { spawnSync } from "node:child_process";
import {
  AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY,
  classifyManagedVolumeName,
  groupCacheVolumes,
  managedCacheVolumes,
  sharedVolumeGroup,
  sharedVolumePolicySummary,
} from "./lib/avantiqo-runpod-shared-volumes.mjs";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_IMAGE_VIDEO_SHARED_REGION_MIGRATION_V1";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const SHARED_GROUP = sharedVolumeGroup("IMAGE_VIDEO");
const DEFAULT_TARGET_DATACENTER = "EUR-IS-1";
const MIN_TARGET_STOCK_RANK = 3; // MEDIUM
const MIN_VOLUME_GB = 80;
const POLL_MS = 5_000;
const QUIESCENCE_TIMEOUT_MS = Math.max(
  30_000,
  Number(process.env.AVANTIQO_IMAGE_VIDEO_MIGRATION_QUIESCENCE_MS || 5 * 60 * 1000),
);

const APPROVED_GPU_PROFILES = Object.freeze([
  Object.freeze({ key: "RTX_PRO_6000_96GB", match: /RTX\s*PRO\s*6000/i, exclude: null, vram_gb: 96 }),
  Object.freeze({ key: "H100_NVL_94GB", match: /H100.*NVL|NVL.*H100/i, exclude: null, vram_gb: 94 }),
  Object.freeze({ key: "H100_80GB", match: /\bH100\b/i, exclude: /NVL/i, vram_gb: 80 }),
  Object.freeze({ key: "H200_141GB", match: /\bH200\b/i, exclude: null, vram_gb: 141 }),
  Object.freeze({ key: "B200_180GB", match: /\bB200\b/i, exclude: null, vram_gb: 180 }),
]);

function text(value) {
  return String(value ?? "").trim();
}
function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (!text(value)) return [];
  return text(value).split(",").map((entry) => entry.trim()).filter(Boolean);
}
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}
function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function upper(value) {
  return text(value).toUpperCase();
}
function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(upper(value));
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function arg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return text(match ? match.slice(prefix.length) : "");
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function stockRank(status) {
  return ({ HIGH: 4, MEDIUM: 3, LOW: 2 }[upper(status)] || 0);
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
function safeGpu(gpu = {}) {
  const profile = gpuProfile(gpu);
  return {
    gpu_type_id: text(gpu?.gpuTypeId) || null,
    gpu_name: text(gpu?.gpuTypeDisplayName || gpu?.displayName) || null,
    profile: profile?.key || null,
    vram_gb: profile?.vram_gb || null,
    available: gpu?.available === true,
    stock_status: text(gpu?.stockStatus) || null,
    stock_rank: stockRank(gpu?.stockStatus),
  };
}
function approvedCapacity(dataCenter = {}) {
  return list(dataCenter?.gpuAvailability)
    .map(safeGpu)
    .filter((gpu) => gpu.profile && gpu.vram_gb >= 80 && gpu.gpu_type_id)
    .sort((a, b) => b.stock_rank - a.stock_rank || a.gpu_type_id.localeCompare(b.gpu_type_id));
}
function healthCounters(body = {}) {
  const jobs = body?.jobs && typeof body.jobs === "object" ? body.jobs : {};
  const workers = body?.workers && typeof body.workers === "object" ? body.workers : {};
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers: {
      idle: finite(workers.idle, 0),
      initializing: finite(workers.initializing, 0),
      ready: finite(workers.ready, 0),
      running: finite(workers.running, 0),
      throttled: finite(workers.throttled, 0),
      unhealthy: finite(workers.unhealthy, 0),
    },
  };
}
function activityCount(counters) {
  return (
    counters.jobs.in_queue +
    counters.jobs.in_progress +
    Object.values(counters.workers).reduce((sum, value) => sum + finite(value, 0), 0)
  );
}
function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint?.id) || null,
    name: text(endpoint?.name) || null,
    template_id: text(endpoint?.templateId || endpoint?.template?.id) || null,
    network_volume_ids: endpointVolumeIds(endpoint),
    data_center_ids: list(endpoint?.dataCenterIds),
    gpu_type_ids: list(endpoint?.gpuTypeIds),
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    scaler_type: text(endpoint?.scalerType) || null,
    scaler_value: finite(endpoint?.scalerValue),
    idle_timeout_seconds: finite(endpoint?.idleTimeout),
    execution_timeout_ms: finite(endpoint?.executionTimeoutMs ?? endpoint?.executionTimeout),
    flashboot: endpoint?.flashBoot ?? endpoint?.flashboot ?? null,
  };
}
function stableEndpointFields(endpoint = {}) {
  const safe = safeEndpoint(endpoint);
  return {
    template_id: safe.template_id,
    workers_min: safe.workers_min,
    workers_max: safe.workers_max,
    scaler_type: safe.scaler_type,
    scaler_value: safe.scaler_value,
    idle_timeout_seconds: safe.idle_timeout_seconds,
    execution_timeout_ms: safe.execution_timeout_ms,
    flashboot: safe.flashboot,
  };
}
function safeVolume(volume = {}) {
  return {
    id: text(volume?.id) || null,
    name: text(volume?.name) || null,
    size_gb: finite(volume?.size ?? volume?.sizeGb),
    data_center_id: text(volume?.dataCenterId) || null,
    group: classifyManagedVolumeName(volume?.name)?.id || null,
  };
}
function assertStableFields(before, after, label) {
  if (JSON.stringify(stableEndpointFields(before)) !== JSON.stringify(stableEndpointFields(after))) {
    throw new Error(`${label}_STABLE_ENDPOINT_FIELDS_CHANGED`);
  }
}
function command(commandName, args, errorCode) {
  const result = spawnSync(commandName, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const detail = text(result.stderr || result.stdout).slice(0, 1200);
    throw new Error(`${errorCode}:${detail || `exit=${result.status}`}`);
  }
  return text(result.stdout);
}
function runChild(script, args, label) {
  console.log(`AVANTIQO_IMAGE_VIDEO_MIGRATION_CHILD_START=${label}`);
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${label}_FAILED:exit=${result.status ?? "UNKNOWN"}`);
  }
  console.log(`AVANTIQO_IMAGE_VIDEO_MIGRATION_CHILD_COMPLETE=${label}`);
}
function requireCurrentMain() {
  command("git", ["fetch", "origin", "main"], "AVANTIQO_IMAGE_VIDEO_MIGRATION_FETCH_MAIN_FAILED");
  const branch = command("git", ["branch", "--show-current"], "AVANTIQO_IMAGE_VIDEO_MIGRATION_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_IMAGE_VIDEO_MIGRATION_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  const head = command("git", ["rev-parse", "HEAD"], "AVANTIQO_IMAGE_VIDEO_MIGRATION_HEAD_READ_FAILED");
  const originMain = command("git", ["rev-parse", "origin/main"], "AVANTIQO_IMAGE_VIDEO_MIGRATION_ORIGIN_READ_FAILED");
  if (head !== originMain) {
    throw new Error(`AVANTIQO_IMAGE_VIDEO_MIGRATION_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin=${originMain}:run_git_pull_ff_only_origin_main`);
  }
  return head;
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1200);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}
async function rest(path, key, options = {}) {
  return readJson(await fetch(`${REST_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  }), "RUNPOD_REST");
}
async function serverless(endpointId, path, key, options = {}) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  }), "RUNPOD_SERVERLESS");
}
async function discoverDatacenters(key) {
  const query = `
    query AvantiqoImageVideoRegionMigration($input: GpuAvailabilityInput) {
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
      variables: { input: { gpuCount: 1, minDisk: 5, minMemoryInGb: 80, secureCloud: true } },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || body?.errors?.length || !Array.isArray(body?.data?.dataCenters)) {
    const detail = text(body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw).slice(0, 1200);
    throw new Error(`RUNPOD_GPU_AVAILABILITY_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  return body.data.dataCenters;
}
async function waitForQuiescence(endpointId, inferenceKey, label) {
  const deadline = Date.now() + QUIESCENCE_TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    const health = await serverless(endpointId, "/health", inferenceKey);
    last = healthCounters(health);
    if (activityCount(last) === 0) return last;
    console.log(`AVANTIQO_IMAGE_VIDEO_MIGRATION_QUIESCENCE_WAIT label=${label} health=${JSON.stringify(last)}`);
    await sleep(POLL_MS);
  }
  throw new Error(`AVANTIQO_IMAGE_VIDEO_MIGRATION_QUIESCENCE_TIMEOUT:${label}:${JSON.stringify(last)}`);
}
function resolveImageEndpoint(endpoints, configuredId) {
  if (configuredId) {
    const matches = endpoints.filter((endpoint) => text(endpoint?.id) === configuredId);
    if (matches.length !== 1 || text(matches[0]?.name) !== IMAGE_ENDPOINT_NAME) {
      throw new Error(`AVANTIQO_IMAGE_VIDEO_MIGRATION_CONFIGURED_ENDPOINT_INVALID:matches=${matches.length}`);
    }
    return { endpoint: matches[0], source: "ENV_VERIFIED" };
  }
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_IMAGE_VIDEO_MIGRATION_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return { endpoint: matches[0], source: "EXACT_NAME" };
}
function endpointUsers(endpoints, volumeId, exceptEndpointId = null) {
  return endpoints
    .filter((endpoint) => text(endpoint?.id) !== text(exceptEndpointId))
    .filter((endpoint) => endpointVolumeIds(endpoint).includes(volumeId))
    .map((endpoint) => ({ id: text(endpoint?.id) || null, name: text(endpoint?.name) || null }));
}
async function deleteVolumeIfUnused(volumeId, managementKey, endpointIdToIgnore = null) {
  const endpoints = await rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey);
  if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID_FOR_VOLUME_DELETE");
  const users = endpointUsers(endpoints, volumeId, endpointIdToIgnore);
  if (users.length) return { deleted: false, users };
  await rest(`/networkvolumes/${encodeURIComponent(volumeId)}`, managementKey, { method: "DELETE" });
  return { deleted: true, users: [] };
}

const apply = process.argv.includes("--apply");
const approved = yes(process.env.AVANTIQO_IMAGE_VIDEO_REGION_MIGRATION_APPROVED);
if (apply && !approved) {
  throw new Error("AVANTIQO_IMAGE_VIDEO_REGION_MIGRATION_APPROVED=YES_REQUIRED");
}
const targetDataCenterId = arg("target-datacenter") || DEFAULT_TARGET_DATACENTER;
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
const mainSha = requireCurrentMain();

console.log(`AVANTIQO_IMAGE_VIDEO_MIGRATION_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log(`AVANTIQO_IMAGE_VIDEO_MIGRATION_TARGET_DATACENTER=${targetDataCenterId}`);
console.log(`AVANTIQO_IMAGE_VIDEO_MIGRATION_CANONICAL_VOLUME=${SHARED_GROUP.canonical_name}`);
console.log("AVANTIQO_IMAGE_VIDEO_MIGRATION_PER_ENGINE_VOLUME_CREATION=false");
console.log("AVANTIQO_IMAGE_VIDEO_MIGRATION_IMAGE_GENERATION=false");
console.log("AVANTIQO_IMAGE_VIDEO_MIGRATION_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_VIDEO_MIGRATION_SECRETS_PRINTED=false");

const [endpoints, volumes, dataCenters] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
  discoverDatacenters(managementKey),
]);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");

const resolved = resolveImageEndpoint(endpoints, configuredEndpointId);
const endpoint = resolved.endpoint;
const endpointId = text(endpoint.id);
const sourceVolumeIds = endpointVolumeIds(endpoint);
if (sourceVolumeIds.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_VIDEO_MIGRATION_EXACTLY_ONE_SOURCE_VOLUME_REQUIRED:count=${sourceVolumeIds.length}`);
}
const sourceVolume = volumes.find((volume) => text(volume?.id) === sourceVolumeIds[0]);
if (!sourceVolume) throw new Error("AVANTIQO_IMAGE_VIDEO_MIGRATION_SOURCE_VOLUME_NOT_FOUND");
if (classifyManagedVolumeName(sourceVolume?.name)?.id !== SHARED_GROUP.id) {
  throw new Error("AVANTIQO_IMAGE_VIDEO_MIGRATION_SOURCE_VOLUME_WRONG_GROUP");
}
if (finite(sourceVolume?.size, 0) < MIN_VOLUME_GB) {
  throw new Error(`AVANTIQO_IMAGE_VIDEO_MIGRATION_SOURCE_VOLUME_TOO_SMALL:size_gb=${finite(sourceVolume?.size, 0)}`);
}
const sourceVolumeId = text(sourceVolume.id);
const sourceDataCenterId = text(sourceVolume.dataCenterId);
if (!sourceDataCenterId) throw new Error("AVANTIQO_IMAGE_VIDEO_MIGRATION_SOURCE_DATACENTER_REQUIRED");

const groupVolumes = groupCacheVolumes(volumes, SHARED_GROUP);
const canonicalVolumes = groupVolumes.filter((volume) => text(volume?.name) === SHARED_GROUP.canonical_name);
if (canonicalVolumes.length > 1) {
  throw new Error(`AVANTIQO_IMAGE_VIDEO_MIGRATION_MULTIPLE_CANONICAL_VOLUMES:count=${canonicalVolumes.length}`);
}
if (groupVolumes.length > 1 && canonicalVolumes.length === 0) {
  throw new Error(`AVANTIQO_IMAGE_VIDEO_MIGRATION_LEGACY_CONSOLIDATION_REQUIRED:count=${groupVolumes.length}`);
}
const sourceUsers = endpointUsers(endpoints, sourceVolumeId, endpointId);
if (sourceUsers.length) {
  throw new Error(
    `AVANTIQO_IMAGE_VIDEO_MIGRATION_SOURCE_SHARED_BY_OTHER_ENDPOINTS:${sourceUsers.map((entry) => entry.name || entry.id).join("|")}`,
  );
}

const currentGpuTypes = list(endpoint?.gpuTypeIds);
if (!currentGpuTypes.length) throw new Error("AVANTIQO_IMAGE_VIDEO_MIGRATION_CURRENT_GPU_TYPES_REQUIRED");
const sourceDc = dataCenters.find((dc) => text(dc?.id) === sourceDataCenterId);
const targetDc = dataCenters.find((dc) => text(dc?.id) === targetDataCenterId);
if (!sourceDc) throw new Error(`AVANTIQO_IMAGE_VIDEO_MIGRATION_SOURCE_DC_NOT_FOUND:${sourceDataCenterId}`);
if (!targetDc || targetDc.storageSupport !== true) {
  throw new Error(`AVANTIQO_IMAGE_VIDEO_MIGRATION_TARGET_DC_STORAGE_UNAVAILABLE:${targetDataCenterId}`);
}

const sourceCapacity = approvedCapacity(sourceDc).filter((gpu) => currentGpuTypes.includes(gpu.gpu_type_id));
const targetCapacity = approvedCapacity(targetDc).filter((gpu) => currentGpuTypes.includes(gpu.gpu_type_id));
const sourceBestRank = Math.max(0, ...sourceCapacity.map((gpu) => gpu.available ? gpu.stock_rank : 0));
const targetCandidates = targetCapacity.filter(
  (gpu) => gpu.available === true && gpu.stock_rank >= MIN_TARGET_STOCK_RANK,
);
const targetBestRank = Math.max(0, ...targetCandidates.map((gpu) => gpu.stock_rank));
const targetGpuTypes = unique(targetCandidates.filter((gpu) => gpu.stock_rank === targetBestRank).map((gpu) => gpu.gpu_type_id));

if (sourceDataCenterId === targetDataCenterId && text(sourceVolume?.name) === SHARED_GROUP.canonical_name) {
  console.log("AVANTIQO_IMAGE_VIDEO_MIGRATION_ALREADY_COMPLETE=true");
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    main_sha: mainSha,
    mutation_performed: false,
    endpoint: safeEndpoint(endpoint),
    shared_volume: safeVolume(sourceVolume),
    next_action: "RUN_SHARED_IMAGE_CACHE_PROBE",
  }, null, 2));
  process.exit(0);
}
if (!targetCandidates.length) {
  throw new Error(`AVANTIQO_IMAGE_VIDEO_MIGRATION_TARGET_MEDIUM_OR_HIGH_STOCK_REQUIRED:${targetDataCenterId}`);
}
if (targetBestRank <= sourceBestRank) {
  throw new Error(
    `AVANTIQO_IMAGE_VIDEO_MIGRATION_TARGET_NOT_STRICTLY_BETTER:source_rank=${sourceBestRank}:target_rank=${targetBestRank}`,
  );
}

let targetVolume = canonicalVolumes[0] || null;
if (targetVolume && text(targetVolume?.dataCenterId) !== targetDataCenterId) {
  throw new Error(
    `AVANTIQO_IMAGE_VIDEO_MIGRATION_CANONICAL_VOLUME_WRONG_DC:id=${text(targetVolume?.id)}:dc=${text(targetVolume?.dataCenterId)}:target=${targetDataCenterId}`,
  );
}
if (targetVolume && finite(targetVolume?.size, 0) < MIN_VOLUME_GB) {
  throw new Error(`AVANTIQO_IMAGE_VIDEO_MIGRATION_CANONICAL_VOLUME_TOO_SMALL:size_gb=${finite(targetVolume?.size, 0)}`);
}
if (!targetVolume) {
  const managed = managedCacheVolumes(volumes);
  if (managed.length >= AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY.maximum_managed_cache_volumes) {
    throw new Error(
      `AVANTIQO_IMAGE_VIDEO_MIGRATION_TRANSIENT_VOLUME_BUDGET_EXCEEDED:managed=${managed.length}:maximum=${AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY.maximum_managed_cache_volumes}`,
    );
  }
}

const initialHealth = healthCounters(await serverless(endpointId, "/health", inferenceKey));
if (activityCount(initialHealth) !== 0) {
  throw new Error(`AVANTIQO_IMAGE_VIDEO_MIGRATION_REQUIRES_IDLE_IMAGE_ENDPOINT:${JSON.stringify(initialHealth)}`);
}

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_sha: mainSha,
  endpoint_resolution: resolved.source,
  endpoint_before: safeEndpoint(endpoint),
  source_volume: safeVolume(sourceVolume),
  source_capacity_for_current_gpu: sourceCapacity,
  target_datacenter: {
    id: targetDataCenterId,
    name: text(targetDc?.name) || null,
    location: text(targetDc?.location) || null,
    capacity_for_current_gpu: targetCapacity,
  },
  target_gpu_type_ids: targetGpuTypes,
  target_volume_existing: targetVolume ? safeVolume(targetVolume) : null,
  target_volume_will_be_created: !targetVolume,
  transient_managed_volume_count_after_create: managedCacheVolumes(volumes).length + (targetVolume ? 0 : 1),
  current_shared_policy: sharedVolumePolicySummary(volumes),
  source_other_endpoint_users: sourceUsers,
  image_generation: false,
  cache_bootstrap_or_verify_required: true,
  cache_model_download_allowed_if_missing: true,
  runtime_probe_required: true,
  production_deploy: false,
  mutation_performed: false,
  next_action: apply ? "MIGRATE_CACHE_PROBE_AND_CONSOLIDATE" : "RUN_WITH_APPLY_APPROVAL",
};

if (!apply) {
  console.log("AVANTIQO_IMAGE_VIDEO_MIGRATION_PLAN=READY");
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

// Replan immediately before the first provider mutation.
requireCurrentMain();
const [freshEndpoints, freshVolumes, freshDataCenters] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
  discoverDatacenters(managementKey),
]);
const freshResolved = resolveImageEndpoint(freshEndpoints, endpointId);
const freshEndpoint = freshResolved.endpoint;
if (!sameSet(endpointVolumeIds(freshEndpoint), [sourceVolumeId])) {
  throw new Error("AVANTIQO_IMAGE_VIDEO_MIGRATION_SOURCE_BINDING_CHANGED_REPLAN_REQUIRED");
}
assertStableFields(endpoint, freshEndpoint, "AVANTIQO_IMAGE_VIDEO_MIGRATION_PREWRITE");
const freshSourceUsers = endpointUsers(freshEndpoints, sourceVolumeId, endpointId);
if (freshSourceUsers.length) {
  throw new Error("AVANTIQO_IMAGE_VIDEO_MIGRATION_SOURCE_GAINED_OTHER_ENDPOINT_USER_REPLAN_REQUIRED");
}
const freshTargetDc = freshDataCenters.find((dc) => text(dc?.id) === targetDataCenterId);
const freshTargetCapacity = approvedCapacity(freshTargetDc).filter((gpu) => currentGpuTypes.includes(gpu.gpu_type_id));
const freshTargetCandidates = freshTargetCapacity.filter(
  (gpu) => gpu.available === true && gpu.stock_rank >= MIN_TARGET_STOCK_RANK,
);
const freshTargetRank = Math.max(0, ...freshTargetCandidates.map((gpu) => gpu.stock_rank));
const freshTargetGpuTypes = unique(
  freshTargetCandidates.filter((gpu) => gpu.stock_rank === freshTargetRank).map((gpu) => gpu.gpu_type_id),
);
if (!freshTargetGpuTypes.length || freshTargetRank <= sourceBestRank) {
  throw new Error(
    `AVANTIQO_IMAGE_VIDEO_MIGRATION_CAPACITY_DEGRADED_BEFORE_WRITE:source_rank=${sourceBestRank}:target_rank=${freshTargetRank}`,
  );
}
const freshGroupVolumes = groupCacheVolumes(freshVolumes, SHARED_GROUP);
const freshCanonical = freshGroupVolumes.filter((volume) => text(volume?.name) === SHARED_GROUP.canonical_name);
if (freshCanonical.length > 1) throw new Error("AVANTIQO_IMAGE_VIDEO_MIGRATION_CANONICAL_AMBIGUOUS_BEFORE_WRITE");
if (freshCanonical.length === 1) {
  targetVolume = freshCanonical[0];
  if (text(targetVolume?.dataCenterId) !== targetDataCenterId) {
    throw new Error("AVANTIQO_IMAGE_VIDEO_MIGRATION_CANONICAL_DC_CHANGED_REPLAN_REQUIRED");
  }
} else {
  const managed = managedCacheVolumes(freshVolumes);
  if (managed.length >= AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY.maximum_managed_cache_volumes) {
    throw new Error("AVANTIQO_IMAGE_VIDEO_MIGRATION_TRANSIENT_VOLUME_BUDGET_LOST_REPLAN_REQUIRED");
  }
}
await waitForQuiescence(endpointId, inferenceKey, "BEFORE_MIGRATION");

let targetCreated = false;
if (!targetVolume) {
  targetVolume = await rest("/networkvolumes", managementKey, {
    method: "POST",
    body: {
      dataCenterId: targetDataCenterId,
      name: SHARED_GROUP.canonical_name,
      size: Math.max(MIN_VOLUME_GB, finite(sourceVolume?.size, MIN_VOLUME_GB)),
    },
  });
  targetCreated = true;
  console.log(`AVANTIQO_IMAGE_VIDEO_MIGRATION_TARGET_VOLUME_CREATED=${text(targetVolume?.id) || "MISSING"}`);
}
const targetVolumeId = text(targetVolume?.id);
if (!targetVolumeId || text(targetVolume?.dataCenterId) !== targetDataCenterId) {
  throw new Error("AVANTIQO_IMAGE_VIDEO_MIGRATION_TARGET_VOLUME_VERIFY_FAILED");
}

async function patchImageTo(volume, dataCenterId, gpuTypes) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: {
      networkVolumeId: text(volume.id),
      networkVolumeIds: [text(volume.id)],
      dataCenterIds: [dataCenterId],
      gpuTypeIds: gpuTypes,
      workersMin: finite(endpoint?.workersMin, 0),
      workersMax: finite(endpoint?.workersMax, 1),
    },
  });
  const verified = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
  );
  if (!sameSet(endpointVolumeIds(verified), [text(volume.id)])) {
    throw new Error("AVANTIQO_IMAGE_VIDEO_MIGRATION_ENDPOINT_VOLUME_VERIFY_FAILED");
  }
  if (!sameSet(list(verified?.gpuTypeIds), gpuTypes)) {
    throw new Error("AVANTIQO_IMAGE_VIDEO_MIGRATION_ENDPOINT_GPU_VERIFY_FAILED");
  }
  assertStableFields(endpoint, verified, "AVANTIQO_IMAGE_VIDEO_MIGRATION_POSTPATCH");
  return verified;
}
async function rollbackBeforeCacheProof(reason) {
  console.error(`AVANTIQO_IMAGE_VIDEO_MIGRATION_ROLLBACK_REASON=${reason}`);
  await waitForQuiescence(endpointId, inferenceKey, "ROLLBACK").catch(() => null);
  await patchImageTo(sourceVolume, sourceDataCenterId, currentGpuTypes);
  if (targetCreated) {
    const cleanup = await deleteVolumeIfUnused(targetVolumeId, managementKey, endpointId);
    console.log(`AVANTIQO_IMAGE_VIDEO_MIGRATION_UNPROVEN_TARGET_VOLUME_DELETED=${cleanup.deleted}`);
  }
}

await patchImageTo(targetVolume, targetDataCenterId, freshTargetGpuTypes);
console.log("AVANTIQO_IMAGE_VIDEO_MIGRATION_IMAGE_ENDPOINT_MOVED_TO_TARGET=true");

try {
  runChild("scripts/cache-avantiqo-image-2512-local.mjs", ["--apply"], "AVANTIQO_IMAGE_VIDEO_MIGRATION_CACHE");
} catch (error) {
  await rollbackBeforeCacheProof(text(error?.message || error));
  throw error;
}

let probePassed = false;
try {
  runChild("scripts/probe-avantiqo-image-runtime-local.mjs", [], "AVANTIQO_IMAGE_VIDEO_MIGRATION_PROBE");
  probePassed = true;
} catch (error) {
  console.error(`AVANTIQO_IMAGE_VIDEO_MIGRATION_PROBE_FAILED_AFTER_CACHE=${text(error?.message || error)}`);
}

if (!probePassed) {
  console.log("AVANTIQO_IMAGE_VIDEO_MIGRATION_TARGET_CACHE_PRESERVED=true");
  console.log("AVANTIQO_IMAGE_VIDEO_MIGRATION_SOURCE_BACKUP_PRESERVED=true");
  console.log(JSON.stringify({
    ...plan,
    success: false,
    mode: "APPLY",
    mutation_performed: true,
    target_volume: safeVolume(targetVolume),
    target_cache_verified: true,
    target_runtime_probe_passed: false,
    source_volume_deleted: false,
    image_generation: false,
    production_deploy: false,
    next_action: "TARGET_CACHE_READY_PROBE_FAILED_KEEP_MIGRATION_OVERLAP_FOR_DIAGNOSIS",
  }, null, 2));
  process.exitCode = 2;
  process.exit(0);
}

const finalEndpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
if (!Array.isArray(finalEndpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID_AFTER_PROBE");
const finalImage = resolveImageEndpoint(finalEndpoints, endpointId).endpoint;
if (!sameSet(endpointVolumeIds(finalImage), [targetVolumeId])) {
  throw new Error("AVANTIQO_IMAGE_VIDEO_MIGRATION_FINAL_TARGET_BINDING_LOST");
}
assertStableFields(endpoint, finalImage, "AVANTIQO_IMAGE_VIDEO_MIGRATION_FINAL");
const remainingSourceUsers = endpointUsers(finalEndpoints, sourceVolumeId, null);
let sourceDeleted = false;
if (!remainingSourceUsers.length && sourceVolumeId !== targetVolumeId) {
  const cleanup = await deleteVolumeIfUnused(sourceVolumeId, managementKey, null);
  sourceDeleted = cleanup.deleted;
}

const finalVolumes = await rest("/networkvolumes", managementKey);
if (!Array.isArray(finalVolumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID_AFTER_MIGRATION");
const finalCanonical = finalVolumes.filter(
  (volume) => text(volume?.name) === SHARED_GROUP.canonical_name && text(volume?.id) === targetVolumeId,
);
if (finalCanonical.length !== 1) {
  throw new Error("AVANTIQO_IMAGE_VIDEO_MIGRATION_FINAL_CANONICAL_VOLUME_MISSING");
}

console.log("AVANTIQO_IMAGE_VIDEO_SHARED_REGION_MIGRATION=COMPLETE");
console.log(JSON.stringify({
  ...plan,
  success: sourceDeleted || sourceVolumeId === targetVolumeId,
  mode: "APPLY",
  mutation_performed: true,
  endpoint_after: safeEndpoint(finalImage),
  target_volume: safeVolume(finalCanonical[0]),
  target_cache_verified: true,
  target_runtime_probe_passed: true,
  source_volume_deleted: sourceDeleted,
  source_volume_remaining_users: remainingSourceUsers,
  final_shared_policy: sharedVolumePolicySummary(finalVolumes),
  image_generation: false,
  production_deploy: false,
  next_action: sourceDeleted || sourceVolumeId === targetVolumeId
    ? "RUN_ONE_IMAGE_QUALITY_CERTIFICATION"
    : "MIGRATE_REMAINING_SOURCE_VOLUME_CONSUMERS_BEFORE_DELETE",
}, null, 2));
if (!sourceDeleted && sourceVolumeId !== targetVolumeId) process.exitCode = 2;
