import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

const REST = "https://rest.runpod.io/v1";
const SERVERLESS = "https://api.runpod.ai/v2";
const GQL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_CODE_RUNPOD_FALLBACK_POOL_REBIND_V1";
const ENDPOINT_NAME = "avantiqo-code-v1";
const MINIMUM_VRAM_GB = 80;
const MAX_GPU_FALLBACKS = 3;

const PROFILES = Object.freeze([
  Object.freeze({ key: "RTX_PRO_6000_BLACKWELL_96GB", match: /RTX\s*PRO\s*6000/i, exclude: /MIG/i, priority: 5000 }),
  Object.freeze({ key: "H100_NVL_94GB", match: /H100.*NVL|NVL.*H100/i, exclude: /MIG/i, priority: 4900 }),
  Object.freeze({ key: "H100_80GB", match: /\bH100\b/i, exclude: /NVL|MIG/i, priority: 4800 }),
  Object.freeze({ key: "H200_141GB", match: /\bH200\b/i, exclude: /MIG/i, priority: 4700 }),
  Object.freeze({ key: "B200_180GB", match: /\bB200\b/i, exclude: /MIG/i, priority: 4600 }),
]);

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function approved(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
}
function stringList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (!text(value)) return [];
  return text(value).split(",").map((entry) => entry.trim()).filter(Boolean);
}
function unique(values) { return [...new Set(stringList(values))]; }
function sameSet(left, right) {
  const a = [...unique(left)].sort();
  const b = [...unique(right)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function stockRank(value) {
  const status = text(value).toUpperCase();
  if (status === "HIGH") return 4;
  if (status === "MEDIUM") return 3;
  if (status === "LOW") return 2;
  if (status && status !== "NONE" && status !== "UNAVAILABLE") return 1;
  return 0;
}
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function endpointVolumeIds(endpoint = {}) {
  return [...new Set([text(endpoint.networkVolumeId), ...stringList(endpoint.networkVolumeIds)].filter(Boolean))];
}
function profileFor(gpu = {}) {
  const label = [gpu?.gpuTypeId, gpu?.gpuTypeDisplayName, gpu?.displayName]
    .map(text)
    .filter(Boolean)
    .join(" ");
  return PROFILES.find((profile) =>
    profile.match.test(label) && !(profile.exclude && profile.exclude.test(label)),
  ) || null;
}
function healthCounters(body = {}) {
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
function activeWorkerCount(endpoint = {}) {
  return list(endpoint.workers).filter((worker) => {
    const desired = text(worker.desiredStatus ?? worker.desired_status).toUpperCase();
    const status = text(worker.status ?? worker.workerStatus ?? worker.runtimeStatus).toUpperCase();
    const value = desired || status;
    return value && !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(value);
  }).length;
}
function assertResting(endpoint, health, label) {
  const counters = healthCounters(health);
  if (finite(endpoint.workersMin, -1) !== 0 || finite(endpoint.workersMax, -1) !== 0) {
    throw new Error(`${label}_REQUIRES_RESTING_0_0:${endpoint.workersMin}:${endpoint.workersMax}`);
  }
  if (counters.jobs.in_queue !== 0 || counters.jobs.in_progress !== 0) {
    throw new Error(`${label}_REQUIRES_EMPTY_QUEUE:${counters.jobs.in_queue}:${counters.jobs.in_progress}`);
  }
  if (
    counters.workers.idle !== 0 ||
    counters.workers.initializing !== 0 ||
    counters.workers.ready !== 0 ||
    counters.workers.running !== 0 ||
    counters.workers.throttled !== 0 ||
    counters.workers.unhealthy !== 0 ||
    activeWorkerCount(endpoint) !== 0
  ) {
    throw new Error(`${label}_REQUIRES_NO_ACTIVE_WORKER`);
  }
  return counters;
}
function stableEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    network_volume_ids: endpointVolumeIds(endpoint).sort(),
    data_center_ids: unique(endpoint.dataCenterIds).sort(),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    compute_type: text(endpoint.computeType) || null,
    gpu_count: finite(endpoint.gpuCount),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout),
    flashboot: endpoint.flashBoot ?? endpoint.flashboot ?? null,
    allowed_cuda_versions: unique(endpoint.allowedCudaVersions).sort(),
    min_cuda_version: text(endpoint.minCudaVersion) || null,
  };
}
function sameStableEndpoint(left, right) {
  return JSON.stringify(stableEndpoint(left)) === JSON.stringify(stableEndpoint(right));
}
function safeGpu(gpu = {}) {
  const profile = profileFor(gpu);
  return {
    gpu_type_id: text(gpu.gpuTypeId) || null,
    gpu_name: text(gpu.gpuTypeDisplayName || gpu.displayName) || null,
    profile: profile?.key || null,
    priority: profile?.priority || 0,
    available: gpu.available === true,
    stock_status: text(gpu.stockStatus).toUpperCase() || "UNAVAILABLE",
    stock_rank: stockRank(gpu.stockStatus),
  };
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
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
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  }), "RUNPOD_REST");
}
async function queueHealth(key, endpointId) {
  return readJson(await fetch(`${SERVERLESS}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_HEALTH");
}
async function gpuAvailability(key) {
  const query = `
    query AvantiqoCodeFallbackPool($input: GpuAvailabilityInput) {
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
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  const errors = list(body?.errors).map((entry) => text(entry?.message)).filter(Boolean);
  if (!response.ok || errors.length || !Array.isArray(body?.data?.dataCenters)) {
    throw new Error(`RUNPOD_GPU_AVAILABILITY_FAILED:${response.status}:${errors.join(" | ") || text(raw).slice(0, 900)}`);
  }
  return body.data.dataCenters;
}
function compatibleTargetRows(dataCenters, targetDatacenterId) {
  const dc = list(dataCenters).find((candidate) => text(candidate?.id) === targetDatacenterId) || null;
  if (!dc) throw new Error(`AVANTIQO_CODE_FALLBACK_POOL_DATACENTER_NOT_FOUND:${targetDatacenterId}`);
  const rows = list(dc.gpuAvailability)
    .map(safeGpu)
    .filter((gpu) => gpu.profile && gpu.gpu_type_id)
    .sort((left, right) =>
      right.stock_rank - left.stock_rank ||
      right.priority - left.priority ||
      left.gpu_type_id.localeCompare(right.gpu_type_id)
    );
  return {
    datacenter: {
      id: targetDatacenterId,
      name: text(dc.name) || null,
      location: text(dc.location) || null,
      storage_support: dc.storageSupport ?? null,
    },
    rows,
  };
}
function globalValidGpuIds(dataCenters) {
  return new Set(
    list(dataCenters).flatMap((dc) => list(dc?.gpuAvailability))
      .map(safeGpu)
      .filter((gpu) => gpu.profile && gpu.gpu_type_id)
      .map((gpu) => gpu.gpu_type_id),
  );
}
function selectFallbackPool(rows) {
  const selected = [];
  for (const row of rows) {
    if (!selected.includes(row.gpu_type_id)) selected.push(row.gpu_type_id);
    if (selected.length >= MAX_GPU_FALLBACKS) break;
  }
  return selected;
}
function stockForPool(rows, pool) {
  return pool.map((gpuTypeId) => {
    const row = rows.find((candidate) => candidate.gpu_type_id === gpuTypeId) || null;
    return {
      gpu_type_id: gpuTypeId,
      gpu_name: row?.gpu_name || null,
      profile: row?.profile || null,
      available: row?.available === true,
      stock_status: row?.stock_status || "UNAVAILABLE",
      stock_rank: row?.stock_rank || 0,
    };
  });
}
function evaluatePool(dataCenters, targetDatacenterId) {
  const target = compatibleTargetRows(dataCenters, targetDatacenterId);
  const validGlobally = globalValidGpuIds(dataCenters);
  const pool = selectFallbackPool(target.rows);
  const poolStock = stockForPool(target.rows, pool);
  const invalid = pool.filter((gpuTypeId) => !validGlobally.has(gpuTypeId));
  if (invalid.length) {
    throw new Error(`AVANTIQO_CODE_FALLBACK_POOL_GLOBAL_GPU_VALIDATION_FAILED:${invalid.join("|")}`);
  }
  return {
    ...target,
    pool,
    pool_stock: poolStock,
    stocked_pool_members: poolStock.filter((entry) => entry.available && entry.stock_rank > 0),
    global_valid_gpu_type_count: validGlobally.size,
  };
}

const envPath = resolve(process.cwd(), ".env.local");
const localEnvLoaded = existsSync(envPath);
if (localEnvLoaded) loadEnvFile(envPath);

const apply = process.argv.includes("--apply");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const runtimeKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY) || required("RUNPOD_API_KEY");
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
if (apply && !approved(process.env.AVANTIQO_CODE_FALLBACK_POOL_REBIND_APPROVED)) {
  throw new Error("AVANTIQO_CODE_FALLBACK_POOL_REBIND_APPROVED=YES_REQUIRED");
}

console.log(`AVANTIQO_CODE_FALLBACK_POOL_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log("AVANTIQO_CODE_FALLBACK_POOL_SAFE_LEASE_OWNS_SCALING=true");
console.log("AVANTIQO_CODE_FALLBACK_POOL_WORKER_SCALING_MUTATION=false");
console.log("AVANTIQO_CODE_FALLBACK_POOL_PROVIDER_JOB_SUBMISSION=false");
console.log("AVANTIQO_CODE_FALLBACK_POOL_INFERENCE_PERFORMED=false");
console.log("AVANTIQO_CODE_FALLBACK_POOL_VOLUME_MUTATION=false");
console.log("AVANTIQO_CODE_FALLBACK_POOL_TEMPLATE_MUTATION=false");
console.log("AVANTIQO_CODE_FALLBACK_POOL_A100_ALLOWED=false");
console.log("AVANTIQO_CODE_FALLBACK_POOL_SECRETS_PRINTED=false");

const [endpoints, volumes, health, dataCenters] = await Promise.all([
  rest(managementKey, "/endpoints?includeTemplate=true&includeWorkers=true"),
  rest(managementKey, "/networkvolumes"),
  configuredEndpointId
    ? queueHealth(runtimeKey, configuredEndpointId)
    : Promise.resolve(null),
  gpuAvailability(managementKey),
]);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");

const matches = configuredEndpointId
  ? endpoints.filter((endpoint) => text(endpoint?.id) === configuredEndpointId)
  : endpoints.filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
if (matches.length !== 1 || text(matches[0]?.name) !== ENDPOINT_NAME) {
  throw new Error(`AVANTIQO_CODE_FALLBACK_POOL_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
}
const endpoint = matches[0];
const endpointId = text(endpoint.id);
const liveHealth = health || await queueHealth(runtimeKey, endpointId);
const counters = assertResting(endpoint, liveHealth, "AVANTIQO_CODE_FALLBACK_POOL");
const beforeStable = stableEndpoint(endpoint);

const volumeIds = endpointVolumeIds(endpoint);
if (volumeIds.length !== 1) {
  throw new Error(`AVANTIQO_CODE_FALLBACK_POOL_EXACTLY_ONE_VOLUME_REQUIRED:${volumeIds.length}`);
}
const volume = volumes.find((candidate) => text(candidate?.id) === volumeIds[0]) || null;
if (!volume) throw new Error(`AVANTIQO_CODE_FALLBACK_POOL_VOLUME_NOT_FOUND:${volumeIds[0]}`);
const targetDatacenterId = text(volume.dataCenterId ?? volume.data_center_id);
if (!targetDatacenterId) throw new Error("AVANTIQO_CODE_FALLBACK_POOL_VOLUME_DATACENTER_REQUIRED");

const evaluation = evaluatePool(dataCenters, targetDatacenterId);
if (!evaluation.pool.length) {
  throw new Error(`AVANTIQO_CODE_FALLBACK_POOL_NO_COMPATIBLE_NATIVE_FP8_GPU_TYPES:${targetDatacenterId}`);
}
const atLeastOneStocked = evaluation.stocked_pool_members.length > 0;
const currentPool = unique(endpoint.gpuTypeIds);
const mutationRequired = !sameSet(currentPool, evaluation.pool);
const plan = {
  success: atLeastOneStocked,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  local_env_loaded: localEnvLoaded,
  scheduler_diagnosis_rule: "IN_QUEUE_WITH_NO_REAL_WORKER_IS_CAPACITY_PLACEMENT_UNTIL_PROVEN_OTHERWISE",
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
    data_center_id: targetDatacenterId,
  },
  fallback_pool: {
    max_types: MAX_GPU_FALLBACKS,
    target_gpu_type_ids: evaluation.pool,
    pool_member_stock: evaluation.pool_stock,
    stocked_member_count: evaluation.stocked_pool_members.length,
    at_least_one_stocked_member_required: true,
    every_pool_member_current_stock_required: false,
    every_pool_member_globally_valid_required: true,
    a100_allowed: false,
    native_fp8_hopper_blackwell_only: true,
    compatible_candidates_in_attached_datacenter: evaluation.rows,
    global_valid_compatible_gpu_type_count: evaluation.global_valid_gpu_type_count,
  },
  mutation_required: mutationRequired,
  mutation_scope: mutationRequired ? ["gpuTypeIds"] : [],
  safe_lease_owns_scaling: true,
  worker_scaling_mutation_performed: false,
  provider_job_submitted: false,
  inference_performed: false,
  volume_mutation_performed: false,
  template_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
  health: counters,
  next_action: atLeastOneStocked
    ? mutationRequired
      ? "APPLY_GPU_FALLBACK_POOL_ONLY_THEN_RUN_SAFE_LEASE_RUNTIME_PROBE"
      : "RUN_SAFE_LEASE_RUNTIME_PROBE"
    : "DO_NOT_SUBMIT_JOB_RECHECK_CAPACITY_OR_RELOCATE_ATTACHED_CACHE_DATACENTER",
};

if (!atLeastOneStocked) {
  console.log(JSON.stringify({ ...plan, blocked_reason: "NO_CURRENT_STOCK_FOR_ANY_SELECTED_COMPATIBLE_POOL_MEMBER" }, null, 2));
  process.exitCode = 2;
  process.exit(0);
}
if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

const [freshEndpoints, freshVolumes, freshHealth, freshDataCenters] = await Promise.all([
  rest(managementKey, "/endpoints?includeTemplate=true&includeWorkers=true"),
  rest(managementKey, "/networkvolumes"),
  queueHealth(runtimeKey, endpointId),
  gpuAvailability(managementKey),
]);
const freshMatches = list(freshEndpoints).filter((candidate) => text(candidate?.id) === endpointId);
if (freshMatches.length !== 1 || text(freshMatches[0]?.name) !== ENDPOINT_NAME) {
  throw new Error("AVANTIQO_CODE_FALLBACK_POOL_ENDPOINT_CHANGED_BEFORE_WRITE");
}
const freshEndpoint = freshMatches[0];
assertResting(freshEndpoint, freshHealth, "AVANTIQO_CODE_FALLBACK_POOL_BEFORE_WRITE");
if (!sameStableEndpoint(endpoint, freshEndpoint)) {
  throw new Error("AVANTIQO_CODE_FALLBACK_POOL_STABLE_ENDPOINT_CHANGED_BEFORE_WRITE");
}
const freshVolumeIds = endpointVolumeIds(freshEndpoint);
if (!sameSet(freshVolumeIds, volumeIds)) {
  throw new Error("AVANTIQO_CODE_FALLBACK_POOL_VOLUME_BINDING_CHANGED_BEFORE_WRITE");
}
const freshVolume = list(freshVolumes).find((candidate) => text(candidate?.id) === volumeIds[0]) || null;
if (!freshVolume) throw new Error("AVANTIQO_CODE_FALLBACK_POOL_VOLUME_DISAPPEARED_BEFORE_WRITE");
if (text(freshVolume.dataCenterId ?? freshVolume.data_center_id) !== targetDatacenterId) {
  throw new Error("AVANTIQO_CODE_FALLBACK_POOL_VOLUME_DATACENTER_CHANGED_BEFORE_WRITE");
}

const freshEvaluation = evaluatePool(freshDataCenters, targetDatacenterId);
if (!freshEvaluation.pool.length || !freshEvaluation.stocked_pool_members.length) {
  throw new Error("AVANTIQO_CODE_FALLBACK_POOL_NO_USABLE_STOCK_BEFORE_WRITE");
}
const freshPool = freshEvaluation.pool;
const freshCurrentPool = unique(freshEndpoint.gpuTypeIds);
const freshMutationRequired = !sameSet(freshCurrentPool, freshPool);

if (freshMutationRequired) {
  await rest(managementKey, `/endpoints/${encodeURIComponent(endpointId)}`, {
    method: "PATCH",
    body: { gpuTypeIds: freshPool },
  });
}

const [verifiedEndpoint, verifiedHealth] = await Promise.all([
  rest(managementKey, `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`),
  queueHealth(runtimeKey, endpointId),
]);
if (!sameStableEndpoint(freshEndpoint, verifiedEndpoint)) {
  throw new Error("AVANTIQO_CODE_FALLBACK_POOL_UNRELATED_ENDPOINT_FIELD_CHANGED");
}
if (!sameSet(verifiedEndpoint.gpuTypeIds, freshPool)) {
  throw new Error(`AVANTIQO_CODE_FALLBACK_POOL_VERIFY_FAILED:${JSON.stringify(unique(verifiedEndpoint.gpuTypeIds))}`);
}
const verifiedCounters = assertResting(verifiedEndpoint, verifiedHealth, "AVANTIQO_CODE_FALLBACK_POOL_AFTER_WRITE");

console.log(JSON.stringify({
  ...plan,
  success: true,
  mode: "APPLY",
  mutation_performed: freshMutationRequired,
  mutation_scope: freshMutationRequired ? ["gpuTypeIds"] : [],
  before_gpu_type_ids: freshCurrentPool,
  after_gpu_type_ids: unique(verifiedEndpoint.gpuTypeIds),
  current_stock_requirement: {
    at_least_one_pool_member: true,
    every_pool_member: false,
    stocked_member_count_at_write: freshEvaluation.stocked_pool_members.length,
    stocked_members_at_write: freshEvaluation.stocked_pool_members,
  },
  unrelated_endpoint_fields_preserved: true,
  safe_lease_owns_scaling: true,
  worker_scaling_mutation_performed: false,
  provider_job_submitted: false,
  inference_performed: false,
  volume_mutation_performed: false,
  template_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
  health_after: verifiedCounters,
  next_action: "RUN_AVANTIQO_CODE_RUNTIME_PROBE_SAFE_LEASE",
}, null, 2));
console.log(`${CONTRACT}=PASS`);
