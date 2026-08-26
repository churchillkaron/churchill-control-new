import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

const CONTRACT = "AVANTIQO_INTELLIGENCE_TRAINER_TO_CODE_SLOT_HANDOFF_V1";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CODE_ENDPOINT_NAME = "avantiqo-code-v1";
const TRAINER_ENDPOINT_NAME = "avantiqo-intelligence-trainer-v1";
const ALLOWED_SHARED_ENDPOINTS = new Set([
  "avantiqo-intelligence-v1",
  TRAINER_ENDPOINT_NAME,
  "avantiqo-intelligence-candidate-v1",
  CODE_ENDPOINT_NAME,
]);
const DRAIN_TIMEOUT_MS = Math.max(
  30_000,
  Math.min(5 * 60 * 1000, Number(process.env.AVANTIQO_CODE_TRAINER_SLOT_DRAIN_TIMEOUT_MS || 2 * 60 * 1000)),
);
const POLL_MS = 2_000;

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (!text(value)) return [];
  return text(value).split(",").map((entry) => entry.trim()).filter(Boolean);
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}

function managementLiveWorkerCount(endpoint = {}) {
  return (Array.isArray(endpoint.workers) ? endpoint.workers : []).filter((worker) => {
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    const exited = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
    if (desired && !exited.has(desired)) return true;
    return Boolean(status && !exited.has(status));
  }).length;
}

function stableEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    gpu_type_ids: unique(list(endpoint.gpuTypeIds)).sort(),
    data_center_ids: unique(list(endpoint.dataCenterIds)).sort(),
    network_volume_ids: endpointVolumeIds(endpoint).sort(),
    idle_timeout_seconds: number(endpoint.idleTimeout, null),
    execution_timeout_ms: number(endpoint.executionTimeoutMs ?? endpoint.executionTimeout, null),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: number(endpoint.scalerValue, null),
    flashboot: endpoint.flashBoot ?? endpoint.flashboot ?? null,
  };
}

