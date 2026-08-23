const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function json(response) {
  return response.json().catch(() => ({}));
}

function safeEnv(env = {}) {
  const source = env && typeof env === "object" && !Array.isArray(env) ? env : {};
  const visible = new Set([
    "AVANTIQO_CODE_FOUNDATION_MODEL",
    "AVANTIQO_CODE_QUANTIZATION",
    "AVANTIQO_CODE_DTYPE",
    "AVANTIQO_CODE_REQUIRE_CACHED_MODEL",
    "AVANTIQO_CODE_HF_CACHE_ROOT",
    "AVANTIQO_CODE_MAX_NEW_TOKENS",
  ]);
  return {
    keys: Object.keys(source).sort(),
    non_secret_code_configuration: Object.fromEntries(
      Object.entries(source).filter(([key]) => visible.has(key)),
    ),
  };
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizeWorker(worker = {}) {
  return {
    id: worker.id || null,
    status: worker.status || worker.desiredStatus || null,
    gpu_type: worker.gpuTypeId || worker.gpu?.displayName || worker.machine?.gpuDisplayName || null,
    data_center_id: worker.dataCenterId || worker.machine?.dataCenterId || null,
    cost_per_hr: Number.isFinite(Number(worker.costPerHr)) ? Number(worker.costPerHr) : null,
    last_started_at: worker.lastStartedAt || null,
    last_status_change: worker.lastStatusChange || null,
  };
}

const apiKey = required("RUNPOD_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID");
const authorization = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };

const [endpointsResponse, healthResponse] = await Promise.all([
  fetch(`${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`, { headers: authorization }),
  fetch(`${QUEUE_BASE}/${endpointId}/health`, { headers: authorization }),
]);

const endpointsBody = await json(endpointsResponse);
const health = await json(healthResponse);
if (!endpointsResponse.ok) {
  throw new Error(`RUNPOD_ENDPOINT_DISCOVERY_HTTP_${endpointsResponse.status}:${text(endpointsBody?.error || endpointsBody?.message)}`);
}
if (!healthResponse.ok) {
  throw new Error(`RUNPOD_ENDPOINT_HEALTH_HTTP_${healthResponse.status}:${text(health?.error || health?.message)}`);
}

const endpoints = Array.isArray(endpointsBody)
  ? endpointsBody
  : Array.isArray(endpointsBody?.endpoints)
    ? endpointsBody.endpoints
    : [];
const endpoint = endpoints.find((candidate) => text(candidate?.id) === endpointId);
if (!endpoint) throw new Error(`RUNPOD_CODE_ENDPOINT_NOT_FOUND:${endpointId}`);

const workers = health?.workers || {};
const jobs = health?.jobs || {};
const operationalWorkers = number(workers.idle) + number(workers.ready) + number(workers.running);
const initializingWorkers = number(workers.initializing);
const gpuTypes = Array.isArray(endpoint.gpuTypeIds) ? endpoint.gpuTypeIds : [];
const dataCenters = Array.isArray(endpoint.dataCenterIds)
  ? endpoint.dataCenterIds
  : text(endpoint.dataCenterIds)
    ? text(endpoint.dataCenterIds).split(",").map((value) => value.trim()).filter(Boolean)
    : [];

let readiness = "UNKNOWN";
if (operationalWorkers > 0) readiness = "READY_OR_RUNNING";
else if (initializingWorkers > 0) readiness = "WORKER_INITIALIZING_NO_READY_CAPACITY";
else if (number(endpoint.workersMin) === 0) readiness = "SCALE_TO_ZERO_IDLE";
else readiness = "NO_WORKER_CAPACITY";

const report = {
  success: readiness !== "WORKER_INITIALIZING_NO_READY_CAPACITY" && readiness !== "NO_WORKER_CAPACITY",
  contract: "AVANTIQO_CODE_RUNPOD_DIAGNOSTIC_V1",
  mutation_performed: false,
  provider_job_submitted: false,
  endpoint: {
    id: endpoint.id,
    name: endpoint.name || null,
    compute_type: endpoint.computeType || null,
    gpu_count: endpoint.gpuCount ?? null,
    gpu_type_ids: gpuTypes,
    gpu_type_count: gpuTypes.length,
    data_center_ids: dataCenters,
    data_center_scope: dataCenters.length ? "RESTRICTED" : "ANY",
    allowed_cuda_versions: endpoint.allowedCudaVersions || [],
    min_cuda_version: endpoint.minCudaVersion || null,
    workers_min: endpoint.workersMin ?? null,
    workers_max: endpoint.workersMax ?? null,
    idle_timeout_seconds: endpoint.idleTimeout ?? null,
    scaler_type: endpoint.scalerType || null,
    scaler_value: endpoint.scalerValue ?? null,
    execution_timeout_ms: endpoint.executionTimeoutMs ?? null,
    flashboot: endpoint.flashboot ?? endpoint.flashBoot ?? null,
    network_volume_attached: Boolean(endpoint.networkVolumeId || (endpoint.networkVolumeIds || []).length),
    template_id: endpoint.templateId || endpoint.template?.id || null,
    version: endpoint.version ?? null,
    environment: safeEnv(endpoint.env),
    template: endpoint.template ? {
      id: endpoint.template.id || null,
      image: endpoint.template.image || null,
      container_disk_gb: endpoint.template.containerDiskInGb ?? null,
      environment: safeEnv(endpoint.template.env),
    } : null,
    workers: Array.isArray(endpoint.workers) ? endpoint.workers.map(sanitizeWorker) : [],
  },
  health: {
    jobs: {
      completed: number(jobs.completed),
      failed: number(jobs.failed),
      in_progress: number(jobs.inProgress),
      in_queue: number(jobs.inQueue),
      retried: number(jobs.retried),
    },
    workers: {
      idle: number(workers.idle),
      initializing: initializingWorkers,
      ready: number(workers.ready),
      running: number(workers.running),
      throttled: number(workers.throttled),
      unhealthy: number(workers.unhealthy),
      operational: operationalWorkers,
    },
  },
  diagnosis: {
    readiness,
    queue_is_clean: number(jobs.inQueue) === 0,
    single_gpu_type_only: gpuTypes.length === 1,
    region_restricted: dataCenters.length > 0,
    scale_to_zero: number(endpoint.workersMin) === 0,
    initialization_blocker: readiness === "WORKER_INITIALIZING_NO_READY_CAPACITY",
  },
};

console.log(JSON.stringify(report, null, 2));
if (!report.success) process.exitCode = 1;
