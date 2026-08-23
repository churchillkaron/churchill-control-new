const API_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_CODE_ENGINE_V1";
const EXPECTED_FOUNDATION_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct";
const EXPECTED_RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8";
const EXPECTED_QUANTIZATION = "fp8";
const EXPECTED_SERVING_RUNTIME = "vllm";
const EXPECTED_MULTIPROC_METHOD = "spawn";
const DEFAULT_READY_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_JOB_TIMEOUT_MS = 5 * 60 * 1000;
const HEALTH_POLL_MS = 5000;
const JOB_POLL_MS = 1000;

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

while (Date.now() < readyDeadline) {
  const healthResponse = await fetch(`${API_BASE}/${endpointId}/health`, { headers });
  const health = await responseBody(healthResponse);
  if (!healthResponse.ok) {
    throw new Error(`RUNPOD_HEALTH_HTTP_${healthResponse.status}`);
  }

  const workers = workerSnapshot(health);
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
    // A scale-to-zero endpoint has no live worker but is safe to wake with this
    // metadata-only job. The handler's runtime_probe path never loads the model.
    readinessMode = "SCALED_TO_ZERO";
    break;
  }

  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_RUNTIME_PROBE_WAITING",
    generation_performed: false,
    provider_job_submitted: false,
    workers,
  }));
  await delay(HEALTH_POLL_MS);
}

if (!readinessMode) {
  throw new Error(
    `RUNPOD_WORKER_READINESS_TIMEOUT:${JSON.stringify(finalWorkers || {})}`,
  );
}

const started = performance.now();
const submitResponse = await fetch(`${API_BASE}/${endpointId}/run`, {
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
});
let body = await responseBody(submitResponse);
if (!submitResponse.ok) {
  throw new Error(`RUNPOD_SUBMIT_HTTP_${submitResponse.status}:${text(body?.error || body?.message)}`);
}
const jobId = text(body?.id);
if (!jobId) throw new Error("RUNPOD_JOB_ID_REQUIRED");

const jobTimeoutMs = Math.max(
  30_000,
  Math.min(
    15 * 60 * 1000,
    number(process.env.AVANTIQO_CODE_RUNTIME_PROBE_JOB_TIMEOUT_MS, DEFAULT_JOB_TIMEOUT_MS),
  ),
);
const deadline = Date.now() + jobTimeoutMs;
while (Date.now() < deadline) {
  const status = text(body?.status).toUpperCase();
  if (status === "COMPLETED") break;
  if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(status)) {
    throw new Error(`RUNPOD_JOB_${status}:${text(body?.error || body?.message)}`);
  }
  await delay(JOB_POLL_MS);
  const response = await fetch(`${API_BASE}/${endpointId}/status/${jobId}`, { headers });
  body = await responseBody(response);
  if (!response.ok) throw new Error(`RUNPOD_STATUS_HTTP_${response.status}`);
}

if (text(body?.status).toUpperCase() !== "COMPLETED") {
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
  contract: "AVANTIQO_CODE_RUNTIME_PROBE_V2",
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
