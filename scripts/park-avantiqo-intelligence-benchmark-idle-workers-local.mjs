import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTROL_BASE = "https://api.runpod.io/v2/serverless";
const CONTRACT = "AVANTIQO_INTELLIGENCE_BENCHMARK_IDLE_WORKER_PARK_V1";
const ENDPOINT_NAME = "avantiqo-intelligence-trainer-v1";
const EXPECTED_MAIN_ENV = "AVANTIQO_INTELLIGENCE_BENCHMARK_IDLE_WORKER_PARK_EXPECTED_MAIN";
const APPROVAL_ENV = "AVANTIQO_INTELLIGENCE_BENCHMARK_IDLE_WORKER_PARK_APPROVED";
const DRAIN_TIMEOUT_MS = Number(
  process.env.AVANTIQO_INTELLIGENCE_BENCHMARK_IDLE_WORKER_PARK_DRAIN_TIMEOUT_MS || 180_000,
);
const POLL_MS = 5_000;

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${redact(result.stderr || result.stdout).slice(0, 1000)}`);
  }
  return text(result.stdout);
}

function validateMain() {
  const expected = text(process.env[EXPECTED_MAIN_ENV]);
  if (expected && !/^[0-9a-f]{40}$/i.test(expected)) {
    throw new Error(`${CONTRACT}_EXPECTED_MAIN_INVALID`);
  }
  const branch = shell("git", ["branch", "--show-current"], `${CONTRACT}_GIT_BRANCH_FAILED`);
  if (branch !== "main") throw new Error(`${CONTRACT}_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], `${CONTRACT}_GIT_HEAD_FAILED`);
  if (expected) {
    if (head !== expected) {
      throw new Error(`${CONTRACT}_PINNED_MAIN_MISMATCH:head=${head}:expected=${expected}`);
    }
    return { head, pinned: true };
  }
  shell("git", ["fetch", "origin", "main"], `${CONTRACT}_GIT_FETCH_FAILED`);
  const remote = shell("git", ["rev-parse", "origin/main"], `${CONTRACT}_GIT_REMOTE_FAILED`);
  if (head !== remote) {
    throw new Error(`${CONTRACT}_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
  }
  return { head, pinned: false };
}

function managementCredential() {
  const value = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
  if (!value) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return value;
}

function runtimeCredential(managementKey) {
  return text(process.env.RUNPOD_API_KEY) || managementKey;
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
    const detail = redact(body?.message || body?.error || body?.detail || raw).slice(0, 900);
    throw new Error(`${CONTRACT}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  if (options.allowEmpty && !raw) return null;
  if (body === null) throw new Error(`${CONTRACT}_HTTP_${response.status}:INVALID_JSON`);
  return body;
}

async function rest(path, key, options = {}) {
  return requestJson(`${REST_BASE}${path}`, key, options);
}

async function health(endpointId, key) {
  return requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, key, {
    timeoutMs: 20_000,
  });
}

async function control(endpointId, key) {
  return requestJson(`${CONTROL_BASE}/${encodeURIComponent(endpointId)}/workers`, key, {
    timeoutMs: 20_000,
  });
}

