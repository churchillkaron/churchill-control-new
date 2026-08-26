import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_CODE_RUNPOD_STALE_WORKER_RECYCLE_V1";
const REST_BASE = "https://rest.runpod.io/v1";
const CONTROL_BASE = "https://api.runpod.io/v2";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CODE_ENDPOINT_NAME = "avantiqo-code-v1";
const TRAINER_ENDPOINT_NAME = "avantiqo-intelligence-trainer-v1";
const ALLOWED_SHARED_ENDPOINTS = new Set([
  "avantiqo-intelligence-v1",
  TRAINER_ENDPOINT_NAME,
  "avantiqo-intelligence-candidate-v1",
  CODE_ENDPOINT_NAME,
]);
const POLL_MS = 2_000;
const DRAIN_TIMEOUT_MS = 2 * 60_000;
const OBSERVE_TIMEOUT_MS = 2 * 60_000;
const REQUIRED_DRAIN_OBSERVATIONS = 2;

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (!text(value)) return [];
  return text(value).split(",").map((entry) => entry.trim()).filter(Boolean);
}

function finite(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 700)}`);
  }
  return text(result.stdout);
}

function validateCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_CODE_STALE_RECYCLE_GIT_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_CODE_STALE_RECYCLE_GIT_BRANCH_FAILED");
  if (branch !== "main") {
    throw new Error(`AVANTIQO_CODE_STALE_RECYCLE_MAIN_REQUIRED:${branch || "DETACHED"}`);
  }
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_CODE_STALE_RECYCLE_GIT_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_CODE_STALE_RECYCLE_GIT_REMOTE_FAILED");
  if (head !== remote) {
    throw new Error(`AVANTIQO_CODE_STALE_RECYCLE_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
  }
  return head;
}

function endpointVolumeIds(endpoint = {}) {
  return [...new Set([
    text(endpoint.networkVolumeId),
    ...list(endpoint.networkVolumeIds),
  ].filter(Boolean))];
}

function healthSummary(body = {}) {
  const jobs = body?.jobs || {};
  const workers = body?.workers || {};
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
      completed: finite(jobs.completed, 0),
      failed: finite(jobs.failed, 0),
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

function healthBusy(health = {}) {
  return Boolean(
    health.jobs?.in_progress > 0 ||
    health.workers?.initializing > 0 ||
    health.workers?.running > 0 ||
    health.workers?.throttled > 0 ||
    health.workers?.unhealthy > 0
  );
}

function activeHealthWorkerCount(health = {}) {
  return Object.values(health.workers || {}).reduce(
    (sum, value) => sum + Math.max(0, finite(value, 0)),
    0,
  );
}

function safeControlWorkers(body = {}) {
  const source = Array.isArray(body?.workers) ? body.workers : [];
  return source.map((worker) => ({
    id_present: Boolean(text(worker?.id)),
    status: text(worker?.status).toUpperCase() || null,
    desired_status: text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase() || null,
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    is_stale: worker?.isStale === true,
  }));
}

function activeControlWorkers(body = {}) {
  const terminal = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
  return safeControlWorkers(body).filter((worker) => {
    const status = text(worker.status).toUpperCase();
    const desired = text(worker.desired_status).toUpperCase();
    return Boolean((status && !terminal.has(status)) || (desired && !terminal.has(desired)));
  });
}

function workerRecyclable(worker = {}) {
  const status = text(worker.status).toUpperCase();
  return worker.is_stale === true || ["IDLE", "READY"].includes(status);
}

function stableIdentity(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    gpu_type_ids: list(endpoint.gpuTypeIds).sort(),
    data_center_ids: list(endpoint.dataCenterIds).sort(),
    network_volume_ids: endpointVolumeIds(endpoint).sort(),
    idle_timeout_seconds: finite(endpoint.idleTimeout, null),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout, null),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue, null),
    flashboot: endpoint.flashBoot ?? endpoint.flashboot ?? null,
  };
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
    const detail = text(body?.detail || body?.message || body?.error?.message || body?.error || raw).slice(0, 1000);
    const error = new Error(`RUNPOD_HTTP_${response.status}:${detail || "UNKNOWN"}`);
    error.httpStatus = response.status;
    throw error;
  }
  return body ?? {};
}

