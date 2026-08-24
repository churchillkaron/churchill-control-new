const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";

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

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function safeEnv(env = {}) {
  const source = object(env);
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

function nullableNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stockScore(value) {
  const status = text(value).toUpperCase();
  if (status === "HIGH") return 4;
  if (status === "MEDIUM") return 3;
  if (status === "LOW") return 2;
  if (status && status !== "NONE" && status !== "UNAVAILABLE") return 1;
  return 0;
}

function sanitizeWorker(worker = {}) {
  return {
    id: worker.id || null,
    status: worker.status || worker.desiredStatus || null,
    gpu_type: worker.gpuTypeId || worker.gpu?.displayName || worker.machine?.gpuDisplayName || null,
    data_center_id: worker.dataCenterId || worker.machine?.dataCenterId || null,
    cost_per_hr: nullableNumber(worker.costPerHr),
    last_started_at: worker.lastStartedAt || null,
    last_status_change: worker.lastStatusChange || null,
  };
}

function sanitizeTemplate(template = {}) {
  return {
    id: template.id || null,
    name: template.name || null,
    image_name: template.imageName || template.image || null,
    docker_entrypoint: list(template.dockerEntrypoint),
    docker_start_cmd: list(template.dockerStartCmd),
    container_disk_gb: template.containerDiskInGb ?? null,
    volume_gb: template.volumeInGb ?? null,
    volume_mount_path: template.volumeMountPath || null,
    is_serverless: template.isServerless ?? null,
    environment: safeEnv(template.env),
  };
}

function sanitizeNetworkVolume(volume = {}) {
  return {
    id: text(volume.id) || null,
    name: text(volume.name) || null,
    size_gb: nullableNumber(volume.size),
    data_center_id: text(volume.dataCenterId) || null,
  };
}

function sanitizeGpu(gpu = {}) {
  const status = text(gpu.stockStatus) || null;
  return {
    gpu_type_id: text(gpu.gpuTypeId) || null,
    gpu_name: text(gpu.gpuTypeDisplayName || gpu.displayName) || null,
    available: gpu.available === true,
    stock_status: status,
    schedulable_stock_reported: gpu.available === true && stockScore(status) > 0,
  };
}

function endpointNetworkVolumeIds(endpoint = {}) {
  return [
    text(endpoint.networkVolumeId),
    ...list(endpoint.networkVolumeIds).map(text),
  ].filter(Boolean);
}

async function discoverGpuAvailability(credential) {
  if (!text(credential)) {
    return {
      available: false,
      http_status: null,
      data_centers: [],
      error: "RUNPOD_MANAGEMENT_CREDENTIAL_UNAVAILABLE",
    };
  }

  const query = `
    query AvantiqoCodeDiagnosticGpuAvailability($input: GpuAvailabilityInput) {
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

  try {
    const response = await fetch(`${GRAPHQL_URL}?api_key=${encodeURIComponent(credential)}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
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
    const body = await json(response);
    const errors = list(body?.errors).map((entry) => text(entry?.message)).filter(Boolean);
    const dataCenters = list(body?.data?.dataCenters);
    if (!response.ok || errors.length || !Array.isArray(body?.data?.dataCenters)) {
      return {
        available: false,
        http_status: response.status,
        data_centers: [],
        error: errors.join(" | ") || text(body?.message || body?.error) || "INVALID_RESPONSE",
      };
    }
    return {
      available: true,
      http_status: response.status,
      data_centers: dataCenters,
      error: null,
    };
  } catch (error) {
    return {
      available: false,
      http_status: null,
      data_centers: [],
      error: text(error?.message || error) || "RUNPOD_GPU_AVAILABILITY_FAILED",
    };
  }
}

const runtimeApiKey = required("RUNPOD_API_KEY");
const managementApiKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
const managementCredential = managementApiKey || runtimeApiKey;
const endpointId = required("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID");
const runtimeAuthorization = {
  Authorization: `Bearer ${runtimeApiKey}`,
  Accept: "application/json",
};
const managementAuthorization = {
  Authorization: `Bearer ${managementCredential}`,
  Accept: "application/json",
};

