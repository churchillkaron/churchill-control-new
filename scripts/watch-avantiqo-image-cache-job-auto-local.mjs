const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const TARGET_MODEL = "Qwen/Qwen-Image-2512";
const POLL_MS = 10_000;
const DEFAULT_WAIT_MS = 90 * 60 * 1000;
const ESCALATION_WINDOW_MS = 5 * 60 * 1000;

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jobIdFromArgs() {
  const arg = process.argv.find((value) => value.startsWith("--job-id="));
  return text(arg ? arg.slice("--job-id=".length) : process.env.AVANTIQO_IMAGE_CACHE_JOB_ID);
}

async function restRequest(path, credential) {
  const response = await fetch(`${REST_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function queueRequest(endpointId, path, inferenceKey) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`, {
    headers: {
      Authorization: `Bearer ${inferenceKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.error || body?.message || raw).slice(0, 1000);
    throw new Error(`RUNPOD_QUEUE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

function safeHealth(body = {}) {
  const jobs = body?.jobs || {};
  const workers = body?.workers || {};
  return {
    jobs: {
      completed: finite(jobs.completed, 0),
      failed: finite(jobs.failed, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
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

function validateCacheOutput(job) {
  const output = job?.output || {};
  return {
    valid:
      text(output.target_model) === TARGET_MODEL &&
      output.cache_ready === true &&
      output.inference_performed === false &&
      text(output.foundation_model_source) === "runpod-cache",
    output,
  };
}

const jobId = jobIdFromArgs();
if (!jobId) throw new Error("AVANTIQO_IMAGE_CACHE_JOB_ID_REQUIRED_USE_--job-id=<existing-job-id>");

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const waitMs = Math.max(POLL_MS, finite(process.env.AVANTIQO_IMAGE_CACHE_WATCH_WAIT_MS, DEFAULT_WAIT_MS));

console.log("AVANTIQO_IMAGE_CACHE_WATCH_MODE=READ_ONLY");
console.log(`AVANTIQO_IMAGE_CACHE_WATCH_JOB=${jobId}`);
console.log("AVANTIQO_IMAGE_CACHE_WATCH_NEW_JOB_SUBMITTED=false");
console.log("AVANTIQO_IMAGE_CACHE_WATCH_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_IMAGE_CACHE_WATCH_PRODUCTION_DEPLOY_PERFORMED=false");
console.log("AVANTIQO_IMAGE_CACHE_WATCH_SECRETS_PRINTED=false");

const endpoints = await restRequest("/endpoints?includeTemplate=false&includeWorkers=false", managementKey);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
const configuredId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
let selected = null;
if (configuredId) {
  const matches = endpoints.filter((endpoint) => text(endpoint?.id) === configuredId);
  if (matches.length !== 1 || text(matches[0]?.name) !== IMAGE_ENDPOINT_NAME) {
    throw new Error("AVANTIQO_IMAGE_CACHE_WATCH_CONFIGURED_ENDPOINT_INVALID");
  }
  selected = matches[0];
} else {
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_IMAGE_CACHE_WATCH_ENDPOINT_AUTO_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  selected = matches[0];
}
const endpointId = text(selected?.id);
if (!endpointId) throw new Error("AVANTIQO_IMAGE_CACHE_WATCH_ENDPOINT_ID_MISSING");
console.log(`AVANTIQO_IMAGE_CACHE_WATCH_ENDPOINT_RESOLUTION=${configuredId ? "ENV_VERIFIED" : "EXACT_NAME"}`);

const startedAt = Date.now();
const deadline = startedAt + waitMs;
let lastStatus = null;
let schedulingStallStartedAt = null;

while (Date.now() < deadline) {
  const [job, healthRaw] = await Promise.all([
    queueRequest(endpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey),
    queueRequest(endpointId, "/health", inferenceKey),
  ]);
  const status = text(job?.status).toUpperCase();
  const health = safeHealth(healthRaw);

  console.log(
    `AVANTIQO_IMAGE_CACHE_WATCH_PROGRESS status=${status || "UNKNOWN"} queued=${health.jobs.in_queue} in_progress=${health.jobs.in_progress} initializing=${health.workers.initializing} ready=${health.workers.ready} running=${health.workers.running} throttled=${health.workers.throttled} unhealthy=${health.workers.unhealthy}`,
  );

  if (status === "COMPLETED") {
    const validation = validateCacheOutput(job);
    console.log(`AVANTIQO_IMAGE_CACHE_READY=${validation.valid ? "YES" : "NO"}`);
    console.log("AVANTIQO_IMAGE_CACHE_WATCH=COMPLETE");
    console.log(JSON.stringify(validation.output, null, 2));
    process.exit(validation.valid ? 0 : 2);
  }

  if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
    throw new Error(
      `AVANTIQO_IMAGE_CACHE_EXISTING_JOB_${status}:${text(job?.error || job?.output?.error)}`,
    );
  }

  if (!new Set(["IN_QUEUE", "IN_PROGRESS"]).has(status)) {
    throw new Error(`AVANTIQO_IMAGE_CACHE_WATCH_UNEXPECTED_STATUS:${status || "UNKNOWN"}`);
  }

  const schedulingHealthy =
    status === "IN_PROGRESS" ||
    health.workers.initializing > 0 ||
    health.workers.ready > 0 ||
    health.workers.running > 0;

  if (status === "IN_QUEUE" && !schedulingHealthy && health.workers.throttled > 0) {
    schedulingStallStartedAt ??= Date.now();
    if (Date.now() - schedulingStallStartedAt >= ESCALATION_WINDOW_MS) {
      console.log("AVANTIQO_IMAGE_CACHE_WATCH=ESCALATION_REQUIRED");
      console.log("AVANTIQO_IMAGE_CACHE_WATCH_NEXT_ACTION=RUN_GUARDED_GPU_POOL_APPLY");
      process.exit(2);
    }
  } else {
    schedulingStallStartedAt = null;
  }

  if (status !== lastStatus) {
    lastStatus = status;
  }
  await sleep(POLL_MS);
}

throw new Error(`AVANTIQO_IMAGE_CACHE_WATCH_TIMEOUT:${jobId}:last_status=${lastStatus || "UNKNOWN"}`);
