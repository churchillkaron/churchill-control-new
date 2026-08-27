import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const GQL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_CODE_RUNPOD_FALLBACK_POOL_REBIND_V2";
const ENDPOINT_NAME = "avantiqo-code-v1";
const MINIMUM_VRAM_GB = 80;
const MAX_GPU_FALLBACKS = 3;

// Stable compatibility preference. Live stock MUST NOT reorder this list.
// A100 is intentionally excluded: the certified Code FP8 runtime is Hopper/Blackwell.
const PROFILES = Object.freeze([
  Object.freeze({ key: "RTX_PRO_6000_BLACKWELL_96GB", match: /RTX\s*PRO\s*6000/i, exclude: /MIG/i, priority: 5000 }),
  Object.freeze({ key: "H100_NVL_94GB", match: /H100.*NVL|NVL.*H100/i, exclude: /MIG/i, priority: 4900 }),
  Object.freeze({ key: "H100_80GB", match: /\bH100\b/i, exclude: /NVL|MIG/i, priority: 4800 }),
  Object.freeze({ key: "H200_141GB", match: /\bH200\b/i, exclude: /MIG/i, priority: 4700 }),
  Object.freeze({ key: "B200_180GB", match: /\bB200\b/i, exclude: /MIG/i, priority: 4600 }),
]);

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
const unique = (values) => [...new Set(list(values).map(text).filter(Boolean))];
const sorted = (values) => [...unique(values)].sort();