const [
  endpointsResponse,
  templatesResponse,
  networkVolumesResponse,
  healthResponse,
  gpuAvailability,
] = await Promise.all([
  fetch(`${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`, {
    headers: managementAuthorization,
  }),
  fetch(
    `${REST_BASE}/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false`,
    { headers: managementAuthorization },
  ),
  fetch(`${REST_BASE}/networkvolumes`, { headers: managementAuthorization }),
  fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: runtimeAuthorization,
  }),
  discoverGpuAvailability(managementCredential),
]);

const endpointsBody = await json(endpointsResponse);
const templatesBody = await json(templatesResponse);
const networkVolumesBody = await json(networkVolumesResponse);
const health = await json(healthResponse);
if (!healthResponse.ok) {
  throw new Error(`RUNPOD_ENDPOINT_HEALTH_HTTP_${healthResponse.status}:${text(health?.error || health?.message)}`);
}

const managementScopeAvailable = endpointsResponse.ok;
const managementScopeStatus = endpointsResponse.status;
const templateListAvailable = templatesResponse.ok;
const networkVolumeListAvailable = networkVolumesResponse.ok;
const endpoints = managementScopeAvailable
  ? Array.isArray(endpointsBody)
    ? endpointsBody
    : list(endpointsBody?.endpoints)
  : [];
const templates = templateListAvailable
  ? Array.isArray(templatesBody)
    ? templatesBody
    : list(templatesBody?.templates)
  : [];
const networkVolumes = networkVolumeListAvailable
  ? Array.isArray(networkVolumesBody)
    ? networkVolumesBody
    : list(networkVolumesBody?.networkVolumes || networkVolumesBody?.network_volumes)
  : [];
const endpoint = endpoints.find((candidate) => text(candidate?.id) === endpointId) || null;
const templateId = text(endpoint?.templateId || endpoint?.template?.id);
const endpointEmbeddedTemplate = object(endpoint?.template);
const templateById = new Map(
  templates.map((template) => [text(template?.id), template]).filter(([id]) => id),
);
const resolvedTemplate = Object.keys(endpointEmbeddedTemplate).length > 0
  ? endpointEmbeddedTemplate
  : templateById.get(templateId) || null;
const templateResolutionSource = resolvedTemplate
  ? Object.keys(endpointEmbeddedTemplate).length > 0
    ? "ENDPOINT_INCLUDE_TEMPLATE"
    : "ENDPOINT_BOUND_TEMPLATE_LIST"
  : templateId
    ? "NOT_RETURNED"
    : "NO_TEMPLATE_ID";
const networkVolumeById = new Map(
  networkVolumes.map((volume) => [text(volume?.id), volume]).filter(([id]) => id),
);
const attachedNetworkVolumeIds = endpoint ? [...new Set(endpointNetworkVolumeIds(endpoint))] : [];
const attachedNetworkVolumes = attachedNetworkVolumeIds.map((volumeId) => ({
  id: volumeId,
  found_in_account: networkVolumeById.has(volumeId),
  volume: networkVolumeById.has(volumeId)
    ? sanitizeNetworkVolume(networkVolumeById.get(volumeId))
    : null,
}));
const attachedVolumeDataCenterIds = [
  ...new Set(
    attachedNetworkVolumes
      .map((entry) => text(entry?.volume?.data_center_id))
      .filter(Boolean),
  ),
];

