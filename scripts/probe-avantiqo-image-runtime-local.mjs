const API_BASE = "https://api.runpod.ai/v2";
const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_IMAGE_ENGINE_V1";
const OPERATION = "runtime_probe";
const EXPECTED_PROBE_CONTRACT = "AVANTIQO_IMAGE_RUNTIME_PROBE_V1";
const DEFAULT_ENDPOINT_NAME = "avantiqo-image-v1";
const POLL_INTERVAL_MS = 5000;
const MAX_WAIT_MS = Math.max(
  POLL_INTERVAL_MS,
  Number(process.env.AVANTIQO_IMAGE_RUNTIME_PROBE_TIMEOUT_MS || 15 * 60 * 1000),
);

function text(value) {
  return String(value ?? "").trim();
}

function required(name, code = `${name}_REQUIRED`) {
  const value = text(process.env[name]);
  if (!value) throw new Error(code);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseJson(response) {
  const raw = await response.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    throw new Error(
      `RUNPOD_HTTP_${response.status}:${text(body?.error || body?.message || body?.detail || raw).slice(0, 1000)}`,
    );
  }
  return body;
}

async function resolveEndpointId() {
  const explicit = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
  if (explicit) return { id: explicit, source: "ENV" };

  const managementKey = required(
    "RUNPOD_MANAGEMENT_API_KEY",
    "RUNPOD_MANAGEMENT_API_KEY_REQUIRED_FOR_IMAGE_ENDPOINT_AUTO_RESOLUTION",
  );
  const endpointName =
    text(process.env.AVANTIQO_IMAGE_RUNPOD_ENDPOINT_NAME) || DEFAULT_ENDPOINT_NAME;
  const response = await fetch(
    `${REST_BASE}/endpoints?includeTemplate=false&includeWorkers=false`,
    {
      headers: {
        Authorization: `Bearer ${managementKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30000),
    },
  );
  const endpoints = await parseJson(response);
  if (!Array.isArray(endpoints)) {
    throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
  }
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === endpointName);
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_IMAGE_RUNTIME_PROBE_ENDPOINT_RESOLUTION_FAILED:name=${endpointName}:matches=${matches.length}`,
    );
  }
  const id = text(matches[0]?.id);
  if (!id) throw new Error("AVANTIQO_IMAGE_RUNTIME_PROBE_ENDPOINT_ID_MISSING");
  return { id, source: "RUNPOD_MANAGEMENT_API" };
}

function terminalFailure(status) {
  return ["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status);
}

const apiKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const endpoint = await resolveEndpointId();
const endpointId = endpoint.id;

console.log("AVANTIQO_IMAGE_RUNTIME_PROBE_GENERATION_REQUESTED=false");
console.log("AVANTIQO_IMAGE_RUNTIME_PROBE_INFERENCE_PERFORMED=false");
console.log("AVANTIQO_IMAGE_RUNTIME_PROBE_MODEL_DOWNLOAD_PERFORMED=false");
console.log("AVANTIQO_IMAGE_RUNTIME_PROBE_STORAGE_MUTATION=false");
console.log("AVANTIQO_IMAGE_RUNTIME_PROBE_ENDPOINT_MUTATION=false");
console.log(`AVANTIQO_IMAGE_RUNTIME_PROBE_ENDPOINT_SOURCE=${endpoint.source}`);

const submitResponse = await fetch(`${API_BASE}/${encodeURIComponent(endpointId)}/run`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify({
    input: {
      contract: CONTRACT,
      operation: OPERATION,
    },
  }),
  signal: AbortSignal.timeout(30000),
});

let body = await parseJson(submitResponse);
let status = text(body?.status).toUpperCase();
const jobId = text(body?.id);
if (!jobId && status !== "COMPLETED") {
  throw new Error(`AVANTIQO_IMAGE_RUNTIME_PROBE_JOB_ID_MISSING:${status || "UNKNOWN"}`);
}
console.log(`AVANTIQO_IMAGE_RUNTIME_PROBE_JOB=${jobId || "completed-immediately"}`);

const deadline = Date.now() + MAX_WAIT_MS;
while (status !== "COMPLETED") {
  if (terminalFailure(status)) {
    throw new Error(
      `AVANTIQO_IMAGE_RUNTIME_PROBE_${status}:${text(body?.error || body?.output?.error)}`,
    );
  }
  if (Date.now() >= deadline) {
    throw new Error(`AVANTIQO_IMAGE_RUNTIME_PROBE_WAIT_TIMEOUT:${jobId}`);
  }
  console.log(`AVANTIQO_IMAGE_RUNTIME_PROBE_PROGRESS status=${status || "UNKNOWN"}`);
  await sleep(POLL_INTERVAL_MS);
  const statusResponse = await fetch(
    `${API_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`,
    {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    },
  );
  body = await parseJson(statusResponse);
  status = text(body?.status).toUpperCase();
}

const output = body?.output || {};
const safe =
  text(output.probe_contract) === EXPECTED_PROBE_CONTRACT &&
  text(output.operation) === OPERATION &&
  output.generation_requested === false &&
  output.inference_performed === false &&
  output.model_download_performed === false &&
  output.storage_upload_performed === false &&
  output.storage_mutation_performed === false &&
  output.generation_pipeline_loaded_by_probe === false;

console.log(`AVANTIQO_IMAGE_RUNTIME_PROBE_SAFE=${safe ? "YES" : "NO"}`);
console.log(`AVANTIQO_IMAGE_RUNTIME_ENTRYPOINT=${text(output.entrypoint) || "UNKNOWN"}`);
console.log(`AVANTIQO_IMAGE_RUNTIME_ENTRYPOINT_REVISION=${text(output.entrypoint_revision) || "UNKNOWN"}`);
console.log(`AVANTIQO_IMAGE_RUNTIME_REVISION=${text(output.runtime_revision) || "UNKNOWN"}`);
console.log(`AVANTIQO_IMAGE_2512_CACHE_READY=${output?.quality_cache?.cache_ready === true ? "YES" : "NO"}`);
console.log(
  `AVANTIQO_IMAGE_2512_CACHE_MISSING_FILES=${Number(output?.quality_cache?.missing_required_file_count) || 0}`,
);
console.log(JSON.stringify(output, null, 2));
if (!safe) process.exitCode = 2;
