const API_BASE = "https://api.runpod.ai/v2";
const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_CODE_ENGINE_V1";
const EXPECTED_FOUNDATION_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct";
const EXPECTED_RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8";
const EXPECTED_QUANTIZATION = "fp8";
const EXPECTED_SERVING_RUNTIME = "vllm";
const EXPECTED_MULTIPROC_METHOD = "spawn";
const DEFAULT_READY_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_JOB_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_READY_QUEUE_TIMEOUT_MS = 30_000;
const DEFAULT_SCALE_ZERO_QUEUE_TIMEOUT_MS = 3 * 60 * 1000;
const HEALTH_POLL_MS = 5000;
const JOB_POLL_MS = 1000;
const JOB_HEARTBEAT_MS = 5000;

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function responseBody(response) {
  return response.json().catch(() => ({}));
}

async function fetchWithTimeout(url, options, label, timeoutMs) {
  try {
    return await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = text(error?.name);
    const message = text(error?.message || error);
    if (name === "TimeoutError" || name === "AbortError") {
      throw new Error(`${label}_TIMEOUT_AFTER_${timeoutMs}MS`);
    }
    throw new Error(`${label}_FAILED:${message}`);
  }
}

function workerSnapshot(health) {
  const workers = health?.workers || {};
  return {
    idle: Number(workers.idle) || 0,
    initializing: Number(workers.initializing) || 0,
    ready: Number(workers.ready) || 0,
    running: Number(workers.running) || 0,
    throttled: Number(workers.throttled) || 0,
    unhealthy: Number(workers.unhealthy) || 0,
  };
}

function jobSnapshot(health) {
  const jobs = health?.jobs || {};
  return {
    completed: Number(jobs.completed) || 0,
    failed: Number(jobs.failed) || 0,
    in_progress: Number(jobs.in_progress) || 0,
    in_queue: Number(jobs.in_queue) || 0,
    retried: Number(jobs.retried) || 0,
  };
}

function managementWorkerSnapshot(endpoint) {
  const workers = Array.isArray(endpoint?.workers) ? endpoint.workers : [];
  const safeWorkers = workers.map((worker) => ({
    id_present: Boolean(text(worker?.id)),
    desired_status: text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase() || null,
    status: text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase() || null,
  }));
  const nonExited = safeWorkers.filter((worker) => worker.desired_status !== "EXITED");
  return {
    worker_count: safeWorkers.length,
    non_exited_worker_count: nonExited.length,
    all_workers_desired_exited: safeWorkers.length === 0 || nonExited.length === 0,
    workers: safeWorkers,
  };
}

function operationalCapacity(workers) {
  return workers.ready + workers.running + workers.idle;
}

function hasWorkerAcceptanceEvidence(workers, jobs) {
  return workers.running > 0 || jobs.in_progress > 0;
}

const apiKey = required("RUNPOD_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID");
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
const headers = {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};
const managementHeaders = managementKey
  ? {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
    }
  : null;
const requestTimeoutMs = Math.max(
  5000,
  Math.min(
    60_000,
    number(process.env.AVANTIQO_CODE_RUNTIME_PROBE_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS),
  ),
);

async function healthSnapshot() {
  const response = await fetchWithTimeout(
    `${API_BASE}/${endpointId}/health`,
    { headers },
    "RUNPOD_HEALTH_REQUEST",
    requestTimeoutMs,
  );
  const health = await responseBody(response);
  if (!response.ok) throw new Error(`RUNPOD_HEALTH_HTTP_${response.status}`);
  return {
    health,
    workers: workerSnapshot(health),
    jobs: jobSnapshot(health),
  };
}

