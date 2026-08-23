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
    "AVANTIQO_CODE_RUNTIME_MODEL",
    "AVANTIQO_CODE_QUANTIZATION",
    "AVANTIQO_CODE_DTYPE",
    "AVANTIQO_CODE_REQUIRE_CACHED_MODEL",
    "AVANTIQO_CODE_HF_CACHE_ROOT",
    "AVANTIQO_CODE_MAX_MODEL_LEN",
    "AVANTIQO_CODE_GPU_MEMORY_UTILIZATION",
    "AVANTIQO_CODE_MAX_NEW_TOKENS",
    "VLLM_WORKER_MULTIPROC_METHOD",
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

function sanitizeTemplate(template = {}) {
  return {
    id: template.id || null,
    name: template.name || null,
    image_name: template.imageName || template.image || null,
    docker_entrypoint: Array.isArray(template.dockerEntrypoint) ? template.dockerEntrypoint : [],
    docker_start_cmd: Array.isArray(template.dockerStartCmd) ? template.dockerStartCmd : [],
    container_disk_gb: template.containerDiskInGb ?? null,
    volume_gb: template.volumeInGb ?? null,
    volume_mount_path: template.volumeMountPath || null,
    is_serverless: template.isServerless ?? null,
    environment: safeEnv(template.env),
  };
}

const runtimeApiKey = required("RUNPOD_API_KEY");
const managementApiKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
const endpointId = required("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID");
const runtimeAuthorization = {
  Authorization: `Bearer ${runtimeApiKey}`,
  Accept: "application/json",
};
const managementAuthorization = {
  Authorization: `Bearer ${managementApiKey || runtimeApiKey}`,
  Accept: "application/json",
};

const [endpointsResponse, healthResponse] = await Promise.all([
  fetch(`${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`, {
    headers: managementAuthorization,
  }),
  fetch(`${QUEUE_BASE}/${endpointId}/health`, { headers: runtimeAuthorization }),
]);

const endpointsBody = await json(endpointsResponse);
const health = await json(healthResponse);
if (!healthResponse.ok) {
  throw new Error(`RUNPOD_ENDPOINT_HEALTH_HTTP_${healthResponse.status}:${text(health?.error || health?.message)}`);
}

const managementScopeAvailable = endpointsResponse.ok;
const managementScopeStatus = endpointsResponse.status;
const endpoints = managementScopeAvailable
  ? Array.isArray(endpointsBody)
    ? endpointsBody
    : Array.isArray(endpointsBody?.endpoints)
      ? endpointsBody.endpoints
      : []
  : [];
const endpoint = endpoints.find((candidate) => text(candidate?.id) === endpointId) || null;
const templateId = text(endpoint?.templateId || endpoint?.template?.id);
let directTemplate = null;
let directTemplateStatus = null;
if (managementScopeAvailable && templateId) {
  const templateResponse = await fetch(`${REST_BASE}/templates/${templateId}`, {
    headers: managementAuthorization,
  });
  directTemplateStatus = templateResponse.status;
  const templateBody = await json(templateResponse);
  if (templateResponse.ok && templateBody && typeof templateBody === "object") {
    directTemplate = templateBody;
  }
}

const workers = health?.workers || {};
const jobs = health?.jobs || {};
const operationalWorkers = number(workers.idle) + number(workers.ready) + number(workers.running);
const initializingWorkers = number(workers.initializing);
const gpuTypes = endpoint && Array.isArray(endpoint.gpuTypeIds) ? endpoint.gpuTypeIds : [];
const dataCenters = endpoint && Array.isArray(endpoint.dataCenterIds)
  ? endpoint.dataCenterIds
  : endpoint && text(endpoint.dataCenterIds)
    ? text(endpoint.dataCenterIds).split(",").map((value) => value.trim()).filter(Boolean)
    : [];

let readiness = "UNKNOWN";
if (operationalWorkers > 0) readiness = "READY_OR_RUNNING";
else if (initializingWorkers > 0) readiness = "WORKER_INITIALIZING_NO_READY_CAPACITY";
else if (endpoint && number(endpoint.workersMin) === 0) readiness = "SCALE_TO_ZERO_IDLE";
else if (number(jobs.inQueue) === 0) readiness = "NO_ACTIVE_WORKER_QUEUE_CLEAN";
else readiness = "NO_WORKER_CAPACITY";

const template = directTemplate || endpoint?.template || null;
const report = {
  success: readiness !== "NO_WORKER_CAPACITY",
  contract: "AVANTIQO_CODE_RUNPOD_DIAGNOSTIC_V3",
  mutation_performed: false,
  provider_job_submitted: false,
  generation_performed: false,
  management_scope: {
    available: managementScopeAvailable,
    http_status: managementScopeStatus,
    credential_source: managementApiKey
      ? "RUNPOD_MANAGEMENT_API_KEY"
      : "RUNPOD_API_KEY_FALLBACK",
    direct_template_http_status: directTemplateStatus,
    note: managementScopeAvailable
      ? "Account-level Code endpoint and template configuration were read without mutation."
      : "Management configuration was unavailable; runtime health remains available.",
  },
  endpoint: endpoint ? {
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
    network_volume_id_present: Boolean(endpoint.networkVolumeId),
    network_volume_ids_count: Array.isArray(endpoint.networkVolumeIds)
      ? endpoint.networkVolumeIds.length
      : 0,
    template_id: templateId || null,
    version: endpoint.version ?? null,
    environment: safeEnv(endpoint.env),
    template: template ? sanitizeTemplate(template) : null,
    workers: Array.isArray(endpoint.workers) ? endpoint.workers.map(sanitizeWorker) : [],
  } : {
    id: endpointId,
    configuration_unavailable_without_management_scope: true,
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
    initialization_in_progress: initializingWorkers > 0,
    management_scope_required_for_gpu_template_details: !managementScopeAvailable,
    runtime_probe_should_not_load_model: true,
  },
};

console.log(JSON.stringify(report, null, 2));
if (!report.success) process.exitCode = 1;
