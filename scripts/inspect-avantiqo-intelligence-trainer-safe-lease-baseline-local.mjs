const CONTRACT = "AVANTIQO_INTELLIGENCE_TRAINER_SAFE_LEASE_BASELINE_INSPECTOR_V1";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const ENDPOINT_NAME = "avantiqo-intelligence-trainer-v1";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}
function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function redact(value) {
  return text(value, 1800)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}
function activeWorkers(endpoint = {}) {
  const terminal = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
  return list(endpoint.workers).filter((worker) => {
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus, 100).toUpperCase();
    const desired = text(worker?.desiredStatus ?? worker?.desired_status, 100).toUpperCase();
    if (status && !terminal.has(status)) return true;
    if (desired && !terminal.has(desired)) return true;
    return !status && !desired;
  });
}
function healthSummary(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
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
async function request(url, key) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw)}`);
  }
  return body ?? {};
}
async function queueRequest(url, keys) {
  const failures = [];
  for (const entry of keys) {
    if (!entry.key) continue;
    try {
      return { body: await request(url, entry.key), source: entry.source };
    } catch (error) {
      failures.push({ source: entry.source, error: redact(error?.message || error).slice(0, 300) });
    }
  }
  throw new Error(`QUEUE_HEALTH_UNREADABLE:${JSON.stringify(failures)}`);
}

const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY, 12000);
const endpointId = text(
  process.env.RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID ||
    process.env.RUNPOD_AVANTIQO_INTELLIGENCE_BENCHMARK_ENDPOINT_ID,
  240,
);
if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
if (!endpointId) throw new Error("RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID_REQUIRED");

const endpoint = await request(
  `${REST_BASE}/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
if (text(endpoint?.name, 300) !== ENDPOINT_NAME) {
  throw new Error(`TRAINER_ENDPOINT_NAME_MISMATCH:${text(endpoint?.name, 300) || "UNKNOWN"}`);
}

const queueKeys = [
  { source: "RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY", key: text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY, 12000) },
  { source: "RUNPOD_API_KEY", key: text(process.env.RUNPOD_API_KEY, 12000) },
  { source: "RUNPOD_MANAGEMENT_API_KEY", key: text(process.env.RUNPOD_MANAGEMENT_API_KEY, 12000) },
].filter((entry, index, all) => entry.key && all.findIndex((candidate) => candidate.key === entry.key) === index);
if (!queueKeys.length) throw new Error("RUNPOD_QUEUE_KEY_REQUIRED");

const queueResult = await queueRequest(
  `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`,
  queueKeys,
);
const health = healthSummary(queueResult.body);
const managementWorkers = activeWorkers(endpoint);
const queueWorkerCount = Object.values(health.workers).reduce((sum, value) => sum + Math.max(0, finite(value, 0)), 0);
const workersMin = finite(endpoint?.workersMin, null);
const workersMax = finite(endpoint?.workersMax, null);
const jobCount = health.jobs.in_queue + health.jobs.in_progress;
const activeWorkerCount = managementWorkers.length + queueWorkerCount;

let diagnosis = "NONCLEAN_STATE_REQUIRES_REVIEW";
let nextAction = "DO_NOT_ACQUIRE_SAFE_LEASE";
if (workersMin === 0 && workersMax === 0 && jobCount === 0 && activeWorkerCount === 0) {
  diagnosis = "CLEAN_REST_STATE";
  nextAction = "SAFE_TO_PLAN_BENCHMARK_V2_REBIND_OR_RETRY_SAFE_LEASE";
} else if (jobCount > 0 || health.jobs.in_progress > 0) {
  diagnosis = "LIVE_OR_QUEUED_WORK_PRESENT";
  nextAction = "DO_NOT_MUTATE_OR_RESUBMIT";
} else if (workersMin === 0 && workersMax > 0 && activeWorkerCount === 0) {
  diagnosis = "STALE_OPEN_CAPACITY_NO_ACTIVE_WORK";
  nextAction = "GOVERNED_CLOSE_TO_0_0_REQUIRED_BEFORE_REBIND";
} else if (workersMin === 0 && workersMax === 0 && activeWorkerCount > 0) {
  diagnosis = "WORKER_DRAINING_AFTER_CLOSE";
  nextAction = "WAIT_FOR_ZERO_ACTIVE_WORKERS_THEN_REINSPECT";
} else if (workersMin > 0) {
  diagnosis = "INVALID_PERMANENT_MIN_CAPACITY";
  nextAction = "GOVERNED_REPAIR_REQUIRED";
}

const template = object(endpoint?.template);
const env = object(template?.env);
const result = {
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  diagnosis,
  next_action: nextAction,
  endpoint: {
    id: endpointId,
    name: text(endpoint?.name, 300),
    workers_min: workersMin,
    workers_max: workersMax,
    active_management_workers: managementWorkers.length,
    queue_worker_count: queueWorkerCount,
    health,
    queue_health_credential_source: queueResult.source,
    clean_0_0: diagnosis === "CLEAN_REST_STATE",
  },
  template: {
    id: text(endpoint?.templateId || template?.id, 300) || null,
    name: text(template?.name, 500) || null,
    image_name: text(template?.imageName, 1400) || null,
    benchmark_enabled: text(env.AVANTIQO_INTELLIGENCE_BENCHMARK_ENABLED, 40) || null,
    trainer_enabled: text(env.AVANTIQO_INTELLIGENCE_TRAINER_ENABLED, 40) || null,
    volume_mount_path: text(template?.volumeMountPath, 500) || null,
  },
  safety: {
    endpoint_mutation_performed: false,
    worker_scaling_mutation_performed: false,
    queue_mutation_performed: false,
    provider_job_submitted: false,
    inference_performed: false,
    training_started: false,
    production_model_promoted: false,
    secrets_printed: false,
  },
};
console.log(JSON.stringify(result, null, 2));
console.log(`${CONTRACT}=PASS`);
