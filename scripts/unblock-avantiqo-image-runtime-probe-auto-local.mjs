const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const EXPECTED_PROBE_CONTRACT = "AVANTIQO_IMAGE_RUNTIME_PROBE_V1";
const POLL_MS = 10_000;
const DEFAULT_WAIT_MS = 30 * 60 * 1000;

const ORIGINAL_GPU_TYPES = [
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
];

// Temporary capacity fallbacks only. All have at least 80 GB VRAM, so
// broadening the pool cannot silently route an unrelated Image request onto a
// small-memory worker while the existing zero-generation probe is finishing.
const SAFE_FALLBACK_GPU_TYPES = [
  "NVIDIA B200",
  "NVIDIA H200",
  "NVIDIA H200 NVL",
  "NVIDIA H100 80GB HBM3",
  "NVIDIA H100 PCIe",
  "NVIDIA H100 NVL",
  "NVIDIA A100-SXM4-80GB",
  "NVIDIA A100 80GB PCIe",
];

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function recognizedRepairPool(gpuTypes) {
  return (
    ORIGINAL_GPU_TYPES.every((gpu, index) => gpuTypes[index] === gpu) &&
    gpuTypes
      .slice(ORIGINAL_GPU_TYPES.length)
      .every((gpu) => SAFE_FALLBACK_GPU_TYPES.includes(gpu))
  );
}

function required(name, code = `${name}_REQUIRED`) {
  const value = text(process.env[name]);
  if (!value) throw new Error(code);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jobIdFromArgs() {
  const arg = process.argv.find((value) => value.startsWith("--job-id="));
  return text(arg ? arg.slice("--job-id=".length) : process.env.AVANTIQO_IMAGE_RUNTIME_PROBE_JOB_ID);
}

async function rest(path, credential, options = {}) {
  const response = await fetch(`${REST_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1200);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function queue(endpointId, jobId, credential) {
  const response = await fetch(
    `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`,
    {
      headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    },
  );
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.error || body?.message || raw).slice(0, 1200);
    throw new Error(`RUNPOD_QUEUE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function health(endpointId, credential) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.error || body?.message || raw).slice(0, 1200);
    throw new Error(`RUNPOD_HEALTH_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

function safeHealth(body = {}) {
  const jobs = body?.jobs || {};
  const workers = body?.workers || {};
  return {
    jobs: {
      completed: finite(jobs.completed, 0),
      failed: finite(jobs.failed, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      retried: finite(jobs.retried, 0),
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

function validateProbeOutput(output = {}) {
  return (
    text(output.probe_contract) === EXPECTED_PROBE_CONTRACT &&
    text(output.operation) === "runtime_probe" &&
    output.generation_requested === false &&
    output.inference_performed === false &&
    output.model_download_performed === false &&
    output.storage_upload_performed === false &&
    output.storage_mutation_performed === false &&
    output.generation_pipeline_loaded_by_probe === false
  );
}

const jobId = jobIdFromArgs();
if (!jobId) {
  throw new Error("AVANTIQO_IMAGE_RUNTIME_PROBE_JOB_ID_REQUIRED_USE_--job-id=<existing-job-id>");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const waitMs = Math.max(
  POLL_MS,
  finite(process.env.AVANTIQO_IMAGE_RUNTIME_PROBE_UNBLOCK_WAIT_MS, DEFAULT_WAIT_MS),
);

console.log("AVANTIQO_IMAGE_RUNTIME_PROBE_UNBLOCK_EXISTING_JOB_ONLY=true");
console.log("AVANTIQO_IMAGE_RUNTIME_PROBE_UNBLOCK_NEW_JOB_SUBMITTED=false");
console.log("AVANTIQO_IMAGE_RUNTIME_PROBE_UNBLOCK_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_IMAGE_RUNTIME_PROBE_UNBLOCK_MODEL_DOWNLOAD_REQUESTED=false");
console.log("AVANTIQO_IMAGE_RUNTIME_PROBE_UNBLOCK_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_RUNTIME_PROBE_UNBLOCK_STORAGE_MUTATION=false");
console.log(`AVANTIQO_IMAGE_RUNTIME_PROBE_UNBLOCK_JOB=${jobId}`);

const endpoints = await rest(
  "/endpoints?includeTemplate=false&includeWorkers=false",
  managementKey,
);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
const matches = endpoints.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
if (matches.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_RUNTIME_PROBE_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
}
const endpointId = text(matches[0]?.id);
if (!endpointId) throw new Error("AVANTIQO_IMAGE_RUNTIME_PROBE_ENDPOINT_ID_MISSING");

let endpoint = await rest(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
if (text(endpoint?.name) !== IMAGE_ENDPOINT_NAME) {
  throw new Error("AVANTIQO_IMAGE_RUNTIME_PROBE_ENDPOINT_NAME_MISMATCH");
}

const currentGpuTypes = list(endpoint?.gpuTypeIds).map(text).filter(Boolean);
if (!sameArray(currentGpuTypes, ORIGINAL_GPU_TYPES) && !recognizedRepairPool(currentGpuTypes)) {
  throw new Error(
    `AVANTIQO_IMAGE_RUNTIME_PROBE_CONCURRENT_GPU_CONFIGURATION_CHANGE:${currentGpuTypes.join("|")}`,
  );
}

const originalWorkersMin = finite(endpoint?.workersMin);
const originalWorkersMax = finite(endpoint?.workersMax);
if (originalWorkersMin !== 0 || originalWorkersMax !== 1) {
  throw new Error(
    `AVANTIQO_IMAGE_RUNTIME_PROBE_SCALING_CHANGED:workersMin=${originalWorkersMin}:workersMax=${originalWorkersMax}`,
  );
}

let job = await queue(endpointId, jobId, inferenceKey);
let status = text(job?.status).toUpperCase();
let poolWidened = !sameArray(currentGpuTypes, ORIGINAL_GPU_TYPES);

async function restoreOriginalPool() {
  if (!poolWidened) return false;
  const live = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
  );
  const liveGpuTypes = list(live?.gpuTypeIds).map(text).filter(Boolean);
  if (!recognizedRepairPool(liveGpuTypes)) {
    throw new Error(
      `AVANTIQO_IMAGE_RUNTIME_PROBE_RESTORE_BLOCKED_BY_CONCURRENT_GPU_CHANGE:${liveGpuTypes.join("|")}`,
    );
  }
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { gpuTypeIds: ORIGINAL_GPU_TYPES },
  });
  const verified = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=false`,
    managementKey,
  );
  const verifiedGpuTypes = list(verified?.gpuTypeIds).map(text).filter(Boolean);
  if (!sameArray(verifiedGpuTypes, ORIGINAL_GPU_TYPES)) {
    throw new Error("AVANTIQO_IMAGE_RUNTIME_PROBE_GPU_POOL_RESTORE_VERIFY_FAILED");
  }
  poolWidened = false;
  return true;
}

if (status === "IN_QUEUE" && !poolWidened) {
  const widenedGpuTypes = [...ORIGINAL_GPU_TYPES, ...SAFE_FALLBACK_GPU_TYPES];
  // Refetch immediately before the only write so unrelated endpoint changes
  // cannot be overwritten.
  endpoint = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
  );
  const liveGpuTypes = list(endpoint?.gpuTypeIds).map(text).filter(Boolean);
  if (!sameArray(liveGpuTypes, ORIGINAL_GPU_TYPES)) {
    throw new Error(
      `AVANTIQO_IMAGE_RUNTIME_PROBE_GPU_POOL_CHANGED_BEFORE_WRITE:${liveGpuTypes.join("|")}`,
    );
  }
  if (finite(endpoint?.workersMin) !== 0 || finite(endpoint?.workersMax) !== 1) {
    throw new Error("AVANTIQO_IMAGE_RUNTIME_PROBE_SCALING_CHANGED_BEFORE_WRITE");
  }
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { gpuTypeIds: widenedGpuTypes },
  });
  poolWidened = true;
  console.log("AVANTIQO_IMAGE_RUNTIME_PROBE_GPU_POOL_TEMPORARILY_WIDENED=true");
}

