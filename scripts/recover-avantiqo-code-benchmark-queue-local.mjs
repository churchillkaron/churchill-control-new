const API_BASE = "https://api.runpod.ai/v2";
const RUNPOD_REST_API = "https://rest.runpod.io/v1";
const EXPECTED_ENDPOINT_NAME = "avantiqo-code-v1";
const TERMINAL_JOB_STATUSES = new Set([
  "COMPLETED",
  "FAILED",
  "TIMED_OUT",
  "CANCELLED",
  "CANCELED",
]);
const POLL_MS = 3000;
const DEFAULT_SETTLE_TIMEOUT_MS = 15 * 60 * 1000;

function text(value) {
  return String(value ?? "").trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function headers(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

function settleTimeoutMs() {
  return Math.max(
    3 * 60 * 1000,
    Math.min(
      30 * 60 * 1000,
      number(process.env.AVANTIQO_CODE_BENCHMARK_RECOVERY_TIMEOUT_MS, DEFAULT_SETTLE_TIMEOUT_MS),
    ),
  );
}

async function request(endpointId, path, apiKey, method = "GET") {
  const response = await fetch(`${API_BASE}/${endpointId}${path}`, {
    method,
    headers: headers(apiKey),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`RUNPOD_${method}_${response.status}:${text(body?.error || body?.message || body?.status)}`);
  }
  return body;
}

async function resolveEndpointId() {
  const configured = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
  if (configured) {
    return {
      id: configured,
      name: null,
      source: "environment",
    };
  }

  const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
  const response = await fetch(`${RUNPOD_REST_API}/endpoints?includeTemplate=true`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error(`RUNPOD_ENDPOINT_DISCOVERY_HTTP_${response.status}`);
  }

  const endpoints = Array.isArray(body) ? body : Array.isArray(body?.endpoints) ? body.endpoints : [];
  const matches = endpoints.filter(
    (endpoint) => text(endpoint?.name).toLowerCase() === EXPECTED_ENDPOINT_NAME,
  );
  if (matches.length !== 1 || !text(matches[0]?.id)) {
    throw new Error(`RUNPOD_AVANTIQO_CODE_ENDPOINT_EXACT_MATCH_REQUIRED:${matches.length}`);
  }

  return {
    id: text(matches[0].id),
    name: text(matches[0].name) || null,
    source: "runpod_management_read_only_discovery",
  };
}

function summarizeHealth(health = {}) {
  const jobs = health.jobs || {};
  const workers = health.workers || {};
  return {
    jobs: {
      in_queue: number(jobs.inQueue ?? jobs.in_queue),
      in_progress: number(jobs.inProgress ?? jobs.in_progress),
      completed: number(jobs.completed),
      failed: number(jobs.failed),
      retried: number(jobs.retried),
    },
    workers: {
      idle: number(workers.idle),
      initializing: number(workers.initializing),
      ready: number(workers.ready),
      running: number(workers.running),
      throttled: number(workers.throttled),
      unhealthy: number(workers.unhealthy),
    },
  };
}

async function settleExactJob(endpointId, jobId, apiKey) {
  if (!jobId) return null;
  let statusBody = await request(endpointId, `/status/${encodeURIComponent(jobId)}`, apiKey);
  let status = text(statusBody?.status).toUpperCase();

  if (!TERMINAL_JOB_STATUSES.has(status)) {
    const cancelled = await request(endpointId, `/cancel/${encodeURIComponent(jobId)}`, apiKey, "POST");
    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_BENCHMARK_RECOVERY_EXACT_JOB_CANCEL_REQUESTED",
      job_id: jobId,
      returned_status: text(cancelled?.status).toUpperCase() || null,
    }));
  }

  const deadline = Date.now() + settleTimeoutMs();
  while (!TERMINAL_JOB_STATUSES.has(status)) {
    if (Date.now() >= deadline) {
      throw new Error(`AVANTIQO_CODE_BENCHMARK_RECOVERY_JOB_SETTLE_TIMEOUT:${jobId}:${status || "UNKNOWN"}`);
    }
    await delay(POLL_MS);
    statusBody = await request(endpointId, `/status/${encodeURIComponent(jobId)}`, apiKey);
    status = text(statusBody?.status).toUpperCase();
  }

  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_BENCHMARK_RECOVERY_EXACT_JOB_SETTLED",
    job_id: jobId,
    terminal_status: status,
  }));
  return status;
}

async function waitQuiescent(endpointId, apiKey) {
  const deadline = Date.now() + settleTimeoutMs();
  let latest = null;
  while (Date.now() < deadline) {
    latest = summarizeHealth(await request(endpointId, "/health", apiKey));
    const quiescent =
      latest.jobs.in_queue === 0 &&
      latest.jobs.in_progress === 0 &&
      latest.workers.running === 0 &&
      latest.workers.unhealthy === 0;
    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_BENCHMARK_RECOVERY_PROGRESS",
      health: latest,
      quiescent,
    }));
    if (quiescent) return latest;
    await delay(POLL_MS);
  }
  throw new Error(`AVANTIQO_CODE_BENCHMARK_RECOVERY_QUIESCENCE_TIMEOUT:${JSON.stringify(latest)}`);
}

const apiKey = required("RUNPOD_API_KEY");
const approval = text(process.env.AVANTIQO_CODE_BENCHMARK_QUEUE_RECOVERY_APPROVED).toUpperCase();
if (approval !== "YES") {
  throw new Error("AVANTIQO_CODE_BENCHMARK_QUEUE_RECOVERY_APPROVED_REQUIRED");
}
const exactJobId = text(process.env.AVANTIQO_CODE_BENCHMARK_RECOVER_JOB_ID);
const endpoint = await resolveEndpointId();
const endpointId = endpoint.id;

const before = summarizeHealth(await request(endpointId, "/health", apiKey));
console.log(JSON.stringify({
  event: "AVANTIQO_CODE_BENCHMARK_RECOVERY_START",
  endpoint_resolution: endpoint,
  exact_job_id: exactJobId || null,
  health: before,
  endpoint_mutation_performed: false,
  inference_submission_performed: false,
}));

if (exactJobId) {
  await settleExactJob(endpointId, exactJobId, apiKey);
}

const prePurge = summarizeHealth(await request(endpointId, "/health", apiKey));
if (prePurge.jobs.in_queue > 0) {
  const purged = await request(endpointId, "/purge-queue", apiKey, "POST");
  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_BENCHMARK_RECOVERY_QUEUE_PURGED",
    removed: number(purged?.removed),
    status: text(purged?.status) || null,
    pre_purge_health: prePurge,
  }));
} else {
  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_BENCHMARK_RECOVERY_QUEUE_ALREADY_EMPTY",
    pre_purge_health: prePurge,
  }));
}

const after = await waitQuiescent(endpointId, apiKey);
console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_BENCHMARK_QUEUE_RECOVERY_V2",
  endpoint_resolution: endpoint,
  exact_job_id: exactJobId || null,
  final_health: after,
  endpoint_mutation_performed: false,
  inference_submission_performed: false,
  queue_recovery_performed: true,
}, null, 2));
