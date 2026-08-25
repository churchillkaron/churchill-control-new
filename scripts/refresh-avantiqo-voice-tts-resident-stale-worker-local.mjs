import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const CONTROL_BASE = "https://api.runpod.io/v2";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_TTS_RESIDENT_STALE_WORKER_REFRESH_V1";
const ENDPOINT_ID = "d7zzs3609cn5un";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1-recovery-20260825";
const CURRENT_JOB_ID = "a6100711-05a4-4197-a764-39b1c267ead9-e2";
const EXPECTED_IMAGE = "ghcr.io/churchillkaron/avantiqo-voice-tts-worker@sha256:81e58234e242e03d207484497e7dff1689eb0bec91f96209462ac718af22174b";
const DRAIN_TIMEOUT_MS = 3 * 60_000;
const FRESH_WORKER_TIMEOUT_MS = 10 * 60_000;
const HANDOFF_TIMEOUT_MS = 45_000;
const POLL_MS = 3_000;
const REQUIRED_STABLE_DRAIN_OBSERVATIONS = 2;

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeList(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const found = normalizeList(value[key], keys, depth + 1);
    if (found) return found;
  }
  return null;
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 800);
    const error = new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
    error.httpStatus = response.status;
    throw error;
  }
  return body || {};
}

async function rest(pathname, key, options = {}) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_RESIDENT_REFRESH_REST");
}

async function queueRaw(pathname, key) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(ENDPOINT_ID)}${pathname}`, {
    headers: {
      Authorization: `Bearer ${key}`,
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
  return { response, body: body || {} };
}

async function queueRead(pathname, credentials) {
  const candidates = [...new Set([credentials.inference, credentials.management].filter(Boolean))];
  let last = null;
  for (const key of candidates) {
    const { response, body } = await queueRaw(pathname, key);
    if (response.ok) return body;
    if (![401, 403].includes(response.status)) {
      throw new Error(`RUNPOD_VOICE_TTS_RESIDENT_REFRESH_QUEUE_HTTP_${response.status}:${text(body?.error || body?.message)}`);
    }
    last = new Error(`RUNPOD_VOICE_TTS_RESIDENT_REFRESH_QUEUE_HTTP_${response.status}`);
  }
  throw last || new Error("RUNPOD_VOICE_TTS_RESIDENT_REFRESH_QUEUE_CREDENTIAL_REQUIRED");
}

async function endpointBoundTemplates(key) {
  const raw = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    key,
  );
  const templates = normalizeList(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VOICE_TTS_RESIDENT_REFRESH_TEMPLATE_LIST_INVALID");
  return templates;
}

function resolveTemplate(endpoint, templates) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  const matches = templates.filter((template) => text(template?.id) === templateId);
  if (!templateId || matches.length !== 1) {
    throw new Error(`AVANTIQO_VOICE_TTS_RESIDENT_REFRESH_TEMPLATE_RESOLUTION_FAILED:id=${templateId || "NONE"}:matches=${matches.length}`);
  }
  return matches[0];
}

async function readEndpointState(key) {
  const [endpoint, templates] = await Promise.all([
    rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}?includeTemplate=true&includeWorkers=true`, key),
    endpointBoundTemplates(key),
  ]);
  if (text(endpoint?.id) !== ENDPOINT_ID || text(endpoint?.name) !== ENDPOINT_NAME) {
    throw new Error("AVANTIQO_VOICE_TTS_RESIDENT_REFRESH_ENDPOINT_MISMATCH");
  }
  return { endpoint, template: resolveTemplate(endpoint, templates) };
}

async function controlWorkers(key) {
  const body = await readJson(await fetch(
    `${CONTROL_BASE}/serverless/${encodeURIComponent(ENDPOINT_ID)}/workers`,
    {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    },
  ), "RUNPOD_VOICE_TTS_RESIDENT_REFRESH_CONTROL");
  return list(body?.workers).map((worker) => ({
    id: text(worker?.id) || null,
    status: text(worker?.status).toUpperCase() || null,
    image: text(worker?.image) || null,
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    is_stale: worker?.isStale === true,
  }));
}