function stringList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (!text(value)) return [];
  return text(value).split(",").map((entry) => entry.trim()).filter(Boolean);
}
function sameSet(left, right) {
  const a = sorted(stringList(left));
  const b = sorted(stringList(right));
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function endpointVolumes(endpoint = {}) {
  return [...new Set([text(endpoint.networkVolumeId), ...stringList(endpoint.networkVolumeIds)].filter(Boolean))];
}
function profileForLabel(label) {
  return PROFILES.find((profile) => profile.match.test(label) && !(profile.exclude && profile.exclude.test(label))) || null;
}
function profileForGpuType(row = {}) {
  return profileForLabel([row.id, row.displayName].map(text).filter(Boolean).join(" "));
}
function stockRank(value) {
  const status = text(value).toUpperCase();
  if (status === "HIGH") return 4;
  if (status === "MEDIUM") return 3;
  if (status === "LOW") return 2;
  if (status && status !== "NONE" && status !== "UNAVAILABLE") return 1;
  return 0;
}
function healthSummary(body = {}) {
  const jobs = body.jobs || {};
  const workers = body.workers || {};
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
function activeManagementWorkers(endpoint = {}) {
  return list(endpoint.workers).filter((worker) => {
    const desired = text(worker.desiredStatus ?? worker.desired_status).toUpperCase();
    const status = text(worker.status ?? worker.workerStatus ?? worker.runtimeStatus).toUpperCase();
    const effective = desired || status;
    return effective && !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(effective);
  });
}
function assertCleanRest(endpoint, health, label) {
  const summary = healthSummary(health);
  if (finite(endpoint.workersMin, -1) !== 0 || finite(endpoint.workersMax, -1) !== 0) {
    throw new Error(`${label}_RESTING_0_0_REQUIRED:${endpoint.workersMin}:${endpoint.workersMax}`);
  }
  if (summary.jobs.in_queue || summary.jobs.in_progress) {
    throw new Error(`${label}_EMPTY_QUEUE_REQUIRED:${summary.jobs.in_queue}:${summary.jobs.in_progress}`);
  }
  if (Object.values(summary.workers).some((value) => value > 0) || activeManagementWorkers(endpoint).length) {
    throw new Error(`${label}_NO_ACTIVE_WORKER_REQUIRED`);
  }
  return summary;
}
function stableEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    network_volume_ids: endpointVolumes(endpoint).sort(),
    data_center_ids: stringList(endpoint.dataCenterIds).sort(),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    compute_type: text(endpoint.computeType) || null,
    gpu_count: finite(endpoint.gpuCount),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout),
    flashboot: endpoint.flashBoot ?? endpoint.flashboot ?? null,
    allowed_cuda_versions: stringList(endpoint.allowedCudaVersions).sort(),
    min_cuda_version: text(endpoint.minCudaVersion) || null,
  };
}
function sameStableEndpoint(left, right) {
  return JSON.stringify(stableEndpoint(left)) === JSON.stringify(stableEndpoint(right));
}
async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 1000)}`);
  }
  return body ?? {};
}
async function rest(key, pathname, options = {}) {
  return readJson(await fetch(`${REST}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_CODE_FALLBACK_POOL_REST");
}
async function queueHealth(key, endpointId) {
  return readJson(await fetch(`${QUEUE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_CODE_FALLBACK_POOL_QUEUE");
}
async function runpodInventory(key) {
  const query = `
    query AvantiqoCodeFallbackPoolV2($input: GpuAvailabilityInput) {
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
        input: {
          gpuCount: 1,
          minDisk: 5,
          minMemoryInGb: MINIMUM_VRAM_GB,
          secureCloud: true,
        },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  const errors = list(body?.errors).map((entry) => text(entry?.message)).filter(Boolean);
  if (!response.ok || errors.length || !Array.isArray(body?.data?.gpuTypes) || !Array.isArray(body?.data?.dataCenters)) {
    throw new Error(`AVANTIQO_CODE_FALLBACK_POOL_GRAPHQL_FAILED:${response.status}:${errors.join(" | ") || text(raw).slice(0, 900)}`);
  }
  return body.data;
}
function buildStablePool(inventory, datacenterId) {
  const dc = list(inventory.dataCenters).find((row) => text(row.id) === datacenterId) || null;
  if (!dc) throw new Error(`AVANTIQO_CODE_FALLBACK_POOL_DATACENTER_NOT_FOUND:${datacenterId}`);
  if (dc.storageSupport !== true) throw new Error(`AVANTIQO_CODE_FALLBACK_POOL_STORAGE_UNSUPPORTED:${datacenterId}`);

  const availability = new Map(list(dc.gpuAvailability).map((row) => [text(row.gpuTypeId), row]));
  const compatibleGlobal = list(inventory.gpuTypes)
    .map((row) => {
      const profile = profileForGpuType(row);
      return {
        id: text(row.id),
        name: text(row.displayName) || null,
        memory_gb: finite(row.memoryInGb),
        secure_cloud_supported: row.secureCloud === true,
        profile: profile?.key || null,
        priority: profile?.priority || 0,
      };
    })
    .filter((row) => row.id && row.profile && row.memory_gb >= MINIMUM_VRAM_GB && row.secure_cloud_supported)
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));

  // Datacenter visibility determines placement compatibility, not current stock.
  // Stock is checked only after the stable pool is selected.
  const visibleIds = new Set(list(dc.gpuAvailability).map((row) => text(row.gpuTypeId)).filter(Boolean));
  const targetPool = compatibleGlobal
    .filter((row) => visibleIds.has(row.id))
    .slice(0, MAX_GPU_FALLBACKS)
    .map((row) => row.id);

  if (!targetPool.length) {
    throw new Error(`AVANTIQO_CODE_FALLBACK_POOL_NO_COMPATIBLE_GPU_TYPES:${datacenterId}`);
  }

  const poolRows = targetPool.map((gpuTypeId) => {
    const global = compatibleGlobal.find((row) => row.id === gpuTypeId);
    const live = availability.get(gpuTypeId) || {};
    return {
      gpu_type_id: gpuTypeId,
      gpu_name: global?.name || text(live.gpuTypeDisplayName || live.displayName) || null,
      profile: global?.profile || null,
      memory_gb: global?.memory_gb ?? null,
      secure_cloud_supported: global?.secure_cloud_supported === true,
      currently_available: live.available === true,
      stock_status: text(live.stockStatus).toUpperCase() || "NOT_LISTED",
      stock_rank: stockRank(live.stockStatus),
    };
  });

  return {
    datacenter: {
      id: datacenterId,
      name: text(dc.name) || null,
      location: text(dc.location) || null,
    },
    target_pool: targetPool,
    pool_rows: poolRows,
    stocked_members: poolRows.filter((row) => row.currently_available && row.stock_rank > 0),
    globally_valid_compatible_gpu_count: compatibleGlobal.length,
  };
}

const envPath = resolve(process.cwd(), ".env.local");
const localEnvLoaded = existsSync(envPath);
if (localEnvLoaded) loadEnvFile(envPath);

const apply = process.argv.includes("--apply");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const runtimeKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY) || required("RUNPOD_API_KEY");
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
if (apply && !approved(process.env.AVANTIQO_CODE_FALLBACK_POOL_REBIND_V2_APPROVED)) {
  throw new Error("AVANTIQO_CODE_FALLBACK_POOL_REBIND_V2_APPROVED=YES_REQUIRED");
}

