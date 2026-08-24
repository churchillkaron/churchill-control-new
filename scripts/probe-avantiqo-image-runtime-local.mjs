import {
  resolveReusableGroupVolume,
  sharedVolumeGroup,
  sharedVolumePolicySummary,
} from "./lib/avantiqo-runpod-shared-volumes.mjs";

const API_BASE = "https://api.runpod.ai/v2";
const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_IMAGE_ENGINE_V1";
const OPERATION = "runtime_probe";
const EXPECTED_PROBE_CONTRACT = "AVANTIQO_IMAGE_RUNTIME_PROBE_V1";
const EXPECTED_CACHE_CONTRACT = "AVANTIQO_IMAGE_CACHE_COMPLETION_V1";
const EXPECTED_ENTRYPOINT = "handler_v3.py";
const EXPECTED_ENTRYPOINT_REVISION = "AVANTIQO_IMAGE_HANDLER_V3_QUALITY_COMPILER_V2";
const EXPECTED_RUNTIME_REVISION = "AVANTIQO_IMAGE_QWEN_2512_QUALITY_V2";
const EXPECTED_QUALITY_POLICY = "QWEN_IMAGE_2512_REALISM_IDENTITY_PHYSICS_V2";
const EXPECTED_QUALITY_COMPILER_CONTRACT = "AVANTIQO_IMAGE_QUALITY_COMPILER_V2";
const TARGET_MODEL = "Qwen/Qwen-Image-2512";
const DEFAULT_ENDPOINT_NAME = "avantiqo-image-v1";
const SHARED_GROUP = sharedVolumeGroup("IMAGE_VIDEO");
const POLL_INTERVAL_MS = 5000;
const QUEUE_WAIT_MS = Math.max(
  POLL_INTERVAL_MS,
  Number(process.env.AVANTIQO_IMAGE_RUNTIME_PROBE_QUEUE_TIMEOUT_MS || 5 * 60 * 1000),
);
const MAX_WAIT_MS = Math.max(
  QUEUE_WAIT_MS,
  Number(process.env.AVANTIQO_IMAGE_RUNTIME_PROBE_TIMEOUT_MS || 15 * 60 * 1000),
);
const TRANSIENT_RETRY_ATTEMPTS = Math.max(
  1,
  Number(process.env.AVANTIQO_IMAGE_RUNTIME_PROBE_NETWORK_RETRIES || 8),
);
const TRANSIENT_RETRY_BASE_MS = Math.max(
  250,
  Number(process.env.AVANTIQO_IMAGE_RUNTIME_PROBE_NETWORK_RETRY_BASE_MS || 1500),
);

