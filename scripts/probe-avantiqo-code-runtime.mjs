const API_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_CODE_ENGINE_V1";
const EXPECTED_FOUNDATION_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct";
const EXPECTED_RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8";
const EXPECTED_QUANTIZATION = "fp8";
const EXPECTED_SERVING_RUNTIME = "vllm";
const EXPECTED_MULTIPROC_METHOD = "spawn";

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function responseBody(response) {
  return response.json().catch(() => ({}));
}

const apiKey = required("RUNPOD_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID");
const headers = {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};

const healthResponse = await fetch(`${API_BASE}/${endpointId}/health`, { headers });
const health = await responseBody(healthResponse);
if (!healthResponse.ok) {
  throw new Error(`RUNPOD_HEALTH_HTTP_${healthResponse.status}`);
}

const workers = health?.workers || {};
const ready = Number(workers.ready) || 0;
const running = Number(workers.running) || 0;
const idle = Number(workers.idle) || 0;
const initializing = Number(workers.initializing) || 0;
const unhealthy = Number(workers.unhealthy) || 0;
if (unhealthy > 0) throw new Error(`RUNPOD_WORKER_UNHEALTHY:${unhealthy}`);
if (initializing > 0 && ready + running + idle === 0) {
  throw new Error("RUNPOD_WORKER_STILL_INITIALIZING");
}
if (ready + running + idle === 0) {
  throw new Error("RUNPOD_WORKER_NOT_READY_FOR_RUNTIME_PROBE");
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

const deadline = Date.now() + 60_000;
while (Date.now() < deadline) {
  const status = text(body?.status).toUpperCase();
  if (status === "COMPLETED") break;
  if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(status)) {
    throw new Error(`RUNPOD_JOB_${status}:${text(body?.error || body?.message)}`);
  }
  await delay(1000);
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
  contract: "AVANTIQO_CODE_RUNTIME_PROBE_V1",
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