console.log(`AVANTIQO_CODE_FALLBACK_POOL_V2_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log("AVANTIQO_CODE_FALLBACK_POOL_V2_SAFE_LEASE_OWNS_SCALING=true");
console.log("AVANTIQO_CODE_FALLBACK_POOL_V2_SCALING_MUTATION=false");
console.log("AVANTIQO_CODE_FALLBACK_POOL_V2_PROVIDER_JOB_SUBMISSION=false");
console.log("AVANTIQO_CODE_FALLBACK_POOL_V2_INFERENCE_PERFORMED=false");
console.log("AVANTIQO_CODE_FALLBACK_POOL_V2_VOLUME_MUTATION=false");
console.log("AVANTIQO_CODE_FALLBACK_POOL_V2_TEMPLATE_MUTATION=false");
console.log("AVANTIQO_CODE_FALLBACK_POOL_V2_A100_ALLOWED=false");
console.log("AVANTIQO_CODE_FALLBACK_POOL_V2_STOCK_REORDERS_POOL=false");
console.log("AVANTIQO_CODE_FALLBACK_POOL_V2_SECRETS_PRINTED=false");

const [endpoints, volumes, inventory] = await Promise.all([
  rest(managementKey, "/endpoints?includeTemplate=true&includeWorkers=true"),
  rest(managementKey, "/networkvolumes"),
  runpodInventory(managementKey),
]);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");

const matches = configuredEndpointId
  ? endpoints.filter((endpoint) => text(endpoint.id) === configuredEndpointId)
  : endpoints.filter((endpoint) => text(endpoint.name) === ENDPOINT_NAME);
if (matches.length !== 1 || text(matches[0].name) !== ENDPOINT_NAME) {
  throw new Error(`AVANTIQO_CODE_FALLBACK_POOL_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
}
const endpoint = matches[0];
const endpointId = text(endpoint.id);
const health = await queueHealth(runtimeKey, endpointId);
const healthBefore = assertCleanRest(endpoint, health, "AVANTIQO_CODE_FALLBACK_POOL_V2");
const beforeStable = stableEndpoint(endpoint);

const volumeIds = endpointVolumes(endpoint);
if (volumeIds.length !== 1) throw new Error(`AVANTIQO_CODE_FALLBACK_POOL_EXACTLY_ONE_VOLUME_REQUIRED:${volumeIds.length}`);
const volume = volumes.find((row) => text(row.id) === volumeIds[0]) || null;
if (!volume) throw new Error(`AVANTIQO_CODE_FALLBACK_POOL_VOLUME_NOT_FOUND:${volumeIds[0]}`);
const datacenterId = text(volume.dataCenterId ?? volume.data_center_id);
if (!datacenterId) throw new Error("AVANTIQO_CODE_FALLBACK_POOL_VOLUME_DATACENTER_REQUIRED");

const selection = buildStablePool(inventory, datacenterId);
const currentPool = stringList(endpoint.gpuTypeIds);
const mutationRequired = !sameSet(currentPool, selection.target_pool);
const usableNow = selection.stocked_members.length > 0;

const plan = {
  success: usableNow,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  local_env_loaded: localEnvLoaded,
  scheduler_rule: "IN_QUEUE_WITH_NO_REAL_WORKER_MEANS_CAPACITY_PLACEMENT_UNTIL_PROVEN_OTHERWISE",
  endpoint: {
    id: endpointId,
    name: ENDPOINT_NAME,
    workers_min: beforeStable.workers_min,
    workers_max: beforeStable.workers_max,
    current_gpu_type_ids: currentPool,
    allowed_cuda_versions: beforeStable.allowed_cuda_versions,
    min_cuda_version: beforeStable.min_cuda_version,
  },
  attached_volume: {
    id: text(volume.id),
    name: text(volume.name) || null,
    size_gb: finite(volume.size ?? volume.sizeGb),
    data_center_id: datacenterId,
  },
  fallback_pool: {
    target_gpu_type_ids: selection.target_pool,
    stable_preference_order: true,
    stock_changes_do_not_reorder_pool: true,
    globally_valid_gpu_types_required: true,
    globally_valid_compatible_gpu_count: selection.globally_valid_compatible_gpu_count,
    pool_member_status: selection.pool_rows,
    stocked_member_count: selection.stocked_members.length,
    at_least_one_currently_stocked_member_required: true,
    every_pool_member_currently_stocked_required: false,
    native_fp8_hopper_blackwell_only: true,
    a100_allowed: false,
  },
  mutation_required: mutationRequired,
  mutation_scope: mutationRequired ? ["gpuTypeIds"] : [],
  safe_lease_owns_scaling: true,
  scaling_mutation_performed: false,
  provider_job_submitted: false,
  inference_performed: false,
  volume_mutation_performed: false,
  template_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
  health: healthBefore,
  next_action: usableNow
    ? mutationRequired
      ? "APPLY_GPU_POOL_ONLY_THEN_RUN_SAFE_LEASE_RUNTIME_PROBE"
      : "RUN_SAFE_LEASE_RUNTIME_PROBE"
    : "DO_NOT_SUBMIT_CODE_JOB_RECHECK_STOCK_OR_PLAN_VOLUME_RELOCATION",
};