function text(value) {
  return String(value ?? "").trim();
}
function list(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}
function required(name, code = `${name}_REQUIRED`) {
  const value = text(process.env[name]);
  if (!value) throw new Error(code);
  return value;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function arg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return text(match ? match.slice(prefix.length) : "");
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function healthCounters(body = {}) {
  const jobs = body?.jobs && typeof body.jobs === "object" ? body.jobs : {};
  const workers = body?.workers && typeof body.workers === "object" ? body.workers : {};
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
function activeJobs(counters) {
  return counters.jobs.in_queue + counters.jobs.in_progress;
}
function terminalFailure(status) {
  return ["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status);
}
function retryableHttpStatus(status) {
  return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}
function transientCode(error) {
  return text(
    error?.cause?.code ||
    error?.cause?.cause?.code ||
    error?.code ||
    error?.name ||
    error?.message,
  ).toUpperCase();
}
function isTransientNetworkError(error) {
  if (error?.transient === true) return true;
  const code = transientCode(error);
  return [
    "ENOTFOUND",
    "EAI_AGAIN",
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_BODY_TIMEOUT",
    "UND_ERR_SOCKET",
    "ABORTERROR",
    "TIMEOUTERROR",
    "TYPEERROR",
  ].some((candidate) => code.includes(candidate));
}
function retryDelayMs(attempt) {
  return Math.min(10_000, TRANSIENT_RETRY_BASE_MS * Math.max(1, attempt));
}

async function parseResponse(response, prefix = "RUNPOD_HTTP") {
  const raw = await response.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }
  return { response, raw, body, prefix };
}
async function requestJson(url, options, { label, retrySafe = true } = {}) {
  const attempts = retrySafe ? TRANSIENT_RETRY_ATTEMPTS : 1;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const parsed = await parseResponse(
        await fetch(url, {
          ...options,
          signal: AbortSignal.timeout(30_000),
        }),
        label || "RUNPOD_HTTP",
      );
      if (parsed.response.ok) return parsed.body;
      const detail = text(
        parsed.body?.error ||
        parsed.body?.message ||
        parsed.body?.detail ||
        parsed.raw,
      ).slice(0, 1000);
      const error = new Error(`${parsed.prefix}_${parsed.response.status}:${detail}`);
      if (!retrySafe || !retryableHttpStatus(parsed.response.status) || attempt >= attempts) {
        throw error;
      }
      lastError = error;
      console.log(
        `AVANTIQO_IMAGE_RUNTIME_PROBE_TRANSIENT_HTTP_RETRY label=${parsed.prefix} status=${parsed.response.status} attempt=${attempt}/${attempts}`,
      );
      await sleep(retryDelayMs(attempt));
    } catch (error) {
      if (!retrySafe || !isTransientNetworkError(error)) {
        throw error;
      }
      lastError = error;
      if (attempt >= attempts) break;
      console.log(
        `AVANTIQO_IMAGE_RUNTIME_PROBE_TRANSIENT_NETWORK_RETRY label=${label || "RUNPOD_HTTP"} code=${transientCode(error).slice(0, 80)} attempt=${attempt}/${attempts}`,
      );
      await sleep(retryDelayMs(attempt));
    }
  }
  const exhausted = new Error(
    `AVANTIQO_IMAGE_RUNTIME_PROBE_TRANSIENT_NETWORK_EXHAUSTED:${text(lastError?.message).slice(0, 500)}`,
  );
  exhausted.transient = true;
  throw exhausted;
}
async function rest(path, managementKey) {
  return requestJson(
    `${REST_BASE}${path}`,
    {
      headers: {
        Authorization: `Bearer ${managementKey}`,
        Accept: "application/json",
      },
    },
    { label: "RUNPOD_REST_HTTP", retrySafe: true },
  );
}
async function queue(endpointId, path, apiKey, options = {}) {
  const method = options.method || "GET";
  return requestJson(
    `${API_BASE}/${encodeURIComponent(endpointId)}${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    },
    {
      label: "RUNPOD_QUEUE_HTTP",
      // Never retry /run automatically: an accepted request whose response was
      // lost could otherwise create a duplicate provider job. GET/status and
      // exact-job cancellation are safe to retry.
      retrySafe: options.retrySafe ?? method === "GET",
    },
  );
}
function resolveEndpoint(endpoints, explicitId) {
  if (explicitId) {
    const matches = endpoints.filter((endpoint) => text(endpoint?.id) === explicitId);
    if (matches.length !== 1 || text(matches[0]?.name) !== DEFAULT_ENDPOINT_NAME) {
      throw new Error(`AVANTIQO_IMAGE_RUNTIME_PROBE_CONFIGURED_ENDPOINT_INVALID:matches=${matches.length}`);
    }
    return { endpoint: matches[0], source: "ENV_VERIFIED" };
  }
  const endpointName = text(process.env.AVANTIQO_IMAGE_RUNPOD_ENDPOINT_NAME) || DEFAULT_ENDPOINT_NAME;
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === endpointName);
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_IMAGE_RUNTIME_PROBE_ENDPOINT_RESOLUTION_FAILED:name=${endpointName}:matches=${matches.length}`,
    );
  }
  return { endpoint: matches[0], source: "RUNPOD_MANAGEMENT_API" };
}
async function cancelProbe(endpointId, jobId, apiKey, reason) {
  if (!jobId) return false;
  try {
    await queue(endpointId, `/cancel/${encodeURIComponent(jobId)}`, apiKey, {
      method: "POST",
      retrySafe: true,
    });
    console.log(`AVANTIQO_IMAGE_RUNTIME_PROBE_CANCELLED=${reason}`);
    return true;
  } catch (error) {
    console.log(`AVANTIQO_IMAGE_RUNTIME_PROBE_CANCEL_FAILED=${text(error?.message).slice(0, 300)}`);
    return false;
  }
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const apiKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
const resumeJobId = arg("job-id") || text(process.env.AVANTIQO_IMAGE_RUNTIME_PROBE_JOB_ID);

console.log("AVANTIQO_IMAGE_RUNTIME_PROBE_SHARED_VOLUME_AWARE=true");
console.log(`AVANTIQO_IMAGE_RUNTIME_PROBE_SHARED_GROUP=${SHARED_GROUP.id}`);
console.log(`AVANTIQO_IMAGE_RUNTIME_PROBE_EXPECTED_ENTRYPOINT_REVISION=${EXPECTED_ENTRYPOINT_REVISION}`);
console.log(`AVANTIQO_IMAGE_RUNTIME_PROBE_EXPECTED_RUNTIME_REVISION=${EXPECTED_RUNTIME_REVISION}`);
console.log(`AVANTIQO_IMAGE_RUNTIME_PROBE_EXPECTED_QUALITY_POLICY=${EXPECTED_QUALITY_POLICY}`);
console.log(`AVANTIQO_IMAGE_RUNTIME_PROBE_EXPECTED_QUALITY_COMPILER=${EXPECTED_QUALITY_COMPILER_CONTRACT}`);
console.log("AVANTIQO_IMAGE_RUNTIME_PROBE_GENERATION_REQUESTED=false");
console.log("AVANTIQO_IMAGE_RUNTIME_PROBE_INFERENCE_PERFORMED=false");
console.log("AVANTIQO_IMAGE_RUNTIME_PROBE_MODEL_DOWNLOAD_PERFORMED=false");
console.log("AVANTIQO_IMAGE_RUNTIME_PROBE_STORAGE_MUTATION=false");
console.log("AVANTIQO_IMAGE_RUNTIME_PROBE_ENDPOINT_MUTATION=false");
console.log(`AVANTIQO_IMAGE_RUNTIME_PROBE_QUEUE_TIMEOUT_MS=${QUEUE_WAIT_MS}`);
console.log("AVANTIQO_IMAGE_RUNTIME_PROBE_TRANSIENT_FETCH_RETRY=true");
console.log(`AVANTIQO_IMAGE_RUNTIME_PROBE_TRANSIENT_FETCH_ATTEMPTS=${TRANSIENT_RETRY_ATTEMPTS}`);
console.log("AVANTIQO_IMAGE_RUNTIME_PROBE_DUPLICATE_JOB_RETRY=false");
console.log(`AVANTIQO_IMAGE_RUNTIME_PROBE_RESUME_EXISTING_JOB=${resumeJobId ? "true" : "false"}`);
console.log("AVANTIQO_IMAGE_RUNTIME_PROBE_PRODUCTION_DEPLOY=false");

const [endpoints, volumes] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
]);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");

