import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_VIDEO_WORKER_ALLOCATION_PROOF_V43";
const APPROVAL_ENV = "AVANTIQO_VIDEO_WORKER_ALLOCATION_PROOF_V43_APPROVED";
const SAFE_LEASE = "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const LANE = "cinema";
const ENDPOINT_ID = "r0bzqq9zoi92h7";
const ENDPOINT_NAME = "avantiqo-cinema-v1";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const REQUIRED_CUDA = ["12.8", "12.9", "13.0"];
const REQUIRED_VOLUMES = ["7pcdebhpga", "t4erb6kxi1"];
const REQUIRED_GPU_POOL = [
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
];
const SUBMIT_PROPAGATION_LIMIT_MS = 20_000;
const WORKER_ALLOCATION_LIMIT_MS = 30_000;
const POLL_MS = 2_000;
const LEASE_TTL_MS = 180_000;

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = (values) => [...new Set(values.map(text).filter(Boolean))].sort();
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sameSet(a, b) {
  const left = unique(a);
  const right = unique(b);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
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
async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw).slice(0, 900)}`);
  return body ?? {};
}
async function rest(pathname, key) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_V43_REST");
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
  }), "AVANTIQO_VIDEO_V43_QUEUE");
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
  throw new Error("AVANTIQO_VIDEO_V43_QUEUE_CREDENTIAL_NOT_FOUND");
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
function endpointVolumes(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
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

async function runLeased() {
  if (
    text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE).toUpperCase() !== "YES" ||
    text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT ||
    text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== LANE ||
    text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID) !== ENDPOINT_ID
  ) throw new Error("AVANTIQO_VIDEO_V43_VALID_CINEMA_SAFE_LEASE_REQUIRED");

  const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
  const credential = await queueCredential(managementKey);
  const initial = await rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey);
  if (text(initial.id) !== ENDPOINT_ID || text(initial.name) !== ENDPOINT_NAME) throw new Error("AVANTIQO_VIDEO_V43_ENDPOINT_ID_NAME_INVALID");
  if (finite(initial.workersMin, -1) !== 0 || finite(initial.workersMax, -1) !== 1) {
    throw new Error(`AVANTIQO_VIDEO_V43_SAFE_LEASE_CAPACITY_REQUIRED:${finite(initial.workersMin)}/${finite(initial.workersMax)}`);
  }
  if (!sameSet(list(initial.allowedCudaVersions), REQUIRED_CUDA)) {
    throw new Error(`AVANTIQO_VIDEO_V43_CUDA_ELIGIBILITY_NOT_REPAIRED:${unique(list(initial.allowedCudaVersions)).join("|")}`);
  }
  if (!sameSet(endpointVolumes(initial), REQUIRED_VOLUMES)) {
    throw new Error(`AVANTIQO_VIDEO_V43_MULTI_REGION_VOLUMES_REQUIRED:${endpointVolumes(initial).join("|")}`);
  }
  if (!sameSet(list(initial.gpuTypeIds), REQUIRED_GPU_POOL)) {
    throw new Error(`AVANTIQO_VIDEO_V43_BLACKWELL_POOL_CHANGED:${unique(list(initial.gpuTypeIds)).join("|")}`);
  }
  const initialHealth = healthSummary(await queue("/health", credential.key));
  if (initialHealth.jobs.in_queue !== 0 || initialHealth.jobs.in_progress !== 0 || initialHealth.worker_total !== 0) {
    throw new Error(`AVANTIQO_VIDEO_V43_CINEMA_NOT_CLEAN:${JSON.stringify(initialHealth)}`);
  }

  let submitted = null;
  let submitAttempt = 0;
  const submitDeadline = Date.now() + SUBMIT_PROPAGATION_LIMIT_MS;
  while (!submitted) {
    submitAttempt += 1;
    const control = await rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=false&includeWorkers=false`, managementKey);
    if (finite(control.workersMin, -1) !== 0 || finite(control.workersMax, -1) !== 1) {
      throw new Error(`AVANTIQO_VIDEO_V43_LEASE_STATE_LOST:${finite(control.workersMin)}/${finite(control.workersMax)}`);
    }
    try {
      submitted = await queue("/run", credential.key, { method: "POST", body: { input: { operation: "runtime_probe" } } });
    } catch (error) {
      const message = redact(error?.message || error);
      const retryable = /HTTP_409/i.test(message) && /Endpoint is paused/i.test(message) && /max_workers=0/i.test(message);
      if (!retryable) throw error;
      if (Date.now() >= submitDeadline) throw new Error(`AVANTIQO_VIDEO_V43_QUEUE_PROPAGATION_TIMEOUT:${submitAttempt}:${message}`);
      console.log(`AVANTIQO_VIDEO_V43_QUEUE_PROPAGATION_WAIT=${JSON.stringify({ attempt: submitAttempt, rest_workers_min: 0, rest_workers_max: 1, retry_in_ms: 1000 })}`);
      await sleep(1_000);
    }
  }

  const jobId = text(submitted.id || submitted.jobId || submitted.job_id);
  if (!jobId) throw new Error("AVANTIQO_VIDEO_V43_JOB_ID_REQUIRED");
  console.log(`AVANTIQO_VIDEO_V43_RUNTIME_PROBE_ACCEPTED=${JSON.stringify({ job_id: jobId, submit_attempts: submitAttempt, widened_cuda_versions: REQUIRED_CUDA })}`);

  const started = Date.now();
  let latestHealth = initialHealth;
  let latestManagement = [];
  let latestStatus = null;
  while (Date.now() - started < WORKER_ALLOCATION_LIMIT_MS) {
    const [statusRaw, healthRaw, endpointRaw] = await Promise.all([
      queue(`/status/${encodeURIComponent(jobId)}`, credential.key),
      queue("/health", credential.key),
      rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=false&includeWorkers=true`, managementKey),
    ]);
    latestStatus = text(statusRaw?.status).toUpperCase();
    latestHealth = healthSummary(healthRaw);
    latestManagement = activeManagementWorkers(endpointRaw);
    const elapsedSeconds = Math.floor((Date.now() - started) / 1000);
    console.log(`AVANTIQO_VIDEO_V43_PROGRESS=${JSON.stringify({ elapsed_seconds: elapsedSeconds, status: latestStatus, health: latestHealth, management_worker_count: latestManagement.length })}`);

    if (latestHealth.worker_total > 0 || latestManagement.length > 0 || latestStatus === "IN_PROGRESS") {
      const cancelled = await cancel(jobId, credential.key, "WORKER_ALLOCATION_PROVEN_STOP_BEFORE_RUNTIME_PROBE_COMPLETION");
      console.log(JSON.stringify({
        success: true,
        contract: CONTRACT,
        endpoint_id: ENDPOINT_ID,
        job_id: jobId,
        worker_allocation_proven: true,
        elapsed_seconds: elapsedSeconds,
        status_at_proof: latestStatus,
        queue_health_at_proof: latestHealth,
        management_workers_at_proof: latestManagement,
        widened_cuda_versions: REQUIRED_CUDA,
        cancel_after_allocation_proof: cancelled,
        runtime_probe_completion_required: false,
        generation_requested: false,
        inference_completion_requested: false,
        model_download_requested: false,
        endpoint_placement_mutation_performed: false,
        direct_workers_max_write: false,
        secrets_printed: false,
      }, null, 2));
      console.log("AVANTIQO_VIDEO_WORKER_ALLOCATION_PROOF_V43_CHILD=PASS");
      return;
    }
    if (latestStatus === "COMPLETED") {
      console.log(JSON.stringify({
        success: true,
        contract: CONTRACT,
        endpoint_id: ENDPOINT_ID,
        job_id: jobId,
        worker_allocation_proven: true,
        proof_basis: "RUNTIME_PROBE_COMPLETED_BEFORE_WORKER_POLL_CAPTURE",
        elapsed_seconds: elapsedSeconds,
        widened_cuda_versions: REQUIRED_CUDA,
        generation_requested: false,
        endpoint_placement_mutation_performed: false,
        direct_workers_max_write: false,
        secrets_printed: false,
      }, null, 2));
      console.log("AVANTIQO_VIDEO_WORKER_ALLOCATION_PROOF_V43_CHILD=PASS");
      return;
    }
    if (["FAILED", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(latestStatus)) {
      throw new Error(`AVANTIQO_VIDEO_V43_TERMINAL_BEFORE_WORKER_PROOF:${latestStatus}:${redact(statusRaw?.error || statusRaw?.output || statusRaw?.message).slice(0, 700)}`);
    }
    await sleep(POLL_MS);
  }

  const cancelled = await cancel(jobId, credential.key, "NO_WORKER_WITH_WIDENED_CUDA_30S");
  throw new Error(`AVANTIQO_VIDEO_V43_NO_WORKER_WITH_WIDENED_CUDA_30S:${JSON.stringify({ latest_status: latestStatus, latest_health: latestHealth, management_workers: latestManagement, cancelled })}`);
}

const major = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(major) || major < 20) throw new Error(`AVANTIQO_VIDEO_V43_NODE20_REQUIRED:${process.version}`);
const apply = process.argv.includes("--apply");
const leased = process.argv.includes("--leased");

if (!apply) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: "PLAN",
    endpoint_id: ENDPOINT_ID,
    safe_lease_contract: SAFE_LEASE_CONTRACT,
    safe_lease_lane: LANE,
    lease_ttl_ms: LEASE_TTL_MS,
    worker_allocation_limit_ms: WORKER_ALLOCATION_LIMIT_MS,
    queue_propagation_limit_ms: SUBMIT_PROPAGATION_LIMIT_MS,
    required_cuda_versions: REQUIRED_CUDA,
    required_network_volume_ids: REQUIRED_VOLUMES,
    required_gpu_pool: REQUIRED_GPU_POOL,
    operation: "runtime_probe",
    stop_immediately_after_worker_allocation_proof: true,
    generation_requested: false,
    endpoint_placement_mutation_performed: false,
    direct_workers_max_write: false,
    secrets_printed: false,
  }, null, 2));
  console.log("AVANTIQO_VIDEO_WORKER_ALLOCATION_PROOF_V43_APPLIED=false");
  process.exit(0);
}

if (!approved(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
if (leased) {
  await runLeased();
  process.exit(0);
}

const cinemaQueueKey = text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY) || text(process.env.RUNPOD_API_KEY) || text(process.env.RUNPOD_MANAGEMENT_API_KEY);
if (!cinemaQueueKey) throw new Error("AVANTIQO_VIDEO_V43_CINEMA_QUEUE_KEY_REQUIRED");
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
  console.log(`AVANTIQO_VIDEO_V43_SAFE_LEASE_FAILED=exit=${child.status}`);
  process.exit(child.status || 3);
}
console.log("AVANTIQO_VIDEO_WORKER_ALLOCATION_PROOF_V43=PASS");
