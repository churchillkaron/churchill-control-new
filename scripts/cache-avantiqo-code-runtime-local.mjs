const API_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_CODE_ENGINE_V1";
const TARGET_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8";
const POLL_INTERVAL_MS = 5000;
const MAX_WAIT_MS = Math.max(
  POLL_INTERVAL_MS,
  Number(process.env.AVANTIQO_CODE_CACHE_TIMEOUT_MS || 90 * 60 * 1000),
);

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function body(response) {
  const raw = await response.text();
  let parsed = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = {};
  }
  if (!response.ok) {
    throw new Error(
      `RUNPOD_HTTP_${response.status}:${text(parsed?.error || parsed?.message || raw).slice(0, 1000)}`,
    );
  }
  return parsed;
}

const apiKey = required("RUNPOD_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID");

console.log(`AVANTIQO_CODE_CACHE_TARGET=${TARGET_MODEL}`);
console.log("AVANTIQO_CODE_CACHE_INFERENCE_PERFORMED=false");
console.log("AVANTIQO_CODE_CACHE_GENERATION_PERFORMED=false");
console.log("AVANTIQO_CODE_CACHE_PROVIDER_JOB_SUBMITTED=true");

const submit = await fetch(`${API_BASE}/${encodeURIComponent(endpointId)}/run`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify({
    input: {
      contract: CONTRACT,
      capability: "ai.code.debug",
      organization_id: "benchmark-only",
      organization_service_id: "benchmark-only",
      usage_id: `code-cache-bootstrap-${Date.now()}`,
      instruction: "Cache the source-locked Avantiqo Code FP8 runtime model only; do not perform inference.",
      structured_specification: {
        cache_runtime_model: true,
        target_model: TARGET_MODEL,
        purpose: "DEPLOYED_RUNTIME_CACHE_BOOTSTRAP",
      },
    },
  }),
  signal: AbortSignal.timeout(30_000),
});

let result = await body(submit);
let status = text(result?.status).toUpperCase();
const jobId = text(result?.id);
if (!jobId && status !== "COMPLETED") {
  throw new Error(`AVANTIQO_CODE_CACHE_JOB_ID_MISSING:${status || "UNKNOWN"}`);
}
console.log(`AVANTIQO_CODE_CACHE_JOB=${jobId || "completed-immediately"}`);

const deadline = Date.now() + MAX_WAIT_MS;
while (status !== "COMPLETED") {
  if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
    throw new Error(
      `AVANTIQO_CODE_CACHE_${status}:${text(result?.error || result?.output?.error)}`,
    );
  }
  if (Date.now() >= deadline) {
    throw new Error(`AVANTIQO_CODE_CACHE_WAIT_TIMEOUT:${jobId}`);
  }
  console.log(`AVANTIQO_CODE_CACHE_PROGRESS status=${status || "UNKNOWN"}`);
  await sleep(POLL_INTERVAL_MS);
  const response = await fetch(
    `${API_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`,
    {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    },
  );
  result = await body(response);
  status = text(result?.status).toUpperCase();
}

const output = result?.output || {};
const passed =
  text(output.runtime_model) === TARGET_MODEL &&
  output.cache_ready === true &&
  output.inference_performed === false &&
  output.engine_loaded === false;

console.log(`AVANTIQO_CODE_CACHE_READY=${passed ? "YES" : "NO"}`);
console.log(JSON.stringify({
  success: passed,
  contract: "AVANTIQO_CODE_RUNTIME_CACHE_BOOTSTRAP_V1",
  job_id: jobId || null,
  provider_job_submitted: true,
  generation_performed: false,
  inference_performed: false,
  output,
}, null, 2));
if (!passed) process.exitCode = 2;