async function managementSnapshot() {
  if (!managementHeaders) return null;
  const response = await fetchWithTimeout(
    `${REST_BASE}/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=true`,
    { headers: managementHeaders },
    "RUNPOD_MANAGEMENT_ENDPOINT_REQUEST",
    requestTimeoutMs,
  );
  const endpoint = await responseBody(response);
  if (!response.ok) throw new Error(`RUNPOD_MANAGEMENT_ENDPOINT_HTTP_${response.status}`);
  if (text(endpoint?.id) !== endpointId) {
    throw new Error(`RUNPOD_MANAGEMENT_ENDPOINT_ID_MISMATCH:${text(endpoint?.id) || "MISSING"}`);
  }
  return managementWorkerSnapshot(endpoint);
}

async function readinessSnapshot() {
  const [health, management] = await Promise.all([
    healthSnapshot(),
    managementSnapshot(),
  ]);
  return {
    ...health,
    management,
  };
}

async function cancelProbeJob(jobId, reason) {
  try {
    const response = await fetchWithTimeout(
      `${API_BASE}/${endpointId}/cancel/${jobId}`,
      { method: "POST", headers },
      "RUNPOD_RUNTIME_PROBE_CANCEL",
      requestTimeoutMs,
    );
    const body = await responseBody(response);
    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_RUNTIME_PROBE_CANCELLED",
      job_id: jobId,
      reason,
      http_status: response.status,
      runpod_status: text(body?.status),
      generation_performed: false,
    }));
    return response.ok;
  } catch (error) {
    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_RUNTIME_PROBE_CANCEL_FAILED",
      job_id: jobId,
      reason,
      error: text(error?.message || error),
      generation_performed: false,
    }));
    return false;
  }
}

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_RUNTIME_PROBE_START",
  endpoint_id: endpointId,
  generation_performed: false,
  provider_job_submitted: false,
  request_timeout_ms: requestTimeoutMs,
  management_plane_available: Boolean(managementHeaders),
  management_plane_authoritative_for_scaled_to_zero: Boolean(managementHeaders),
}));

const readyTimeoutMs = Math.max(
  30_000,
  Math.min(
    30 * 60 * 1000,
    number(process.env.AVANTIQO_CODE_RUNTIME_PROBE_READY_TIMEOUT_MS, DEFAULT_READY_TIMEOUT_MS),
  ),
);
const readyDeadline = Date.now() + readyTimeoutMs;
let finalHealth = null;
let finalWorkers = null;
let finalJobs = null;
let finalManagement = null;
let readinessMode = null;
let healthAttempt = 0;

while (Date.now() < readyDeadline) {
  healthAttempt += 1;
  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_RUNTIME_PROBE_HEALTH_CHECK",
    attempt: healthAttempt,
    generation_performed: false,
    provider_job_submitted: false,
  }));

  const { health, workers, jobs, management } = await readinessSnapshot();
  finalHealth = health;
  finalWorkers = workers;
  finalJobs = jobs;
  finalManagement = management;

  if (workers.unhealthy > 0) {
    throw new Error(`RUNPOD_WORKER_UNHEALTHY:${workers.unhealthy}`);
  }

  if (operationalCapacity(workers) > 0) {
    readinessMode = "READY_CAPACITY";
    break;
  }

  const jobsClear = jobs.in_queue === 0 && jobs.in_progress === 0;
  if (management?.all_workers_desired_exited === true && jobsClear) {
    readinessMode = "SCALED_TO_ZERO_MANAGEMENT_AUTHORITY";
    break;
  }

  if (workers.initializing === 0) {
    readinessMode = "SCALED_TO_ZERO_HEALTH";
    break;
  }

  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_RUNTIME_PROBE_WAITING",
    generation_performed: false,
    provider_job_submitted: false,
    workers,
    jobs,
    management,
    seconds_remaining: Math.max(0, Math.ceil((readyDeadline - Date.now()) / 1000)),
  }));
  await delay(HEALTH_POLL_MS);
}

if (!readinessMode) {
  throw new Error(
    `RUNPOD_WORKER_READINESS_TIMEOUT:${JSON.stringify({ workers: finalWorkers || {}, management: finalManagement })}`,
  );
}

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_RUNTIME_PROBE_READY",
  readiness_mode: readinessMode,
  workers: finalWorkers,
  jobs: finalJobs,
  management: finalManagement,
  stale_initializing_ignored:
    readinessMode === "SCALED_TO_ZERO_MANAGEMENT_AUTHORITY" && (finalWorkers?.initializing || 0) > 0,
  generation_performed: false,
  provider_job_submitted: false,
}));