function activeControlWorkers(workers) {
  return workers.filter((worker) => !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(worker.status));
}

function managementWorkerSummary(endpoint) {
  const workers = list(endpoint?.workers).map((worker) => ({
    id: text(worker?.id) || null,
    desired_status: text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase() || null,
    status: text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase() || null,
  }));
  const nonExited = workers.filter((worker) => worker.desired_status !== "EXITED");
  return {
    workers,
    all_workers_desired_exited: workers.length === 0 || nonExited.length === 0,
    non_exited_worker_count: nonExited.length,
  };
}

function healthSummary(body = {}) {
  const jobs = object(body?.jobs);
  const workers = object(body?.workers);
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

function stableEndpoint(endpoint, template) {
  return {
    id: text(endpoint?.id),
    name: text(endpoint?.name),
    template_id: text(endpoint?.templateId || endpoint?.template?.id),
    template_image: text(template?.imageName),
    min_cuda_version: text(endpoint?.minCudaVersion),
    gpu_type_ids: unique(list(endpoint?.gpuTypeIds)),
    data_center_ids: unique(list(endpoint?.dataCenterIds)),
    idle_timeout: finite(endpoint?.idleTimeout),
    execution_timeout: finite(endpoint?.executionTimeoutMs ?? endpoint?.executionTimeout),
    flashboot: endpoint?.flashboot === true || endpoint?.flashBoot === true,
  };
}

function assertStable(before, after) {
  if (
    before.id !== after.id || before.name !== after.name ||
    before.template_id !== after.template_id || before.template_image !== after.template_image ||
    before.min_cuda_version !== after.min_cuda_version ||
    !sameSet(before.gpu_type_ids, after.gpu_type_ids) ||
    !sameSet(before.data_center_ids, after.data_center_ids) ||
    before.idle_timeout !== after.idle_timeout ||
    before.execution_timeout !== after.execution_timeout ||
    before.flashboot !== after.flashboot
  ) {
    throw new Error("AVANTIQO_VOICE_TTS_RESIDENT_REFRESH_UNRELATED_ENDPOINT_CHANGE");
  }
}

async function verifyNoActiveJobs(credentials) {
  const [job, health] = await Promise.all([
    queueRead(`/status/${encodeURIComponent(CURRENT_JOB_ID)}`, credentials),
    queueRead("/health", credentials),
  ]);
  const jobStatus = text(job?.status).toUpperCase() || "UNKNOWN";
  const healthSafe = healthSummary(health);
  if (jobStatus === "COMPLETED") {
    throw new Error("AVANTIQO_VOICE_TTS_RESIDENT_REFRESH_CURRENT_JOB_COMPLETED_RECOVER_AUDIO_FIRST");
  }
  if (!["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(jobStatus)) {
    throw new Error(`AVANTIQO_VOICE_TTS_RESIDENT_REFRESH_CURRENT_JOB_NOT_TERMINAL:${jobStatus}`);
  }
  if (healthSafe.jobs.in_queue > 0 || healthSafe.jobs.in_progress > 0) {
    throw new Error(`AVANTIQO_VOICE_TTS_RESIDENT_REFRESH_ACTIVE_JOBS:queue=${healthSafe.jobs.in_queue}:progress=${healthSafe.jobs.in_progress}`);
  }
  return { job_status: jobStatus, health: healthSafe };
}

async function waitForDrain(managementKey, credentials) {
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  let stable = 0;
  let latest = null;
  while (Date.now() < deadline) {
    const [state, healthRaw, workers] = await Promise.all([
      readEndpointState(managementKey),
      queueRead("/health", credentials),
      controlWorkers(managementKey),
    ]);
    const management = managementWorkerSummary(state.endpoint);
    const health = healthSummary(healthRaw);
    const active = activeControlWorkers(workers);
    const drained =
      health.jobs.in_queue === 0 &&
      health.jobs.in_progress === 0 &&
      health.workers.running === 0 &&
      health.workers.unhealthy === 0 &&
      management.all_workers_desired_exited;
    latest = {
      management,
      health,
      active_control_workers: active,
      drained_candidate: drained,
    };
    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_TTS_RESIDENT_STALE_DRAIN_PROGRESS",
      workers: active,
      management_all_desired_exited: management.all_workers_desired_exited,
      drained_candidate: drained,
      stable_observations: stable,
      generation_submitted: false,
      secrets_printed: false,
    }));
    if (drained) {
      stable += 1;
      if (stable >= REQUIRED_STABLE_DRAIN_OBSERVATIONS) return latest;
    } else {
      stable = 0;
    }
    await sleep(POLL_MS);
  }
  throw new Error(`AVANTIQO_VOICE_TTS_RESIDENT_REFRESH_DRAIN_TIMEOUT:${JSON.stringify(latest)}`);
}

