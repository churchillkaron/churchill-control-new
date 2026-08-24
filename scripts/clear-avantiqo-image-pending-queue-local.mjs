const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function required(name, code = `${name}_REQUIRED`) {
  const value = text(process.env[name]);
  if (!value) throw new Error(code);
  return value;
}

async function parseResponse(response, prefix) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1200);
    throw new Error(`${prefix}_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function rest(path, credential, options = {}) {
  const response = await fetch(`${REST_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  return parseResponse(response, "RUNPOD_REST_HTTP");
}

async function queueRequest(path, credential, options = {}) {
  const response = await fetch(`${QUEUE_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  return parseResponse(response, "RUNPOD_QUEUE_HTTP");
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
      retried: finite(jobs.retried, 0),
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

function probeJobIdFromArgs() {
  const arg = process.argv.find((value) => value.startsWith("--probe-job-id="));
  return text(arg ? arg.slice("--probe-job-id=".length) : process.env.AVANTIQO_IMAGE_RUNTIME_PROBE_JOB_ID);
}

const apply = process.argv.includes("--apply");
const approved = text(process.env.AVANTIQO_IMAGE_QUEUE_CLEAR_APPROVED).toUpperCase() === "YES";
if (apply && !approved) {
  throw new Error("AVANTIQO_IMAGE_QUEUE_CLEAR_APPROVED=YES_REQUIRED");
}

const probeJobId = probeJobIdFromArgs();
if (!probeJobId) {
  throw new Error("AVANTIQO_IMAGE_RUNTIME_PROBE_JOB_ID_REQUIRED_USE_--probe-job-id=<job-id>");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");

console.log(`AVANTIQO_IMAGE_QUEUE_CLEAR_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log("AVANTIQO_IMAGE_QUEUE_CLEAR_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_IMAGE_QUEUE_CLEAR_INFERENCE_REQUESTED=false");
console.log("AVANTIQO_IMAGE_QUEUE_CLEAR_MODEL_DOWNLOAD_REQUESTED=false");
console.log("AVANTIQO_IMAGE_QUEUE_CLEAR_STORAGE_MUTATION=false");
console.log("AVANTIQO_IMAGE_QUEUE_CLEAR_GPU_POOL_MUTATION=false");
console.log("AVANTIQO_IMAGE_QUEUE_CLEAR_TEMPLATE_MUTATION=false");
console.log("AVANTIQO_IMAGE_QUEUE_CLEAR_PRODUCTION_DEPLOY=false");

const endpoints = await rest(
  "/endpoints?includeTemplate=false&includeWorkers=false",
  managementKey,
);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
const matches = endpoints.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
if (matches.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_QUEUE_CLEAR_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
}
const endpointId = text(matches[0]?.id);
if (!endpointId) throw new Error("AVANTIQO_IMAGE_QUEUE_CLEAR_ENDPOINT_ID_MISSING");

let endpoint = await rest(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
if (text(endpoint?.name) !== IMAGE_ENDPOINT_NAME) {
  throw new Error("AVANTIQO_IMAGE_QUEUE_CLEAR_ENDPOINT_NAME_MISMATCH");
}
const originalWorkersMin = finite(endpoint?.workersMin);
const originalWorkersMax = finite(endpoint?.workersMax);
if (originalWorkersMin !== 0 || originalWorkersMax !== 1) {
  throw new Error(
    `AVANTIQO_IMAGE_QUEUE_CLEAR_SCALING_UNEXPECTED:workersMin=${originalWorkersMin}:workersMax=${originalWorkersMax}`,
  );
}

const initialHealthBody = await queueRequest(
  `/${encodeURIComponent(endpointId)}/health`,
  inferenceKey,
);
const initialHealth = safeHealth(initialHealthBody);
const probeStatusBody = await queueRequest(
  `/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(probeJobId)}`,
  inferenceKey,
);
const probeStatus = text(probeStatusBody?.status).toUpperCase();

const plan = {
  success: true,
  contract: "AVANTIQO_IMAGE_QUEUE_CLEAR_V1",
  mode: apply ? "APPLY" : "PLAN",
  endpoint_name: IMAGE_ENDPOINT_NAME,
  endpoint_id_present: true,
  probe_job_id_present: true,
  probe_job_status: probeStatus || null,
  initial_health: initialHealth,
  original_scaling: {
    workers_min: originalWorkersMin,
    workers_max: originalWorkersMax,
  },
  actions: {
    freeze_new_worker_assignment: true,
    cancel_known_probe_if_queued: true,
    purge_all_remaining_pending_image_jobs: true,
    restore_workers_max: originalWorkersMax,
  },
  safety: {
    endpoint_name_guarded: true,
    running_jobs_must_be_zero: true,
    new_jobs_submitted: 0,
    generation_jobs_submitted: 0,
    inference_requested: false,
    gpu_pool_mutation_allowed: false,
    template_mutation_allowed: false,
    storage_mutation_allowed: false,
    production_deploy_performed: false,
  },
};

if (!apply) {
  console.log("AVANTIQO_IMAGE_QUEUE_CLEAR_PLAN=READY");
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

if (initialHealth.jobs.in_progress !== 0 || initialHealth.workers.running !== 0) {
  throw new Error(
    `AVANTIQO_IMAGE_QUEUE_CLEAR_REFUSED_ACTIVE_EXECUTION:inProgress=${initialHealth.jobs.in_progress}:runningWorkers=${initialHealth.workers.running}`,
  );
}
if (!["IN_QUEUE", "CANCELLED", "CANCELED", "FAILED", "TIMED_OUT"].includes(probeStatus)) {
  throw new Error(`AVANTIQO_IMAGE_QUEUE_CLEAR_PROBE_STATUS_UNSAFE:${probeStatus || "UNKNOWN"}`);
}

// Refetch immediately before the first write. Only the worker maximum is
// changed; GPU pool, template, storage, scaler, and idle timeout are untouched.
endpoint = await rest(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
if (text(endpoint?.name) !== IMAGE_ENDPOINT_NAME) {
  throw new Error("AVANTIQO_IMAGE_QUEUE_CLEAR_ENDPOINT_CHANGED_BEFORE_WRITE");
}
if (finite(endpoint?.workersMin) !== 0 || finite(endpoint?.workersMax) !== originalWorkersMax) {
  throw new Error("AVANTIQO_IMAGE_QUEUE_CLEAR_SCALING_CHANGED_BEFORE_WRITE");
}

let workersMaxFrozen = false;
try {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMax: 0 },
  });
  workersMaxFrozen = true;

  const frozenEndpoint = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=true`,
    managementKey,
  );
  if (finite(frozenEndpoint?.workersMax) !== 0) {
    throw new Error("AVANTIQO_IMAGE_QUEUE_CLEAR_FREEZE_VERIFY_FAILED");
  }

  if (probeStatus === "IN_QUEUE") {
    await queueRequest(
      `/${encodeURIComponent(endpointId)}/cancel/${encodeURIComponent(probeJobId)}`,
      inferenceKey,
      { method: "POST" },
    );
  }

  const purgeResult = await queueRequest(
    `/${encodeURIComponent(endpointId)}/purge-queue`,
    inferenceKey,
    { method: "POST" },
  );

  const postPurgeHealth = safeHealth(
    await queueRequest(`/${encodeURIComponent(endpointId)}/health`, inferenceKey),
  );
  if (postPurgeHealth.jobs.in_queue !== 0 || postPurgeHealth.jobs.in_progress !== 0) {
    throw new Error(
      `AVANTIQO_IMAGE_QUEUE_CLEAR_VERIFY_FAILED:inQueue=${postPurgeHealth.jobs.in_queue}:inProgress=${postPurgeHealth.jobs.in_progress}`,
    );
  }

  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMax: originalWorkersMax },
  });
  workersMaxFrozen = false;

  const restoredEndpoint = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=true`,
    managementKey,
  );
  if (
    finite(restoredEndpoint?.workersMin) !== originalWorkersMin ||
    finite(restoredEndpoint?.workersMax) !== originalWorkersMax
  ) {
    throw new Error("AVANTIQO_IMAGE_QUEUE_CLEAR_SCALING_RESTORE_VERIFY_FAILED");
  }

  console.log("AVANTIQO_IMAGE_QUEUE_CLEAR=COMPLETE");
  console.log(JSON.stringify({
    ...plan,
    mutation_performed: true,
    purge_result: purgeResult,
    final_health: postPurgeHealth,
    scaling_restored: true,
    next_action: "INSPECT_IMAGE_RUNTIME_BINDING_WITH_EMPTY_QUEUE",
  }, null, 2));
} finally {
  if (workersMaxFrozen) {
    try {
      await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
        method: "PATCH",
        body: { workersMax: originalWorkersMax },
      });
      console.log("AVANTIQO_IMAGE_QUEUE_CLEAR_EMERGENCY_SCALING_RESTORE=ATTEMPTED");
    } catch (error) {
      console.error(
        `AVANTIQO_IMAGE_QUEUE_CLEAR_EMERGENCY_SCALING_RESTORE_FAILED:${text(error?.message || error)}`,
      );
      process.exitCode = 2;
    }
  }
}
