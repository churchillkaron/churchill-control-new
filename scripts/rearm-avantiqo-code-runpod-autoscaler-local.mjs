import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_CODE_RUNPOD_AUTOSCALER_REARM_V1";
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
const OBSERVE_TIMEOUT_MS = 2 * 60_000;

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
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_CODE_AUTOSCALER_REARM_GIT_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_CODE_AUTOSCALER_REARM_GIT_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_CODE_AUTOSCALER_REARM_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_CODE_AUTOSCALER_REARM_GIT_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_CODE_AUTOSCALER_REARM_GIT_REMOTE_FAILED");
  if (head !== remote) {
    throw new Error(`AVANTIQO_CODE_AUTOSCALER_REARM_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
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

function activeControlWorkerCount(body = {}) {
  return safeControlWorkers(body).filter((worker) => {
    const terminal = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
    const status = text(worker.status).toUpperCase();
    const desired = text(worker.desired_status).toUpperCase();
    return Boolean((status && !terminal.has(status)) || (desired && !terminal.has(desired)));
  }).length;
}

function stableEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    gpu_type_ids: list(endpoint.gpuTypeIds).sort(),
    data_center_ids: list(endpoint.dataCenterIds).sort(),
    network_volume_ids: endpointVolumeIds(endpoint).sort(),
    workers_min: finite(endpoint.workersMin, null),
    workers_max: finite(endpoint.workersMax, null),
    idle_timeout_seconds: finite(endpoint.idleTimeout, null),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout, null),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue, null),
    flashboot: endpoint.flashBoot ?? endpoint.flashboot ?? null,
  };
}

function endpointExecutionActive(health, control) {
  return Boolean(
    health?.jobs?.in_progress > 0 ||
    activeHealthWorkerCount(health) > 0 ||
    activeControlWorkerCount(control) > 0
  );
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
  if (!Array.isArray(endpoints)) throw new Error("AVANTIQO_CODE_AUTOSCALER_REARM_ENDPOINT_LIST_INVALID");
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
  throw lastError || new Error("AVANTIQO_CODE_AUTOSCALER_REARM_JOB_STATUS_FAILED");
}

async function accountState(managementKey) {
  const query = `
    query AvantiqoCodeAutoscalerRearmAccountState {
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
    throw new Error(`AVANTIQO_CODE_AUTOSCALER_REARM_ACCOUNT_STATE_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  return body.data.myself;
}

async function totalActiveControlWorkers(endpoints, managementKey) {
  const snapshots = await Promise.all(
    endpoints.map(async (endpoint) => ({
      endpoint_id: text(endpoint.id),
      endpoint_name: text(endpoint.name) || null,
      control: await controlWorkers(text(endpoint.id), managementKey),
    })),
  );
  const total = snapshots.reduce((sum, snapshot) => sum + activeControlWorkerCount(snapshot.control), 0);
  return { total, snapshots };
}

const envPath = resolve(process.cwd(), ".env.local");
const localEnvLoaded = existsSync(envPath);
if (localEnvLoaded) loadEnvFile(envPath);

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(nodeMajor) || nodeMajor < 24) {
  throw new Error(`AVANTIQO_CODE_AUTOSCALER_REARM_NODE24_REQUIRED:actual=${process.versions.node}`);
}
if (text(process.env.NODE_ENV).toLowerCase() !== "development") {
  throw new Error("AVANTIQO_CODE_AUTOSCALER_REARM_DEVELOPMENT_ENV_REQUIRED");
}

const apply = process.argv.includes("--apply");
if (apply && !yes(process.env.AVANTIQO_CODE_AUTOSCALER_REARM_APPROVED)) {
  throw new Error("AVANTIQO_CODE_AUTOSCALER_REARM_APPROVED=YES_REQUIRED");
}

const usageId = text(process.env.AVANTIQO_CODE_PLANNER_PENDING_USAGE_ID);
const providerJobId = text(process.env.AVANTIQO_CODE_PLANNER_PENDING_PROVIDER_JOB_ID);
if (!usageId || !providerJobId) {
  throw new Error("AVANTIQO_CODE_AUTOSCALER_REARM_EXACT_PENDING_TARGET_REQUIRED");
}

const mainCommit = validateCurrentMain();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const queueKey = text(
  process.env.RUNPOD_AVANTIQO_CODE_API_KEY ||
  process.env.RUNPOD_API_KEY ||
  process.env.RUNPOD_MANAGEMENT_API_KEY,
);
if (!managementKey || !queueKey) throw new Error("AVANTIQO_CODE_AUTOSCALER_REARM_RUNPOD_KEYS_REQUIRED");

const configuredCodeEndpointId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
let endpoints = await managementEndpoints(managementKey);
const codeMatches = configuredCodeEndpointId
  ? endpoints.filter((endpoint) => text(endpoint.id) === configuredCodeEndpointId && text(endpoint.name) === CODE_ENDPOINT_NAME)
  : endpoints.filter((endpoint) => text(endpoint.name) === CODE_ENDPOINT_NAME);
const trainerMatches = endpoints.filter((endpoint) => text(endpoint.name) === TRAINER_ENDPOINT_NAME);
if (codeMatches.length !== 1) throw new Error(`AVANTIQO_CODE_AUTOSCALER_REARM_CODE_RESOLUTION_FAILED:${codeMatches.length}`);
if (trainerMatches.length !== 1) throw new Error(`AVANTIQO_CODE_AUTOSCALER_REARM_TRAINER_RESOLUTION_FAILED:${trainerMatches.length}`);

const code = codeMatches[0];
const trainer = trainerMatches[0];
const codeStable = stableEndpoint(code);
const trainerStable = stableEndpoint(trainer);
const sharedVolumeIds = codeStable.network_volume_ids.filter((id) => trainerStable.network_volume_ids.includes(id));
if (sharedVolumeIds.length !== 1) {
  throw new Error(`AVANTIQO_CODE_AUTOSCALER_REARM_SHARED_VOLUME_REQUIRED:${sharedVolumeIds.length}`);
}
if (codeStable.workers_min !== 0 || codeStable.workers_max !== 1) {
  throw new Error(`AVANTIQO_CODE_AUTOSCALER_REARM_CODE_SCALING_REQUIRED:min=${codeStable.workers_min}:max=${codeStable.workers_max}`);
}
if (trainerStable.workers_min !== 0 || trainerStable.workers_max !== 0) {
  throw new Error(`AVANTIQO_CODE_AUTOSCALER_REARM_TRAINER_MUST_REMAIN_PARKED:min=${trainerStable.workers_min}:max=${trainerStable.workers_max}`);
}

const sharedPeers = endpoints.filter((endpoint) =>
  endpointVolumeIds(endpoint).some((id) => sharedVolumeIds.includes(id)),
);
for (const peer of sharedPeers) {
  if (!ALLOWED_SHARED_ENDPOINTS.has(text(peer.name))) {
    throw new Error(`AVANTIQO_CODE_AUTOSCALER_REARM_UNEXPECTED_SHARED_ENDPOINT:${text(peer.name) || "UNKNOWN"}`);
  }
}

const [account, concurrency, jobBefore] = await Promise.all([
  accountState(managementKey),
  totalActiveControlWorkers(endpoints, managementKey),
  providerJob(codeStable.id, providerJobId, queueKey),
]);
const clientBalance = finite(account.clientBalance, null);
const minBalance = finite(account.minBalance, 0);
const maxConcurrency = finite(account.maxServerlessConcurrency, null);
const balanceSafe = account.underBalance !== true && clientBalance !== null && clientBalance > Math.max(0, minBalance || 0);
const concurrencySafe = maxConcurrency !== null && maxConcurrency > concurrency.total;

const peerSnapshots = [];
for (const peer of sharedPeers) {
  const [health, control] = await Promise.all([
    queueHealth(text(peer.id), queueKey),
    controlWorkers(text(peer.id), managementKey),
  ]);
  peerSnapshots.push({
    endpoint_id: text(peer.id),
    endpoint_name: text(peer.name),
    workers_min: finite(peer.workersMin, null),
    workers_max: finite(peer.workersMax, null),
    health,
    active_control_workers: activeControlWorkerCount(control),
    control_workers: safeControlWorkers(control),
  });
}

const codeSnapshot = peerSnapshots.find((snapshot) => snapshot.endpoint_id === codeStable.id);
const trainerSnapshot = peerSnapshots.find((snapshot) => snapshot.endpoint_id === trainerStable.id);
if (!codeSnapshot || !trainerSnapshot) throw new Error("AVANTIQO_CODE_AUTOSCALER_REARM_SHARED_PEER_SNAPSHOTS_REQUIRED");

const otherBlockingPeers = peerSnapshots.filter((snapshot) =>
  ![codeStable.id, trainerStable.id].includes(snapshot.endpoint_id) &&
  Boolean(
    snapshot.health.jobs.in_queue > 0 ||
    snapshot.health.jobs.in_progress > 0 ||
    activeHealthWorkerCount(snapshot.health) > 0 ||
    snapshot.active_control_workers > 0
  ),
);

const jobStatusBefore = text(jobBefore?.status).toUpperCase();
const safeToRearm = Boolean(
  balanceSafe &&
  concurrencySafe &&
  jobStatusBefore === "IN_QUEUE" &&
  codeSnapshot.health.jobs.in_queue === 1 &&
  codeSnapshot.health.jobs.in_progress === 0 &&
  activeHealthWorkerCount(codeSnapshot.health) === 0 &&
  codeSnapshot.active_control_workers === 0 &&
  trainerSnapshot.health.jobs.in_queue === 0 &&
  trainerSnapshot.health.jobs.in_progress === 0 &&
  activeHealthWorkerCount(trainerSnapshot.health) === 0 &&
  trainerSnapshot.active_control_workers === 0 &&
  otherBlockingPeers.length === 0
);

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_commit: mainCommit,
  local_env_loaded: localEnvLoaded,
  usage_id: usageId,
  provider_job_id: providerJobId,
  shared_volume_id: sharedVolumeIds[0],
  account: {
    under_balance: account.underBalance === true,
    min_balance_usd: minBalance,
    client_balance_usd: clientBalance,
    balance_safe: balanceSafe,
    max_serverless_concurrency: maxConcurrency,
    active_control_workers: concurrency.total,
    concurrency_remaining: maxConcurrency === null ? null : maxConcurrency - concurrency.total,
    concurrency_safe: concurrencySafe,
  },
  code: codeSnapshot,
  trainer: trainerSnapshot,
  provider_job_status: jobStatusBefore || null,
  other_blocking_shared_peers: otherBlockingPeers.map((snapshot) => snapshot.endpoint_name),
  safe_to_rearm: safeToRearm,
  provider_job_submitted: false,
  queue_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
};

console.log(JSON.stringify({ event: "AVANTIQO_CODE_AUTOSCALER_REARM_PREFLIGHT", ...plan }, null, 2));
if (!apply) process.exit(0);
if (!balanceSafe) {
  throw new Error(`AVANTIQO_CODE_AUTOSCALER_REARM_RUNPOD_BALANCE_NOT_POSITIVE:client=${clientBalance}:minimum=${minBalance}`);
}
if (!concurrencySafe) {
  throw new Error(`AVANTIQO_CODE_AUTOSCALER_REARM_CONCURRENCY_UNAVAILABLE:active=${concurrency.total}:max=${maxConcurrency}`);
}
if (!safeToRearm) throw new Error("AVANTIQO_CODE_AUTOSCALER_REARM_PREFLIGHT_NOT_SAFE");

endpoints = await managementEndpoints(managementKey);
const freshCode = endpoints.find((endpoint) => text(endpoint.id) === codeStable.id);
const freshTrainer = endpoints.find((endpoint) => text(endpoint.id) === trainerStable.id);
if (!freshCode || !freshTrainer) throw new Error("AVANTIQO_CODE_AUTOSCALER_REARM_ENDPOINT_CHANGED_BEFORE_WRITE");
if (JSON.stringify(stableEndpoint(freshCode)) !== JSON.stringify(codeStable)) {
  throw new Error("AVANTIQO_CODE_AUTOSCALER_REARM_CODE_FIELDS_CHANGED_BEFORE_WRITE");
}
if (JSON.stringify(stableEndpoint(freshTrainer)) !== JSON.stringify(trainerStable)) {
  throw new Error("AVANTIQO_CODE_AUTOSCALER_REARM_TRAINER_FIELDS_CHANGED_BEFORE_WRITE");
}

const [freshAccount, freshCodeHealth, freshCodeControl, freshTrainerHealth, freshTrainerControl, freshJob] = await Promise.all([
  accountState(managementKey),
  queueHealth(codeStable.id, queueKey),
  controlWorkers(codeStable.id, managementKey),
  queueHealth(trainerStable.id, queueKey),
  controlWorkers(trainerStable.id, managementKey),
  providerJob(codeStable.id, providerJobId, queueKey),
]);
const freshClientBalance = finite(freshAccount.clientBalance, null);
const freshMinBalance = finite(freshAccount.minBalance, 0);
if (freshAccount.underBalance === true || freshClientBalance === null || freshClientBalance <= Math.max(0, freshMinBalance || 0)) {
  throw new Error(`AVANTIQO_CODE_AUTOSCALER_REARM_BALANCE_CHANGED_BEFORE_WRITE:client=${freshClientBalance}:minimum=${freshMinBalance}`);
}
if (text(freshJob?.status).toUpperCase() !== "IN_QUEUE") {
  throw new Error(`AVANTIQO_CODE_AUTOSCALER_REARM_JOB_CHANGED_BEFORE_WRITE:${text(freshJob?.status).toUpperCase() || "UNKNOWN"}`);
}
if (
  freshCodeHealth.jobs.in_queue !== 1 ||
  freshCodeHealth.jobs.in_progress !== 0 ||
  endpointExecutionActive(freshCodeHealth, freshCodeControl)
) {
  throw new Error(`AVANTIQO_CODE_AUTOSCALER_REARM_CODE_BECAME_ACTIVE_BEFORE_WRITE:${JSON.stringify(freshCodeHealth)}`);
}
if (
  freshTrainerHealth.jobs.in_queue !== 0 ||
  freshTrainerHealth.jobs.in_progress !== 0 ||
  endpointExecutionActive(freshTrainerHealth, freshTrainerControl)
) {
  throw new Error(`AVANTIQO_CODE_AUTOSCALER_REARM_TRAINER_BECAME_ACTIVE_BEFORE_WRITE:${JSON.stringify(freshTrainerHealth)}`);
}

await requestJson(`${REST_BASE}/endpoints/${encodeURIComponent(codeStable.id)}`, managementKey, {
  method: "PATCH",
  body: { workersMin: 0, workersMax: 0 },
});

const parkedEndpoints = await managementEndpoints(managementKey);
const parkedCode = parkedEndpoints.find((endpoint) => text(endpoint.id) === codeStable.id);
if (!parkedCode || finite(parkedCode.workersMin, null) !== 0 || finite(parkedCode.workersMax, null) !== 0) {
  throw new Error("AVANTIQO_CODE_AUTOSCALER_REARM_PARK_VERIFY_FAILED");
}
const parkedJob = await providerJob(codeStable.id, providerJobId, queueKey);
if (text(parkedJob?.status).toUpperCase() !== "IN_QUEUE") {
  throw new Error(`AVANTIQO_CODE_AUTOSCALER_REARM_JOB_NOT_PRESERVED_WHILE_PARKED:${text(parkedJob?.status).toUpperCase() || "UNKNOWN"}`);
}

await requestJson(`${REST_BASE}/endpoints/${encodeURIComponent(codeStable.id)}`, managementKey, {
  method: "PATCH",
  body: { workersMin: 0, workersMax: 1 },
});

const resumedEndpoints = await managementEndpoints(managementKey);
const resumedCode = resumedEndpoints.find((endpoint) => text(endpoint.id) === codeStable.id);
if (!resumedCode || finite(resumedCode.workersMin, null) !== 0 || finite(resumedCode.workersMax, null) !== 1) {
  throw new Error("AVANTIQO_CODE_AUTOSCALER_REARM_RESUME_VERIFY_FAILED");
}

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_AUTOSCALER_REARM_APPLIED",
  contract: CONTRACT,
  usage_id: usageId,
  provider_job_id: providerJobId,
  code_endpoint_id: codeStable.id,
  workers_max_transition: [1, 0, 1],
  exact_queued_job_preserved: true,
  trainer_remained_parked: true,
  provider_job_submitted: false,
  queue_mutation_performed: false,
  endpoint_mutation_performed: true,
  production_deploy_performed: false,
  secrets_printed: false,
}));

const observeStartedAt = Date.now();
let workerObserved = false;
let jobLeftQueue = false;
let terminalStatus = null;
let latest = null;
let lastProgressAt = 0;

while (Date.now() - observeStartedAt < OBSERVE_TIMEOUT_MS) {
  const [job, health, control] = await Promise.all([
    providerJob(codeStable.id, providerJobId, queueKey),
    queueHealth(codeStable.id, queueKey),
    controlWorkers(codeStable.id, managementKey),
  ]);
  const status = text(job?.status).toUpperCase() || "UNKNOWN";
  const controlCount = activeControlWorkerCount(control);
  const healthWorkerCount = activeHealthWorkerCount(health);
  workerObserved = workerObserved || controlCount > 0 || healthWorkerCount > 0;
  jobLeftQueue = jobLeftQueue || status !== "IN_QUEUE" || health.jobs.in_progress > 0;
  if (["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status)) terminalStatus = status;
  latest = {
    status,
    health,
    active_control_workers: controlCount,
    control_workers: safeControlWorkers(control),
  };

  if (Date.now() - lastProgressAt >= 10_000) {
    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_AUTOSCALER_REARM_PROGRESS",
      contract: CONTRACT,
      provider_job_id: providerJobId,
      elapsed_seconds: Math.round((Date.now() - observeStartedAt) / 1000),
      provider_status: status,
      worker_observed: workerObserved,
      job_left_queue: jobLeftQueue,
      health,
      active_control_workers: controlCount,
      provider_job_submitted: false,
      secrets_printed: false,
    }));
    lastProgressAt = Date.now();
  }

  if (workerObserved || jobLeftQueue || terminalStatus) break;
  await sleep(POLL_MS);
}

const recoveryTriggered = Boolean(workerObserved || jobLeftQueue || terminalStatus);
console.log(JSON.stringify({
  success: recoveryTriggered,
  contract: CONTRACT,
  usage_id: usageId,
  provider_job_id: providerJobId,
  code_endpoint_id: codeStable.id,
  shared_volume_id: sharedVolumeIds[0],
  autoscaler_rearmed: true,
  worker_observed: workerObserved,
  job_left_queue: jobLeftQueue,
  terminal_status: terminalStatus,
  latest,
  next_action: recoveryTriggered
    ? "KEEP_EXISTING_SETTLEMENT_RUNNING_OR_RERUN_EXISTING_PENDING_SETTLEMENT_IF_IT_ALREADY_EXITED"
    : "RUNPOD_SCHEDULER_DID_NOT_ACCEPT_EXISTING_JOB_AFTER_GUARDED_REARM",
  provider_job_submitted: false,
  queue_mutation_performed: false,
  endpoint_mutation_performed: true,
  trainer_remained_parked: true,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

if (!recoveryTriggered) process.exitCode = 1;