async function waitForFreshWorker(managementKey, credentials) {
  const deadline = Date.now() + FRESH_WORKER_TIMEOUT_MS;
  let latest = null;
  while (Date.now() < deadline) {
    const [workers, healthRaw] = await Promise.all([
      controlWorkers(managementKey),
      queueRead("/health", credentials),
    ]);
    const active = activeControlWorkers(workers);
    const health = healthSummary(healthRaw);
    const fresh = active.find((worker) =>
      worker.is_stale === false &&
      (!worker.image || worker.image === EXPECTED_IMAGE) &&
      ["IDLE", "READY", "RUNNING", "THROTTLED"].includes(worker.status),
    );
    const runtimeReady = health.workers.idle > 0 || health.workers.ready > 0;
    latest = { active, health, fresh: fresh || null, runtime_ready: runtimeReady };
    console.log(JSON.stringify({
      event: "AVANTIQO_VOICE_TTS_RESIDENT_FRESH_WORKER_PROGRESS",
      workers: active,
      runtime_ready: runtimeReady,
      fresh_ready: Boolean(fresh && runtimeReady),
      generation_submitted: false,
      secrets_printed: false,
    }));
    if (fresh && runtimeReady) return fresh;
    await sleep(POLL_MS);
  }
  throw new Error(`AVANTIQO_VOICE_TTS_RESIDENT_REFRESH_FRESH_WORKER_TIMEOUT:${JSON.stringify(latest)}`);
}