const started = performance.now();
const submitResponse = await fetchWithTimeout(
  `${API_BASE}/${endpointId}/run`,
  {
    method: "POST",
    headers,
    body: JSON.stringify({
      input: {
        contract: CONTRACT,
        capability: "ai.code.debug",
        foundation_model: EXPECTED_FOUNDATION_MODEL,
        organization_id: "benchmark-only",
        organization_service_id: "benchmark-only",
        usage_id: `code-runtime-probe-${Date.now()}`,
        instruction: "Report the deployed Avantiqo Code runtime metadata only.",
        structured_specification: {
          runtime_probe: true,
          purpose: "DEPLOYED_RUNTIME_METADATA_PROBE",
        },
      },
    }),
  },
  "RUNPOD_RUNTIME_PROBE_SUBMIT",
  requestTimeoutMs,
);
let body = await responseBody(submitResponse);
if (!submitResponse.ok) {
  throw new Error(`RUNPOD_SUBMIT_HTTP_${submitResponse.status}:${text(body?.error || body?.message)}`);
}
const jobId = text(body?.id);
if (!jobId) throw new Error("RUNPOD_JOB_ID_REQUIRED");
console.log(JSON.stringify({
  event: "AVANTIQO_CODE_RUNTIME_PROBE_SUBMITTED",
  job_id: jobId,
  generation_performed: false,
  provider_job_submitted: true,
}));

const jobTimeoutMs = Math.max(
  30_000,
  Math.min(
    15 * 60 * 1000,
    number(process.env.AVANTIQO_CODE_RUNTIME_PROBE_JOB_TIMEOUT_MS, DEFAULT_JOB_TIMEOUT_MS),
  ),
);
const readyQueueTimeoutMs = Math.max(
  10_000,
  Math.min(
    2 * 60 * 1000,
    number(process.env.AVANTIQO_CODE_RUNTIME_PROBE_READY_QUEUE_TIMEOUT_MS, DEFAULT_READY_QUEUE_TIMEOUT_MS),
  ),
);
const scaleZeroQueueTimeoutMs = Math.max(
  30_000,
  Math.min(
    10 * 60 * 1000,
    number(process.env.AVANTIQO_CODE_RUNTIME_PROBE_SCALE_ZERO_QUEUE_TIMEOUT_MS, DEFAULT_SCALE_ZERO_QUEUE_TIMEOUT_MS),
  ),
);
const queueTimeoutMs = readinessMode === "READY_CAPACITY"
  ? readyQueueTimeoutMs
  : scaleZeroQueueTimeoutMs;
const deadline = Date.now() + jobTimeoutMs;
const queuedSince = Date.now();
let lastStatus = null;
let lastHeartbeatAt = 0;
let workerAcceptanceObserved = false;
let workerAcceptanceObservedAt = null;
let latestWorkers = finalWorkers;
let latestJobs = finalJobs;

