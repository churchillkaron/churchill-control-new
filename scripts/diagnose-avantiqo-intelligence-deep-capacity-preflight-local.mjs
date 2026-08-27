const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_INTELLIGENCE_DEEP_CAPACITY_PREFLIGHT_V1";
const ENDPOINT_NAME = "avantiqo-intelligence-v1";

const text = (value, limit = 4000) => String(value ?? "").trim().slice(0, limit);
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const upper = (value) => text(value, 120).toUpperCase();
const unique = (values) => [...new Set(values.map((value) => text(value, 300)).filter(Boolean))];
const stockRank = (value) => ({ HIGH: 4, MEDIUM: 3, LOW: 2 }[upper(value)] || 0);

function credential() {
  const value = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY, 8000);
  if (!value) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return value;
}

function runtimeCredential(managementKey) {
  return text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY || process.env.RUNPOD_API_KEY || managementKey, 8000);
}

function redact(value) {
  return text(value, 1600)
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
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || body === null) {
    throw new Error(`${CONTRACT}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw)}`);
  }
  return body;
}

const rest = (path, key) => requestJson(`${REST_BASE}${path}`, key);
const queue = (endpointId, path, key) => requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`, key, { timeoutMs: 20_000 });

async function graphql(query, variables, key) {
  const body = await requestJson(GRAPHQL_URL, key, {
    method: "POST",
    body: { query, variables },
  });
  if (Array.isArray(body?.errors) && body.errors.length) {
    throw new Error(`${CONTRACT}_GRAPHQL:${redact(body.errors.map((entry) => entry?.message).filter(Boolean).join(" | "))}`);
  }
  return object(body?.data);
}

function rows(value, keys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function resolveOne(items, name, code) {
  const matches = rows(items, ["endpoints", "serverlessEndpoints"]).filter((entry) => text(entry?.name, 300) === name);
  if (matches.length !== 1) throw new Error(`${code}:name=${name}:matches=${matches.length}`);
  return matches[0];
}

function networkVolumeIds(endpoint = {}) {
  return unique([
    endpoint?.networkVolumeId,
    ...list(endpoint?.networkVolumeIds).map((entry) => typeof entry === "string" ? entry : entry?.networkVolumeId || entry?.id),
  ]);
}

function activeWorkers(endpoint = {}) {
  const terminal = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
  return list(endpoint?.workers).filter((worker) => {
    const status = upper(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus);
    const desired = upper(worker?.desiredStatus ?? worker?.desired_status);
    if (status && !terminal.has(status)) return true;
    if (desired && !terminal.has(desired)) return true;
    return !status && !desired;
  });
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

function command(value) {
  return (Array.isArray(value) ? value : [value]).map((entry) => text(entry, 3000)).filter(Boolean);
}

function templateSummary(template = {}) {
  return {
    template_id_present: Boolean(text(template?.id, 300)),
    image_reference_present: Boolean(text(template?.imageName, 1200)),
    docker_entrypoint: command(template?.dockerEntrypoint),
    docker_start_cmd: command(template?.dockerStartCmd),
    volume_mount_path: text(template?.volumeMountPath, 800) || null,
    volume_gb: finite(template?.volumeInGb, 0),
  };
}

function templateNotFound(error) {
  const message = text(error?.message, 2000).toLowerCase();
  return message.includes("_http_404:") && message.includes("template not found");
}

const CAPACITY_QUERY = `
query AvantiqoIntelligenceDeepCapacityPreflight($input: GpuAvailabilityInput) {
  gpuTypes { id displayName memoryInGb }
  dataCenters {
    id
    name
    location
    gpuAvailability(input: $input) {
      available
      stockStatus
      gpuTypeId
      gpuTypeDisplayName
      displayName
    }
  }
}`;

const managementKey = credential();
const queueKey = runtimeCredential(managementKey);
const [endpointBody, volumesBody, capacityData] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
  graphql(CAPACITY_QUERY, {
    input: {
      gpuCount: 1,
      minDisk: 5,
      minMemoryInGb: 20,
      secureCloud: true,
    },
  }, managementKey),
]);

const endpoint = resolveOne(endpointBody, ENDPOINT_NAME, `${CONTRACT}_ENDPOINT_RESOLUTION_FAILED`);
const endpointId = text(endpoint?.id, 300);
const templateId = text(endpoint?.templateId || endpoint?.template?.id, 300);
if (!endpointId) throw new Error(`${CONTRACT}_ENDPOINT_ID_REQUIRED`);
if (!templateId) throw new Error(`${CONTRACT}_TEMPLATE_ID_REQUIRED`);

const healthRaw = await queue(endpointId, "/health", queueKey);
let template = {
  id: templateId,
  ...object(endpoint?.template),
};
let templateLookupStatus = text(template?.imageName, 1200)
  ? "EMBEDDED_ENDPOINT_TEMPLATE"
  : "SECONDARY_LOOKUP_REQUIRED";
if (!text(template?.imageName, 1200)) {
  try {
    template = await rest(`/templates/${encodeURIComponent(templateId)}`, managementKey);
    templateLookupStatus = "SECONDARY_LOOKUP_SUCCEEDED";
  } catch (error) {
    if (!templateNotFound(error)) throw error;
    templateLookupStatus = "MISSING_OR_STALE_TEMPLATE_REFERENCE";
    template = {
      id: templateId,
      ...object(endpoint?.template),
    };
  }
}

const health = healthSummary(healthRaw);
const configuredGpuTypes = unique(list(endpoint?.gpuTypeIds));
const volumeIds = networkVolumeIds(endpoint);
const volumes = rows(volumesBody, ["networkVolumes", "volumes"]);
const attachedVolumes = volumes
  .filter((volume) => volumeIds.includes(text(volume?.id, 300)))
  .map((volume) => ({
    id: text(volume?.id, 300) || null,
    data_center_id: text(volume?.dataCenterId, 300) || null,
  }));
const volumeDataCenters = unique(attachedVolumes.map((volume) => volume.data_center_id));
const explicitDataCenters = unique(list(endpoint?.dataCenterIds));
const effectiveDataCenters = volumeDataCenters.length ? volumeDataCenters : explicitDataCenters;
const placementSource = volumeDataCenters.length
  ? "NETWORK_VOLUME_DATACENTER"
  : explicitDataCenters.length
    ? "ENDPOINT_DATACENTER_RESTRICTION"
    : "GLOBAL_SERVERLESS_PLACEMENT";

const gpuTypes = list(capacityData?.gpuTypes).map((row) => ({
  id: text(row?.id, 300),
  display_name: text(row?.displayName, 300) || null,
  memory_gb: finite(row?.memoryInGb),
})).filter((row) => row.id);
const knownGpuIds = new Set(gpuTypes.map((row) => row.id));
const invalidConfiguredGpuTypes = configuredGpuTypes.filter((id) => !knownGpuIds.has(id));
const availability = list(capacityData?.dataCenters).flatMap((dc) =>
  list(dc?.gpuAvailability).map((row) => ({
    data_center_id: text(dc?.id, 300) || null,
    data_center_name: text(dc?.name, 300) || null,
    location: text(dc?.location, 300) || null,
    gpu_type_id: text(row?.gpuTypeId, 300) || null,
    gpu_name: text(row?.gpuTypeDisplayName || row?.displayName || row?.gpuTypeId, 300) || null,
    available: row?.available === true,
    stock_status: upper(row?.stockStatus) || "UNAVAILABLE",
    stock_rank: stockRank(row?.stockStatus),
  })),
);
const configuredRows = availability.filter((row) => configuredGpuTypes.includes(row.gpu_type_id));
const effectiveRows = effectiveDataCenters.length
  ? configuredRows.filter((row) => effectiveDataCenters.includes(row.data_center_id))
  : configuredRows;
const liveUsableRows = effectiveRows
  .filter((row) => row.available && row.stock_rank > 0)
  .sort((a, b) => b.stock_rank - a.stock_rank || String(a.gpu_type_id).localeCompare(String(b.gpu_type_id)));

const active = activeWorkers(endpoint);
const restingZeroZero = finite(endpoint?.workersMin, -1) === 0 && finite(endpoint?.workersMax, -1) === 0;
const queueDrained = health.jobs.in_queue === 0 && health.jobs.in_progress === 0;
const workerResting = active.length === 0 && Object.values(health.workers).every((value) => finite(value, 0) === 0);
const runtimeTemplate = templateSummary(template);
const templateRuntimePresent = runtimeTemplate.template_id_present && runtimeTemplate.image_reference_present;

let diagnosis = "READY_FOR_SAFE_LEASE_RUNTIME_PROBE";
let nextAction = "RUN_SAFE_LEASE_MODELS_ROUTE_PROBE_NO_INFERENCE";
if (!restingZeroZero) {
  diagnosis = "ENDPOINT_NOT_SAFE_LEASE_RESTING_0_0";
  nextAction = "RESTORE_ENDPOINT_TO_0_0_BEFORE_ANY_PROBE";
} else if (!queueDrained) {
  diagnosis = "ENDPOINT_QUEUE_NOT_DRAINED";
  nextAction = "DO_NOT_CHANGE_MODEL_CODE_INSPECT_OR_CLEAR_STALE_QUEUE_UNDER_GOVERNANCE";
} else if (!workerResting) {
  diagnosis = "ENDPOINT_WORKER_NOT_RESTING";
  nextAction = "WAIT_FOR_OR_CLEAN_STALE_WORKER_BEFORE_ANY_PROBE";
} else if (templateLookupStatus === "MISSING_OR_STALE_TEMPLATE_REFERENCE") {
  diagnosis = "STALE_OR_UNREADABLE_TEMPLATE_BINDING";
  nextAction = "VERIFY_ENDPOINT_TEMPLATE_BINDING_AND_IMMUTABLE_IMAGE_BEFORE_ANY_PROBE";
} else if (!templateRuntimePresent) {
  diagnosis = "IMMUTABLE_RUNTIME_TEMPLATE_INCOMPLETE";
  nextAction = "VERIFY_IMAGE_AND_RUNTIME_ENTRYPOINT_BEFORE_ANY_PROBE";
} else if (!configuredGpuTypes.length || invalidConfiguredGpuTypes.length) {
  diagnosis = "CONFIGURED_GPU_TYPE_INVALID";
  nextAction = "REPAIR_GPU_CONFIGURATION_FROM_GLOBALLY_VALID_SERVERLESS_TYPES";
} else if (!liveUsableRows.length) {
  diagnosis = "NO_CURRENT_COMPATIBLE_SERVERLESS_CAPACITY";
  nextAction = "KEEP_ENDPOINT_0_0_RECHECK_OR_REPAIR_FALLBACK_POOL_DO_NOT_CHANGE_MODEL_CODE";
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  endpoint: {
    name: text(endpoint?.name, 300) || null,
    endpoint_id_present: Boolean(endpointId),
    template_id_present: Boolean(templateId),
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    gpu_count: finite(endpoint?.gpuCount),
    configured_gpu_type_ids: configuredGpuTypes,
    configured_gpu_types_globally_valid: configuredGpuTypes.length > 0 && invalidConfiguredGpuTypes.length === 0,
    invalid_configured_gpu_type_ids: invalidConfiguredGpuTypes,
    allowed_cuda_versions: unique(list(endpoint?.allowedCudaVersions)),
    minimum_cuda_version: text(endpoint?.minCudaVersion, 200) || null,
    network_volume_ids: volumeIds,
    attached_network_volumes: attachedVolumes,
    effective_data_center_ids: effectiveDataCenters,
    effective_placement_source: placementSource,
  },
  template_lookup_status: templateLookupStatus,
  runtime_template: runtimeTemplate,
  health,
  safe_lease_resting_0_0: restingZeroZero,
  queue_drained: queueDrained,
  worker_resting: workerResting,
  current_usable_target_count: liveUsableRows.length,
  current_usable_targets: liveUsableRows.slice(0, 20),
  configured_capacity_rows: effectiveRows.slice(0, 40),
  capacity_policy: {
    every_configured_gpu_must_be_globally_valid: true,
    every_configured_gpu_need_not_have_simultaneous_stock: true,
    at_least_one_current_effective_target_required: true,
    queue_without_worker_is_scheduler_capacity_until_proven_otherwise: true,
  },
  diagnosis,
  next_action: nextAction,
  generation_submitted: false,
  inference_performed: false,
  model_download_requested: false,
  endpoint_mutation_performed: false,
  queue_mutation_performed: false,
  storage_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

if (diagnosis !== "READY_FOR_SAFE_LEASE_RUNTIME_PROBE") process.exitCode = 3;
