const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const TARGET_GPU_TYPES = [
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA H200",
  "NVIDIA B200",
];
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_PLACEMENT_REPAIR_V2";

const text = (v) => String(v ?? "").trim();
const list = (v) => Array.isArray(v) ? v : [];
const object = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const finite = (v, f = 0) => Number.isFinite(Number(v)) ? Number(v) : f;

function key() {
  const v = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
  if (!v) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return v;
}
function runtimeKey() {
  const v = text(process.env.RUNPOD_API_KEY || process.env.RUNPOD_MANAGEMENT_API_KEY);
  if (!v) throw new Error("RUNPOD_API_OR_MANAGEMENT_KEY_REQUIRED");
  return v;
}
async function req(url, credential, options = {}) {
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
    throw new Error(`${CONTRACT}_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0,500)}`);
  }
  return body;
}
function rows(v) {
  if (Array.isArray(v)) return v;
  for (const k of ["data","items","results","endpoints"]) if (Array.isArray(v?.[k])) return v[k];
  return [];
}
async function loadFast(mgmt, runtime) {
  const endpoints = rows(await req(`${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`, mgmt));
  const matches = endpoints.filter((e) => text(e?.name) === FAST_NAME);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_FAST_RESOLUTION:${matches.length}`);
  const endpoint = matches[0];
  const id = text(endpoint?.id);
  if (!id) throw new Error(`${CONTRACT}_FAST_ID_REQUIRED`);
  const health = await req(`${QUEUE_BASE}/${encodeURIComponent(id)}/health`, runtime);
  return { endpoint, id, health };
}
function snapshot(endpoint = {}) {
  return {
    template_id: text(endpoint?.templateId || endpoint?.template?.id) || null,
    workers_min: finite(endpoint?.workersMin, -1),
    workers_max: finite(endpoint?.workersMax, -1),
    gpu_count: finite(endpoint?.gpuCount, -1),
    data_center_ids: [...list(endpoint?.dataCenterIds)].map(text).filter(Boolean).sort(),
    network_volume_id: text(endpoint?.networkVolumeId) || null,
    network_volume_ids: [...list(endpoint?.networkVolumeIds)].map(text).filter(Boolean).sort(),
    allowed_cuda_versions: [...list(endpoint?.allowedCudaVersions)].map(text).filter(Boolean).sort(),
    min_cuda_version: text(endpoint?.minCudaVersion) || null,
    execution_timeout_ms: finite(endpoint?.executionTimeoutMs, -1),
    idle_timeout: finite(endpoint?.idleTimeout, -1),
    scaler_type: text(endpoint?.scalerType) || null,
    scaler_value: finite(endpoint?.scalerValue, -1),
    flashboot: endpoint?.flashboot === true,
  };
}
function healthState(h = {}) {
  const jobs = object(h?.jobs);
  const workers = object(h?.workers);
  return {
    queued: finite(jobs.inQueue ?? jobs.in_queue, 0),
    in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    initializing: finite(workers.initializing, 0),
    running: finite(workers.running, 0),
    ready: finite(workers.ready, 0),
    idle: finite(workers.idle, 0),
  };
}

if (text(process.env.AVANTIQO_INTELLIGENCE_FAST_PLACEMENT_REPAIR_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_INTELLIGENCE_FAST_PLACEMENT_REPAIR_APPROVED=YES_REQUIRED");
}
const mgmt = key();
const runtime = runtimeKey();
let live = await loadFast(mgmt, runtime);
const beforeState = healthState(live.health);
if (beforeState.in_progress > 0 || beforeState.initializing > 0 || beforeState.running > 0 || beforeState.ready > 0 || beforeState.idle > 0) {
  throw new Error(`${CONTRACT}_ACTIVE_FAST_WORK_BLOCKS_REPAIR:${JSON.stringify(beforeState)}`);
}
if (finite(live.endpoint?.workersMin, -1) !== 0 || finite(live.endpoint?.workersMax, -1) !== 0) {
  throw new Error(`${CONTRACT}_FAST_0_0_REQUIRED`);
}
const before = snapshot(live.endpoint);
if (before.network_volume_id || before.network_volume_ids.length) {
  throw new Error(`${CONTRACT}_FAST_NETWORK_VOLUME_FORBIDDEN`);
}
let queuePurged = false;
if (beforeState.queued > 0) {
  await req(`${QUEUE_BASE}/${encodeURIComponent(live.id)}/purge-queue`, runtime, { method: "POST" });
  queuePurged = true;
}
await req(`${REST_BASE}/endpoints/${encodeURIComponent(live.id)}`, mgmt, {
  method: "PATCH",
  body: { gpuTypeIds: TARGET_GPU_TYPES },
});
await new Promise((r) => setTimeout(r, 1500));
live = await loadFast(mgmt, runtime);
const after = snapshot(live.endpoint);
const afterGpu = list(live.endpoint?.gpuTypeIds).map(text).filter(Boolean);
if (JSON.stringify(afterGpu) !== JSON.stringify(TARGET_GPU_TYPES)) {
  throw new Error(`${CONTRACT}_GPU_PRIORITY_VERIFY_FAILED:${JSON.stringify(afterGpu)}`);
}
for (const field of Object.keys(before)) {
  if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
    throw new Error(`${CONTRACT}_INVARIANT_CHANGED:${field}:before=${JSON.stringify(before[field])}:after=${JSON.stringify(after[field])}`);
  }
}
const finalState = healthState(live.health);
if (finalState.queued !== 0 || finalState.in_progress !== 0 || finalState.initializing !== 0 || finalState.running !== 0) {
  throw new Error(`${CONTRACT}_FINAL_IDLE_VERIFY_FAILED:${JSON.stringify(finalState)}`);
}
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  endpoint: FAST_NAME,
  queue_purged: queuePurged,
  gpu_priority: TARGET_GPU_TYPES,
  workers_min: finite(live.endpoint?.workersMin, -1),
  workers_max: finite(live.endpoint?.workersMax, -1),
  data_centers_unrestricted: after.data_center_ids.length === 0,
  network_volume_attached: false,
  final_health: finalState,
  new_network_volume_created: false,
  model_inference_performed: false,
  production_deploy_performed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