const workers = health?.workers || {};
const jobs = health?.jobs || {};
const queuedJobs = number(jobs.inQueue);
const operationalWorkers = number(workers.idle) + number(workers.ready) + number(workers.running);
const initializingWorkers = number(workers.initializing);
const gpuTypes = endpoint && Array.isArray(endpoint.gpuTypeIds) ? endpoint.gpuTypeIds.map(text).filter(Boolean) : [];
const dataCenters = endpoint && Array.isArray(endpoint.dataCenterIds)
  ? endpoint.dataCenterIds.map(text).filter(Boolean)
  : endpoint && text(endpoint.dataCenterIds)
    ? text(endpoint.dataCenterIds).split(",").map((value) => value.trim()).filter(Boolean)
    : [];
const effectiveDataCenterIds = attachedVolumeDataCenterIds.length
  ? attachedVolumeDataCenterIds
  : dataCenters;
const effectiveDataCenters = effectiveDataCenterIds.map((dataCenterId) => {
  const source = gpuAvailability.data_centers.find((candidate) => text(candidate?.id) === dataCenterId) || null;
  return {
    id: dataCenterId,
    name: text(source?.name) || null,
    location: text(source?.location) || null,
    storage_support: source?.storageSupport ?? null,
    gpu_availability: list(source?.gpuAvailability).map(sanitizeGpu),
  };
});
const boundGpuCapacity = effectiveDataCenters.flatMap((dataCenter) =>
  gpuTypes.map((gpuTypeId) => {
    const match = dataCenter.gpu_availability.find((gpu) => gpu.gpu_type_id === gpuTypeId) || null;
    return {
      data_center_id: dataCenter.id,
      gpu_type_id: gpuTypeId,
      returned_by_availability_api: Boolean(match),
      available: match?.available ?? null,
      stock_status: match?.stock_status ?? null,
      schedulable_stock_reported: match?.schedulable_stock_reported ?? false,
    };
  }),
);
const boundGpuStockReportedAvailable = boundGpuCapacity.some(
  (entry) => entry.schedulable_stock_reported === true,
);
const boundGpuStockReportedUnavailable = (
  gpuAvailability.available
  && effectiveDataCenterIds.length > 0
  && gpuTypes.length > 0
  && boundGpuCapacity.length === effectiveDataCenterIds.length * gpuTypes.length
  && !boundGpuStockReportedAvailable
);

let readiness = "UNKNOWN";
if (operationalWorkers > 0) readiness = "READY_OR_RUNNING";
else if (initializingWorkers > 0) readiness = "WORKER_INITIALIZING_NO_READY_CAPACITY";
else if (queuedJobs > 0 && boundGpuStockReportedUnavailable) readiness = "QUEUED_NO_BOUND_GPU_STOCK";
else if (queuedJobs > 0) readiness = "QUEUED_NO_WORKER_CAPACITY";
else if (endpoint && number(endpoint.workersMin) === 0) readiness = "SCALE_TO_ZERO_IDLE";
else readiness = "NO_ACTIVE_WORKER_QUEUE_CLEAN";

const success = !["QUEUED_NO_BOUND_GPU_STOCK", "QUEUED_NO_WORKER_CAPACITY"].includes(readiness);
const nextAction = readiness === "QUEUED_NO_BOUND_GPU_STOCK"
  ? "WIDEN_GPU_POOL_IN_ATTACHED_VOLUME_DATACENTER_OR_RELOCATE_STORAGE"
  : readiness === "QUEUED_NO_WORKER_CAPACITY" && boundGpuStockReportedAvailable
    ? "INSPECT_RUNPOD_SCHEDULER_OR_WORKER_START_FAILURE"
    : readiness === "QUEUED_NO_WORKER_CAPACITY"
      ? "RESOLVE_EFFECTIVE_DATACENTER_GPU_CAPACITY"
      : null;

