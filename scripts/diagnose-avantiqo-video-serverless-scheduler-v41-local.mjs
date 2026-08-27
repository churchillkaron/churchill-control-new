const CONTRACT = "AVANTIQO_VIDEO_SERVERLESS_SCHEDULER_DIAGNOSIS_V41";
const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const GQL = "https://api.runpod.io/graphql";
const ENDPOINT_ID = "r0bzqq9zoi92h7";
const ENDPOINT_NAME = "avantiqo-cinema-v1";

const text = (v) => String(v ?? "").trim();
const list = (v) => Array.isArray(v) ? v : [];
const finite = (v, fallback = null) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const unique = (v) => [...new Set(v.map(text).filter(Boolean))];
const object = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}
function normalizeList(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const nested = normalizeList(value[key], keys, depth + 1);
    if (nested) return nested;
  }
  return null;
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function stockRank(value) {
  const v = text(value).toUpperCase();
  if (v === "HIGH") return 4;
  if (v === "MEDIUM") return 3;
  if (v === "LOW") return 2;
  if (v === "AVAILABLE") return 1;
  return 0;
}
async function json(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw).slice(0, 900)}`);
  return body ?? {};
}
async function rest(path, key) {
  return json(await fetch(`${REST}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_V41_REST");
}
async function queue(path, key) {
  return json(await fetch(`${QUEUE}/${ENDPOINT_ID}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_V41_QUEUE");
}
async function queueKey(managementKey) {
  const candidates = [
    ["RUNPOD_AVANTIQO_VIDEO_API_KEY", text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY)],
    ["RUNPOD_API_KEY", text(process.env.RUNPOD_API_KEY)],
    ["RUNPOD_MANAGEMENT_API_KEY", managementKey],
  ];
  const seen = new Set();
  for (const [source, key] of candidates) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    try { await queue("/health", key); return { source, key }; } catch {}
  }
  throw new Error("AVANTIQO_VIDEO_V41_QUEUE_KEY_NOT_FOUND");
}
function healthSummary(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  const wc = {
    idle: finite(workers.idle, 0),
    initializing: finite(workers.initializing, 0),
    ready: finite(workers.ready, 0),
    running: finite(workers.running, 0),
    throttled: finite(workers.throttled, 0),
    unhealthy: finite(workers.unhealthy, 0),
  };
  return {
    jobs: { in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0), in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0) },
    workers: wc,
    worker_total: Object.values(wc).reduce((a, b) => a + b, 0),
  };
}
async function capacity(managementKey, gpuCount, diskGb) {
  const query = `
    query AvantiqoVideoV41($input: GpuAvailabilityInput) {
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
  const response = await fetch(`${GQL}?api_key=${encodeURIComponent(managementKey)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { input: { gpuCount, minDisk: diskGb, minMemoryInGb: 80, secureCloud: true } } }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok || list(body?.errors).length || !Array.isArray(body?.data?.dataCenters)) {
    throw new Error(`AVANTIQO_VIDEO_V41_GRAPHQL_FAILED:${response.status}:${redact(list(body?.errors).map((e) => e?.message).filter(Boolean).join(" | ") || raw).slice(0, 900)}`);
  }
  return body.data;
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(nodeMajor) || nodeMajor < 20) throw new Error(`AVANTIQO_VIDEO_V41_NODE20_REQUIRED:${process.version}`);

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const [endpoint, templatesRaw, volumesRaw] = await Promise.all([
  rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  rest("/networkvolumes", managementKey),
]);
if (text(endpoint.id) !== ENDPOINT_ID || text(endpoint.name) !== ENDPOINT_NAME) throw new Error("AVANTIQO_VIDEO_V41_ENDPOINT_ID_NAME_INVALID");

const templates = normalizeList(templatesRaw, ["templates"]);
const volumes = normalizeList(volumesRaw, ["networkVolumes", "volumes"]);
if (!templates || !volumes) throw new Error("AVANTIQO_VIDEO_V41_INVENTORY_INVALID");

const templateId = text(endpoint.templateId || endpoint.template?.id);
const template = text(endpoint.template?.id) === templateId && Object.keys(object(endpoint.template)).length
  ? endpoint.template
  : templates.find((row) => text(row?.id) === templateId);
if (!template) throw new Error(`AVANTIQO_VIDEO_V41_TEMPLATE_NOT_FOUND:${templateId || "NONE"}`);

const volumeIds = endpointVolumeIds(endpoint);
const attached = volumeIds.map((id) => {
  const v = volumes.find((row) => text(row?.id) === id) || {};
  return { id, name: text(v.name) || null, data_center_id: text(v.dataCenterId) || null, size_gb: finite(v.size ?? v.sizeGb, null), resolves: Boolean(text(v.id)) };
});
const effectiveDcs = unique(attached.map((v) => v.data_center_id));
const gpuTypes = unique(list(endpoint.gpuTypeIds));
const gpuCount = Math.max(1, finite(endpoint.gpuCount, 1));
const diskGb = Math.max(5, finite(template.containerDiskInGb, 50));
const credential = await queueKey(managementKey);
const [healthRaw, cap] = await Promise.all([queue("/health", credential.key), capacity(managementKey, gpuCount, diskGb)]);
const health = healthSummary(healthRaw);
const meta = new Map(list(cap.gpuTypes).map((row) => [text(row.id), row]));
const rows = [];
for (const dcId of effectiveDcs) {
  const dc = list(cap.dataCenters).find((row) => text(row.id) === dcId) || {};
  const availability = new Map(list(dc.gpuAvailability).map((row) => [text(row.gpuTypeId), row]));
  for (const gpuTypeId of gpuTypes) {
    const a = availability.get(gpuTypeId) || {};
    const m = meta.get(gpuTypeId) || {};
    rows.push({
      data_center_id: dcId,
      data_center_storage_support: dc.storageSupport === true,
      gpu_type_id: gpuTypeId,
      display_name: text(a.gpuTypeDisplayName || a.displayName || m.displayName) || null,
      memory_gb: finite(m.memoryInGb, null),
      secure_cloud_supported: m.secureCloud === true,
      available: a.available === true,
      stock_status: text(a.stockStatus).toUpperCase() || "NOT_LISTED",
      stock_rank: stockRank(a.stockStatus),
    });
  }
}

const schedulable = rows.filter((r) => r.available && r.stock_rank > 0);
const preferred = schedulable.filter((r) => r.stock_rank >= 3);
const scalerType = text(endpoint.scalerType).toUpperCase();
const scalerValue = finite(endpoint.scalerValue, null);
const workersMin = finite(endpoint.workersMin, null);
const workersMax = finite(endpoint.workersMax, null);
const managementWorkers = list(endpoint.workers).map((w) => ({
  desired_status: text(w.desiredStatus || w.desired_status).toUpperCase() || null,
  status: text(w.status || w.workerStatus || w.runtimeStatus).toUpperCase() || null,
  gpu_type_id: text(w.gpuTypeId || w.gpu?.displayName || w.machine?.gpuDisplayName) || null,
  data_center_id: text(w.dataCenterId || w.machine?.dataCenterId) || null,
  cost_per_hr: finite(w.adjustedCostPerHr ?? w.costPerHr, null),
}));

const configBlockers = [];
if (text(endpoint.computeType).toUpperCase() !== "GPU") configBlockers.push("COMPUTE_TYPE_NOT_GPU");
if (gpuCount !== 1) configBlockers.push(`GPU_COUNT_${gpuCount}`);
if (!["QUEUE_DELAY", "REQUEST_COUNT"].includes(scalerType)) configBlockers.push(`SCALER_TYPE_${scalerType || "NONE"}`);
if (!Number.isFinite(scalerValue) || scalerValue < 1) configBlockers.push(`SCALER_VALUE_${scalerValue}`);
if (!volumeIds.length) configBlockers.push("NO_NETWORK_VOLUMES");
if (attached.some((v) => !v.resolves || !v.data_center_id)) configBlockers.push("NETWORK_VOLUME_RESOLUTION_INVALID");
if (!gpuTypes.length) configBlockers.push("NO_GPU_TYPES");

let diagnosis = "RESTING_STATE_READ_ONLY";
if (workersMax === 1 && health.jobs.in_queue > 0 && health.worker_total === 0) {
  if (configBlockers.length) diagnosis = "ENDPOINT_CONFIGURATION_BLOCKS_AUTOSCALING";
  else if (!schedulable.length) diagnosis = "NO_SECURE_BLACKWELL_CAPACITY_IN_ATTACHED_VOLUME_DATACENTERS";
  else if (!preferred.length) diagnosis = "ONLY_LOW_BLACKWELL_STOCK_VISIBLE_ALLOCATION_UNRELIABLE";
  else diagnosis = "RUNPOD_AUTOSCALER_NOT_CREATING_WORKER_DESPITE_ELIGIBLE_CAPACITY";
} else if (health.worker_total > 0 || managementWorkers.some((w) => !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(w.desired_status || w.status))) {
  diagnosis = "WORKER_EXISTS_OR_STARTING";
} else if (workersMax === 0 && health.jobs.in_queue > 0) diagnosis = "QUEUED_JOB_WHILE_ENDPOINT_PAUSED";
else if (workersMax === 1 && health.jobs.in_queue === 0) diagnosis = "LEASE_OPEN_BUT_NO_JOB_QUEUED";

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  diagnosis,
  endpoint: {
    id: ENDPOINT_ID,
    name: ENDPOINT_NAME,
    compute_type: text(endpoint.computeType) || null,
    workers_min: workersMin,
    workers_max: workersMax,
    scaler_type: scalerType || null,
    scaler_value: scalerValue,
    gpu_count: gpuCount,
    gpu_type_ids: gpuTypes,
    data_center_ids: unique(list(endpoint.dataCenterIds)),
    primary_network_volume_id: text(endpoint.networkVolumeId) || null,
    network_volume_ids: volumeIds,
    effective_data_center_ids: effectiveDcs,
    allowed_cuda_versions: unique(list(endpoint.allowedCudaVersions)),
    min_cuda_version: text(endpoint.minCudaVersion) || null,
    flashboot: endpoint.flashboot ?? endpoint.flashBoot ?? null,
    idle_timeout_seconds: finite(endpoint.idleTimeout, null),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout, null),
  },
  template: {
    id: templateId || null,
    name: text(template.name) || null,
    image_name: text(template.imageName) || null,
    is_serverless: template.isServerless === true,
    container_disk_gb: diskGb,
    volume_mount_path: text(template.volumeMountPath) || null,
    docker_entrypoint: list(template.dockerEntrypoint),
    docker_start_cmd: list(template.dockerStartCmd),
  },
  attached_network_volumes: attached,
  queue: { credential_source: credential.source, ...health },
  management_workers: managementWorkers,
  capacity_query: { gpu_count: gpuCount, min_disk_gb: diskGb, min_memory_gb: 80, secure_cloud: true },
  capacity_by_datacenter_and_gpu: rows,
  schedulable_capacity: schedulable,
  high_or_medium_capacity: preferred,
  configuration_blockers: configBlockers,
  expected_handoff: {
    workers_max_one_means: "ALLOW_UP_TO_ONE_WORKER",
    queue_job_should_trigger_autoscaler: true,
    queue_delay_threshold_seconds: scalerType === "QUEUE_DELAY" ? scalerValue : null,
  },
  endpoint_mutation_performed: false,
  queue_mutation_performed: false,
  generation_submitted: false,
  gpu_compute_requested: false,
  secrets_printed: false,
}, null, 2));
console.log(`AVANTIQO_VIDEO_V41_DIAGNOSIS=${diagnosis}`);