while (Date.now() < deadline) {
  const status = text(body?.status).toUpperCase();
  if (status === "COMPLETED") break;
  if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(status)) {
    throw new Error(`RUNPOD_JOB_${status}:${text(body?.error || body?.message)}`);
  }

  const now = Date.now();
  const statusChanged = status !== lastStatus;
  const heartbeatDue = now - lastHeartbeatAt >= JOB_HEARTBEAT_MS;
  if (statusChanged || heartbeatDue) {
    try {
      const snapshot = await healthSnapshot();
      latestWorkers = snapshot.workers;
      latestJobs = snapshot.jobs;
      if (hasWorkerAcceptanceEvidence(latestWorkers, latestJobs) && !workerAcceptanceObserved) {
        workerAcceptanceObserved = true;
        workerAcceptanceObservedAt = now;
        console.log(JSON.stringify({
          event: "AVANTIQO_CODE_RUNTIME_PROBE_WORKER_ACCEPTED",
          job_id: jobId,
          api_status: status,
          workers: latestWorkers,
          jobs: latestJobs,
          generation_performed: false,
        }));
      }
    } catch (error) {
      latestWorkers = { health_error: text(error?.message || error) };
      latestJobs = null;
    }

    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_RUNTIME_PROBE_JOB_STATUS",
      job_id: jobId,
      status,
      seconds_since_submit: Math.round((now - queuedSince) / 1000),
      worker_acceptance_observed: workerAcceptanceObserved,
      seconds_since_worker_acceptance: workerAcceptanceObservedAt
        ? Math.round((now - workerAcceptanceObservedAt) / 1000)
        : null,
      workers: latestWorkers,
      jobs: latestJobs,
      generation_performed: false,
    }));
    lastStatus = status;
    lastHeartbeatAt = now;
  }

  if (
    status === "IN_QUEUE" &&
    !workerAcceptanceObserved &&
    now - queuedSince >= queueTimeoutMs
  ) {
    await cancelProbeJob(jobId, `QUEUE_TIMEOUT_WITHOUT_WORKER_ACCEPTANCE_${queueTimeoutMs}MS`);
    throw new Error(
      `RUNPOD_RUNTIME_PROBE_QUEUE_STALE:${jobId}:${readinessMode}:${queueTimeoutMs}MS`,
    );
  }

  await delay(JOB_POLL_MS);
  const response = await fetchWithTimeout(
    `${API_BASE}/${endpointId}/status/${jobId}`,
    { headers },
    "RUNPOD_RUNTIME_PROBE_STATUS",
    requestTimeoutMs,
  );
  body = await responseBody(response);
  if (!response.ok) throw new Error(`RUNPOD_STATUS_HTTP_${response.status}`);
}

if (text(body?.status).toUpperCase() !== "COMPLETED") {
  await cancelProbeJob(jobId, `JOB_TIMEOUT_${jobTimeoutMs}MS`);
  throw new Error(
    `RUNPOD_RUNTIME_PROBE_TIMEOUT:${jobId}:worker_acceptance=${workerAcceptanceObserved}`,
  );
}

const output = body?.output || {};
const checks = {
  provider: text(output.provider) === "avantiqo-code",
  contract: text(output.engine_contract) === CONTRACT,
  foundation_model: text(output.foundation_model) === EXPECTED_FOUNDATION_MODEL,
  runtime_model: text(output.runtime_model) === EXPECTED_RUNTIME_MODEL,
  serving_runtime: text(output.serving_runtime).toLowerCase() === EXPECTED_SERVING_RUNTIME,
  quantization: text(output.quantization).toLowerCase() === EXPECTED_QUANTIZATION,
  cached_model_found: output.cached_model_found === true,
  multiproc_method: text(output.vllm_worker_multiproc_method).toLowerCase() === EXPECTED_MULTIPROC_METHOD,
  raw_reasoning_boundary: output.raw_reasoning_persisted === false,
};
const passed = Object.values(checks).every(Boolean);

console.log(JSON.stringify({
  success: passed,
  contract: "AVANTIQO_CODE_RUNTIME_PROBE_V6",
  readiness_mode: readinessMode,
  management_plane_authoritative_for_scaled_to_zero: Boolean(managementHeaders),
  stale_initializing_ignored:
    readinessMode === "SCALED_TO_ZERO_MANAGEMENT_AUTHORITY" && (finalWorkers?.initializing || 0) > 0,
  worker_acceptance_observed: workerAcceptanceObserved,
  initial_health: finalHealth,
  initial_management: finalManagement,
  provider_job_submitted: true,
  generation_performed: false,
  job_id: jobId,
  wall_ms: Math.round(performance.now() - started),
  delay_ms: Number(body?.delayTime) || null,
  execution_ms: Number(body?.executionTime) || null,
  checks,
  output,
  activation_allowed: false,
}, null, 2));

if (!passed) process.exitCode = 1;