const resolved = resolveEndpoint(endpoints, configuredEndpointId);
const endpoint = resolved.endpoint;
const endpointId = text(endpoint?.id);
if (!endpointId) throw new Error("AVANTIQO_IMAGE_RUNTIME_PROBE_ENDPOINT_ID_MISSING");

const reusable = resolveReusableGroupVolume(volumes, SHARED_GROUP);
const sharedVolume = reusable.volume;
if (!sharedVolume) {
  throw new Error(`AVANTIQO_IMAGE_RUNTIME_PROBE_SHARED_VOLUME_REQUIRED:group=${SHARED_GROUP.id}`);
}
const sharedVolumeId = text(sharedVolume?.id);
const sharedDataCenterId = text(sharedVolume?.dataCenterId);
if (!sharedVolumeId || !sharedDataCenterId) {
  throw new Error("AVANTIQO_IMAGE_RUNTIME_PROBE_SHARED_VOLUME_METADATA_INVALID");
}
const attachedIds = endpointVolumeIds(endpoint);
if (attachedIds.length !== 1 || attachedIds[0] !== sharedVolumeId) {
  throw new Error(
    `AVANTIQO_IMAGE_RUNTIME_PROBE_SHARED_VOLUME_ATTACHMENT_MISMATCH:attached=${attachedIds.join("|") || "NONE"}:expected=${sharedVolumeId}`,
  );
}
if (finite(endpoint?.workersMin) !== 0 || finite(endpoint?.workersMax) !== 1) {
  throw new Error(
    `AVANTIQO_IMAGE_RUNTIME_PROBE_SCALING_INVALID:min=${finite(endpoint?.workersMin)}:max=${finite(endpoint?.workersMax)}`,
  );
}
const gpuTypes = list(endpoint?.gpuTypeIds);
if (!gpuTypes.length) throw new Error("AVANTIQO_IMAGE_RUNTIME_PROBE_GPU_TYPES_REQUIRED");

