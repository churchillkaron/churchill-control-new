const API_BASE = "https://api.runpod.ai/v2";
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

function operationalCapacity(workers) {
  return workers.ready + workers.running + workers.idle;
}

const apiKey = required("RUNPOD_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID");
const headers = {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};
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
  return { health, workers: workerSnapshot(health) };
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

  const { health, workers } = await healthSnapshot();
  finalHealth = health;
  finalWorkers = workers;

  if (workers.unhealthy > 0) {
    throw new Error(`RUNPOD_WORKER_UNHEALTHY:${workers.unhealthy}`);
  }

  if (operationalCapacity(workers) > 0) {
    readinessMode = "READY_CAPACITY";
    break;
  }

  if (workers.initializing === 0) {
    readinessMode = "SCALED_TO_ZERO";
    break;
  }

  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_RUNTIME_PROBE_WAITING",
    generation_performed: false,
    provider_job_submitted: false,
    workers,
    seconds_remaining: Math.max(0, Math.ceil((readyDeadline - Date.now()) / 1000)),
  }));
  await delay(HEALTH_POLL_MS);
}

if (!readinessMode) {
  throw new Error(
    `RUNPOD_WORKER_READINESS_TIMEOUT:${JSON.stringify(finalWorkers || {})}`,
  );
}

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_RUNTIME_PROBE_READY",
  readiness_mode: readinessMode,
  workers: finalWorkers,
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
    let currentWorkers = null;
    try {
      currentWorkers = (await healthSnapshot()).workers;
    } catch (error) {
      currentWorkers = { health_error: text(error?.message || error) };
    }
    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_RUNTIME_PROBE_JOB_STATUS",
      job_id: jobId,
      status,
      seconds_in_status: Math.round((now - queuedSince) / 1000),
      workers: currentWorkers,
      generation_performed: false,
    }));
    lastStatus = status;
    lastHeartbeatAt = now;
  }

  if (status === "IN_QUEUE" && now - queuedSince >= queueTimeoutMs) {
    await cancelProbeJob(jobId, `QUEUE_TIMEOUT_${queueTimeoutMs}MS`);
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
  throw new Error(`RUNPOD_RUNTIME_PROBE_TIMEOUT:${jobId}`);
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
  contract: "AVANTIQO_CODE_RUNTIME_PROBE_V4",
  readiness_mode: readinessMode,
  initial_health: finalHealth,
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
