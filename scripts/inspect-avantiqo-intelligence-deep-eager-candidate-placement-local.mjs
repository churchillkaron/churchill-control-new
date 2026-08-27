const REST_BASE = "https://rest.runpod.io/v1";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_INTELLIGENCE_DEEP_EAGER_CANDIDATE_PLACEMENT_V1";
const DEEP_NAME = "avantiqo-intelligence-v1";
const CANDIDATE_NAME = "avantiqo-intelligence-deep-eager-candidate-v1";

const text = (value, limit = 4000) => String(value ?? "").trim().slice(0, limit);
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(options.timeoutMs || 25_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`${CONTRACT}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw).slice(0, 900)}`);
  }
  if (body === null) throw new Error(`${CONTRACT}_HTTP_${response.status}:INVALID_JSON`);
  return body;
}

async function graphql(query, variables, key) {
  const response = await requestJson(GRAPHQL_URL, key, {
    method: "POST",
    body: { query, variables },
  });
  if (Array.isArray(response?.errors) && response.errors.length) {
    throw new Error(`${CONTRACT}_GRAPHQL:${redact(response.errors.map((entry) => entry?.message).join(" | ")).slice(0, 900)}`);
  }
  return response;
}

function rows(value, keys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of [...keys, "data", "items", "results"]) if (Array.isArray(value[key])) return value[key];
  return [];
}

function resolveOne(items, name, code) {
  const matches = rows(items).filter((entry) => text(entry?.name, 300) === name);
  if (matches.length !== 1) throw new Error(`${code}:name=${name}:matches=${matches.length}`);
  return matches[0];
}

function templateId(endpoint = {}) {
  return text(endpoint?.templateId || endpoint?.template?.id, 300);
}

function normalizeStringList(value) {
  if (Array.isArray(value)) return value.map((entry) => text(typeof entry === "string" ? entry : entry?.id || entry?.networkVolumeId, 300)).filter(Boolean).sort();
  const raw = text(value, 3000);
  if (!raw) return [];
  return raw.split(",").map((entry) => entry.trim()).filter(Boolean).sort();
}

function restPlacement(endpoint = {}) {
  return {
    gpu_count: finite(endpoint?.gpuCount),
    gpu_type_ids: normalizeStringList(endpoint?.gpuTypeIds),
    data_center_ids: normalizeStringList(endpoint?.dataCenterIds),
    network_volume_id: text(endpoint?.networkVolumeId, 300) || null,
    network_volume_ids: normalizeStringList(endpoint?.networkVolumeIds),
    compute_type: text(endpoint?.computeType, 120) || null,
    idle_timeout: finite(endpoint?.idleTimeout),
    scaler_type: text(endpoint?.scalerType, 120) || null,
    scaler_value: finite(endpoint?.scalerValue),
    execution_timeout_ms: finite(endpoint?.executionTimeoutMs),
    min_cuda_version: text(endpoint?.minCudaVersion, 120) || null,
    flashboot: endpoint?.flashboot ?? endpoint?.flashBoot ?? endpoint?.flashBootType ?? null,
  };
}

function gqlPlacement(endpoint = {}) {
  return {
    gpu_pool_ids: normalizeStringList(endpoint?.gpuIds),
    gpu_count: finite(endpoint?.gpuCount),
    instance_ids: normalizeStringList(endpoint?.instanceIds),
    locations: text(endpoint?.locations, 1000) || null,
    network_volume_id: text(endpoint?.networkVolumeId, 300) || null,
    network_volume_ids: normalizeStringList(endpoint?.networkVolumeIds),
    idle_timeout: finite(endpoint?.idleTimeout),
    scaler_type: text(endpoint?.scalerType, 120) || null,
    scaler_value: finite(endpoint?.scalerValue),
    execution_timeout_ms: finite(endpoint?.executionTimeoutMs),
    min_cuda_version: text(endpoint?.minCudaVersion, 120) || null,
    flashboot_type: text(endpoint?.flashBootType, 120) || null,
  };
}

function diff(left, right) {
  const fields = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return fields.filter((field) => JSON.stringify(left[field]) !== JSON.stringify(right[field]));
}

function healthSummary(raw = {}) {
  const jobs = object(raw?.jobs);
  const workers = object(raw?.workers);
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

const ENDPOINTS_QUERY = `
query AvantiqoDeepEagerPlacementInspector {
  myself {
    endpoints {
      id
      name
      templateId
      gpuIds
      gpuCount
      instanceIds
      workersMin
      workersMax
      locations
      networkVolumeId
      networkVolumeIds { networkVolumeId }
      idleTimeout
      scalerType
      scalerValue
      executionTimeoutMs
      minCudaVersion
      flashBootType
    }
  }
}`;

const GPU_POOLS_QUERY = `
query AvantiqoDeepEagerPlacementGpuPools {
  serverlessGpuPools {
    id
    gpuTypeIds
  }
}`;

const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY, 2000);
const runtimeKey = text(process.env.RUNPOD_API_KEY || managementKey, 2000);
if (!managementKey || !runtimeKey) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");

