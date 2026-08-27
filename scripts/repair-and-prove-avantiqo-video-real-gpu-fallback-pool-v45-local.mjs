import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_VIDEO_REAL_GPU_FALLBACK_POOL_V45";
const APPROVAL_ENV = "AVANTIQO_VIDEO_REAL_GPU_FALLBACK_POOL_V45_APPROVED";
const SAFE_LEASE = "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const LANE = "cinema";
const ENDPOINT_ID = "r0bzqq9zoi92h7";
const ENDPOINT_NAME = "avantiqo-cinema-v1";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GQL = "https://api.runpod.io/graphql";
const OLD_POOL = [
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
];
const TARGET_POOL = [
  "NVIDIA B200",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA A100 80GB PCIe",
];
const REQUIRED_CUDA = ["12.8", "12.9", "13.0"];
const REQUIRED_VOLUMES = ["7pcdebhpga", "t4erb6kxi1"];
const REQUIRED_DCS = ["US-NC-2", "EU-RO-1"];
const MIN_MEMORY_GB = 80;
const ALLOCATION_LIMIT_MS = 40_000;
const COMPLETION_LIMIT_MS = 120_000;
const POLL_MS = 2_000;
const LEASE_TTL_MS = 240_000;

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];
const sorted = (values) => [...unique(values)].sort();
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function sameSet(a, b) {
  const left = sorted(a);
  const right = sorted(b);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function sameOrder(a, b) {
  const left = list(a).map(text).filter(Boolean);
  const right = list(b).map(text).filter(Boolean);
  return left.length === right.length && left.every((value, index) => value === right[index]);
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
  }), "AVANTIQO_VIDEO_V45_REST");
}
async function queue(pathname, key, options = {}) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(ENDPOINT_ID)}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  }), "AVANTIQO_VIDEO_V45_QUEUE");
}
async function graphql(query, variables, key) {
  const body = await readJson(await fetch(`${GQL}?api_key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_V45_GRAPHQL");
  if (list(body.errors).length) throw new Error(`AVANTIQO_VIDEO_V45_GRAPHQL_ERROR:${redact(list(body.errors).map((e) => e?.message).filter(Boolean).join(" | ")).slice(0, 900)}`);
  return body.data || {};
}
async function queueCredential(managementKey) {
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
  throw new Error("AVANTIQO_VIDEO_V45_QUEUE_CREDENTIAL_NOT_FOUND");
}
function endpointVolumes(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
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
function activeManagementWorkers(endpoint = {}) {
  return list(endpoint.workers).filter((worker) => {
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    const effective = desired || status;
    return effective && !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(effective);
  }).map((worker) => ({
    desired_status: text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase() || null,
    status: text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase() || null,
    gpu_type_id: text(worker?.gpuTypeId || worker?.gpu?.displayName || worker?.machine?.gpuDisplayName) || null,
    data_center_id: text(worker?.dataCenterId || worker?.machine?.dataCenterId) || null,
    cost_per_hr: finite(worker?.adjustedCostPerHr ?? worker?.costPerHr, null),
  }));
}
async function cancel(jobId, key, reason) {
  if (!jobId) return { attempted: false, reason };
  try {
    const result = await queue(`/cancel/${encodeURIComponent(jobId)}`, key, { method: "POST" });
    return { attempted: true, success: true, reason, result_status: text(result?.status) || null };
  } catch (error) {
    return { attempted: true, success: false, reason, error: redact(error?.message || error).slice(0, 500) };
  }
}
async function assertLiveTargetCapacity(managementKey) {
  const query = `
    query AvantiqoVideoV45($input: GpuAvailabilityInput) {
      gpuTypes { id displayName memoryInGb secureCloud communityCloud }
      dataCenters {
        id
        storageSupport
        gpuAvailability(input: $input) { available stockStatus gpuTypeId gpuTypeDisplayName displayName }
      }
    }
  `;
  const data = await graphql(query, { input: { gpuCount: 1, minDisk: 5, minMemoryInGb: MIN_MEMORY_GB, secureCloud: true } }, managementKey);
  const meta = new Map(list(data.gpuTypes).map((row) => [text(row.id), row]));
  const rows = [];
  for (const dcId of REQUIRED_DCS) {
    const dc = list(data.dataCenters).find((row) => text(row.id) === dcId) || {};
    const availability = new Map(list(dc.gpuAvailability).map((row) => [text(row.gpuTypeId), row]));
    for (const gpuTypeId of TARGET_POOL) {
      const a = availability.get(gpuTypeId) || {};
      const m = meta.get(gpuTypeId) || {};
      rows.push({
        data_center_id: dcId,
        gpu_type_id: gpuTypeId,
        memory_gb: finite(m.memoryInGb, null),
        secure_cloud_supported: m.secureCloud === true,
        available: a.available === true,
        stock_status: text(a.stockStatus).toUpperCase() || "NOT_LISTED",
      });
    }
  }
  const available = rows.filter((row) => row.available && row.secure_cloud_supported && row.memory_gb >= MIN_MEMORY_GB);
  for (const gpuTypeId of TARGET_POOL) {
    if (!available.some((row) => row.gpu_type_id === gpuTypeId)) {
      throw new Error(`AVANTIQO_VIDEO_V45_TARGET_GPU_NOT_CURRENTLY_VISIBLE:${gpuTypeId}`);
    }
  }
  return rows;
}

async function runLeased() {
  if (
    text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES" ||
    text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT ||
    text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== LANE ||
    text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID) !== ENDPOINT_ID
  ) throw new Error("AVANTIQO_VIDEO_V45_VALID_CINEMA_SAFE_LEASE_REQUIRED");

  const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
  const credential = await queueCredential(managementKey);
  const endpoint = await rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey);
  if (finite(endpoint.workersMin, -1) !== 0 || finite(endpoint.workersMax, -1) !== 1) throw new Error(`AVANTIQO_VIDEO_V45_SAFE_LEASE_CAPACITY_REQUIRED:${finite(endpoint.workersMin)}/${finite(endpoint.workersMax)}`);
  if (!sameOrder(list(endpoint.gpuTypeIds), TARGET_POOL)) throw new Error(`AVANTIQO_VIDEO_V45_TARGET_GPU_PRIORITY_ORDER_LOST:${JSON.stringify(list(endpoint.gpuTypeIds))}`);
  if (!sameSet(list(endpoint.allowedCudaVersions), REQUIRED_CUDA)) throw new Error("AVANTIQO_VIDEO_V45_CUDA_CONTRACT_CHANGED");
  if (!sameSet(endpointVolumes(endpoint), REQUIRED_VOLUMES)) throw new Error("AVANTIQO_VIDEO_V45_VOLUME_CONTRACT_CHANGED");

  let submitted = null;
  let attempt = 0;
  const submitDeadline = Date.now() + 20_000;
  while (!submitted) {
    attempt += 1;
    try {
      submitted = await queue("/run", credential.key, { method: "POST", body: { input: { operation: "runtime_probe" } } });
    } catch (error) {
      const message = redact(error?.message || error);
      if (!/HTTP_409/i.test(message) || !/Endpoint is paused/i.test(message) || !/max_workers=0/i.test(message)) throw error;
      if (Date.now() >= submitDeadline) throw new Error(`AVANTIQO_VIDEO_V45_QUEUE_PROPAGATION_TIMEOUT:${attempt}:${message}`);
      console.log(`AVANTIQO_VIDEO_V45_QUEUE_PROPAGATION_WAIT=${JSON.stringify({ attempt, retry_in_ms: 1000 })}`);
      await sleep(1_000);
    }
  }
  const jobId = text(submitted.id || submitted.jobId || submitted.job_id);
  if (!jobId) throw new Error("AVANTIQO_VIDEO_V45_JOB_ID_REQUIRED");
  console.log(`AVANTIQO_VIDEO_V45_RUNTIME_PROBE_ACCEPTED=${JSON.stringify({ job_id: jobId, submit_attempts: attempt, gpu_priority_pool: TARGET_POOL })}`);

  const started = Date.now();
  let allocation = null;
  let lastStatus = null;
  let lastHealth = null;
  let lastWorkers = [];
  while (Date.now() - started < ALLOCATION_LIMIT_MS) {
    const [statusRaw, healthRaw, endpointRaw] = await Promise.all([
      queue(`/status/${encodeURIComponent(jobId)}`, credential.key),
      queue("/health", credential.key),
      rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey),
    ]);
    lastStatus = text(statusRaw?.status).toUpperCase();
    lastHealth = healthSummary(healthRaw);
    lastWorkers = activeManagementWorkers(endpointRaw);
    const elapsedSeconds = Math.floor((Date.now() - started) / 1000);
    console.log(`AVANTIQO_VIDEO_V45_ALLOCATION_PROGRESS=${JSON.stringify({ elapsed_seconds: elapsedSeconds, status: lastStatus, health: lastHealth, management_workers: lastWorkers })}`);
    if (lastHealth.worker_total > 0 || lastWorkers.length > 0 || lastStatus === "IN_PROGRESS" || lastStatus === "COMPLETED") {
      allocation = { elapsed_seconds: elapsedSeconds, status: lastStatus, health: lastHealth, management_workers: lastWorkers };
      break;
    }
    if (["FAILED", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(lastStatus)) {
      throw new Error(`AVANTIQO_VIDEO_V45_TERMINAL_BEFORE_ALLOCATION:${lastStatus}:${redact(statusRaw?.error || statusRaw?.output || statusRaw?.message).slice(0, 700)}`);
    }
    await sleep(POLL_MS);
  }

  if (!allocation) {
    const cancelled = await cancel(jobId, credential.key, "NO_WORKER_WITH_REAL_GPU_FALLBACK_POOL");
    throw new Error(`AVANTIQO_VIDEO_V45_NO_WORKER_WITH_REAL_GPU_FALLBACK_POOL:${JSON.stringify({ last_status: lastStatus, last_health: lastHealth, management_workers: lastWorkers, cancelled })}`);
  }
  console.log(`AVANTIQO_VIDEO_V45_WORKER_ALLOCATED=${JSON.stringify(allocation)}`);

  const completionStarted = Date.now();
  let finalStatus = allocation.status;
  let finalBody = null;
  while (Date.now() - completionStarted < COMPLETION_LIMIT_MS) {
    finalBody = await queue(`/status/${encodeURIComponent(jobId)}`, credential.key);
    finalStatus = text(finalBody?.status).toUpperCase();
    if (finalStatus === "COMPLETED") break;
    if (["FAILED", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(finalStatus)) {
      throw new Error(`AVANTIQO_VIDEO_V45_RUNTIME_PROBE_TERMINAL_${finalStatus}:${redact(finalBody?.error || finalBody?.output || finalBody?.message).slice(0, 900)}`);
    }
    await sleep(POLL_MS);
  }
  if (finalStatus !== "COMPLETED") {
    const cancelled = await cancel(jobId, credential.key, "WORKER_ALLOCATED_BUT_RUNTIME_PROBE_COMPLETION_TIMEOUT");
    throw new Error(`AVANTIQO_VIDEO_V45_RUNTIME_PROBE_COMPLETION_TIMEOUT:${JSON.stringify({ final_status: finalStatus, cancelled })}`);
  }

  const output = finalBody?.output || {};
  if (text(output?.probe_contract) !== "AVANTIQO_VIDEO_RUNTIME_PROBE_V1") throw new Error(`AVANTIQO_VIDEO_V45_RUNTIME_PROBE_CONTRACT_INVALID:${text(output?.probe_contract) || "NONE"}`);
  if (output?.generation_requested !== false || output?.inference_performed !== false || output?.model_download_performed !== false || output?.storage_mutation_performed !== false) {
    throw new Error(`AVANTIQO_VIDEO_V45_RUNTIME_PROBE_SIDE_EFFECT_CONTRACT_INVALID:${JSON.stringify({ generation_requested: output?.generation_requested, inference_performed: output?.inference_performed, model_download_performed: output?.model_download_performed, storage_mutation_performed: output?.storage_mutation_performed })}`);
  }

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    endpoint_id: ENDPOINT_ID,
    worker_allocation_proven: true,
    runtime_probe_completed: true,
    job_id: jobId,
    gpu_priority_pool: TARGET_POOL,
    allocation,
    runtime_probe: {
      probe_contract: text(output.probe_contract),
      entrypoint: text(output.entrypoint) || null,
      entrypoint_revision: text(output.entrypoint_revision) || null,
      runtime_revision: text(output.runtime_revision) || null,
      generation_requested: output.generation_requested,
      inference_performed: output.inference_performed,
      model_download_performed: output.model_download_performed,
      storage_mutation_performed: output.storage_mutation_performed,
    },
    generation_submitted: false,
    direct_workers_max_write: false,
    image_endpoint_mutation: false,
    secrets_printed: false,
  }, null, 2));
  console.log("AVANTIQO_VIDEO_REAL_GPU_FALLBACK_POOL_V45_CHILD=PASS");
}

const major = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(major) || major < 20) throw new Error(`AVANTIQO_VIDEO_V45_NODE20_REQUIRED:${process.version}`);
const apply = process.argv.includes("--apply");
const leased = process.argv.includes("--leased");
if (apply && !approved(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);

if (!apply) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: "PLAN",
    endpoint_id: ENDPOINT_ID,
    endpoint_name: ENDPOINT_NAME,
    old_gpu_pool: OLD_POOL,
    target_gpu_priority_pool: TARGET_POOL,
    required_cuda_versions: REQUIRED_CUDA,
    required_network_volume_ids: REQUIRED_VOLUMES,
    allocation_limit_ms: ALLOCATION_LIMIT_MS,
    runtime_probe_completion_limit_ms: COMPLETION_LIMIT_MS,
    runtime_probe_only: true,
    generation_submitted: false,
    image_endpoint_mutation: false,
    secrets_printed: false,
  }, null, 2));
  console.log("AVANTIQO_VIDEO_REAL_GPU_FALLBACK_POOL_V45_APPLIED=false");
  process.exit(0);
}

if (leased) {
  await runLeased();
  process.exit(0);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const credential = await queueCredential(managementKey);
const before = await rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey);
const beforeHealth = healthSummary(await queue("/health", credential.key));
if (text(before.id) !== ENDPOINT_ID || text(before.name) !== ENDPOINT_NAME) throw new Error("AVANTIQO_VIDEO_V45_ENDPOINT_ID_NAME_INVALID");
if (finite(before.workersMin, -1) !== 0 || finite(before.workersMax, -1) !== 0) throw new Error(`AVANTIQO_VIDEO_V45_CINEMA_NOT_RESTING_0_0:${finite(before.workersMin)}/${finite(before.workersMax)}`);
if (beforeHealth.jobs.in_queue !== 0 || beforeHealth.jobs.in_progress !== 0 || beforeHealth.worker_total !== 0) throw new Error(`AVANTIQO_VIDEO_V45_CINEMA_NOT_QUIESCENT:${JSON.stringify(beforeHealth)}`);
if (!sameSet(list(before.allowedCudaVersions), REQUIRED_CUDA)) throw new Error(`AVANTIQO_VIDEO_V45_CUDA_CONTRACT_REQUIRED:${JSON.stringify(list(before.allowedCudaVersions))}`);
if (!sameSet(endpointVolumes(before), REQUIRED_VOLUMES)) throw new Error(`AVANTIQO_VIDEO_V45_MULTI_REGION_VOLUMES_REQUIRED:${JSON.stringify(endpointVolumes(before))}`);
if (!sameSet(list(before.gpuTypeIds), OLD_POOL) && !sameSet(list(before.gpuTypeIds), TARGET_POOL)) throw new Error(`AVANTIQO_VIDEO_V45_UNEXPECTED_EXISTING_GPU_POOL:${JSON.stringify(list(before.gpuTypeIds))}`);

const liveCapacity = await assertLiveTargetCapacity(managementKey);
console.log(`AVANTIQO_VIDEO_V45_LIVE_TARGET_CAPACITY=${JSON.stringify(liveCapacity)}`);

if (!sameOrder(list(before.gpuTypeIds), TARGET_POOL)) {
  await rest(`/endpoints/${ENDPOINT_ID}`, managementKey, { method: "PATCH", body: { gpuTypeIds: TARGET_POOL } });
}
const afterPatch = await rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey);
if (!sameOrder(list(afterPatch.gpuTypeIds), TARGET_POOL)) throw new Error(`AVANTIQO_VIDEO_V45_GPU_PRIORITY_PATCH_VERIFY_FAILED:${JSON.stringify(list(afterPatch.gpuTypeIds))}`);
if (finite(afterPatch.workersMin, -1) !== 0 || finite(afterPatch.workersMax, -1) !== 0) throw new Error(`AVANTIQO_VIDEO_V45_PATCH_CHANGED_CAPACITY:${finite(afterPatch.workersMin)}/${finite(afterPatch.workersMax)}`);
if (!sameSet(list(afterPatch.allowedCudaVersions), REQUIRED_CUDA)) throw new Error("AVANTIQO_VIDEO_V45_PATCH_CHANGED_CUDA");
if (!sameSet(endpointVolumes(afterPatch), REQUIRED_VOLUMES)) throw new Error("AVANTIQO_VIDEO_V45_PATCH_CHANGED_VOLUMES");
console.log(`AVANTIQO_VIDEO_V45_REAL_GPU_POOL_ACTIVE=${JSON.stringify({ before: list(before.gpuTypeIds), after: list(afterPatch.gpuTypeIds), workers_min: finite(afterPatch.workersMin), workers_max: finite(afterPatch.workersMax) })}`);

const cinemaQueueKey = text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY) || text(process.env.RUNPOD_API_KEY) || managementKey;
const env = {
  ...process.env,
  AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED: "YES",
  AVANTIQO_RUNPOD_SAFE_LEASE_TARGET_QUEUE_API_KEY: cinemaQueueKey,
  AVANTIQO_RUNPOD_SAFE_LEASE_INERT_PEER_ISOLATION_LANE: LANE,
  AVANTIQO_RUNPOD_SAFE_LEASE_TARGET_AND_OPEN_HEALTH_LANE: LANE,
};
const child = spawnSync(
  process.execPath,
  [SAFE_LEASE, `--lane=${LANE}`, `--ttl-ms=${LEASE_TTL_MS}`, "--", process.execPath, process.argv[1], "--apply", "--leased"],
  { cwd: process.cwd(), env, stdio: "inherit" },
);
if (child.error) throw child.error;
if (child.status !== 0) {
  console.log(`AVANTIQO_VIDEO_V45_SAFE_LEASE_FAILED=exit=${child.status}`);
  process.exit(child.status || 3);
}

const finalEndpoint = await rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey);
const finalHealth = healthSummary(await queue("/health", credential.key));
if (!sameOrder(list(finalEndpoint.gpuTypeIds), TARGET_POOL)) throw new Error("AVANTIQO_VIDEO_V45_FINAL_GPU_PRIORITY_POOL_CHANGED");
if (finite(finalEndpoint.workersMin, -1) !== 0 || finite(finalEndpoint.workersMax, -1) !== 0) throw new Error(`AVANTIQO_VIDEO_V45_FINAL_NOT_RESTING_0_0:${finite(finalEndpoint.workersMin)}/${finite(finalEndpoint.workersMax)}`);
if (finalHealth.jobs.in_queue !== 0 || finalHealth.jobs.in_progress !== 0 || finalHealth.worker_total !== 0) throw new Error(`AVANTIQO_VIDEO_V45_FINAL_QUEUE_NOT_CLEAN:${JSON.stringify(finalHealth)}`);
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  endpoint_id: ENDPOINT_ID,
  final_gpu_priority_pool: list(finalEndpoint.gpuTypeIds),
  final_workers_min: finite(finalEndpoint.workersMin),
  final_workers_max: finite(finalEndpoint.workersMax),
  final_queue: finalHealth,
  production_gpu_pool_widened_to_real_schedulable_fallbacks: true,
  generation_submitted: false,
  image_endpoint_mutation: false,
  secrets_printed: false,
}, null, 2));
console.log("AVANTIQO_VIDEO_REAL_GPU_FALLBACK_POOL_V45=PASS");
