const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_SCHEDULING_ENVELOPE_REPAIR_V1";
const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const ENDPOINT_ID = "pnfgcl98sceh51";
const ENDPOINT_NAME = "avantiqo-intelligence-fast-v1";
const GPU_TYPE_IDS = Object.freeze([
  "NVIDIA B200",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA H200",
  "NVIDIA H100 80GB HBM3",
  "NVIDIA A100 80GB PCIe",
]);
const CUDA_VERSIONS = Object.freeze(["12.8", "12.9", "13.0"]);

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const terminal = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED", "FAILED"]);

function key(name, fallback = null) {
  const value = text(process.env[name] || (fallback ? process.env[fallback] : ""));
  if (!value) throw new Error(`${CONTRACT}_${name}_REQUIRED`);
  return value;
}

async function request(url, auth, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${auth}`,
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
    signal: AbortSignal.timeout(options.timeoutMs || 30000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = null; }
  if (!response.ok) {
    const error = new Error(`${CONTRACT}_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 500)}`);
    error.httpStatus = response.status;
    throw error;
  }
  return body ?? {};
}

const managementKey = key("RUNPOD_MANAGEMENT_API_KEY", "RUNPOD_API_KEY");
const queueKey = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_API_KEY || process.env.RUNPOD_API_KEY || process.env.RUNPOD_MANAGEMENT_API_KEY);
if (!queueKey) throw new Error(`${CONTRACT}_QUEUE_KEY_REQUIRED`);
const rest = (path, options = {}) => request(`${REST}${path}`, managementKey, options);
const queue = (path, options = {}) => request(`${QUEUE}/${ENDPOINT_ID}${path}`, queueKey, options);

function rows(value, keyName) {
  if (Array.isArray(value)) return value;
  return list(value?.[keyName] || value?.data || value?.items || value?.results);
}

function activeWorkers(endpoint = {}) {
  return list(endpoint.workers).filter((worker) => {
    if (worker?.isStale === true) return false;
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    if (status && !terminal.has(status)) return true;
    if (desired && !terminal.has(desired)) return true;
    return !status && !desired;
  });
}

function volumeIds(endpoint = {}) {
  return [...new Set([
    text(endpoint?.networkVolumeId ?? endpoint?.network_volume_id),
    ...list(endpoint?.networkVolumeIds ?? endpoint?.network_volume_ids).map((entry) =>
      text(typeof entry === "string" ? entry : entry?.networkVolumeId ?? entry?.network_volume_id ?? entry?.id),
    ),
  ].filter(Boolean))].sort();
}

function storageSignature(raw) {
  return rows(raw, "networkVolumes")
    .map((volume) => ({
      id: text(volume?.id),
      name: text(volume?.name),
      size: finite(volume?.size ?? volume?.sizeInGb ?? volume?.sizeGB, 0),
      data_center_id: text(volume?.dataCenterId ?? volume?.data_center_id),
    }))
    .filter((volume) => volume.id)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function queueCounts(health = {}) {
  return {
    queued: finite(health?.jobs?.inQueue ?? health?.jobs?.in_queue, 0),
    in_progress: finite(health?.jobs?.inProgress ?? health?.jobs?.in_progress, 0),
  };
}

function endpointSignature(endpoint = {}) {
  return {
    id: text(endpoint.id),
    name: text(endpoint.name),
    template_id: text(endpoint.templateId || endpoint.template?.id),
    workers_min: finite(endpoint.workersMin, -1),
    workers_max: finite(endpoint.workersMax, -1),
    data_center_ids: list(endpoint.dataCenterIds).map(text).filter(Boolean).sort(),
    network_volume_ids: volumeIds(endpoint),
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean).sort(),
    allowed_cuda_versions: list(endpoint.allowedCudaVersions).map(text).filter(Boolean).sort(),
  };
}

console.log(`${CONTRACT}_PRODUCTION_DEPLOY_PERFORMED=false`);
console.log(`${CONTRACT}_NEW_VOLUME_CREATED=false`);
console.log(`${CONTRACT}_MODEL_INFERENCE_PERFORMED=false`);

const [beforeEndpoint, beforeVolumes] = await Promise.all([
  rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`),
  rest("/networkvolumes"),
]);
const before = endpointSignature(beforeEndpoint);
const storageBefore = storageSignature(beforeVolumes);

