const CONTRACT = "AVANTIQO_VIDEO_CUDA_WORKER_ELIGIBILITY_REPAIR_V42";
const APPROVAL_ENV = "AVANTIQO_VIDEO_CUDA_WORKER_ELIGIBILITY_REPAIR_V42_APPROVED";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const ENDPOINT_ID = "r0bzqq9zoi92h7";
const ENDPOINT_NAME = "avantiqo-cinema-v1";
const SOURCE_VOLUME_ID = "7pcdebhpga";
const DESTINATION_VOLUME_ID = "t4erb6kxi1";
const TARGET_CUDA = ["12.8", "12.9", "13.0"];

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = (values) => [...new Set(values.map(text).filter(Boolean))].sort();
const yes = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function sameSet(left, right) {
  const a = unique(left);
  const b = unique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}
async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw).slice(0, 900)}`);
  return body ?? {};
}
async function rest(pathname, key, options = {}) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_V42_REST");
}
async function queue(endpointId, key) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_V42_QUEUE");
}
async function queueKey(endpointId, managementKey) {
  const candidates = [
    ["RUNPOD_AVANTIQO_VIDEO_API_KEY", text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY)],
    ["RUNPOD_API_KEY", text(process.env.RUNPOD_API_KEY)],
    ["RUNPOD_MANAGEMENT_API_KEY", managementKey],
  ];
  const seen = new Set();
  for (const [source, key] of candidates) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    try { await queue(endpointId, key); return { source, key }; } catch {}
  }
  throw new Error("AVANTIQO_VIDEO_V42_QUEUE_KEY_NOT_FOUND");
}
function healthSummary(body = {}) {
  const jobs = body.jobs || {};
  const workers = body.workers || {};
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
    worker_total: Object.values(wc).reduce((sum, value) => sum + value, 0),
  };
}
function volumes(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function stable(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    gpu_count: finite(endpoint.gpuCount, 1),
    gpu_type_ids: unique(list(endpoint.gpuTypeIds)),
    network_volume_ids: volumes(endpoint),
    primary_network_volume_id: text(endpoint.networkVolumeId) || null,
    allowed_cuda_versions: unique(list(endpoint.allowedCudaVersions)),
    min_cuda_version: text(endpoint.minCudaVersion) || null,
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout),
    flashboot: endpoint.flashboot ?? endpoint.flashBoot ?? null,
  };
}
function withoutCuda(value) {
  const copy = { ...value };
  delete copy.allowed_cuda_versions;
  return copy;
}

const major = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(major) || major < 20) throw new Error(`AVANTIQO_VIDEO_V42_NODE20_REQUIRED:${process.version}`);
const apply = process.argv.includes("--apply");
if (apply && !yes(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const credential = await queueKey(ENDPOINT_ID, managementKey);
const [beforeRaw, beforeQueueRaw] = await Promise.all([
  rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey),
  queue(ENDPOINT_ID, credential.key),
]);
const before = stable(beforeRaw);
const beforeQueue = healthSummary(beforeQueueRaw);

if (before.id !== ENDPOINT_ID || before.name !== ENDPOINT_NAME) throw new Error("AVANTIQO_VIDEO_V42_ENDPOINT_ID_NAME_INVALID");
if (before.workers_min !== 0 || before.workers_max !== 0) throw new Error(`AVANTIQO_VIDEO_V42_CINEMA_NOT_RESTING_0_0:${before.workers_min}/${before.workers_max}`);
if (beforeQueue.jobs.in_queue !== 0 || beforeQueue.jobs.in_progress !== 0 || beforeQueue.worker_total !== 0) throw new Error(`AVANTIQO_VIDEO_V42_CINEMA_NOT_QUIESCENT:${JSON.stringify(beforeQueue)}`);
if (!sameSet(before.network_volume_ids, [SOURCE_VOLUME_ID, DESTINATION_VOLUME_ID])) throw new Error(`AVANTIQO_VIDEO_V42_VOLUME_BINDING_CHANGED:${before.network_volume_ids.join("|")}`);
if (before.gpu_count !== 1 || before.gpu_type_ids.length === 0) throw new Error(`AVANTIQO_VIDEO_V42_GPU_CONTRACT_INVALID:${before.gpu_count}:${before.gpu_type_ids.join("|")}`);

const alreadyApplied = sameSet(before.allowed_cuda_versions, TARGET_CUDA);
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint_id: ENDPOINT_ID,
  endpoint_name: ENDPOINT_NAME,
  current_allowed_cuda_versions: before.allowed_cuda_versions,
  target_allowed_cuda_versions: TARGET_CUDA,
  repair_basis: "CUDA_12_8_CONTAINER_REQUIRES_12_8_OR_NEWER_HOST_COMPATIBILITY",
  workers_remain_0_0: true,
  gpu_pool_mutation: false,
  volume_mutation: false,
  template_mutation: false,
  serverless_job_submission: false,
  generation_submission: false,
  already_applied: alreadyApplied,
  queue_credential_source: credential.source,
  secrets_printed: false,
}, null, 2));

if (!apply) {
  console.log("AVANTIQO_VIDEO_CUDA_WORKER_ELIGIBILITY_REPAIR_V42_APPLIED=false");
  process.exit(0);
}

if (!alreadyApplied) {
  await rest(`/endpoints/${ENDPOINT_ID}`, managementKey, {
    method: "PATCH",
    body: { allowedCudaVersions: TARGET_CUDA },
  });
}

const [afterRaw, afterQueueRaw] = await Promise.all([
  rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey),
  queue(ENDPOINT_ID, credential.key),
]);
const after = stable(afterRaw);
const afterQueue = healthSummary(afterQueueRaw);

if (!sameSet(after.allowed_cuda_versions, TARGET_CUDA)) throw new Error(`AVANTIQO_VIDEO_V42_CUDA_VERIFY_FAILED:${after.allowed_cuda_versions.join("|")}`);
if (JSON.stringify(withoutCuda(after)) !== JSON.stringify(withoutCuda(before))) throw new Error(`AVANTIQO_VIDEO_V42_NON_CUDA_ENDPOINT_DRIFT:${JSON.stringify({ before: withoutCuda(before), after: withoutCuda(after) })}`);
if (after.workers_min !== 0 || after.workers_max !== 0) throw new Error(`AVANTIQO_VIDEO_V42_CAPACITY_CHANGED:${after.workers_min}/${after.workers_max}`);
if (afterQueue.jobs.in_queue !== 0 || afterQueue.jobs.in_progress !== 0 || afterQueue.worker_total !== 0) throw new Error(`AVANTIQO_VIDEO_V42_QUEUE_CHANGED:${JSON.stringify(afterQueue)}`);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  endpoint_id: ENDPOINT_ID,
  allowed_cuda_versions_before: before.allowed_cuda_versions,
  allowed_cuda_versions_after: after.allowed_cuda_versions,
  workers_min: after.workers_min,
  workers_max: after.workers_max,
  gpu_type_ids: after.gpu_type_ids,
  network_volume_ids: after.network_volume_ids,
  queue: afterQueue,
  endpoint_mutation_performed: !alreadyApplied,
  only_allowed_cuda_versions_changed: true,
  serverless_job_submission: false,
  generation_submission: false,
  gpu_compute_used: false,
  image_endpoint_mutation: false,
  secrets_printed: false,
}, null, 2));
console.log("AVANTIQO_VIDEO_CUDA_WORKER_ELIGIBILITY_REPAIR_V42=PASS");