async function waitForControllerCostGuard(managementKey, credentials) {
  const deadline = Date.now() + HANDOFF_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const [state, healthRaw] = await Promise.all([
      readEndpointState(managementKey),
      queueRead("/health", credentials),
    ]);
    const workersMin = finite(state.endpoint?.workersMin, 0);
    const workersMax = finite(state.endpoint?.workersMax, 0);
    const health = healthSummary(healthRaw);
    if (workersMin === 0 && workersMax === 1) {
      return { workers_min: workersMin, workers_max: workersMax, health };
    }
    await sleep(POLL_MS);
  }

  const healthRaw = await queueRead("/health", credentials);
  const health = healthSummary(healthRaw);
  if (health.jobs.in_queue === 0 && health.jobs.in_progress === 0) {
    await rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}`, managementKey, {
      method: "PATCH",
      body: { workersMin: 0, workersMax: 1 },
    });
  }
  const finalState = await readEndpointState(managementKey);
  if (finite(finalState.endpoint?.workersMin) !== 0 || finite(finalState.endpoint?.workersMax) !== 1) {
    throw new Error("AVANTIQO_VOICE_TTS_RESIDENT_REFRESH_FINAL_COST_GUARD_FAILED");
  }
  return { workers_min: 0, workers_max: 1, health };
}

const approved = text(process.env.AVANTIQO_VOICE_TTS_RESIDENT_STALE_REFRESH_APPROVED).toUpperCase() === "YES";
if (!approved) {
  throw new Error("AVANTIQO_VOICE_TTS_RESIDENT_STALE_REFRESH_APPROVED=YES_REQUIRED");
}

const credentials = {
  management: required("RUNPOD_MANAGEMENT_API_KEY"),
  inference: text(process.env.RUNPOD_API_KEY),
};

const noJobs = await verifyNoActiveJobs(credentials);
const initial = await readEndpointState(credentials.management);
if (text(initial.template?.imageName) !== EXPECTED_IMAGE) {
  throw new Error(`AVANTIQO_VOICE_TTS_RESIDENT_REFRESH_IMAGE_MISMATCH:${text(initial.template?.imageName) || "NONE"}`);
}
if (finite(initial.endpoint?.workersMax) !== 1 || ![0, 1].includes(finite(initial.endpoint?.workersMin))) {
  throw new Error(`AVANTIQO_VOICE_TTS_RESIDENT_REFRESH_SCALING_UNSAFE:min=${finite(initial.endpoint?.workersMin)}:max=${finite(initial.endpoint?.workersMax)}`);
}

const baseline = stableEndpoint(initial.endpoint, initial.template);
const initialWorkers = activeControlWorkers(await controlWorkers(credentials.management));
const freshAlreadyReady = initialWorkers.find((worker) =>
  worker.is_stale === false &&
  (!worker.image || worker.image === EXPECTED_IMAGE) &&
  ["IDLE", "READY", "RUNNING", "THROTTLED"].includes(worker.status),
);

if (freshAlreadyReady) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    outcome: "FRESH_WORKER_ALREADY_PRESENT",
    endpoint_id: ENDPOINT_ID,
    current_job_status: noJobs.job_status,
    fresh_worker: freshAlreadyReady,
    mutation_performed: false,
    generation_submitted: false,
    workers_min_change_requested: false,
    secrets_printed: false,
  }, null, 2));
} else {
  if (initialWorkers.length > 0 && initialWorkers.some((worker) => worker.is_stale !== true)) {
    throw new Error("AVANTIQO_VOICE_TTS_RESIDENT_REFRESH_NON_STALE_UNKNOWN_WORKER_PRESENT");
  }

  await rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}`, credentials.management, {
    method: "PATCH",
    body: { workersMin: 0, workersMax: 0 },
  });
  await waitForDrain(credentials.management, credentials);

  const paused = await readEndpointState(credentials.management);
  assertStable(baseline, stableEndpoint(paused.endpoint, paused.template));
  if (finite(paused.endpoint?.workersMin) !== 0 || finite(paused.endpoint?.workersMax) !== 0) {
    throw new Error("AVANTIQO_VOICE_TTS_RESIDENT_REFRESH_PAUSE_VERIFY_FAILED");
  }

  await rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}`, credentials.management, {
    method: "PATCH",
    body: { workersMin: 1, workersMax: 1 },
  });

  const freshWorker = await waitForFreshWorker(credentials.management, credentials);
  const handoff = await waitForControllerCostGuard(credentials.management, credentials);
  const finalState = await readEndpointState(credentials.management);
  assertStable(baseline, stableEndpoint(finalState.endpoint, finalState.template));

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    outcome: "STALE_WORKER_DRAINED_FRESH_WORKER_READY",
    endpoint_id: ENDPOINT_ID,
    current_job_status: noJobs.job_status,
    fresh_worker: freshWorker,
    final_workers_min: finite(finalState.endpoint?.workersMin),
    final_workers_max: finite(finalState.endpoint?.workersMax),
    controller_handoff_health: handoff.health,
    always_on_billing_enabled: false,
    mutation_performed: true,
    generation_submitted: false,
    duplicate_generation_submitted: false,
    stt_submitted: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  }, null, 2));
}
