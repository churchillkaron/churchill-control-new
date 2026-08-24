const QUEUE_BASE = "https://api.runpod.ai/v2";
const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_AUDIO_RUNPOD_DRAIN_WAIT_V2";
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_POLL_MS = 5_000;
const REQUIRED_STABLE_DRAIN_OBSERVATIONS = 2;

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function clamp(value, min, max, fallback) {
  return Math.max(min, Math.min(max, finite(value, fallback)));
}

function summarizeHealth(body = {}) {
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

function safeManagementWorker(worker = {}) {
  return {
    id_present: Boolean(text(worker.id)),
    desired_status: upper(worker.desiredStatus ?? worker.desired_status) || null,
    status: upper(worker.status ?? worker.workerStatus ?? worker.runtimeStatus) || null,
  };
}

function summarizeManagement(endpoint = {}) {
  const workers = Array.isArray(endpoint?.workers) ? endpoint.workers : [];
  const safeWorkers = workers.map(safeManagementWorker);
  const nonExited = safeWorkers.filter((worker) => worker.desired_status !== "EXITED");
  return {
    worker_count: safeWorkers.length,
    workers: safeWorkers,
    all_workers_desired_exited: safeWorkers.length === 0 || nonExited.length === 0,
    non_exited_worker_count: nonExited.length,
  };
}

function evaluateDrain(health, management) {
  const jobsClear = health.jobs.in_queue === 0 && health.jobs.in_progress === 0;
  const noExecutingWorkers =
    health.workers.running === 0 &&
    health.workers.throttled === 0 &&
    health.workers.unhealthy === 0;
  const managementExited = management.all_workers_desired_exited === true;
  return {
    jobs_clear: jobsClear,
    no_executing_workers: noExecutingWorkers,
    management_workers_exited: managementExited,
    health_ready_idle_overlap_ignored: true,
    health_initializing_ignored_when_management_desired_exited: managementExited,
    drained_candidate: jobsClear && noExecutingWorkers && managementExited,
  };
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
    const detail = text(body?.message || body?.error || raw).slice(0, 300);
    throw new Error(`${errorPrefix}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function readHealth(endpointId, apiKey) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  return summarizeHealth(await readJson(response, "RUNPOD_AUDIO_DRAIN_HEALTH"));
}

async function readManagement(endpointId, managementKey) {
  const response = await fetch(
    `${REST_BASE}/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=true`,
    {
      headers: {
        Authorization: `Bearer ${managementKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  const endpoint = await readJson(response, "RUNPOD_AUDIO_DRAIN_MANAGEMENT");
  if (text(endpoint?.id) !== endpointId) {
    throw new Error("RUNPOD_AUDIO_DRAIN_MANAGEMENT_ENDPOINT_ID_MISMATCH");
  }
  return summarizeManagement(endpoint);
}

async function readSnapshot(endpointId, apiKey, managementKey) {
  const [health, management] = await Promise.all([
    readHealth(endpointId, apiKey),
    readManagement(endpointId, managementKey),
  ]);
  return {
    health,
    management,
    drain: evaluateDrain(health, management),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const endpointId = required("RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID");
const apiKey = text(process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY) || required("RUNPOD_API_KEY");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const timeoutMs = clamp(
  process.env.AVANTIQO_AUDIO_RUNPOD_DRAIN_TIMEOUT_MS,
  30_000,
  30 * 60 * 1000,
  DEFAULT_TIMEOUT_MS,
);
const pollMs = clamp(
  process.env.AVANTIQO_AUDIO_RUNPOD_DRAIN_POLL_MS,
  1_000,
  30_000,
  DEFAULT_POLL_MS,
);
const startedAt = Date.now();
const deadline = startedAt + timeoutMs;
let stableDrainObservations = 0;
let latest = await readSnapshot(endpointId, apiKey, managementKey);

console.log("AVANTIQO_AUDIO_RUNPOD_DRAIN_WAIT_READ_ONLY=true");
console.log("AVANTIQO_AUDIO_RUNPOD_DRAIN_WAIT_MANAGEMENT_PLANE_AUTHORITATIVE=true");
console.log("AVANTIQO_AUDIO_RUNPOD_DRAIN_WAIT_HEALTH_BUCKET_SUM=false");
console.log("AVANTIQO_AUDIO_RUNPOD_DRAIN_WAIT_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_AUDIO_RUNPOD_DRAIN_WAIT_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_AUDIO_RUNPOD_DRAIN_WAIT_PRODUCTION_DEPLOY=false");
console.log(JSON.stringify({ event: "AVANTIQO_AUDIO_RUNPOD_DRAIN_WAIT_START", snapshot: latest }));

while (Date.now() < deadline) {
  if (latest.drain.drained_candidate) {
    stableDrainObservations += 1;
    if (stableDrainObservations >= REQUIRED_STABLE_DRAIN_OBSERVATIONS) break;
  } else {
    stableDrainObservations = 0;
  }

  await sleep(pollMs);
  latest = await readSnapshot(endpointId, apiKey, managementKey);
  console.log(
    JSON.stringify({
      event: "AVANTIQO_AUDIO_RUNPOD_DRAIN_WAIT_PROGRESS",
      elapsed_seconds: Math.round((Date.now() - startedAt) / 1000),
      stable_drain_observations: stableDrainObservations,
      snapshot: latest,
    }),
  );
}

const drained =
  latest.drain.drained_candidate &&
  stableDrainObservations >= REQUIRED_STABLE_DRAIN_OBSERVATIONS;

if (!drained) {
  console.error(
    JSON.stringify({
      success: false,
      contract: CONTRACT,
      elapsed_seconds: Math.round((Date.now() - startedAt) / 1000),
      stable_drain_observations: stableDrainObservations,
      final_snapshot: latest,
      mutation_performed: false,
      generation_submitted: false,
      production_deploy_performed: false,
      next_action: "INSPECT_AUDIO_WORKER_DRAIN_BLOCKER",
    }),
  );
  process.exit(2);
}

console.log("AVANTIQO_AUDIO_RUNPOD_DRAIN=COMPLETE");
console.log(
  JSON.stringify(
    {
      success: true,
      contract: CONTRACT,
      elapsed_seconds: Math.round((Date.now() - startedAt) / 1000),
      stable_drain_observations: stableDrainObservations,
      final_snapshot: latest,
      mutation_performed: false,
      generation_submitted: false,
      production_deploy_performed: false,
      next_action: "SAFE_TO_APPLY_AUDIO_STORAGE_AND_TEMPLATE_REPAIR",
    },
    null,
    2,
  ),
);
