const API_BASE = "https://api.runpod.ai/v2";
const TERMINAL_JOB_STATUSES = new Set([
  "COMPLETED",
  "FAILED",
  "TIMED_OUT",
  "CANCELLED",
  "CANCELED",
]);
const POLL_MS = 3000;
const SETTLE_TIMEOUT_MS = 3 * 60 * 1000;

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

  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
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
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
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
const endpointId = required("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID");
const approval = text(process.env.AVANTIQO_CODE_BENCHMARK_QUEUE_RECOVERY_APPROVED).toUpperCase();
if (approval !== "YES") {
  throw new Error("AVANTIQO_CODE_BENCHMARK_QUEUE_RECOVERY_APPROVED_REQUIRED");
}
const exactJobId = text(process.env.AVANTIQO_CODE_BENCHMARK_RECOVER_JOB_ID);

const before = summarizeHealth(await request(endpointId, "/health", apiKey));
console.log(JSON.stringify({
  event: "AVANTIQO_CODE_BENCHMARK_RECOVERY_START",
  endpoint_id: endpointId,
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
  contract: "AVANTIQO_CODE_BENCHMARK_QUEUE_RECOVERY_V1",
  endpoint_id: endpointId,
  exact_job_id: exactJobId || null,
  final_health: after,
  endpoint_mutation_performed: false,
  inference_submission_performed: false,
  queue_recovery_performed: true,
}, null, 2));
