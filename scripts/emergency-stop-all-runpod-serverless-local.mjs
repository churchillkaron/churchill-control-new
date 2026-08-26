const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_RUNPOD_EMERGENCY_ALL_STOP_V1";
const APPROVAL_ENV = "AVANTIQO_RUNPOD_EMERGENCY_STOP_ALL_APPROVED";
const POLL_MS = 5_000;
const VERIFY_TIMEOUT_MS = 120_000;

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const finite = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = redact(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
    const error = new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
    error.httpStatus = response.status;
    throw error;
  }
  return body ?? {};
}

async function rest(path, key, options = {}) {
  return requestJson(`${REST_BASE}${path}`, key, options);
}

async function queue(path, key, options = {}) {
  return requestJson(`${QUEUE_BASE}${path}`, key, options);
}

function endpointsFrom(body) {
  if (Array.isArray(body)) return body;
  return list(body?.endpoints || body?.data || body?.items || body?.results);
}

function podsFrom(body) {
  if (Array.isArray(body)) return body;
  return list(body?.pods || body?.data || body?.items || body?.results);
}

function healthSummary(body = {}) {
  const jobs = body?.jobs || {};
  const workers = body?.workers || {};
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

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint?.id) || null,
    name: text(endpoint?.name) || null,
    workers_min: finite(endpoint?.workersMin, null),
    workers_max: finite(endpoint?.workersMax, null),
  };
}

function safeWorkerPod(pod = {}) {
  return {
    id_present: Boolean(text(pod?.id)),
    endpoint_id: text(pod?.endpointId || pod?.aiApiId) || null,
    desired_status: text(pod?.desiredStatus).toUpperCase() || null,
    gpu_type_id: text(pod?.machine?.gpuTypeId || pod?.gpu?.displayName) || null,
  };
}

