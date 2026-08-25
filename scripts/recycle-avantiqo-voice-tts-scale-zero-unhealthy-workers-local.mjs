import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const CONTROL = "https://api.runpod.io/v2";
const QUEUE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_TTS_SCALE_ZERO_UNHEALTHY_RECYCLE_V1";
const ENDPOINT_ID = "d7zzs3609cn5un";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1-recovery-20260825";
const JOB_ID = "cd7fcbaa-80c6-46c8-8ae6-fcbdc4966ba4-e2";
const EXPECTED_IMAGE = "ghcr.io/churchillkaron/avantiqo-voice-tts-worker@sha256:8a161dbb77e543d50222a414b1abd28d8e20987e5ad37375c85195b854d89642";
const EXPECTED_SOURCE = "0658362e9c8857cbf7d62d13e132d2beb9b1f147";
const STATE_PATH = process.env.AVANTIQO_VOICE_TTS_RESIDENT_STATE || "/tmp/avantiqo-voice-tts-resident-recovery-state.json";
const POLL_MS = 3000;
const DRAIN_TIMEOUT_MS = 5 * 60_000;
const RESUME_WAIT_MS = 10 * 60_000;
const TERMINAL = new Set(["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"]);
const ACTIVE_WORKER_STATUSES = new Set(["IDLE", "READY", "RUNNING", "THROTTLED", "INITIALIZING", "UNHEALTHY"]);

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
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

