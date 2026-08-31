const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const TARGET_GPU_TYPES = [
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
  "NVIDIA H200",
  "NVIDIA B200",
  "NVIDIA H100 NVL",
  "NVIDIA H100 80GB HBM3",
  "NVIDIA H100 PCIe",
  "NVIDIA A100-SXM4-80GB",
  "NVIDIA A100 80GB PCIe",
];
const TARGET_CUDA_VERSIONS = ["12.8", "12.9", "13.0"];
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_GLOBAL_FALLBACK_V3";
const APPROVAL = "AVANTIQO_INTELLIGENCE_FAST_GLOBAL_FALLBACK_V3_APPROVED";

const text = (v) => String(v ?? "").trim();
const list = (v) => Array.isArray(v) ? v : [];
const object = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const finite = (v, f = 0) => Number.isFinite(Number(v)) ? Number(v) : f;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sortedUnique = (values) => [...new Set(values.map(text).filter(Boolean))].sort();

function managementKey() {
  const value = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
  if (!value) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return value;
}
function runtimeKey() {
  const value = text(process.env.RUNPOD_API_KEY || process.env.RUNPOD_MANAGEMENT_API_KEY);
  if (!value) throw new Error("RUNPOD_API_OR_MANAGEMENT_KEY_REQUIRED");
  return value;
}
async function request(url, credential, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = null; }
  if (!response.ok || body === null) {
    throw new Error(`${CONTRACT}_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 600)}`);
  }
  return body;
}
function rows(value) {
  if (Array.isArray(value)) return value;
  for (const key of ["data", "items", "results", "endpoints"]) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return [];
}
function healthState(health = {}) {
  const jobs = object(health.jobs);
  const workers = object(health.workers);
  return {
    queued: finite(jobs.inQueue ?? jobs.in_queue, 0),
    in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    initializing: finite(workers.initializing, 0),
    running: finite(workers.running, 0),
    ready: finite(workers.ready, 0),
    idle: finite(workers.idle, 0),
    throttled: finite(workers.throttled, 0),
    unhealthy: finite(workers.unhealthy, 0),
  };
}
function snapshot(endpoint = {}) {
  return {
    id: text(endpoint.id),
    name: text(endpoint.name),
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    workers_min: finite(endpoint.workersMin, -1),
    workers_max: finite(endpoint.workersMax, -1),
    gpu_count: finite(endpoint.gpuCount, -1),
    data_center_ids: list(endpoint.dataCenterIds).map(text).filter(Boolean).sort(),
    network_volume_id: text(endpoint.networkVolumeId) || null,
    network_volume_ids: list(endpoint.networkVolumeIds).map((entry) => text(typeof entry === "string" ? entry : entry?.networkVolumeId || entry?.id)).filter(Boolean).sort(),
    idle_timeout: finite(endpoint.idleTimeout, -1),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs, -1),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue, -1),
    flashboot: endpoint.flashboot === true,
  };
}
async function loadFast(mgmt, runtime) {
  const endpoints = rows(await request(`${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`, mgmt));
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === FAST_NAME);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_FAST_RESOLUTION:${matches.length}`);
  const endpoint = matches[0];
  const id = text(endpoint.id);
  if (!id) throw new Error(`${CONTRACT}_FAST_ID_REQUIRED`);
  const health = await request(`${QUEUE_BASE}/${encodeURIComponent(id)}/health`, runtime);
  return { endpoint, id, health };
}

if (text(process.env[APPROVAL]).toUpperCase() !== "YES") {
  throw new Error(`${APPROVAL}=YES_REQUIRED`);
}
const mgmt = managementKey();
const runtime = runtimeKey();
let live = await loadFast(mgmt, runtime);
const beforeHealth = healthState(live.health);
if (beforeHealth.in_progress || beforeHealth.initializing || beforeHealth.running || beforeHealth.ready || beforeHealth.idle || beforeHealth.throttled || beforeHealth.unhealthy) {
  throw new Error(`${CONTRACT}_ACTIVE_FAST_WORK_BLOCKS_REPAIR:${JSON.stringify(beforeHealth)}`);
}
if (finite(live.endpoint.workersMin, -1) !== 0 || finite(live.endpoint.workersMax, -1) !== 0) {
  throw new Error(`${CONTRACT}_FAST_0_0_REQUIRED`);
}
const before = snapshot(live.endpoint);
if (before.data_center_ids.length !== 0) throw new Error(`${CONTRACT}_REGION_RESTRICTION_FORBIDDEN:${JSON.stringify(before.data_center_ids)}`);
if (before.network_volume_id || before.network_volume_ids.length) throw new Error(`${CONTRACT}_NETWORK_VOLUME_FORBIDDEN`);
let queuePurged = false;
if (beforeHealth.queued > 0) {
  await request(`${QUEUE_BASE}/${encodeURIComponent(live.id)}/purge-queue`, runtime, { method: "POST", body: {} });
  queuePurged = true;
  await sleep(1000);
  live = await loadFast(mgmt, runtime);
  if (healthState(live.health).queued !== 0) throw new Error(`${CONTRACT}_QUEUE_PURGE_FAILED`);
}
await request(`${REST_BASE}/endpoints/${encodeURIComponent(live.id)}`, mgmt, {
  method: "PATCH",
  body: { gpuTypeIds: TARGET_GPU_TYPES, allowedCudaVersions: TARGET_CUDA_VERSIONS },
});
await sleep(1800);
live = await loadFast(mgmt, runtime);
const after = snapshot(live.endpoint);
const afterGpu = list(live.endpoint.gpuTypeIds).map(text).filter(Boolean);
const afterCuda = list(live.endpoint.allowedCudaVersions).map(text).filter(Boolean);
if (JSON.stringify(sortedUnique(afterGpu)) !== JSON.stringify(sortedUnique(TARGET_GPU_TYPES))) {
  throw new Error(`${CONTRACT}_GPU_POOL_VERIFY_FAILED:${JSON.stringify(afterGpu)}`);
}
if (JSON.stringify(sortedUnique(afterCuda)) !== JSON.stringify(sortedUnique(TARGET_CUDA_VERSIONS))) {
  throw new Error(`${CONTRACT}_CUDA_POOL_VERIFY_FAILED:${JSON.stringify(afterCuda)}`);
}
for (const field of Object.keys(before)) {
  if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
    throw new Error(`${CONTRACT}_INVARIANT_CHANGED:${field}:before=${JSON.stringify(before[field])}:after=${JSON.stringify(after[field])}`);
  }
}
const finalHealth = healthState(live.health);
if (Object.values(finalHealth).some((value) => value !== 0)) {
  throw new Error(`${CONTRACT}_FINAL_IDLE_VERIFY_FAILED:${JSON.stringify(finalHealth)}`);
}
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  endpoint_id: live.id,
  endpoint_name: FAST_NAME,
  queue_purged: queuePurged,
  configured_gpu_fallback_set: afterGpu,
  configured_cuda_versions: afterCuda,
  workers_min: finite(live.endpoint.workersMin, -1),
  workers_max: finite(live.endpoint.workersMax, -1),
  data_centers_unrestricted: after.data_center_ids.length === 0,
  network_volume_attached: false,
  flashboot: after.flashboot,
  final_health: finalHealth,
  model_inference_performed: false,
  new_network_volume_created: false,
  production_deploy_performed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