const report = {
  success,
  contract: "AVANTIQO_CODE_RUNPOD_DIAGNOSTIC_V5",
  mutation_performed: false,
  provider_job_submitted: false,
  generation_performed: false,
  management_scope: {
    available: managementScopeAvailable,
    http_status: managementScopeStatus,
    credential_source: managementApiKey
      ? "RUNPOD_MANAGEMENT_API_KEY"
      : "RUNPOD_API_KEY_FALLBACK",
    endpoint_bound_template_list_http_status: templatesResponse.status,
    endpoint_bound_template_list_available: templateListAvailable,
    network_volume_list_http_status: networkVolumesResponse.status,
    network_volume_list_available: networkVolumeListAvailable,
    gpu_availability_http_status: gpuAvailability.http_status,
    gpu_availability_available: gpuAvailability.available,
    gpu_availability_error: gpuAvailability.error,
    note: managementScopeAvailable
      ? "Account-level Code endpoint, endpoint-bound template, network-volume configuration, and GPU availability were read without mutation."
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
    effective_data_center_ids: effectiveDataCenterIds,
    worker_placement_scope: attachedVolumeDataCenterIds.length
      ? "NETWORK_VOLUME_DATACENTER"
      : dataCenters.length
        ? "ENDPOINT_DATACENTER_RESTRICTION"
        : "RUNPOD_AVAILABLE_DATACENTERS",
    allowed_cuda_versions: endpoint.allowedCudaVersions || [],
    min_cuda_version: endpoint.minCudaVersion || null,
    workers_min: endpoint.workersMin ?? null,
    workers_max: endpoint.workersMax ?? null,
    idle_timeout_seconds: endpoint.idleTimeout ?? null,
    scaler_type: endpoint.scalerType || null,
    scaler_value: endpoint.scalerValue ?? null,
    execution_timeout_ms: endpoint.executionTimeoutMs ?? null,
    flashboot: endpoint.flashboot ?? endpoint.flashBoot ?? null,
    network_volume_id_present: attachedNetworkVolumeIds.length > 0,
    network_volume_ids: attachedNetworkVolumeIds,
    network_volume_ids_count: attachedNetworkVolumeIds.length,
    attached_network_volumes: attachedNetworkVolumes,
    template_id: templateId || null,
    template_resolution_source: templateResolutionSource,
    version: endpoint.version ?? null,
    environment: safeEnv(endpoint.env),
    template: resolvedTemplate ? sanitizeTemplate(resolvedTemplate) : null,
    workers: Array.isArray(endpoint.workers) ? endpoint.workers.map(sanitizeWorker) : [],
  } : {
    id: endpointId,
    configuration_unavailable_without_management_scope: true,
  },
  gpu_capacity: {
    minimum_memory_gb: 80,
    secure_cloud: true,
    effective_data_center_ids: effectiveDataCenterIds,
    effective_data_centers: effectiveDataCenters,
    bound_gpu_capacity: boundGpuCapacity,
    bound_gpu_stock_reported_available: boundGpuStockReportedAvailable,
    bound_gpu_stock_reported_unavailable: boundGpuStockReportedUnavailable,
  },
  account_network_volumes: networkVolumes.map(sanitizeNetworkVolume),
  health: {
    jobs: {
      completed: number(jobs.completed),
      failed: number(jobs.failed),
      in_progress: number(jobs.inProgress),
      in_queue: queuedJobs,
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
    queue_is_clean: queuedJobs === 0,
    queued_job_requires_capacity: queuedJobs > 0,
    initialization_in_progress: initializingWorkers > 0,
    management_scope_required_for_gpu_template_details: !managementScopeAvailable,
    template_id_present: Boolean(templateId),
    template_resolved: Boolean(resolvedTemplate),
    template_resolution_source: templateResolutionSource,
    persistent_network_volume_attached: attachedNetworkVolumeIds.length > 0,
    volume_region_constrains_worker_placement: attachedVolumeDataCenterIds.length > 0,
    bound_gpu_stock_reported_available: boundGpuStockReportedAvailable,
    bound_gpu_stock_reported_unavailable: boundGpuStockReportedUnavailable,
    next_action: nextAction,
    runtime_probe_should_not_load_model: true,
  },
};

console.log(JSON.stringify(report, null, 2));
if (!report.success) process.exitCode = 1;
