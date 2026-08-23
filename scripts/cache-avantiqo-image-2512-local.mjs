const API_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_IMAGE_ENGINE_V1";
const TARGET_MODEL = "Qwen/Qwen-Image-2512";
const POLL_INTERVAL_MS = 5000;
const MAX_WAIT_MS = Math.max(
  POLL_INTERVAL_MS,
  Number(process.env.AVANTIQO_IMAGE_CACHE_TIMEOUT_MS || 90 * 60 * 1000),
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

async function json(response) {
  const raw = await response.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    throw new Error(`RUNPOD_HTTP_${response.status}:${text(body?.error || body?.message || raw).slice(0, 1000)}`);
  }
  return body;
}

const apiKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID");

console.log(`AVANTIQO_IMAGE_CACHE_TARGET=${TARGET_MODEL}`);
console.log("AVANTIQO_IMAGE_CACHE_INFERENCE_PERFORMED=false");

const submit = await fetch(`${API_BASE}/${endpointId}/run`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify({
    input: {
      contract: CONTRACT,
      operation: "cache_foundation_model",
      target_model: TARGET_MODEL,
    },
  }),
  signal: AbortSignal.timeout(30000),
});

let body = await json(submit);
let status = text(body?.status).toUpperCase();
const jobId = text(body?.id);
if (!jobId && status !== "COMPLETED") {
  throw new Error(`AVANTIQO_IMAGE_CACHE_JOB_ID_MISSING:${status || "UNKNOWN"}`);
}
console.log(`AVANTIQO_IMAGE_CACHE_JOB=${jobId || "completed-immediately"}`);

const deadline = Date.now() + MAX_WAIT_MS;
while (status !== "COMPLETED") {
  if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
    throw new Error(`AVANTIQO_IMAGE_CACHE_${status}:${text(body?.error || body?.output?.error)}`);
  }
  if (Date.now() >= deadline) {
    throw new Error(`AVANTIQO_IMAGE_CACHE_WAIT_TIMEOUT:${jobId}`);
  }
  console.log(`AVANTIQO_IMAGE_CACHE_PROGRESS status=${status || "UNKNOWN"}`);
  await sleep(POLL_INTERVAL_MS);
  const response = await fetch(
    `${API_BASE}/${endpointId}/status/${encodeURIComponent(jobId)}`,
    {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    },
  );
  body = await json(response);
  status = text(body?.status).toUpperCase();
}

const output = body?.output || {};
const passed =
  text(output.target_model) === TARGET_MODEL &&
  output.cache_ready === true &&
  output.inference_performed === false &&
  text(output.foundation_model_source) === "runpod-cache";

console.log(`AVANTIQO_IMAGE_CACHE_READY=${passed ? "YES" : "NO"}`);
console.log(JSON.stringify(output, null, 2));
if (!passed) process.exitCode = 2;