function healthCounters(body = {}) {
  const jobs = body.jobs || {};
  const workers = body.workers || {};
  return {
    jobs: {
      in_queue: number(jobs.inQueue ?? jobs.in_queue),
      in_progress: number(jobs.inProgress ?? jobs.in_progress),
      completed: number(jobs.completed),
      failed: number(jobs.failed),
      retried: number(jobs.retried),
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

function activeWorkerCount(health) {
  return Object.values(health?.workers || {}).reduce(
    (sum, value) => sum + Math.max(0, number(value)),
    0,
  );
}

function trainerBusy(health) {
  return Boolean(
    health.jobs.in_queue > 0 ||
    health.jobs.in_progress > 0 ||
    health.workers.initializing > 0 ||
    health.workers.running > 0 ||
    health.workers.throttled > 0 ||
    health.workers.unhealthy > 0
  );
}

function peerActive(health) {
  return Boolean(
    health.jobs.in_queue > 0 ||
    health.jobs.in_progress > 0 ||
    activeWorkerCount(health) > 0
  );
}

function codeExecutionActive(health) {
  return Boolean(
    health.jobs.in_progress > 0 ||
    activeWorkerCount(health) > 0
  );
}

function runpodErrorDetail(body, raw = "") {
  const detail = [
    body?.detail,
    body?.message?.detail,
    body?.error?.detail,
    body?.message,
    body?.error?.message,
    body?.error,
    raw,
  ].map((value) => (typeof value === "string" ? value.trim() : "")).find(Boolean) || "UNKNOWN";
  return detail.slice(0, 1200);
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
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(`RUNPOD_HTTP_${response.status}:${runpodErrorDetail(body, raw)}`);
  }
  return body ?? {};
}

async function managementEndpoints(key) {
  const body = await requestJson(
    `${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`,
    key,
  );
  if (!Array.isArray(body)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
  return body;
}

async function queueHealth(endpointId, key) {
  return healthCounters(
    await requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, key),
  );
}

async function waitForTrainerRelease(trainerId, managementKey, queueKey) {
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  let latest = null;
  while (Date.now() < deadline) {
    const [endpoints, health] = await Promise.all([
      managementEndpoints(managementKey),
      queueHealth(trainerId, queueKey),
    ]);
    const trainer = endpoints.find((endpoint) => text(endpoint.id) === trainerId);
    if (!trainer) throw new Error("AVANTIQO_TRAINER_ENDPOINT_DISAPPEARED_DURING_HANDOFF");
    latest = {
      workers_min: number(trainer.workersMin, null),
      workers_max: number(trainer.workersMax, null),
      live_management_workers: managementLiveWorkerCount(trainer),
      health,
    };
    if (
      latest.workers_min === 0 &&
      latest.workers_max === 0 &&
      latest.live_management_workers === 0 &&
      activeWorkerCount(health) === 0 &&
      health.jobs.in_progress === 0
    ) {
      return latest;
    }
    await sleep(POLL_MS);
  }
  throw new Error(`AVANTIQO_TRAINER_SLOT_RELEASE_TIMEOUT:${JSON.stringify(latest)}`);
}

const envPath = resolve(process.cwd(), ".env.local");
const localEnvLoaded = existsSync(envPath);
if (localEnvLoaded) loadEnvFile(envPath);

const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const queueKey = text(
  process.env.RUNPOD_AVANTIQO_CODE_API_KEY ||
  process.env.RUNPOD_API_KEY ||
  process.env.RUNPOD_MANAGEMENT_API_KEY,
);
const configuredCodeEndpointId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
const apply = process.argv.includes("--apply");

if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_OR_RUNPOD_API_KEY_REQUIRED");
if (!queueKey) throw new Error("RUNPOD_CODE_QUEUE_API_KEY_REQUIRED");
if (apply && !yes(process.env.AVANTIQO_CODE_TRAINER_SLOT_HANDOFF_APPROVED)) {
  throw new Error("AVANTIQO_CODE_TRAINER_SLOT_HANDOFF_APPROVED=YES_REQUIRED");
}

let endpoints = await managementEndpoints(managementKey);
const codeMatches = configuredCodeEndpointId
  ? endpoints.filter((endpoint) => text(endpoint.id) === configuredCodeEndpointId)
  : endpoints.filter((endpoint) => text(endpoint.name) === CODE_ENDPOINT_NAME);
const trainerMatches = endpoints.filter((endpoint) => text(endpoint.name) === TRAINER_ENDPOINT_NAME);
if (codeMatches.length !== 1 || text(codeMatches[0].name) !== CODE_ENDPOINT_NAME) {
  throw new Error(`AVANTIQO_CODE_SLOT_HANDOFF_CODE_RESOLUTION_FAILED:matches=${codeMatches.length}`);
}
if (trainerMatches.length !== 1) {
  throw new Error(`AVANTIQO_CODE_SLOT_HANDOFF_TRAINER_RESOLUTION_FAILED:matches=${trainerMatches.length}`);
}

const code = codeMatches[0];
const trainer = trainerMatches[0];
const codeStable = stableEndpoint(code);
const trainerStable = stableEndpoint(trainer);
const sharedVolumeIds = codeStable.network_volume_ids.filter((id) => trainerStable.network_volume_ids.includes(id));
if (sharedVolumeIds.length !== 1) {
  throw new Error(`AVANTIQO_CODE_SLOT_HANDOFF_SHARED_VOLUME_REQUIRED:matches=${sharedVolumeIds.length}`);
}
if (number(code.workersMin, null) !== 0 || ![0, 1].includes(number(code.workersMax, null))) {
  throw new Error("AVANTIQO_CODE_SLOT_HANDOFF_CODE_SCALING_UNSUPPORTED");
}
if (number(trainer.workersMin, null) !== 0 || ![0, 1].includes(number(trainer.workersMax, null))) {
  throw new Error("AVANTIQO_CODE_SLOT_HANDOFF_TRAINER_SCALING_UNSUPPORTED");
}

const sharedPeers = endpoints.filter((endpoint) =>
  endpointVolumeIds(endpoint).some((id) => sharedVolumeIds.includes(id)),
);
for (const peer of sharedPeers) {
  if (!ALLOWED_SHARED_ENDPOINTS.has(text(peer.name))) {
    throw new Error(`AVANTIQO_CODE_SLOT_HANDOFF_UNEXPECTED_SHARED_ENDPOINT:${text(peer.name) || "UNKNOWN"}`);
  }
}

const healthById = new Map();
for (const peer of sharedPeers) {
  healthById.set(text(peer.id), await queueHealth(text(peer.id), queueKey));
}
const codeHealth = healthById.get(codeStable.id);
const trainerHealth = healthById.get(trainerStable.id);
if (!codeHealth || !trainerHealth) throw new Error("AVANTIQO_CODE_SLOT_HANDOFF_HEALTH_REQUIRED");

const otherBlockingPeers = sharedPeers.filter((peer) => {
  const name = text(peer.name);
  return ![CODE_ENDPOINT_NAME, TRAINER_ENDPOINT_NAME].includes(name) && peerActive(healthById.get(text(peer.id)));
});
const codeQueuedJobs = number(codeHealth.jobs.in_queue);
const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  local_env_loaded: localEnvLoaded,
  shared_volume_id: sharedVolumeIds[0],
  code: {
    id: codeStable.id,
    workers_min: number(code.workersMin, null),
    workers_max: number(code.workersMax, null),
    live_management_workers: managementLiveWorkerCount(code),
    health: codeHealth,
  },
  trainer: {
    id: trainerStable.id,
    workers_min: number(trainer.workersMin, null),
    workers_max: number(trainer.workersMax, null),
    live_management_workers: managementLiveWorkerCount(trainer),
    health: trainerHealth,
  },
  code_queued_jobs: codeQueuedJobs,
  code_execution_active: codeExecutionActive(codeHealth),
  trainer_busy: trainerBusy(trainerHealth),
  other_blocking_peer_count: otherBlockingPeers.length,
  safe_to_handoff: Boolean(
    codeQueuedJobs > 0 &&
    !codeExecutionActive(codeHealth) &&
    !trainerBusy(trainerHealth) &&
    otherBlockingPeers.length === 0
  ),
  provider_job_submitted: false,
  queue_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
};

if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}
if (codeQueuedJobs <= 0) throw new Error("AVANTIQO_CODE_SLOT_HANDOFF_QUEUED_CODE_JOB_REQUIRED");
if (codeExecutionActive(codeHealth)) throw new Error("AVANTIQO_CODE_SLOT_HANDOFF_CODE_ALREADY_EXECUTING");
if (trainerBusy(trainerHealth)) throw new Error("AVANTIQO_CODE_SLOT_HANDOFF_TRAINER_BUSY");
if (otherBlockingPeers.length) {
  throw new Error(
    `AVANTIQO_CODE_SLOT_HANDOFF_OTHER_SHARED_PEER_ACTIVE:${otherBlockingPeers.map((peer) => text(peer.name)).join("|")}`,
  );
}