if (before.id !== ENDPOINT_ID || before.name !== ENDPOINT_NAME) throw new Error(`${CONTRACT}_ENDPOINT_IDENTITY_MISMATCH`);
if (before.workers_min !== 0 || before.workers_max !== 0) throw new Error(`${CONTRACT}_ENDPOINT_NOT_PARKED`);
if (activeWorkers(beforeEndpoint).length !== 0) throw new Error(`${CONTRACT}_ACTIVE_WORKER_PRESENT`);
if (before.network_volume_ids.length !== 0) throw new Error(`${CONTRACT}_UNEXPECTED_FAST_STORAGE:${before.network_volume_ids.join(",")}`);

let health = await queue("/health", { timeoutMs: 20000 });
let counts = queueCounts(health);
if (counts.in_progress > 0) throw new Error(`${CONTRACT}_JOB_IN_PROGRESS:${counts.in_progress}`);
if (counts.queued > 0) {
  await queue("/purge-queue", { method: "POST", timeoutMs: 30000 });
  health = await queue("/health", { timeoutMs: 20000 });
  counts = queueCounts(health);
  if (counts.queued !== 0 || counts.in_progress !== 0) {
    throw new Error(`${CONTRACT}_STALE_QUEUE_PURGE_FAILED:${counts.queued}:${counts.in_progress}`);
  }
  console.log(`${CONTRACT}_STALE_QUEUE_PURGED=true`);
} else {
  console.log(`${CONTRACT}_STALE_QUEUE_PURGED=false`);
}

await rest(`/endpoints/${ENDPOINT_ID}/update`, {
  method: "POST",
  body: {
    workersMin: 0,
    workersMax: 0,
    gpuTypeIds: GPU_TYPE_IDS,
    allowedCudaVersions: CUDA_VERSIONS,
  },
});

const [afterEndpoint, afterVolumes] = await Promise.all([
  rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`),
  rest("/networkvolumes"),
]);
const after = endpointSignature(afterEndpoint);
const storageAfter = storageSignature(afterVolumes);
const afterHealth = queueCounts(await queue("/health", { timeoutMs: 20000 }));

if (after.id !== before.id || after.name !== before.name || after.template_id !== before.template_id) {
  throw new Error(`${CONTRACT}_ENDPOINT_OR_TEMPLATE_CHANGED`);
}
if (after.workers_min !== 0 || after.workers_max !== 0 || activeWorkers(afterEndpoint).length !== 0) {
  throw new Error(`${CONTRACT}_REST_STATE_NOT_PRESERVED`);
}
if (afterHealth.queued !== 0 || afterHealth.in_progress !== 0) throw new Error(`${CONTRACT}_QUEUE_NOT_EMPTY_AFTER_REPAIR`);
if (JSON.stringify(after.network_volume_ids) !== JSON.stringify(before.network_volume_ids)) {
  throw new Error(`${CONTRACT}_ENDPOINT_STORAGE_CHANGED`);
}
if (JSON.stringify(after.data_center_ids) !== JSON.stringify(before.data_center_ids)) {
  throw new Error(`${CONTRACT}_DATACENTER_PIN_CHANGED`);
}
if (JSON.stringify(storageAfter) !== JSON.stringify(storageBefore)) throw new Error(`${CONTRACT}_NETWORK_VOLUME_SET_CHANGED`);
for (const gpu of GPU_TYPE_IDS) if (!after.gpu_type_ids.includes(gpu)) throw new Error(`${CONTRACT}_GPU_NOT_APPLIED:${gpu}`);
for (const cuda of CUDA_VERSIONS) if (!after.allowed_cuda_versions.includes(cuda)) throw new Error(`${CONTRACT}_CUDA_NOT_APPLIED:${cuda}`);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  endpoint_id: ENDPOINT_ID,
  endpoint_name: ENDPOINT_NAME,
  template_id: after.template_id,
  workers_min: after.workers_min,
  workers_max: after.workers_max,
  gpu_type_ids: after.gpu_type_ids,
  allowed_cuda_versions: after.allowed_cuda_versions,
  data_center_ids: after.data_center_ids,
  network_volume_ids: after.network_volume_ids,
  network_volume_count: storageAfter.length,
  queue: afterHealth,
  production_deploy_performed: false,
  new_volume_created: false,
  model_inference_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