if (!usableNow) {
  console.log(JSON.stringify({ ...plan, blocked_reason: "NO_SELECTED_POOL_MEMBER_CURRENTLY_STOCKED" }, null, 2));
  process.exitCode = 2;
  process.exit(0);
}
if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

const [freshEndpoint, freshVolumes, freshInventory, freshHealth] = await Promise.all([
  rest(managementKey, `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`),
  rest(managementKey, "/networkvolumes"),
  runpodInventory(managementKey),
  queueHealth(runtimeKey, endpointId),
]);
assertCleanRest(freshEndpoint, freshHealth, "AVANTIQO_CODE_FALLBACK_POOL_V2_BEFORE_WRITE");
if (!sameStableEndpoint(endpoint, freshEndpoint)) {
  throw new Error("AVANTIQO_CODE_FALLBACK_POOL_STABLE_ENDPOINT_CHANGED_BEFORE_WRITE");
}
if (!sameSet(endpointVolumes(freshEndpoint), volumeIds)) {
  throw new Error("AVANTIQO_CODE_FALLBACK_POOL_VOLUME_BINDING_CHANGED_BEFORE_WRITE");
}
const freshVolume = freshVolumes.find((row) => text(row.id) === volumeIds[0]) || null;
if (!freshVolume || text(freshVolume.dataCenterId ?? freshVolume.data_center_id) !== datacenterId) {
  throw new Error("AVANTIQO_CODE_FALLBACK_POOL_VOLUME_PLACEMENT_CHANGED_BEFORE_WRITE");
}

const freshSelection = buildStablePool(freshInventory, datacenterId);
if (!sameSet(freshSelection.target_pool, selection.target_pool)) {
  throw new Error(`AVANTIQO_CODE_FALLBACK_POOL_COMPATIBILITY_CHANGED_BEFORE_WRITE:${JSON.stringify(freshSelection.target_pool)}`);
}
if (!freshSelection.stocked_members.length) {
  throw new Error("AVANTIQO_CODE_FALLBACK_POOL_STOCK_DISAPPEARED_BEFORE_WRITE");
}
const freshCurrentPool = stringList(freshEndpoint.gpuTypeIds);
const freshMutationRequired = !sameSet(freshCurrentPool, freshSelection.target_pool);

if (freshMutationRequired) {
  await rest(managementKey, `/endpoints/${encodeURIComponent(endpointId)}`, {
    method: "PATCH",
    body: { gpuTypeIds: freshSelection.target_pool },
  });
}

const [verifiedEndpoint, verifiedHealth] = await Promise.all([
  rest(managementKey, `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`),
  queueHealth(runtimeKey, endpointId),
]);
if (!sameStableEndpoint(freshEndpoint, verifiedEndpoint)) {
  throw new Error("AVANTIQO_CODE_FALLBACK_POOL_UNRELATED_ENDPOINT_FIELD_CHANGED");
}
if (!sameSet(verifiedEndpoint.gpuTypeIds, freshSelection.target_pool)) {
  throw new Error(`AVANTIQO_CODE_FALLBACK_POOL_VERIFY_FAILED:${JSON.stringify(stringList(verifiedEndpoint.gpuTypeIds))}`);
}
const healthAfter = assertCleanRest(verifiedEndpoint, verifiedHealth, "AVANTIQO_CODE_FALLBACK_POOL_V2_AFTER_WRITE");

console.log(JSON.stringify({
  ...plan,
  success: true,
  mode: "APPLY",
  mutation_performed: freshMutationRequired,
  before_gpu_type_ids: freshCurrentPool,
  after_gpu_type_ids: stringList(verifiedEndpoint.gpuTypeIds),
  stocked_members_at_write: freshSelection.stocked_members,
  unrelated_endpoint_fields_preserved: true,
  safe_lease_owns_scaling: true,
  scaling_mutation_performed: false,
  provider_job_submitted: false,
  inference_performed: false,
  volume_mutation_performed: false,
  template_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
  health_after: healthAfter,
  next_action: "RUN_AVANTIQO_CODE_RUNTIME_PROBE_SAFE_LEASE",
}, null, 2));
console.log(`${CONTRACT}=PASS`);