const initialHealth = healthCounters(await queue(endpointId, "/health", apiKey));
if (!resumeJobId && activeJobs(initialHealth) !== 0) {
  throw new Error(
    `AVANTIQO_IMAGE_RUNTIME_PROBE_EXISTING_JOB_BLOCKED:in_queue=${initialHealth.jobs.in_queue}:in_progress=${initialHealth.jobs.in_progress}:resume_with_--job-id=<exact_job_id>`,
  );
}
if (resumeJobId && activeJobs(initialHealth) > 1) {
  throw new Error(
    `AVANTIQO_IMAGE_RUNTIME_PROBE_RESUME_UNSAFE_MULTIPLE_JOBS:active_jobs=${activeJobs(initialHealth)}`,
  );
}

console.log(`AVANTIQO_IMAGE_RUNTIME_PROBE_ENDPOINT_SOURCE=${resolved.source}`);
console.log(`AVANTIQO_IMAGE_RUNTIME_PROBE_EFFECTIVE_DATACENTER=${sharedDataCenterId}`);
console.log("AVANTIQO_IMAGE_RUNTIME_PROBE_EFFECTIVE_DATACENTER_SOURCE=NETWORK_VOLUME_DATACENTER");
console.log(`AVANTIQO_IMAGE_RUNTIME_PROBE_GPU_TYPES=${gpuTypes.join("|")}`);
console.log(`AVANTIQO_IMAGE_RUNTIME_PROBE_INITIAL_HEALTH=${JSON.stringify(initialHealth)}`);
console.log(`AVANTIQO_IMAGE_RUNTIME_PROBE_SHARED_POLICY=${JSON.stringify(sharedVolumePolicySummary(volumes))}`);

let body = null;
let jobId = resumeJobId;
let newJobSubmitted = false;
if (resumeJobId) {
  body = await queue(endpointId, `/status/${encodeURIComponent(resumeJobId)}`, apiKey);
  const resumedStatus = text(body?.status).toUpperCase();
  if (activeJobs(initialHealth) === 1 && terminalFailure(resumedStatus)) {
    throw new Error(
      `AVANTIQO_IMAGE_RUNTIME_PROBE_RESUME_JOB_TERMINAL_BUT_OTHER_ACTIVE_JOB_PRESENT:status=${resumedStatus}`,
    );
  }
  console.log(`AVANTIQO_IMAGE_RUNTIME_PROBE_RESUMED_JOB=${resumeJobId}`);
} else {
  try {
    body = await queue(endpointId, "/run", apiKey, {
      method: "POST",
      retrySafe: false,
      body: {
        input: {
          contract: CONTRACT,
          operation: OPERATION,
        },
      },
    });
  } catch (error) {
    if (isTransientNetworkError(error)) {
      throw new Error(
        `AVANTIQO_IMAGE_RUNTIME_PROBE_SUBMIT_RESULT_UNKNOWN_DO_NOT_RETRY_BLINDLY:${text(error?.message).slice(0, 500)}`,
      );
    }
    throw error;
  }
  jobId = text(body?.id);
  newJobSubmitted = true;
}

let status = text(body?.status).toUpperCase();
if (!jobId && status !== "COMPLETED") {
  throw new Error(`AVANTIQO_IMAGE_RUNTIME_PROBE_JOB_ID_MISSING:${status || "UNKNOWN"}`);
}
console.log(`AVANTIQO_IMAGE_RUNTIME_PROBE_JOB=${jobId || "completed-immediately"}`);
console.log(`AVANTIQO_IMAGE_RUNTIME_PROBE_NEW_JOB_SUBMITTED=${newJobSubmitted ? "true" : "false"}`);

