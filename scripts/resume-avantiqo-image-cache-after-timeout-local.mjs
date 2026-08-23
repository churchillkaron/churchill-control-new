const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const CONTRACT = "AVANTIQO_IMAGE_ENGINE_V1";
const TARGET_MODEL = "Qwen/Qwen-Image-2512";
const TEMP_EXECUTION_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const POLL_MS = 10_000;
const MAX_WAIT_MS = 110 * 60 * 1000;

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function failedJobIdFromArgs() {
  const arg = process.argv.find((value) => value.startsWith("--failed-job-id="));
  return text(arg ? arg.slice("--failed-job-id=".length) : process.env.AVANTIQO_IMAGE_FAILED_CACHE_JOB_ID);
}

async function restRequest(path, credential, options = {}) {
  const response = await fetch(`${REST_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
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

async function queueRequest(endpointId, path, inferenceKey, options = {}) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${inferenceKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
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

function endpointVolumeIds(endpoint = {}) {
  return [
    text(endpoint.networkVolumeId),
    ...list(endpoint.networkVolumeIds).map(text),
  ].filter(Boolean);
}

function endpointFingerprint(endpoint = {}) {
  return {
    template_id: text(endpoint.templateId) || null,
    network_volume_ids: endpointVolumeIds(endpoint),
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs),
  };
}

function sameProtectedConfig(left = {}, right = {}) {
  return (
    left.template_id === right.template_id &&
    sameArray(left.network_volume_ids || [], right.network_volume_ids || []) &&
    sameArray(left.gpu_type_ids || [], right.gpu_type_ids || []) &&
    left.workers_min === right.workers_min &&
    left.workers_max === right.workers_max
  );
}

function cacheOutputValid(job = {}) {
  const output = job.output || {};
  return (
    text(output.target_model) === TARGET_MODEL &&
    output.cache_ready === true &&
    output.inference_performed === false &&
    text(output.foundation_model_source) === "runpod-cache"
  );
}

const apply = process.argv.includes("--apply");
const failedJobId = failedJobIdFromArgs();
if (!failedJobId) {
  throw new Error("AVANTIQO_IMAGE_FAILED_CACHE_JOB_ID_REQUIRED_USE_--failed-job-id=<job-id>");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");

console.log(`AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log(`AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_FAILED_JOB=${failedJobId}`);
console.log("AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_GPU_POOL_MUTATION=false");
console.log("AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_VOLUME_MUTATION=false");
console.log("AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_TEMPLATE_MUTATION=false");
console.log("AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_SECRETS_PRINTED=false");

const endpoints = await restRequest("/endpoints?includeTemplate=false&includeWorkers=false", managementKey);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
let selectedEndpoint = null;
if (configuredEndpointId) {
  const matches = endpoints.filter((endpoint) => text(endpoint?.id) === configuredEndpointId);
  if (matches.length !== 1 || text(matches[0]?.name) !== IMAGE_ENDPOINT_NAME) {
    throw new Error("AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_CONFIGURED_ENDPOINT_INVALID");
  }
  selectedEndpoint = matches[0];
} else {
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_ENDPOINT_AUTO_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  selectedEndpoint = matches[0];
}
const endpointId = text(selectedEndpoint?.id);
if (!endpointId) throw new Error("AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_ENDPOINT_ID_MISSING");
console.log(`AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_ENDPOINT_RESOLUTION=${configuredEndpointId ? "ENV_VERIFIED" : "EXACT_NAME"}`);

const [endpoint, failedJob] = await Promise.all([
  restRequest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  queueRequest(endpointId, `/status/${encodeURIComponent(failedJobId)}`, inferenceKey),
]);
if (text(endpoint?.name) !== IMAGE_ENDPOINT_NAME) {
  throw new Error("AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_ENDPOINT_NAME_MISMATCH");
}
const failedStatus = text(failedJob?.status).toUpperCase();
const failedReason = text(failedJob?.error || failedJob?.output?.error);
if (failedStatus !== "FAILED" || !failedReason.toLowerCase().includes("executiontimeout")) {
  throw new Error(
    `AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_FAILED_JOB_NOT_TIMEOUT:status=${failedStatus || "UNKNOWN"}:reason=${failedReason || "MISSING"}`,
  );
}

const original = endpointFingerprint(endpoint);
if (!original.template_id) throw new Error("AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_TEMPLATE_REQUIRED");
if (original.network_volume_ids.length !== 1) {
  throw new Error(
    `AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_EXACTLY_ONE_NETWORK_VOLUME_REQUIRED:count=${original.network_volume_ids.length}`,
  );
}
if (!original.gpu_type_ids.length) throw new Error("AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_GPU_TYPES_REQUIRED");
if (!Number.isFinite(original.execution_timeout_ms) || original.execution_timeout_ms <= 0) {
  throw new Error("AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_ORIGINAL_TIMEOUT_INVALID");
}
if (original.execution_timeout_ms >= TEMP_EXECUTION_TIMEOUT_MS) {
  throw new Error(
    `AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_NO_EXTENSION_NEEDED:current_ms=${original.execution_timeout_ms}`,
  );
}

const plan = {
  success: true,
  contract: "AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_V1",
  mode: apply ? "APPLY" : "PLAN",
  endpoint: {
    name: IMAGE_ENDPOINT_NAME,
    id_present: true,
  },
  failed_cache_job: {
    id: failedJobId,
    status: failedStatus,
    reason: failedReason,
  },
  protected_configuration: {
    template_id: original.template_id,
    network_volume_ids: original.network_volume_ids,
    gpu_type_ids: original.gpu_type_ids,
    workers_min: original.workers_min,
    workers_max: original.workers_max,
  },
  timeout: {
    original_ms: original.execution_timeout_ms,
    temporary_ms: TEMP_EXECUTION_TIMEOUT_MS,
    automatic_restore: true,
  },
  new_cache_job_required: true,
  persistent_cache_reused: true,
  safety: {
    image_endpoint_only: true,
    gpu_pool_mutation: false,
    network_volume_mutation: false,
    template_mutation: false,
    worker_scaling_mutation: false,
    production_deploy: false,
    one_new_cache_job_only: true,
  },
};

if (!apply) {
  console.log("AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_PLAN=READY");
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

let timeoutExtended = false;
let restoreInProgress = false;
let newJobId = null;

async function restoreOriginalTimeout(reason) {
  if (!timeoutExtended || restoreInProgress) return;
  restoreInProgress = true;
  try {
    const currentEndpoint = await restRequest(
      `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
      managementKey,
    );
    const current = endpointFingerprint(currentEndpoint);
    if (!sameProtectedConfig(original, current)) {
      console.error(
        `AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_RESTORE_SKIPPED_CONCURRENT_CONFIG_CHANGE reason=${reason}`,
      );
      return;
    }
    if (current.execution_timeout_ms === original.execution_timeout_ms) {
      timeoutExtended = false;
      console.log("AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_TIMEOUT_ALREADY_RESTORED=true");
      return;
    }
    if (current.execution_timeout_ms !== TEMP_EXECUTION_TIMEOUT_MS) {
      console.error(
        `AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_RESTORE_SKIPPED_CONCURRENT_TIMEOUT_CHANGE current_ms=${current.execution_timeout_ms} reason=${reason}`,
      );
      return;
    }
    await restRequest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
      method: "PATCH",
      body: { executionTimeoutMs: original.execution_timeout_ms },
    });
    const verified = await restRequest(
      `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=false`,
      managementKey,
    );
    if (finite(verified?.executionTimeoutMs) !== original.execution_timeout_ms) {
      throw new Error("AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_RESTORE_VERIFY_FAILED");
    }
    timeoutExtended = false;
    console.log(
      `AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_TIMEOUT_RESTORED=true original_ms=${original.execution_timeout_ms}`,
    );
  } finally {
    restoreInProgress = false;
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => {
    try {
      await restoreOriginalTimeout(signal);
    } catch (error) {
      console.error(
        `AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_SIGNAL_RESTORE_FAILED=${text(error?.message || error)}`,
      );
    } finally {
      process.exit(signal === "SIGINT" ? 130 : 143);
    }
  });
}

try {
  const endpointBeforeWrite = await restRequest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
  );
  const before = endpointFingerprint(endpointBeforeWrite);
  if (!sameProtectedConfig(original, before)) {
    throw new Error("AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_CONCURRENT_CONFIG_CHANGE_BEFORE_WRITE");
  }
  if (before.execution_timeout_ms !== original.execution_timeout_ms) {
    throw new Error(
      `AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_CONCURRENT_TIMEOUT_CHANGE_BEFORE_WRITE:current_ms=${before.execution_timeout_ms}`,
    );
  }

  await restRequest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { executionTimeoutMs: TEMP_EXECUTION_TIMEOUT_MS },
  });
  const endpointAfterWrite = await restRequest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
  );
  const after = endpointFingerprint(endpointAfterWrite);
  if (!sameProtectedConfig(original, after)) {
    throw new Error("AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_PROTECTED_CONFIG_CHANGED_DURING_PATCH");
  }
  if (after.execution_timeout_ms !== TEMP_EXECUTION_TIMEOUT_MS) {
    throw new Error(
      `AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_TIMEOUT_EXTENSION_VERIFY_FAILED:actual_ms=${after.execution_timeout_ms}`,
    );
  }
  timeoutExtended = true;
  console.log(
    `AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_TIMEOUT_EXTENDED=true temporary_ms=${TEMP_EXECUTION_TIMEOUT_MS}`,
  );

  const submit = await queueRequest(endpointId, "/run", inferenceKey, {
    method: "POST",
    body: {
      input: {
        contract: CONTRACT,
        operation: "cache_foundation_model",
        target_model: TARGET_MODEL,
      },
    },
  });
  let body = submit;
  let status = text(body?.status).toUpperCase();
  newJobId = text(body?.id);
  if (!newJobId && status !== "COMPLETED") {
    throw new Error(`AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_NEW_JOB_ID_MISSING:status=${status || "UNKNOWN"}`);
  }
  console.log(`AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_NEW_JOB=${newJobId || "completed-immediately"}`);

  const deadline = Date.now() + MAX_WAIT_MS;
  let lastPrintedStatus = null;
  let lastHealthAt = 0;
  while (status !== "COMPLETED") {
    if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) {
      throw new Error(
        `AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_NEW_JOB_${status}:${text(body?.error || body?.output?.error)}`,
      );
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_WAIT_TIMEOUT:${newJobId}:last_status=${status || "UNKNOWN"}`,
      );
    }

    if (status !== lastPrintedStatus || Date.now() - lastHealthAt >= 30_000) {
      const health = await queueRequest(endpointId, "/health", inferenceKey);
      const jobs = health?.jobs || {};
      const workers = health?.workers || {};
      console.log(
        `AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_PROGRESS status=${status || "UNKNOWN"} queued=${finite(jobs.inQueue ?? jobs.in_queue, 0)} in_progress=${finite(jobs.inProgress ?? jobs.in_progress, 0)} initializing=${finite(workers.initializing, 0)} running=${finite(workers.running, 0)} throttled=${finite(workers.throttled, 0)} unhealthy=${finite(workers.unhealthy, 0)}`,
      );
      lastPrintedStatus = status;
      lastHealthAt = Date.now();
    }

    await sleep(POLL_MS);
    body = await queueRequest(
      endpointId,
      `/status/${encodeURIComponent(newJobId)}`,
      inferenceKey,
    );
    status = text(body?.status).toUpperCase();
  }

  if (!cacheOutputValid(body)) {
    console.log("AVANTIQO_IMAGE_CACHE_READY=NO");
    console.log(JSON.stringify(body?.output || {}, null, 2));
    throw new Error("AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME_OUTPUT_VALIDATION_FAILED");
  }

  console.log("AVANTIQO_IMAGE_CACHE_READY=YES");
  console.log("AVANTIQO_IMAGE_CACHE_TIMEOUT_RESUME=COMPLETE");
  console.log(
    JSON.stringify(
      {
        ...plan,
        mode: "APPLY",
        failed_cache_job_id: failedJobId,
        completed_cache_job_id: newJobId,
        cache_output: body.output,
        next_action: "RUN_ONE_QWEN_IMAGE_2512_QUALITY_TEST",
      },
      null,
      2,
    ),
  );
} finally {
  await restoreOriginalTimeout("finally");
}