async function parseJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 800);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function rest(pathname, key, options = {}) {
  return parseJson(await fetch(`${REST}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_SCALE_ZERO_RECYCLE_REST");
}

async function queueRaw(pathname, key) {
  const response = await fetch(`${QUEUE}/${encodeURIComponent(ENDPOINT_ID)}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  return { response, body: body || {} };
}

async function queueRead(pathname, credentials) {
  const candidates = [...new Set([credentials.inference, credentials.management].filter(Boolean))];
  let last = null;
  for (const key of candidates) {
    const { response, body } = await queueRaw(pathname, key);
    if (response.ok) return body;
    if (![401, 403].includes(response.status)) {
      throw new Error(`RUNPOD_VOICE_TTS_SCALE_ZERO_RECYCLE_QUEUE_HTTP_${response.status}:${text(body?.error || body?.message)}`);
    }
    last = new Error(`RUNPOD_VOICE_TTS_SCALE_ZERO_RECYCLE_QUEUE_HTTP_${response.status}`);
  }
  throw last || new Error("RUNPOD_VOICE_TTS_SCALE_ZERO_RECYCLE_QUEUE_CREDENTIAL_REQUIRED");
}

async function controlWorkers(key) {
  const body = await parseJson(await fetch(`${CONTROL}/serverless/${encodeURIComponent(ENDPOINT_ID)}/workers`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_SCALE_ZERO_RECYCLE_CONTROL");
  return list(body?.workers).map((worker) => ({
    id: text(worker?.id) || null,
    status: text(worker?.status).toUpperCase() || null,
    image: text(worker?.image) || null,
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    is_stale: worker?.isStale === true,
  }));
}

async function endpointBoundTemplates(key) {
  const raw = await rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", key);
  const templates = normalizeList(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VOICE_TTS_SCALE_ZERO_RECYCLE_TEMPLATE_LIST_INVALID");
  return templates;
}

async function endpointSnapshot(key) {
  const endpoint = await rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}?includeTemplate=true&includeWorkers=true`, key);
  if (text(endpoint?.id) !== ENDPOINT_ID || text(endpoint?.name) !== ENDPOINT_NAME) {
    throw new Error("AVANTIQO_VOICE_TTS_SCALE_ZERO_RECYCLE_ENDPOINT_MISMATCH");
  }
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  const template = (await endpointBoundTemplates(key)).find((item) => text(item?.id) === templateId);
  if (!template || text(template?.imageName) !== EXPECTED_IMAGE) {
    throw new Error(`AVANTIQO_VOICE_TTS_SCALE_ZERO_RECYCLE_IMAGE_MISMATCH:${text(template?.imageName) || "NONE"}`);
  }
  return { endpoint, templateId };
}

function healthSummary(body = {}) {
  const jobs = object(body?.jobs);
  const workers = object(body?.workers);
  return {
    jobs: {
      in_queue: number(jobs.inQueue ?? jobs.in_queue),
      in_progress: number(jobs.inProgress ?? jobs.in_progress),
    },
    workers: {
      idle: number(workers.idle),
      initializing: number(workers.initializing),
      ready: number(workers.ready),
      running: number(workers.running),
      throttled: number(workers.throttled),
      unhealthy: number(workers.unhealthy),
    },
  };
}

async function exactJob(credentials) {
  const body = await queueRead(`/status/${encodeURIComponent(JOB_ID)}`, credentials);
  return { body, status: text(body?.status).toUpperCase() || "UNKNOWN" };
}

async function verifyState() {
  const state = JSON.parse(await readFile(STATE_PATH, "utf8"));
  if (
    state?.contract !== "AVANTIQO_VOICE_TTS_RESIDENT_IMAGE_RECOVERY_V1" ||
    state?.state !== "SUBMITTED" ||
    text(state?.endpoint_id) !== ENDPOINT_ID ||
    text(state?.job_id) !== JOB_ID ||
    text(state?.image) !== EXPECTED_IMAGE ||
    text(state?.source_sha) !== EXPECTED_SOURCE ||
    state?.duplicate_generation_allowed !== false
  ) {
    throw new Error(`AVANTIQO_VOICE_TTS_SCALE_ZERO_RECYCLE_STATE_UNSAFE:${JSON.stringify({
      state: state?.state || null,
      endpoint_id: state?.endpoint_id || null,
      job_id: state?.job_id || null,
      image: state?.image || null,
      source_sha: state?.source_sha || null,
    })}`);
  }
}

async function patchScale(key, workersMax) {
  await rest(`/endpoints/${encodeURIComponent(ENDPOINT_ID)}`, key, {
    method: "PATCH",
    body: { workersMin: 0, workersMax },
  });
  const { endpoint } = await endpointSnapshot(key);
  if (Number(endpoint?.workersMin) !== 0 || Number(endpoint?.workersMax) !== workersMax) {
    throw new Error(`AVANTIQO_VOICE_TTS_SCALE_ZERO_RECYCLE_SCALE_VERIFY_FAILED:min=${endpoint?.workersMin}:max=${endpoint?.workersMax}`);
  }
  return endpoint;
}

const approved = text(process.env.AVANTIQO_VOICE_TTS_SCALE_ZERO_RECYCLE_APPROVED).toUpperCase() === "YES";
if (!approved) throw new Error("AVANTIQO_VOICE_TTS_SCALE_ZERO_RECYCLE_APPROVED=YES_REQUIRED");

const credentials = {
  management: required("RUNPOD_MANAGEMENT_API_KEY"),
  inference: text(process.env.RUNPOD_API_KEY),
};

await verifyState();
const initialEndpoint = await endpointSnapshot(credentials.management);
if (Number(initialEndpoint.endpoint?.workersMin) !== 0 || Number(initialEndpoint.endpoint?.workersMax) !== 1) {
  throw new Error(`AVANTIQO_VOICE_TTS_SCALE_ZERO_RECYCLE_INITIAL_SCALE_UNSAFE:min=${initialEndpoint.endpoint?.workersMin}:max=${initialEndpoint.endpoint?.workersMax}`);
}

const initialJob = await exactJob(credentials);
if (initialJob.status === "COMPLETED") {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    endpoint_id: ENDPOINT_ID,
    job_id: JOB_ID,
    status: "COMPLETED",
    recycle_performed: false,
    workers_min: 0,
    workers_max: 1,
    generation_submitted: false,
    duplicate_generation_submitted: false,
    secrets_printed: false,
  }, null, 2));
} else {
  if (initialJob.status !== "IN_QUEUE") {
    throw new Error(`AVANTIQO_VOICE_TTS_SCALE_ZERO_RECYCLE_JOB_NOT_QUEUED:${initialJob.status}`);
  }

  const healthBefore = healthSummary(await queueRead("/health", credentials));
  const workersBefore = await controlWorkers(credentials.management);
  const executingWorker = workersBefore.find((worker) => ["IDLE", "READY", "RUNNING", "THROTTLED"].includes(worker.status));
  if (healthBefore.jobs.in_progress !== 0 || healthBefore.workers.running !== 0 || healthBefore.workers.throttled !== 0 || executingWorker) {
    throw new Error(`AVANTIQO_VOICE_TTS_SCALE_ZERO_RECYCLE_ACTIVE_EXECUTION:${JSON.stringify({ healthBefore, workersBefore })}`);
  }
  if (healthBefore.jobs.in_queue !== 1) {
    throw new Error(`AVANTIQO_VOICE_TTS_SCALE_ZERO_RECYCLE_QUEUE_UNSAFE:${healthBefore.jobs.in_queue}`);
  }

  console.log(JSON.stringify({
    event: "AVANTIQO_VOICE_TTS_SCALE_ZERO_RECYCLE_START",
    job_id: JOB_ID,
    health: healthBefore,
    workers: workersBefore,
    workers_min: 0,
    workers_max: 1,
    generation_submitted: false,
    duplicate_generation_submitted: false,
    secrets_printed: false,
  }));

  let restored = false;
  try {
    await patchScale(credentials.management, 0);
    const drainDeadline = Date.now() + DRAIN_TIMEOUT_MS;
    let stableDrainObservations = 0;

    while (Date.now() < drainDeadline) {
      const [job, workers, endpointState] = await Promise.all([
        exactJob(credentials),
        controlWorkers(credentials.management),
        endpointSnapshot(credentials.management),
      ]);
      if (job.status !== "IN_QUEUE") {
        throw new Error(`AVANTIQO_VOICE_TTS_SCALE_ZERO_RECYCLE_JOB_CHANGED_DURING_DRAIN:${job.status}`);
      }
      const active = workers.filter((worker) => ACTIVE_WORKER_STATUSES.has(worker.status));
      const managementWorkers = list(endpointState.endpoint?.workers).map((worker) => ({
        id: text(worker?.id) || null,
        desired_status: text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase() || null,
        status: text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase() || null,
      }));
      const nonExitedDesired = managementWorkers.filter((worker) => worker.desired_status && worker.desired_status !== "EXITED");
      const drained = active.length === 0 && nonExitedDesired.length === 0;
      stableDrainObservations = drained ? stableDrainObservations + 1 : 0;
      console.log(JSON.stringify({
        event: "AVANTIQO_VOICE_TTS_SCALE_ZERO_RECYCLE_DRAIN_PROGRESS",
        job_id: JOB_ID,
        status: job.status,
        active_workers: active,
        management_workers: managementWorkers,
        stable_drain_observations: stableDrainObservations,
        workers_min: 0,
        workers_max: 0,
        generation_submitted: false,
        duplicate_generation_submitted: false,
        secrets_printed: false,
      }));
      if (stableDrainObservations >= 2) break;
      await sleep(POLL_MS);
    }

    if (stableDrainObservations < 2) {
      throw new Error("AVANTIQO_VOICE_TTS_SCALE_ZERO_RECYCLE_DRAIN_TIMEOUT");
    }

    await patchScale(credentials.management, 1);
    restored = true;

    const resumeDeadline = Date.now() + RESUME_WAIT_MS;
    let finalStatus = "IN_QUEUE";
    while (Date.now() < resumeDeadline) {
      const [job, workers, healthBody] = await Promise.all([
        exactJob(credentials),
        controlWorkers(credentials.management),
        queueRead("/health", credentials),
      ]);
      finalStatus = job.status;
      const health = healthSummary(healthBody);
      console.log(JSON.stringify({
        event: "AVANTIQO_VOICE_TTS_SCALE_ZERO_RECYCLE_RESUME_PROGRESS",
        job_id: JOB_ID,
        status: finalStatus,
        workers,
        health,
        workers_min: 0,
        workers_max: 1,
        generation_submitted: false,
        duplicate_generation_submitted: false,
        secrets_printed: false,
      }));
      if (finalStatus === "IN_PROGRESS" || finalStatus === "COMPLETED") break;
      if (TERMINAL.has(finalStatus)) {
        throw new Error(`AVANTIQO_VOICE_TTS_SCALE_ZERO_RECYCLE_JOB_${finalStatus}`);
      }
      if (finalStatus !== "IN_QUEUE") {
        throw new Error(`AVANTIQO_VOICE_TTS_SCALE_ZERO_RECYCLE_JOB_STATUS_UNSAFE:${finalStatus}`);
      }
      await sleep(POLL_MS);
    }

    if (finalStatus === "IN_QUEUE") {
      throw new Error("AVANTIQO_VOICE_TTS_SCALE_ZERO_RECYCLE_AUTOSCALE_TIMEOUT");
    }

    console.log(JSON.stringify({
      success: true,
      contract: CONTRACT,
      endpoint_id: ENDPOINT_ID,
      job_id: JOB_ID,
      status: finalStatus,
      recycle_performed: true,
      workers_min: 0,
      workers_max: 1,
      always_on_billing_enabled: false,
      generation_submitted: false,
      duplicate_generation_submitted: false,
      job_cancelled: false,
      queue_purged: false,
      stt_submitted: false,
      production_deploy_performed: false,
      pricing_activation_performed: false,
      secrets_printed: false,
    }, null, 2));
  } finally {
    if (!restored) {
      try { await patchScale(credentials.management, 1); } catch {}
    }
  }
}