if (text(process.env[APPROVAL_ENV]).toUpperCase() !== "YES") {
  throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const queueKey = text(process.env.RUNPOD_API_KEY) || managementKey;

console.log(`${CONTRACT}_START=true`);
console.log(`${CONTRACT}_PRODUCTION_DEPLOY=false`);
console.log(`${CONTRACT}_ENDPOINT_DELETE=false`);
console.log(`${CONTRACT}_NETWORK_VOLUME_DELETE=false`);
console.log(`${CONTRACT}_SECRETS_PRINTED=false`);

const endpointBody = await rest(
  "/endpoints?includeTemplate=false&includeWorkers=true",
  managementKey,
);
const endpoints = endpointsFrom(endpointBody);
if (!endpoints.length) throw new Error(`${CONTRACT}_NO_ENDPOINTS_FOUND`);

const original = endpoints.map(safeEndpoint);
const patchResults = [];
for (const endpoint of endpoints) {
  const id = text(endpoint?.id);
  if (!id) continue;
  await rest(`/endpoints/${encodeURIComponent(id)}`, managementKey, {
    method: "PATCH",
    body: { workersMin: 0, workersMax: 0 },
  });
  patchResults.push({ endpoint_id: id, endpoint_name: text(endpoint?.name) || null, workers_min: 0, workers_max: 0 });
}
console.log(`${CONTRACT}_ALL_ENDPOINTS_PARKED=${patchResults.length}`);

const purgeResults = [];
for (const endpoint of endpoints) {
  const id = text(endpoint?.id);
  if (!id) continue;
  try {
    const result = await queue(`/${encodeURIComponent(id)}/purge-queue`, queueKey, { method: "POST" });
    purgeResults.push({ endpoint_id: id, endpoint_name: text(endpoint?.name) || null, success: true, removed: finite(result?.removed, null) });
  } catch (error) {
    purgeResults.push({ endpoint_id: id, endpoint_name: text(endpoint?.name) || null, success: false, error: redact(error?.message).slice(0, 300) });
  }
}
console.log(`${CONTRACT}_QUEUE_PURGE_RESULTS=${JSON.stringify(purgeResults)}`);

const workerPodBody = await rest("/pods?includeWorkers=true", managementKey);
const workerPods = podsFrom(workerPodBody).filter((pod) => text(pod?.endpointId || pod?.aiApiId));
const stopResults = [];
for (const pod of workerPods) {
  const podId = text(pod?.id);
  if (!podId) continue;
  const desired = text(pod?.desiredStatus).toUpperCase();
  if (["EXITED", "TERMINATED"].includes(desired)) {
    stopResults.push({ ...safeWorkerPod(pod), stop_requested: false, already_stopped: true });
    continue;
  }
  try {
    await rest(`/pods/${encodeURIComponent(podId)}/stop`, managementKey, { method: "POST" });
    stopResults.push({ ...safeWorkerPod(pod), stop_requested: true, success: true });
  } catch (error) {
    stopResults.push({ ...safeWorkerPod(pod), stop_requested: true, success: false, error: redact(error?.message).slice(0, 300) });
  }
}
console.log(`${CONTRACT}_WORKER_STOP_RESULTS=${JSON.stringify(stopResults)}`);

let finalState = null;
const startedAt = Date.now();
while (Date.now() - startedAt <= VERIFY_TIMEOUT_MS) {
  const [freshEndpointBody, freshPodBody] = await Promise.all([
    rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey),
    rest("/pods?includeWorkers=true", managementKey),
  ]);
  const freshEndpoints = endpointsFrom(freshEndpointBody);
  const freshWorkerPods = podsFrom(freshPodBody).filter((pod) => text(pod?.endpointId || pod?.aiApiId));
  const endpointViolations = freshEndpoints
    .map(safeEndpoint)
    .filter((endpoint) => endpoint.workers_min !== 0 || endpoint.workers_max !== 0);
  const runningWorkerPods = freshWorkerPods
    .filter((pod) => !["EXITED", "TERMINATED"].includes(text(pod?.desiredStatus).toUpperCase()))
    .map(safeWorkerPod);

  const healthRows = [];
  let totalQueued = 0;
  let totalInProgress = 0;
  for (const endpoint of freshEndpoints) {
    const id = text(endpoint?.id);
    if (!id) continue;
    try {
      const health = healthSummary(await queue(`/${encodeURIComponent(id)}/health`, queueKey));
      totalQueued += health.jobs.in_queue;
      totalInProgress += health.jobs.in_progress;
      if (health.jobs.in_queue || health.jobs.in_progress || Object.values(health.workers).some((value) => value > 0)) {
        healthRows.push({ endpoint_id: id, endpoint_name: text(endpoint?.name) || null, health });
      }
    } catch (error) {
      healthRows.push({ endpoint_id: id, endpoint_name: text(endpoint?.name) || null, health_read_error: redact(error?.message).slice(0, 250) });
    }
  }

  finalState = {
    endpoint_violations: endpointViolations,
    running_serverless_worker_pods: runningWorkerPods,
    total_jobs_in_queue: totalQueued,
    total_jobs_in_progress: totalInProgress,
    active_health_rows: healthRows,
  };
  console.log(`${CONTRACT}_VERIFY=${JSON.stringify({ elapsed_seconds: Math.floor((Date.now() - startedAt) / 1000), endpoint_violations: endpointViolations.length, running_worker_pods: runningWorkerPods.length, jobs_in_queue: totalQueued, jobs_in_progress: totalInProgress })}`);

  if (endpointViolations.length === 0 && runningWorkerPods.length === 0 && totalQueued === 0 && totalInProgress === 0) break;
  await sleep(POLL_MS);
}

const success = Boolean(
  finalState &&
  finalState.endpoint_violations.length === 0 &&
  finalState.running_serverless_worker_pods.length === 0 &&
  finalState.total_jobs_in_queue === 0 &&
  finalState.total_jobs_in_progress === 0
);

const report = {
  success,
  contract: CONTRACT,
  original_endpoint_scaling: original,
  endpoint_park_mutations: patchResults,
  queue_purge_results: purgeResults,
  worker_stop_results: stopResults,
  final_state: finalState,
  policy: {
    workers_min: 0,
    workers_max: 0,
    all_pending_jobs_purged: true,
    all_serverless_worker_pods_stop_requested: true,
  },
  endpoint_deleted: false,
  network_volume_deleted: false,
  production_deploy_performed: false,
  secrets_printed: false,
};

console.log(JSON.stringify(report, null, 2));
console.log(`${CONTRACT}=${success ? "PASS" : "INCOMPLETE"}`);
if (!success) process.exit(3);