const startedAt = Date.now();
const deadline = startedAt + MAX_WAIT_MS;
const queueDeadline = startedAt + QUEUE_WAIT_MS;
while (status !== "COMPLETED") {
  if (terminalFailure(status)) {
    throw new Error(
      `AVANTIQO_IMAGE_RUNTIME_PROBE_${status}:${text(body?.error || body?.output?.error)}`,
    );
  }
  if (status === "IN_QUEUE" && Date.now() >= queueDeadline) {
    await cancelProbe(endpointId, jobId, apiKey, "QUEUE_TIMEOUT");
    throw new Error(`AVANTIQO_IMAGE_RUNTIME_PROBE_QUEUE_TIMEOUT:${jobId}`);
  }
  if (Date.now() >= deadline) {
    await cancelProbe(endpointId, jobId, apiKey, "TOTAL_TIMEOUT");
    throw new Error(`AVANTIQO_IMAGE_RUNTIME_PROBE_WAIT_TIMEOUT:${jobId}`);
  }

  const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
  let health = null;
  try {
    health = healthCounters(await queue(endpointId, "/health", apiKey));
  } catch (error) {
    if (!isTransientNetworkError(error)) throw error;
    console.log(
      `AVANTIQO_IMAGE_RUNTIME_PROBE_MONITOR_NETWORK_UNAVAILABLE phase=health elapsed_seconds=${elapsedSeconds}`,
    );
  }
  console.log(
    `AVANTIQO_IMAGE_RUNTIME_PROBE_PROGRESS status=${status || "UNKNOWN"} elapsed_seconds=${elapsedSeconds} health=${health ? JSON.stringify(health) : "UNAVAILABLE"}`,
  );

  await sleep(POLL_INTERVAL_MS);
  try {
    body = await queue(endpointId, `/status/${encodeURIComponent(jobId)}`, apiKey);
    status = text(body?.status).toUpperCase();
  } catch (error) {
    if (!isTransientNetworkError(error)) throw error;
    console.log(
      `AVANTIQO_IMAGE_RUNTIME_PROBE_MONITOR_NETWORK_UNAVAILABLE phase=status elapsed_seconds=${Math.round((Date.now() - startedAt) / 1000)}`,
    );
  }
}

const output = body?.output || {};
const cache = output?.quality_cache || {};
const safe =
  text(output.probe_contract) === EXPECTED_PROBE_CONTRACT &&
  text(output.engine_contract) === CONTRACT &&
  text(output.operation) === OPERATION &&
  text(output.entrypoint) === EXPECTED_ENTRYPOINT &&
  text(output.entrypoint_revision) === EXPECTED_ENTRYPOINT_REVISION &&
  text(output.runtime_revision) === EXPECTED_RUNTIME_REVISION &&
  text(output.quality_policy) === EXPECTED_QUALITY_POLICY &&
  text(output.quality_compiler_contract) === EXPECTED_QUALITY_COMPILER_CONTRACT &&
  text(output.quality_foundation_model) === TARGET_MODEL &&
  cache.cache_ready === true &&
  text(cache.completion_contract) === EXPECTED_CACHE_CONTRACT &&
  cache.completion_marker_valid === true &&
  finite(cache.missing_required_file_count, -1) === 0 &&
  Array.isArray(cache.missing_required_files) &&
  cache.missing_required_files.length === 0 &&
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
console.log(`AVANTIQO_IMAGE_RUNTIME_QUALITY_POLICY=${text(output.quality_policy) || "UNKNOWN"}`);
console.log(`AVANTIQO_IMAGE_RUNTIME_QUALITY_COMPILER=${text(output.quality_compiler_contract) || "UNKNOWN"}`);
console.log(`AVANTIQO_IMAGE_2512_CACHE_READY=${cache.cache_ready === true ? "YES" : "NO"}`);
console.log(`AVANTIQO_IMAGE_2512_CACHE_COMPLETION_MARKER_VALID=${cache.completion_marker_valid === true ? "YES" : "NO"}`);
console.log(`AVANTIQO_IMAGE_2512_CACHE_MISSING_FILES=${finite(cache.missing_required_file_count, -1)}`);
console.log(JSON.stringify(output, null, 2));
if (!safe) process.exitCode = 2;