endpoints = await managementEndpoints(managementKey);
const freshCode = endpoints.find((endpoint) => text(endpoint.id) === codeStable.id);
const freshTrainer = endpoints.find((endpoint) => text(endpoint.id) === trainerStable.id);
if (!freshCode || !freshTrainer) throw new Error("AVANTIQO_CODE_SLOT_HANDOFF_ENDPOINT_CHANGED_BEFORE_WRITE");
if (JSON.stringify(stableEndpoint(freshCode)) !== JSON.stringify(codeStable)) {
  throw new Error("AVANTIQO_CODE_SLOT_HANDOFF_CODE_STABLE_FIELDS_CHANGED");
}
if (JSON.stringify(stableEndpoint(freshTrainer)) !== JSON.stringify(trainerStable)) {
  throw new Error("AVANTIQO_CODE_SLOT_HANDOFF_TRAINER_STABLE_FIELDS_CHANGED");
}

const [freshCodeHealth, freshTrainerHealth] = await Promise.all([
  queueHealth(codeStable.id, queueKey),
  queueHealth(trainerStable.id, queueKey),
]);
if (number(freshCodeHealth.jobs.in_queue) <= 0) {
  throw new Error("AVANTIQO_CODE_SLOT_HANDOFF_CODE_QUEUE_DRAINED_BEFORE_WRITE");
}
if (codeExecutionActive(freshCodeHealth)) {
  throw new Error("AVANTIQO_CODE_SLOT_HANDOFF_CODE_BECAME_ACTIVE_BEFORE_WRITE");
}
if (trainerBusy(freshTrainerHealth)) {
  throw new Error("AVANTIQO_CODE_SLOT_HANDOFF_TRAINER_BECAME_BUSY_BEFORE_WRITE");
}

let trainerPaused = false;
if (number(freshTrainer.workersMax, null) === 1) {
  await requestJson(
    `${REST_BASE}/endpoints/${encodeURIComponent(trainerStable.id)}`,
    managementKey,
    { method: "PATCH", body: { workersMin: 0, workersMax: 0 } },
  );
  trainerPaused = true;
}
const trainerReleased = await waitForTrainerRelease(trainerStable.id, managementKey, queueKey);

const verifiedEndpoints = await managementEndpoints(managementKey);
const verifiedCode = verifiedEndpoints.find((endpoint) => text(endpoint.id) === codeStable.id);
const verifiedTrainer = verifiedEndpoints.find((endpoint) => text(endpoint.id) === trainerStable.id);
if (!verifiedCode || !verifiedTrainer) throw new Error("AVANTIQO_CODE_SLOT_HANDOFF_VERIFY_ENDPOINT_MISSING");
if (JSON.stringify(stableEndpoint(verifiedCode)) !== JSON.stringify(codeStable)) {
  throw new Error("AVANTIQO_CODE_SLOT_HANDOFF_CODE_FIELDS_CHANGED_DURING_HANDOFF");
}
if (JSON.stringify(stableEndpoint(verifiedTrainer)) !== JSON.stringify(trainerStable)) {
  throw new Error("AVANTIQO_CODE_SLOT_HANDOFF_TRAINER_FIELDS_CHANGED_DURING_HANDOFF");
}
if (number(verifiedTrainer.workersMin, null) !== 0 || number(verifiedTrainer.workersMax, null) !== 0) {
  throw new Error("AVANTIQO_CODE_SLOT_HANDOFF_TRAINER_NOT_PAUSED");
}

let codeResumed = false;
if (number(verifiedCode.workersMax, null) === 0) {
  await requestJson(
    `${REST_BASE}/endpoints/${encodeURIComponent(codeStable.id)}`,
    managementKey,
    { method: "PATCH", body: { workersMin: 0, workersMax: 1 } },
  );
  codeResumed = true;
}

console.log(JSON.stringify({
  ...plan,
  success: true,
  mutation_performed: trainerPaused || codeResumed,
  trainer_paused: true,
  trainer_worker_released: true,
  trainer_release_snapshot: trainerReleased,
  code_resumed: number(verifiedCode.workersMax, null) === 1 || codeResumed,
  existing_queued_code_jobs_preserved: true,
  restore_trainer_after_code_certification_required: true,
  provider_job_submitted: false,
  queue_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));