async function managementEndpoints(key) {
  const body = await requestJson(`${REST_BASE}/endpoints?includeTemplate=false&includeWorkers=true`, key);
  const endpoints = Array.isArray(body) ? body : body?.endpoints;
  if (!Array.isArray(endpoints)) throw new Error("AVANTIQO_CODE_STALE_RECYCLE_ENDPOINT_LIST_INVALID");
  return endpoints;
}

async function queueHealth(endpointId, key) {
  return healthSummary(await requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, key));
}

async function controlWorkers(endpointId, key) {
  return requestJson(`${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`, key);
}

async function providerJob(endpointId, jobId, key) {
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await requestJson(
        `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`,
        key,
      );
    } catch (error) {
      lastError = error;
      const status = finite(error?.httpStatus, null);
      if (!(status === 429 || (status >= 500 && status <= 599)) || attempt === 4) throw error;
      await sleep(1_000);
    }
  }
  throw lastError || new Error("AVANTIQO_CODE_STALE_RECYCLE_JOB_STATUS_FAILED");
}

async function accountState(managementKey) {
  const query = `
    query AvantiqoCodeStaleWorkerRecycleAccountState {
      myself {
        underBalance
        minBalance
        maxServerlessConcurrency
        clientBalance
      }
    }
  `;
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok || body?.errors?.length || !body?.data?.myself) {
    const detail = text(body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw).slice(0, 1000);
    throw new Error(`AVANTIQO_CODE_STALE_RECYCLE_ACCOUNT_STATE_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  return body.data.myself;
}

async function totalActiveControlWorkers(endpoints, managementKey) {
  const snapshots = await Promise.all(endpoints.map(async (endpoint) => {
    const control = await controlWorkers(text(endpoint.id), managementKey);
    return {
      endpoint_id: text(endpoint.id),
      endpoint_name: text(endpoint.name) || null,
      active_control_workers: activeControlWorkers(control).length,
    };
  }));
  return {
    total: snapshots.reduce((sum, snapshot) => sum + snapshot.active_control_workers, 0),
    snapshots,
  };
}

async function waitForCodeDrain(endpointId, providerJobId, managementKey, queueKey) {
  const startedAt = Date.now();
  let stableDrainObservations = 0;
  let latest = null;

  while (Date.now() - startedAt < DRAIN_TIMEOUT_MS) {
    const [job, health, control] = await Promise.all([
      providerJob(endpointId, providerJobId, queueKey),
      queueHealth(endpointId, queueKey),
      controlWorkers(endpointId, managementKey),
    ]);
    const status = text(job?.status).toUpperCase() || "UNKNOWN";
    const active = activeControlWorkers(control);
    latest = {
      provider_status: status,
      health,
      active_control_worker_count: active.length,
      control_workers: safeControlWorkers(control),
    };

    if (status !== "IN_QUEUE" || health.jobs.in_progress > 0 || healthBusy(health)) {
      return { drained: false, job_became_active: true, latest };
    }

    const drainedNow = active.length === 0 && activeHealthWorkerCount(health) === 0;
    stableDrainObservations = drainedNow ? stableDrainObservations + 1 : 0;
    if (stableDrainObservations >= REQUIRED_DRAIN_OBSERVATIONS) {
      return { drained: true, job_became_active: false, latest };
    }
    await sleep(POLL_MS);
  }

  return { drained: false, job_became_active: false, latest };
}

const envPath = resolve(process.cwd(), ".env.local");
const localEnvLoaded = existsSync(envPath);
if (localEnvLoaded) loadEnvFile(envPath);

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(nodeMajor) || nodeMajor < 24) {
  throw new Error(`AVANTIQO_CODE_STALE_RECYCLE_NODE24_REQUIRED:actual=${process.versions.node}`);
}
if (text(process.env.NODE_ENV).toLowerCase() !== "development") {
  throw new Error("AVANTIQO_CODE_STALE_RECYCLE_DEVELOPMENT_ENV_REQUIRED");
}

const apply = process.argv.includes("--apply");
if (apply && !yes(process.env.AVANTIQO_CODE_STALE_WORKER_RECYCLE_APPROVED)) {
  throw new Error("AVANTIQO_CODE_STALE_WORKER_RECYCLE_APPROVED=YES_REQUIRED");
}

const usageId = text(process.env.AVANTIQO_CODE_PLANNER_PENDING_USAGE_ID);
const providerJobId = text(process.env.AVANTIQO_CODE_PLANNER_PENDING_PROVIDER_JOB_ID);
if (!usageId || !providerJobId) {
  throw new Error("AVANTIQO_CODE_STALE_RECYCLE_EXACT_PENDING_TARGET_REQUIRED");
}

const mainCommit = validateCurrentMain();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const queueKey = text(
  process.env.RUNPOD_AVANTIQO_CODE_API_KEY ||
  process.env.RUNPOD_API_KEY ||
  process.env.RUNPOD_MANAGEMENT_API_KEY,
);
if (!managementKey || !queueKey) throw new Error("AVANTIQO_CODE_STALE_RECYCLE_RUNPOD_KEYS_REQUIRED");

const configuredCodeEndpointId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
let endpoints = await managementEndpoints(managementKey);
const codeMatches = configuredCodeEndpointId
  ? endpoints.filter((endpoint) => text(endpoint.id) === configuredCodeEndpointId && text(endpoint.name) === CODE_ENDPOINT_NAME)
  : endpoints.filter((endpoint) => text(endpoint.name) === CODE_ENDPOINT_NAME);
const trainerMatches = endpoints.filter((endpoint) => text(endpoint.name) === TRAINER_ENDPOINT_NAME);
if (codeMatches.length !== 1) throw new Error(`AVANTIQO_CODE_STALE_RECYCLE_CODE_RESOLUTION_FAILED:${codeMatches.length}`);
if (trainerMatches.length !== 1) throw new Error(`AVANTIQO_CODE_STALE_RECYCLE_TRAINER_RESOLUTION_FAILED:${trainerMatches.length}`);

const code = codeMatches[0];
const trainer = trainerMatches[0];
const codeIdentity = stableIdentity(code);
const trainerIdentity = stableIdentity(trainer);
const sharedVolumeIds = codeIdentity.network_volume_ids.filter((id) => trainerIdentity.network_volume_ids.includes(id));
if (sharedVolumeIds.length !== 1) {
  throw new Error(`AVANTIQO_CODE_STALE_RECYCLE_SHARED_VOLUME_REQUIRED:${sharedVolumeIds.length}`);
}
if (finite(code.workersMin, null) !== 0 || finite(code.workersMax, null) !== 1) {
  throw new Error(`AVANTIQO_CODE_STALE_RECYCLE_CODE_SCALING_REQUIRED:min=${finite(code.workersMin, null)}:max=${finite(code.workersMax, null)}`);
}
if (finite(trainer.workersMin, null) !== 0 || finite(trainer.workersMax, null) !== 0) {
  throw new Error(`AVANTIQO_CODE_STALE_RECYCLE_TRAINER_MUST_REMAIN_PARKED:min=${finite(trainer.workersMin, null)}:max=${finite(trainer.workersMax, null)}`);
}

const sharedPeers = endpoints.filter((endpoint) =>
  endpointVolumeIds(endpoint).some((id) => sharedVolumeIds.includes(id)),
);
for (const peer of sharedPeers) {
  if (!ALLOWED_SHARED_ENDPOINTS.has(text(peer.name))) {
    throw new Error(`AVANTIQO_CODE_STALE_RECYCLE_UNEXPECTED_SHARED_ENDPOINT:${text(peer.name) || "UNKNOWN"}`);
  }
}

const [account, concurrency, jobBefore] = await Promise.all([
  accountState(managementKey),
  totalActiveControlWorkers(endpoints, managementKey),
  providerJob(codeIdentity.id, providerJobId, queueKey),
]);
const clientBalance = finite(account.clientBalance, null);
const minBalance = finite(account.minBalance, 0);
const maxConcurrency = finite(account.maxServerlessConcurrency, null);
const balanceSafe = account.underBalance !== true && clientBalance !== null && clientBalance > Math.max(0, minBalance || 0);

const peerSnapshots = [];
for (const peer of sharedPeers) {
  const [health, control] = await Promise.all([
    queueHealth(text(peer.id), queueKey),
    controlWorkers(text(peer.id), managementKey),
  ]);
  const active = activeControlWorkers(control);
  peerSnapshots.push({
    endpoint_id: text(peer.id),
    endpoint_name: text(peer.name),
    workers_min: finite(peer.workersMin, null),
    workers_max: finite(peer.workersMax, null),
    health,
    active_control_workers: active.length,
    recyclable_control_workers: active.filter(workerRecyclable).length,
    control_workers: safeControlWorkers(control),
  });
}

const codeSnapshot = peerSnapshots.find((snapshot) => snapshot.endpoint_id === codeIdentity.id);
const trainerSnapshot = peerSnapshots.find((snapshot) => snapshot.endpoint_id === trainerIdentity.id);
if (!codeSnapshot || !trainerSnapshot) throw new Error("AVANTIQO_CODE_STALE_RECYCLE_SHARED_PEER_SNAPSHOTS_REQUIRED");

const otherBlockingPeers = peerSnapshots.filter((snapshot) =>
  ![codeIdentity.id, trainerIdentity.id].includes(snapshot.endpoint_id) &&
  Boolean(
    snapshot.health.jobs.in_queue > 0 ||
    snapshot.health.jobs.in_progress > 0 ||
    activeHealthWorkerCount(snapshot.health) > 0 ||
    snapshot.active_control_workers > 0
  ),
);

const jobStatusBefore = text(jobBefore?.status).toUpperCase();
const codeWorkersAreRecyclable = Boolean(
  codeSnapshot.active_control_workers > 0 &&
  codeSnapshot.active_control_workers === codeSnapshot.recyclable_control_workers
);
const codeQueueSafe = Boolean(
  jobStatusBefore === "IN_QUEUE" &&
  codeSnapshot.health.jobs.in_queue === 1 &&
  codeSnapshot.health.jobs.in_progress === 0 &&
  !healthBusy(codeSnapshot.health)
);
const trainerSafe = Boolean(
  trainerSnapshot.health.jobs.in_queue === 0 &&
  trainerSnapshot.health.jobs.in_progress === 0 &&
  activeHealthWorkerCount(trainerSnapshot.health) === 0 &&
  trainerSnapshot.active_control_workers === 0
);
const safeToRecycle = Boolean(
  balanceSafe &&
  codeQueueSafe &&
  codeWorkersAreRecyclable &&
  trainerSafe &&
  otherBlockingPeers.length === 0
);

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_STALE_WORKER_RECYCLE_PREFLIGHT",
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_commit: mainCommit,
  local_env_loaded: localEnvLoaded,
  usage_id: usageId,
  provider_job_id: providerJobId,
  provider_job_status: jobStatusBefore || null,
  shared_volume_id: sharedVolumeIds[0],
  account: {
    under_balance: account.underBalance === true,
    min_balance_usd: minBalance,
    client_balance_usd: clientBalance,
    balance_safe: balanceSafe,
    max_serverless_concurrency: maxConcurrency,
    active_control_workers: concurrency.total,
    concurrency_remaining: maxConcurrency === null ? null : maxConcurrency - concurrency.total,
  },
  code: codeSnapshot,
  trainer: trainerSnapshot,
  code_queue_safe: codeQueueSafe,
  code_workers_are_recyclable: codeWorkersAreRecyclable,
  other_blocking_shared_peers: otherBlockingPeers.map((snapshot) => snapshot.endpoint_name),
  safe_to_recycle: safeToRecycle,
  provider_job_submitted: false,
  queue_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

if (!apply) process.exit(0);
if (!safeToRecycle) throw new Error("AVANTIQO_CODE_STALE_RECYCLE_PREFLIGHT_NOT_SAFE");

endpoints = await managementEndpoints(managementKey);
const freshCode = endpoints.find((endpoint) => text(endpoint.id) === codeIdentity.id);
const freshTrainer = endpoints.find((endpoint) => text(endpoint.id) === trainerIdentity.id);
if (!freshCode || !freshTrainer) throw new Error("AVANTIQO_CODE_STALE_RECYCLE_ENDPOINT_CHANGED_BEFORE_WRITE");
if (JSON.stringify(stableIdentity(freshCode)) !== JSON.stringify(codeIdentity)) {
  throw new Error("AVANTIQO_CODE_STALE_RECYCLE_CODE_IDENTITY_CHANGED_BEFORE_WRITE");
}
if (JSON.stringify(stableIdentity(freshTrainer)) !== JSON.stringify(trainerIdentity)) {
  throw new Error("AVANTIQO_CODE_STALE_RECYCLE_TRAINER_IDENTITY_CHANGED_BEFORE_WRITE");
}
if (finite(freshCode.workersMin, null) !== 0 || finite(freshCode.workersMax, null) !== 1) {
  throw new Error("AVANTIQO_CODE_STALE_RECYCLE_CODE_SCALING_CHANGED_BEFORE_WRITE");
}
if (finite(freshTrainer.workersMin, null) !== 0 || finite(freshTrainer.workersMax, null) !== 0) {
  throw new Error("AVANTIQO_CODE_STALE_RECYCLE_TRAINER_SCALING_CHANGED_BEFORE_WRITE");
}

const [freshAccount, freshJob, freshCodeHealth, freshCodeControl, freshTrainerHealth, freshTrainerControl] = await Promise.all([
  accountState(managementKey),
  providerJob(codeIdentity.id, providerJobId, queueKey),
  queueHealth(codeIdentity.id, queueKey),
  controlWorkers(codeIdentity.id, managementKey),
  queueHealth(trainerIdentity.id, queueKey),
  controlWorkers(trainerIdentity.id, managementKey),
]);
const freshClientBalance = finite(freshAccount.clientBalance, null);
const freshMinBalance = finite(freshAccount.minBalance, 0);
if (freshAccount.underBalance === true || freshClientBalance === null || freshClientBalance <= Math.max(0, freshMinBalance || 0)) {
  throw new Error(`AVANTIQO_CODE_STALE_RECYCLE_BALANCE_CHANGED_BEFORE_WRITE:client=${freshClientBalance}:minimum=${freshMinBalance}`);
}
const freshActiveCodeWorkers = activeControlWorkers(freshCodeControl);
if (
  text(freshJob?.status).toUpperCase() !== "IN_QUEUE" ||
  freshCodeHealth.jobs.in_queue !== 1 ||
  freshCodeHealth.jobs.in_progress !== 0 ||
  healthBusy(freshCodeHealth) ||
  freshActiveCodeWorkers.length === 0 ||
  freshActiveCodeWorkers.some((worker) => !workerRecyclable(worker))
) {
  throw new Error(`AVANTIQO_CODE_STALE_RECYCLE_CODE_BECAME_UNSAFE_BEFORE_WRITE:${JSON.stringify({ status: text(freshJob?.status).toUpperCase(), health: freshCodeHealth, workers: safeControlWorkers(freshCodeControl) })}`);
}
if (
  freshTrainerHealth.jobs.in_queue !== 0 ||
  freshTrainerHealth.jobs.in_progress !== 0 ||
  activeHealthWorkerCount(freshTrainerHealth) !== 0 ||
  activeControlWorkers(freshTrainerControl).length !== 0
) {
  throw new Error("AVANTIQO_CODE_STALE_RECYCLE_TRAINER_BECAME_ACTIVE_BEFORE_WRITE");
}

let paused = false;
let restored = false;
let drain = null;
try {
  await requestJson(`${REST_BASE}/endpoints/${encodeURIComponent(codeIdentity.id)}`, managementKey, {
    method: "PATCH",
    body: { workersMin: 0, workersMax: 0 },
  });
  paused = true;

  const parkedEndpoints = await managementEndpoints(managementKey);
  const parkedCode = parkedEndpoints.find((endpoint) => text(endpoint.id) === codeIdentity.id);
  if (!parkedCode || finite(parkedCode.workersMin, null) !== 0 || finite(parkedCode.workersMax, null) !== 0) {
    throw new Error("AVANTIQO_CODE_STALE_RECYCLE_PARK_VERIFY_FAILED");
  }

  drain = await waitForCodeDrain(codeIdentity.id, providerJobId, managementKey, queueKey);

  await requestJson(`${REST_BASE}/endpoints/${encodeURIComponent(codeIdentity.id)}`, managementKey, {
    method: "PATCH",
    body: { workersMin: 0, workersMax: 1 },
  });
  restored = true;
} catch (error) {
  if (paused && !restored) {
    try {
      await requestJson(`${REST_BASE}/endpoints/${encodeURIComponent(codeIdentity.id)}`, managementKey, {
        method: "PATCH",
        body: { workersMin: 0, workersMax: 1 },
      });
      restored = true;
    } catch {
      restored = false;
    }
  }
  throw new Error(`${text(error?.message || error)}:autoscaler_restore_succeeded=${restored}`);
}

const resumedEndpoints = await managementEndpoints(managementKey);
const resumedCode = resumedEndpoints.find((endpoint) => text(endpoint.id) === codeIdentity.id);
if (!resumedCode || finite(resumedCode.workersMin, null) !== 0 || finite(resumedCode.workersMax, null) !== 1) {
  throw new Error("AVANTIQO_CODE_STALE_RECYCLE_RESUME_VERIFY_FAILED");
}
if (JSON.stringify(stableIdentity(resumedCode)) !== JSON.stringify(codeIdentity)) {
  throw new Error("AVANTIQO_CODE_STALE_RECYCLE_UNRELATED_CODE_FIELDS_CHANGED");
}

if (drain?.job_became_active) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    usage_id: usageId,
    provider_job_id: providerJobId,
    autoscaler_recycle_started: true,
    worker_drain_completed: false,
    job_became_active_during_drain: true,
    latest: drain.latest,
    workers_max_restored: true,
    next_action: "KEEP_EXISTING_CERTIFICATION_RUNNING",
    provider_job_submitted: false,
    queue_mutation_performed: false,
    endpoint_mutation_performed: true,
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
  process.exit(0);
}
if (!drain?.drained) {
  throw new Error(`AVANTIQO_CODE_STALE_RECYCLE_DRAIN_TIMEOUT:${JSON.stringify(drain?.latest || null)}`);
}

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_STALE_WORKER_RECYCLE_APPLIED",
  contract: CONTRACT,
  usage_id: usageId,
  provider_job_id: providerJobId,
  workers_max_transition: [1, 0, 1],
  stale_or_idle_workers_drained: true,
  exact_queued_job_preserved: true,
  trainer_remained_parked: true,
  provider_job_submitted: false,
  queue_mutation_performed: false,
  endpoint_mutation_performed: true,
  production_deploy_performed: false,
  secrets_printed: false,
}));

const observeStartedAt = Date.now();
let latest = null;
let recoveryTriggered = false;
let lastPrintedAt = 0;
while (Date.now() - observeStartedAt < OBSERVE_TIMEOUT_MS) {
  const [job, health, control] = await Promise.all([
    providerJob(codeIdentity.id, providerJobId, queueKey),
    queueHealth(codeIdentity.id, queueKey),
    controlWorkers(codeIdentity.id, managementKey),
  ]);
  const status = text(job?.status).toUpperCase() || "UNKNOWN";
  const active = activeControlWorkers(control);
  latest = {
    provider_status: status,
    health,
    active_control_worker_count: active.length,
    control_workers: safeControlWorkers(control),
  };
  recoveryTriggered = Boolean(
    status !== "IN_QUEUE" ||
    health.jobs.in_progress > 0 ||
    health.workers.initializing > 0 ||
    health.workers.running > 0 ||
    active.length > 0
  );

  if (Date.now() - lastPrintedAt >= 10_000) {
    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_STALE_WORKER_RECYCLE_PROGRESS",
      contract: CONTRACT,
      usage_id: usageId,
      provider_job_id: providerJobId,
      elapsed_seconds: Math.round((Date.now() - observeStartedAt) / 1000),
      recovery_triggered: recoveryTriggered,
      latest,
      provider_job_submitted: false,
      secrets_printed: false,
    }));
    lastPrintedAt = Date.now();
  }

  if (recoveryTriggered) break;
  await sleep(POLL_MS);
}

console.log(JSON.stringify({
  success: recoveryTriggered,
  contract: CONTRACT,
  usage_id: usageId,
  provider_job_id: providerJobId,
  shared_volume_id: sharedVolumeIds[0],
  stale_worker_recycle_completed: true,
  recovery_triggered: recoveryTriggered,
  latest,
  next_action: recoveryTriggered
    ? "KEEP_EXISTING_CERTIFICATION_RUNNING"
    : "RUNPOD_DID_NOT_ACCEPT_EXISTING_JOB_AFTER_STALE_WORKER_RECYCLE",
  provider_job_submitted: false,
  queue_mutation_performed: false,
  endpoint_mutation_performed: true,
  trainer_remained_parked: true,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

if (!recoveryTriggered) process.exitCode = 1;