function normalizeRows(value, keys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function healthSummary(value = {}) {
  const jobs = object(value?.jobs);
  const workers = object(value?.workers);
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

function liveControlWorkers(value) {
  const terminal = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
  return list(value?.workers).filter((worker) => {
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    if (status && !terminal.has(status)) return true;
    if (desired && !terminal.has(desired)) return true;
    return false;
  });
}

function billingRiskControlWorkers(value) {
  const billed = new Set(["INITIALIZING", "RUNNING", "OUTDATED"]);
  return list(value?.workers).filter((worker) => {
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    return billed.has(status);
  });
}

function safeWorker(worker) {
  return {
    id: text(worker?.id || worker?.workerId || worker?.worker_id) || null,
    status: text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus) || null,
    desired_status: text(worker?.desiredStatus ?? worker?.desired_status) || null,
    gpu_type_id: text(worker?.gpuTypeId ?? worker?.gpu_type_id ?? worker?.gpuType?.id) || null,
    data_center_id: text(worker?.dataCenterId ?? worker?.data_center_id ?? worker?.dataCenter?.id) || null,
  };
}

async function readState(managementKey, runtimeKey) {
  const endpointsRaw = await rest(
    "/endpoints?includeTemplate=true&includeWorkers=true",
    managementKey,
  );
  const endpoints = normalizeRows(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
  const matches = endpoints.filter((entry) => text(entry?.name) === ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`${CONTRACT}_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  const endpoint = matches[0];
  const endpointId = text(endpoint?.id);
  if (!endpointId) throw new Error(`${CONTRACT}_ENDPOINT_ID_REQUIRED`);
  const [rawHealth, rawControl] = await Promise.all([
    health(endpointId, runtimeKey),
    control(endpointId, managementKey),
  ]);
  return {
    endpoint,
    health: healthSummary(rawHealth),
    control_workers: liveControlWorkers(rawControl).map(safeWorker),
    billing_risk_control_workers: billingRiskControlWorkers(rawControl).map(safeWorker),
  };
}

function assertBenchmarkEndpoint(state) {
  const endpoint = state.endpoint;
  const template = object(endpoint?.template);
  const benchmarkEnabled = text(template?.env?.AVANTIQO_INTELLIGENCE_BENCHMARK_ENABLED).toLowerCase();
  const trainerEnabled = text(template?.env?.AVANTIQO_INTELLIGENCE_TRAINER_ENABLED).toLowerCase();
  if (benchmarkEnabled !== "true") throw new Error(`${CONTRACT}_BENCHMARK_TEMPLATE_NOT_ENABLED`);
  if (trainerEnabled === "true") throw new Error(`${CONTRACT}_TRAINER_TEMPLATE_STILL_ENABLED`);
  if (finite(endpoint?.workersMin, -1) !== 0) {
    throw new Error(`${CONTRACT}_WORKERS_MIN_NOT_ZERO:${finite(endpoint?.workersMin)}`);
  }
  if (![0, 1].includes(finite(endpoint?.workersMax, -1))) {
    throw new Error(`${CONTRACT}_WORKERS_MAX_UNEXPECTED:${finite(endpoint?.workersMax)}`);
  }
  if (state.health.jobs.in_queue !== 0 || state.health.jobs.in_progress !== 0) {
    throw new Error(
      `${CONTRACT}_ACTIVE_BENCHMARK_JOB_REFUSED:queue=${state.health.jobs.in_queue}:progress=${state.health.jobs.in_progress}`,
    );
  }
}

async function waitNoBillingRisk(managementKey, runtimeKey) {
  const startedAt = Date.now();
  let last = null;
  while (Date.now() - startedAt <= DRAIN_TIMEOUT_MS) {
    last = await readState(managementKey, runtimeKey);
    const billingRiskHealth =
      last.health.workers.initializing + last.health.workers.running;
    const safe = last.billing_risk_control_workers.length === 0 && billingRiskHealth === 0;
    console.log(
      `${CONTRACT}_DRAIN_PROGRESS=${JSON.stringify({
        elapsed_seconds: Math.floor((Date.now() - startedAt) / 1000),
        workers_max: finite(last.endpoint?.workersMax),
        jobs: last.health.jobs,
        workers: last.health.workers,
        billing_risk_control_workers: last.billing_risk_control_workers,
        nonterminal_control_workers: last.control_workers,
        billing_risk_cleared: safe,
      })}`,
    );
    if (safe) return last;
    await sleep(POLL_MS);
  }
  throw new Error(`${CONTRACT}_BILLING_RISK_DRAIN_TIMEOUT:${JSON.stringify(last)}`);
}

if (!Number.isInteger(DRAIN_TIMEOUT_MS) || DRAIN_TIMEOUT_MS < 60_000 || DRAIN_TIMEOUT_MS > 600_000) {
  throw new Error(`${CONTRACT}_DRAIN_TIMEOUT_INVALID:${DRAIN_TIMEOUT_MS}`);
}

const apply = process.argv.includes("--apply");
if (apply && text(process.env[APPROVAL_ENV]).toUpperCase() !== "YES") {
  throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
}

const main = validateMain();
const managementKey = managementCredential();
const runtimeKey = runtimeCredential(managementKey);
const before = await readState(managementKey, runtimeKey);
assertBenchmarkEndpoint(before);

const templateId = text(before.endpoint?.templateId || before.endpoint?.template?.id);
const networkVolumeId = text(before.endpoint?.networkVolumeId) || null;
const gpuTypeIds = list(before.endpoint?.gpuTypeIds).map(text).filter(Boolean);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_commit: main.head,
  pinned_main: main.pinned,
  endpoint: {
    id: text(before.endpoint?.id),
    name: ENDPOINT_NAME,
    workers_min: finite(before.endpoint?.workersMin),
    workers_max: finite(before.endpoint?.workersMax),
    template_id: templateId,
    gpu_type_ids: gpuTypeIds,
    network_volume_present: Boolean(networkVolumeId),
  },
  queue: before.health.jobs,
  worker_counters: before.health.workers,
  nonterminal_control_workers: before.control_workers,
  billing_risk_control_workers: before.billing_risk_control_workers,
  target_workers_min: 0,
  target_workers_max: 0,
  benchmark_job_submitted: false,
  queue_mutation_performed: false,
  template_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
  mutation_performed: false,
}, null, 2));

if (!apply) {
  console.log(`${CONTRACT}=PLAN_READY`);
  process.exit(0);
}

if (finite(before.endpoint?.workersMax, -1) !== 0) {
  await rest(`/endpoints/${encodeURIComponent(text(before.endpoint?.id))}`, managementKey, {
    method: "PATCH",
    body: { workersMin: 0, workersMax: 0 },
  });
}

const afterPatch = await readState(managementKey, runtimeKey);
assertBenchmarkEndpoint(afterPatch);
if (finite(afterPatch.endpoint?.workersMax, -1) !== 0) {
  throw new Error(`${CONTRACT}_WORKERS_MAX_ZERO_VERIFY_FAILED`);
}
if (text(afterPatch.endpoint?.templateId || afterPatch.endpoint?.template?.id) !== templateId) {
  throw new Error(`${CONTRACT}_TEMPLATE_CHANGED`);
}
if ((text(afterPatch.endpoint?.networkVolumeId) || null) !== networkVolumeId) {
  throw new Error(`${CONTRACT}_NETWORK_VOLUME_CHANGED`);
}
if (JSON.stringify(list(afterPatch.endpoint?.gpuTypeIds).map(text).filter(Boolean)) !== JSON.stringify(gpuTypeIds)) {
  throw new Error(`${CONTRACT}_GPU_POOL_CHANGED`);
}

const drained = await waitNoBillingRisk(managementKey, runtimeKey);
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "APPLY",
  endpoint_id: text(drained.endpoint?.id),
  workers_min: finite(drained.endpoint?.workersMin),
  workers_max: finite(drained.endpoint?.workersMax),
  queue: drained.health.jobs,
  worker_counters: drained.health.workers,
  nonterminal_control_workers: drained.control_workers,
  billing_risk_control_workers: drained.billing_risk_control_workers,
  billing_risk_cleared: true,
  benchmark_job_submitted: false,
  queue_mutation_performed: false,
  template_mutation_performed: false,
  production_deploy_performed: false,
  mutation_performed: true,
  next_action: "RUN_INTELLIGENCE_COST_GUARD_THEN_RETRY_FRESH_FAST_SCHEDULER_CONTROL",
}, null, 2));
console.log(`${CONTRACT}=PASS`);
