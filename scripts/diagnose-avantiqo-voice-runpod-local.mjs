const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_RUNPOD_DIAGNOSTIC_V1";

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function readJson(response, errorPrefix) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 500);
    throw new Error(`${errorPrefix}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function readManagementEndpoint(endpointId, managementKey) {
  const response = await fetch(
    `${REST_BASE}/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    {
      headers: {
        Authorization: `Bearer ${managementKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  const endpoint = await readJson(response, "RUNPOD_VOICE_DIAGNOSTIC_MANAGEMENT");
  if (text(endpoint?.id) !== endpointId) {
    throw new Error("RUNPOD_VOICE_DIAGNOSTIC_ENDPOINT_ID_MISMATCH");
  }
  return endpoint;
}

async function optionalQueueRead(endpointId, path, apiKey) {
  try {
    const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    });
    const body = await readJson(response, "RUNPOD_VOICE_DIAGNOSTIC_QUEUE");
    return { ok: true, body, error: null };
  } catch (error) {
    return { ok: false, body: null, error: text(error?.message || error).slice(0, 500) };
  }
}

function safeWorker(worker = {}) {
  return {
    id_present: Boolean(text(worker.id)),
    desired_status: upper(worker.desiredStatus ?? worker.desired_status) || null,
    status: upper(worker.status ?? worker.workerStatus ?? worker.runtimeStatus) || null,
    gpu: text(worker.gpu?.displayName || worker.machine?.gpuDisplayName) || null,
    last_status_change: text(worker.lastStatusChange) || null,
    cost_per_hour: finite(worker.costPerHr),
  };
}

function safeEndpoint(endpoint = {}) {
  const workers = Array.isArray(endpoint.workers) ? endpoint.workers.map(safeWorker) : [];
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    template_name: text(endpoint.template?.name) || null,
    template_image: text(endpoint.template?.imageName) || null,
    compute_type: text(endpoint.computeType) || null,
    gpu_count: finite(endpoint.gpuCount),
    gpu_type_ids: Array.isArray(endpoint.gpuTypeIds) ? endpoint.gpuTypeIds.map(text).filter(Boolean) : [],
    data_center_ids: Array.isArray(endpoint.dataCenterIds) ? endpoint.dataCenterIds.map(text).filter(Boolean) : [],
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    flashboot: endpoint.flashboot === true,
    workers,
    worker_count: workers.length,
    non_exited_worker_count: workers.filter((worker) => worker.desired_status !== "EXITED").length,
    initializing_worker_count: workers.filter((worker) => worker.status === "INITIALIZING").length,
    running_worker_count: workers.filter((worker) => worker.status === "RUNNING").length,
    unhealthy_worker_count: workers.filter((worker) => worker.status === "UNHEALTHY").length,
  };
}

function safeHealth(body = {}) {
  const jobs = body?.jobs && typeof body.jobs === "object" ? body.jobs : {};
  const workers = body?.workers && typeof body.workers === "object" ? body.workers : {};
  return {
    jobs: {
      completed: finite(jobs.completed) ?? 0,
      failed: finite(jobs.failed) ?? 0,
      in_progress: finite(jobs.inProgress ?? jobs.in_progress) ?? 0,
      in_queue: finite(jobs.inQueue ?? jobs.in_queue) ?? 0,
      retried: finite(jobs.retried) ?? 0,
    },
    workers: {
      idle: finite(workers.idle) ?? 0,
      initializing: finite(workers.initializing) ?? 0,
      ready: finite(workers.ready) ?? 0,
      running: finite(workers.running) ?? 0,
      throttled: finite(workers.throttled) ?? 0,
      unhealthy: finite(workers.unhealthy) ?? 0,
    },
  };
}

function diagnosis(endpoint, health, job) {
  const jobStatus = upper(job?.status);
  const noManagementWorkers = endpoint.worker_count === 0;
  const noHealthWorkers = health
    ? Object.values(health.workers).every((value) => value === 0)
    : null;
  const initializing =
    endpoint.initializing_worker_count > 0 ||
    (health ? health.workers.initializing > 0 : false);
  const unhealthy =
    endpoint.unhealthy_worker_count > 0 ||
    (health ? health.workers.unhealthy > 0 : false);

  let blocker = null;
  if (jobStatus === "IN_QUEUE" && noManagementWorkers && noHealthWorkers === true) {
    blocker = "NO_WORKER_ALLOCATED_FOR_QUEUED_JOB";
  } else if (jobStatus === "IN_QUEUE" && unhealthy) {
    blocker = "WORKER_UNHEALTHY_DURING_STARTUP";
  } else if (jobStatus === "IN_QUEUE" && initializing) {
    blocker = "WORKER_COLD_START_IN_PROGRESS";
  } else if (jobStatus === "IN_QUEUE") {
    blocker = "JOB_QUEUED_WORKER_STATE_INCONCLUSIVE";
  } else if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(jobStatus)) {
    blocker = `JOB_${jobStatus}`;
  }

  return {
    blocker,
    queue_accepted: Boolean(jobStatus),
    job_status: jobStatus || null,
    worker_allocation_observed: endpoint.worker_count > 0 || (health ? Object.values(health.workers).some((value) => value > 0) : false),
    worker_initialization_observed: initializing,
    worker_unhealthy_observed: unhealthy,
    safe_to_submit_duplicate_job: false,
  };
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = managementKey;
const ttsEndpointId = required("RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID");
const sttEndpointId = required("RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID");
const jobId = text(process.env.AVANTIQO_VOICE_SMOKE_JOB_ID);

const [ttsEndpointRaw, sttEndpointRaw, ttsHealthRead, sttHealthRead, jobRead] = await Promise.all([
  readManagementEndpoint(ttsEndpointId, managementKey),
  readManagementEndpoint(sttEndpointId, managementKey),
  optionalQueueRead(ttsEndpointId, "/health", inferenceKey),
  optionalQueueRead(sttEndpointId, "/health", inferenceKey),
  jobId ? optionalQueueRead(ttsEndpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey) : Promise.resolve({ ok: false, body: null, error: "JOB_ID_NOT_SUPPLIED" }),
]);

const ttsEndpoint = safeEndpoint(ttsEndpointRaw);
const sttEndpoint = safeEndpoint(sttEndpointRaw);
const ttsHealth = ttsHealthRead.ok ? safeHealth(ttsHealthRead.body) : null;
const sttHealth = sttHealthRead.ok ? safeHealth(sttHealthRead.body) : null;
const job = jobRead.ok ? jobRead.body : null;

const result = {
  success: true,
  contract: CONTRACT,
  read_only: true,
  mutation_performed: false,
  generation_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  inference_credential_source: "RUNPOD_MANAGEMENT_API_KEY",
  tts: {
    endpoint: ttsEndpoint,
    health: ttsHealth,
    health_read: { ok: ttsHealthRead.ok, error: ttsHealthRead.error },
    job_id_supplied: Boolean(jobId),
    job: job
      ? {
          id_present: Boolean(text(job.id)),
          status: upper(job.status) || null,
          delay_time_ms: finite(job.delayTime),
          execution_time_ms: finite(job.executionTime),
          error_present: Boolean(text(job.error || job.message)),
          error: text(job.error || job.message).slice(0, 500) || null,
        }
      : null,
    diagnosis: diagnosis(ttsEndpoint, ttsHealth, job),
  },
  stt: {
    endpoint: sttEndpoint,
    health: sttHealth,
    health_read: { ok: sttHealthRead.ok, error: sttHealthRead.error },
  },
  secrets_in_output: false,
};

console.log(JSON.stringify(result, null, 2));