const [restRaw, gqlRaw, poolsRaw] = await Promise.all([
  requestJson(`${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`, managementKey),
  graphql(ENDPOINTS_QUERY, {}, managementKey),
  graphql(GPU_POOLS_QUERY, {}, managementKey),
]);

const restEndpoints = rows(restRaw, ["endpoints", "serverlessEndpoints"]);
const gqlEndpoints = list(gqlRaw?.data?.myself?.endpoints);
const pools = list(poolsRaw?.data?.serverlessGpuPools);
const deepRest = resolveOne(restEndpoints, DEEP_NAME, `${CONTRACT}_DEEP_REST_RESOLUTION_FAILED`);
const candidateRest = resolveOne(restEndpoints, CANDIDATE_NAME, `${CONTRACT}_CANDIDATE_REST_RESOLUTION_FAILED`);
const deepGql = resolveOne(gqlEndpoints, DEEP_NAME, `${CONTRACT}_DEEP_GRAPHQL_RESOLUTION_FAILED`);
const candidateGql = resolveOne(gqlEndpoints, CANDIDATE_NAME, `${CONTRACT}_CANDIDATE_GRAPHQL_RESOLUTION_FAILED`);

const [deepHealthRaw, candidateHealthRaw] = await Promise.all([
  requestJson(`${QUEUE_BASE}/${encodeURIComponent(text(deepRest?.id, 300))}/health`, runtimeKey),
  requestJson(`${QUEUE_BASE}/${encodeURIComponent(text(candidateRest?.id, 300))}/health`, runtimeKey),
]);

const deepRestPlacement = restPlacement(deepRest);
const candidateRestPlacement = restPlacement(candidateRest);
const deepGqlPlacement = gqlPlacement(deepGql);
const candidateGqlPlacement = gqlPlacement(candidateGql);
const deepPoolIds = deepGqlPlacement.gpu_pool_ids;
const candidatePoolIds = candidateGqlPlacement.gpu_pool_ids;

function poolSummary(ids) {
  return ids.map((id) => {
    const pool = pools.find((entry) => text(entry?.id, 300) === id);
    return {
      id,
      gpu_type_ids: normalizeStringList(pool?.gpuTypeIds),
      resolved: Boolean(pool),
    };
  });
}

const restDiff = diff(deepRestPlacement, candidateRestPlacement);
const gqlDiff = diff(deepGqlPlacement, candidateGqlPlacement);
const templateDifferentAsExpected = templateId(deepRest) !== templateId(candidateRest);
const deepHealth = healthSummary(deepHealthRaw);
const candidateHealth = healthSummary(candidateHealthRaw);
const bothParked =
  finite(deepRest?.workersMin, -1) === 0 && finite(deepRest?.workersMax, -1) === 0 &&
  finite(candidateRest?.workersMin, -1) === 0 && finite(candidateRest?.workersMax, -1) === 0 &&
  deepHealth.jobs.in_queue === 0 && deepHealth.jobs.in_progress === 0 &&
  candidateHealth.jobs.in_queue === 0 && candidateHealth.jobs.in_progress === 0;

let diagnosis = "PLACEMENT_PARITY_CONFIRMED_LIVE_CAPACITY_OR_ADMISSION_REMAINS";
if (restDiff.length || gqlDiff.length) diagnosis = "CANDIDATE_PLACEMENT_DRIFT_CONFIRMED";
if (!deepPoolIds.length || !candidatePoolIds.length) diagnosis = "GPU_POOL_BINDING_MISSING";
if (deepPoolIds.some((id) => !pools.some((pool) => text(pool?.id, 300) === id)) || candidatePoolIds.some((id) => !pools.some((pool) => text(pool?.id, 300) === id))) {
  diagnosis = "GPU_POOL_BINDING_UNRESOLVED";
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  diagnosis,
  deep: {
    name: DEEP_NAME,
    workers_min: finite(deepRest?.workersMin),
    workers_max: finite(deepRest?.workersMax),
    health: deepHealth,
    rest_placement: deepRestPlacement,
    graphql_placement: deepGqlPlacement,
    gpu_pools: poolSummary(deepPoolIds),
  },
  candidate: {
    name: CANDIDATE_NAME,
    workers_min: finite(candidateRest?.workersMin),
    workers_max: finite(candidateRest?.workersMax),
    health: candidateHealth,
    rest_placement: candidateRestPlacement,
    graphql_placement: candidateGqlPlacement,
    gpu_pools: poolSummary(candidatePoolIds),
  },
  comparison: {
    rest_difference_fields: restDiff,
    graphql_difference_fields: gqlDiff,
    placement_equal_rest: restDiff.length === 0,
    placement_equal_graphql: gqlDiff.length === 0,
    template_ids_different_as_expected: templateDifferentAsExpected,
    both_parked_zero_queue: bothParked,
  },
  inference_performed: false,
  generation_submitted: false,
  gpu_activation_performed: false,
  endpoint_mutation_performed: false,
  template_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
