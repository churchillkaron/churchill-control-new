const REST = "https://rest.runpod.io/v1";
const SERVERLESS = "https://api.runpod.ai/v2";
const GQL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_CODE_IMAGE_RUNPOD_LIVE_COMPARISON_V1";

function text(value) {
  return String(value ?? "").trim();
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function healthCounters(health = {}) {
  const jobs = health?.jobs && typeof health.jobs === "object" ? health.jobs : {};
  const workers = health?.workers && typeof health.workers === "object" ? health.workers : {};
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
      completed: finite(jobs.completed, 0),
      failed: finite(jobs.failed, 0),
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
function stockRank(value) {
  return ({ HIGH: 4, MEDIUM: 3, LOW: 2 }[text(value).toUpperCase()] || 0);
}
function safeVolume(volume = {}) {
  return {
    id: text(volume.id) || null,
    name: text(volume.name) || null,
    size_gb: finite(volume.size ?? volume.sizeGb),
    data_center_id: text(volume.dataCenterId ?? volume.data_center_id) || null,
  };
}
function safeWorker(worker = {}) {
  return {
    status: text(worker.status || worker.desiredStatus) || null,
    gpu_type: text(worker.gpuTypeId || worker.gpu?.displayName || worker.machine?.gpuDisplayName) || null,
    data_center_id: text(worker.dataCenterId || worker.machine?.dataCenterId) || null,
    cost_per_hr: finite(worker.costPerHr),
  };
}
function safeTemplate(template = {}) {
  const env = template?.env && typeof template.env === "object" && !Array.isArray(template.env)
    ? template.env
    : {};
  return {
    id: text(template.id) || null,
    name: text(template.name) || null,
    image_name: text(template.imageName || template.image) || null,
    docker_entrypoint: list(template.dockerEntrypoint),
    docker_start_cmd: list(template.dockerStartCmd),
    container_disk_gb: finite(template.containerDiskInGb),
    volume_gb: finite(template.volumeInGb),
    volume_mount_path: text(template.volumeMountPath) || null,
    is_serverless: template.isServerless ?? null,
    env_keys: Object.keys(env).sort(),
  };
}
function safeEndpoint(endpoint = {}, volumeById, templateById) {
  const volumeIds = endpointVolumeIds(endpoint);
  const attachedVolumes = volumeIds.map((id) => volumeById.get(id)).filter(Boolean).map(safeVolume);
  const explicitDataCenters = list(endpoint.dataCenterIds).map(text).filter(Boolean);
  const volumeDataCenters = unique(attachedVolumes.map((volume) => volume.data_center_id));
  const effectiveDataCenters = volumeDataCenters.length ? volumeDataCenters : explicitDataCenters;
  const templateId = text(endpoint.templateId || endpoint.template?.id);
  const embeddedTemplate = endpoint?.template && typeof endpoint.template === "object" ? endpoint.template : null;
  const template = embeddedTemplate && Object.keys(embeddedTemplate).length
    ? embeddedTemplate
    : templateById.get(templateId) || null;
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    compute_type: text(endpoint.computeType) || null,
    gpu_count: finite(endpoint.gpuCount),
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout),
    flashboot: endpoint.flashboot ?? endpoint.flashBoot ?? null,
    allowed_cuda_versions: list(endpoint.allowedCudaVersions),
    min_cuda_version: text(endpoint.minCudaVersion) || null,
    data_center_ids: explicitDataCenters,
    effective_data_center_ids: effectiveDataCenters,
    effective_placement_source: volumeDataCenters.length
      ? "NETWORK_VOLUME_DATACENTER"
      : explicitDataCenters.length
        ? "ENDPOINT_DATACENTER_RESTRICTION"
        : "RUNPOD_AVAILABLE_DATACENTERS",
    network_volume_ids: volumeIds,
    attached_network_volumes: attachedVolumes,
    template_id: templateId || null,
    template: template ? safeTemplate(template) : null,
    workers: list(endpoint.workers).map(safeWorker),
    version: finite(endpoint.version),
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
  return readJson(await fetch(`${REST}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_REST");
}
async function health(endpointId, key) {
  return readJson(await fetch(`${SERVERLESS}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_HEALTH");
}
async function availability(key) {
  const query = `
    query AvantiqoCodeImageLiveComparison($input: GpuAvailabilityInput) {
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
        input: { gpuCount: 1, minDisk: 5, minMemoryInGb: 1, secureCloud: true },
      },
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
function capacityFor(endpoint, dataCenters) {
  const rows = [];
  for (const dcId of endpoint.effective_data_center_ids) {
    const dc = dataCenters.find((candidate) => text(candidate?.id) === dcId);
    for (const gpuTypeId of endpoint.gpu_type_ids) {
      const gpu = list(dc?.gpuAvailability).find((candidate) => text(candidate?.gpuTypeId) === gpuTypeId) || null;
      rows.push({
        data_center_id: dcId,
        gpu_type_id: gpuTypeId,
        gpu_name: text(gpu?.gpuTypeDisplayName || gpu?.displayName) || null,
        available: gpu?.available === true,
        stock_status: text(gpu?.stockStatus) || "UNAVAILABLE",
        stock_rank: stockRank(gpu?.stockStatus),
        returned_by_api: Boolean(gpu),
      });
    }
  }
  return rows;
}
function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function diff(code, image, key, severity, note = null) {
  if (equal(code[key], image[key])) return null;
  return {
    field: key,
    severity,
    code: code[key],
    image: image[key],
    note,
  };
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const codeEndpointId = required("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID");
const imageEndpointId = required("RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID");
const codeApiKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY) || required("RUNPOD_API_KEY");
const imageApiKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");

console.log("AVANTIQO_CODE_IMAGE_LIVE_COMPARISON_MODE=READ_ONLY");
console.log("AVANTIQO_CODE_IMAGE_LIVE_COMPARISON_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_CODE_IMAGE_LIVE_COMPARISON_JOB_SUBMISSION=false");
console.log("AVANTIQO_CODE_IMAGE_LIVE_COMPARISON_VOLUME_MUTATION=false");
console.log("AVANTIQO_CODE_IMAGE_LIVE_COMPARISON_TEMPLATE_MUTATION=false");
console.log("AVANTIQO_CODE_IMAGE_LIVE_COMPARISON_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_CODE_IMAGE_LIVE_COMPARISON_SECRETS_PRINTED=false");

const [endpoints, volumes, templates, codeHealthRaw, imageHealthRaw, dataCenters] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  health(codeEndpointId, codeApiKey),
  health(imageEndpointId, imageApiKey),
  availability(managementKey),
]);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");
if (!Array.isArray(templates)) throw new Error("RUNPOD_TEMPLATE_LIST_INVALID");
const codeRaw = endpoints.find((endpoint) => text(endpoint?.id) === codeEndpointId);
const imageRaw = endpoints.find((endpoint) => text(endpoint?.id) === imageEndpointId);
if (!codeRaw) throw new Error("AVANTIQO_CODE_ENDPOINT_NOT_FOUND");
if (!imageRaw) throw new Error("AVANTIQO_IMAGE_ENDPOINT_NOT_FOUND");

const volumeById = new Map(volumes.map((volume) => [text(volume?.id), volume]).filter(([id]) => id));
const templateById = new Map(templates.map((template) => [text(template?.id), template]).filter(([id]) => id));
const code = safeEndpoint(codeRaw, volumeById, templateById);
const image = safeEndpoint(imageRaw, volumeById, templateById);
const codeHealth = healthCounters(codeHealthRaw);
const imageHealth = healthCounters(imageHealthRaw);
const codeCapacity = capacityFor(code, dataCenters);
const imageCapacity = capacityFor(image, dataCenters);

const differences = [
  diff(code, image, "compute_type", "HIGH"),
  diff(code, image, "gpu_count", "HIGH"),
  diff(code, image, "workers_min", "MEDIUM"),
  diff(code, image, "workers_max", "HIGH"),
  diff(code, image, "scaler_type", "HIGH", "Code is intentionally configured for REQUEST_COUNT scaling."),
  diff(code, image, "scaler_value", "HIGH"),
  diff(code, image, "idle_timeout_seconds", "MEDIUM"),
  diff(code, image, "flashboot", "MEDIUM"),
  diff(code, image, "allowed_cuda_versions", "HIGH"),
  diff(code, image, "min_cuda_version", "HIGH"),
  diff(code, image, "effective_data_center_ids", "HIGH"),
  diff(code, image, "effective_placement_source", "HIGH"),
].filter(Boolean);

const codeStock = codeCapacity.filter((entry) => entry.available && entry.stock_rank > 0);
const imageStock = imageCapacity.filter((entry) => entry.available && entry.stock_rank > 0);
const likelySchedulerDifferences = differences.filter((entry) => entry.severity === "HIGH");

let nextAction = "INSPECT_TEMPLATE_OR_RUNPOD_SCHEDULER_SUPPORT";
if (differences.some((entry) => ["scaler_type", "scaler_value"].includes(entry.field))) {
  nextAction = "ALIGN_IMAGE_SCALER_WITH_PROVEN_CODE_PATTERN_THEN_REPROBE";
} else if (codeStock.length && !imageStock.length) {
  nextAction = "IMAGE_BOUND_GPU_HAS_NO_EFFECTIVE_STOCK_RELOCATE_SHARED_GROUP_OR_CHANGE_GPU";
} else if (!equal(code.effective_data_center_ids, image.effective_data_center_ids)) {
  nextAction = "COMPARE_EFFECTIVE_DATACENTER_STOCK_AND_SHARED_VOLUME_PLACEMENT";
} else if (differences.some((entry) => ["compute_type", "gpu_count", "allowed_cuda_versions", "min_cuda_version", "flashboot"].includes(entry.field))) {
  nextAction = "ALIGN_ONLY_PROVEN_SCHEDULER_FIELDS_WITH_CODE_AFTER_REVIEW";
}

const report = {
  success: true,
  contract: CONTRACT,
  mutation_performed: false,
  provider_job_submitted: false,
  production_deploy_performed: false,
  code: {
    endpoint: code,
    health: codeHealth,
    bound_gpu_capacity: codeCapacity,
  },
  image: {
    endpoint: image,
    health: imageHealth,
    bound_gpu_capacity: imageCapacity,
  },
  comparison: {
    scheduler_relevant_differences: differences,
    high_severity_difference_count: likelySchedulerDifferences.length,
    code_schedulable_gpu_rows: codeStock,
    image_schedulable_gpu_rows: imageStock,
    same_effective_datacenter: equal(code.effective_data_center_ids, image.effective_data_center_ids),
    same_scaler: code.scaler_type === image.scaler_type && code.scaler_value === image.scaler_value,
    same_worker_limits: code.workers_min === image.workers_min && code.workers_max === image.workers_max,
    same_compute_type: code.compute_type === image.compute_type,
    same_gpu_count: code.gpu_count === image.gpu_count,
    same_flashboot: code.flashboot === image.flashboot,
  },
  next_action: nextAction,
};

console.log("AVANTIQO_CODE_IMAGE_LIVE_COMPARISON_COMPLETE=YES");
console.log(JSON.stringify(report, null, 2));