const deadline = Date.now() + waitMs;
while (!["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
  const endpointHealth = await health(endpointId, inferenceKey);
  console.log(
    `AVANTIQO_IMAGE_RUNTIME_PROBE_UNBLOCK_PROGRESS status=${status || "UNKNOWN"} health=${JSON.stringify(safeHealth(endpointHealth))}`,
  );
  if (Date.now() >= deadline) {
    await restoreOriginalPool();
    throw new Error(`AVANTIQO_IMAGE_RUNTIME_PROBE_UNBLOCK_WAIT_TIMEOUT:${jobId}`);
  }
  await sleep(POLL_MS);
  job = await queue(endpointId, jobId, inferenceKey);
  status = text(job?.status).toUpperCase();
}

const restored = await restoreOriginalPool();
console.log(`AVANTIQO_IMAGE_RUNTIME_PROBE_GPU_POOL_RESTORED=${restored || !poolWidened ? "YES" : "NO"}`);

if (status !== "COMPLETED") {
  throw new Error(
    `AVANTIQO_IMAGE_RUNTIME_PROBE_EXISTING_JOB_${status}:${text(job?.error || job?.output?.error)}`,
  );
}

const output = job?.output || {};
const safe = validateProbeOutput(output);
console.log(`AVANTIQO_IMAGE_RUNTIME_PROBE_SAFE=${safe ? "YES" : "NO"}`);
console.log(`AVANTIQO_IMAGE_RUNTIME_ENTRYPOINT=${text(output.entrypoint) || "UNKNOWN"}`);
console.log(`AVANTIQO_IMAGE_RUNTIME_ENTRYPOINT_REVISION=${text(output.entrypoint_revision) || "UNKNOWN"}`);
console.log(`AVANTIQO_IMAGE_RUNTIME_REVISION=${text(output.runtime_revision) || "UNKNOWN"}`);
console.log(`AVANTIQO_IMAGE_2512_CACHE_READY=${output?.quality_cache?.cache_ready === true ? "YES" : "NO"}`);
console.log(
  `AVANTIQO_IMAGE_2512_CACHE_MISSING_FILES=${Number(output?.quality_cache?.missing_required_file_count) || 0}`,
);
console.log(JSON.stringify(output, null, 2));
if (!safe) process.exitCode = 2;
