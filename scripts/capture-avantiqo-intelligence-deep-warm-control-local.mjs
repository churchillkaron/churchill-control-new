import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const CONTROL_BASE = "https://api.runpod.io/v2";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_INTELLIGENCE_DEEP_WARM_CONTROL_V2";
const APPROVAL = "AVANTIQO_INTELLIGENCE_DEEP_WARM_CONTROL_APPROVED";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const TIMEOUT_MS = Math.max(30_000, Math.min(120_000, Number(process.env.AVANTIQO_INTELLIGENCE_DEEP_WARM_CONTROL_TIMEOUT_MS || 90_000)));
const POLL_MS = 5_000;

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}

function shell(name, args, code) {
  const result = spawnSync(name, args, { cwd: process.cwd(), encoding: "utf8", env: process.env });
  if (result.status !== 0) throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 500)}`);
  return text(result.stdout);
}

function validateCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_DEEP_WARM_CONTROL_GIT_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_DEEP_WARM_CONTROL_GIT_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_DEEP_WARM_CONTROL_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_DEEP_WARM_CONTROL_GIT_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_DEEP_WARM_CONTROL_GIT_REMOTE_FAILED");
  if (head !== remote) throw new Error(`AVANTIQO_DEEP_WARM_CONTROL_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
  return head;
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
    const detail = redact(text(body?.message || body?.error || body?.detail || raw)).slice(0, 700);
    throw new Error(`RUNPOD_DEEP_WARM_CONTROL_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

function healthSummary(body) {
  const jobs = object(body?.jobs);
  const workers = object(body?.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress),
    },
    workers: {
      idle: finite(workers.idle),
      initializing: finite(workers.initializing),
      ready: finite(workers.ready),
      running: finite(workers.running),
      throttled: finite(workers.throttled),
      unhealthy: finite(workers.unhealthy),
    },
  };
}

function safeWorkers(body) {
  return list(body?.workers).map((worker) => ({
    id_present: Boolean(text(worker?.id)),
    status: text(worker?.status).toUpperCase() || null,
    version: Number.isFinite(Number(worker?.version)) ? Number(worker.version) : null,
    gpu_count: Number.isFinite(Number(worker?.gpuCount)) ? Number(worker.gpuCount) : null,
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    started_at: text(worker?.startedAt) || null,
    is_stale: worker?.isStale === true,
  }));
}

async function endpoints(key) {
  return requestJson(`${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`, key);
}

function resolveOne(rows, name) {
  const matches = list(rows).filter((row) => text(row?.name) === name);
  if (matches.length !== 1) throw new Error(`AVANTIQO_DEEP_WARM_CONTROL_ENDPOINT_RESOLUTION_FAILED:name=${name}:matches=${matches.length}`);
  return matches[0];
}

async function patchDeepMin(id, key, min) {
  await requestJson(`${REST_BASE}/endpoints/${encodeURIComponent(id)}`, key, {
    method: "PATCH",
    body: { workersMin: min, workersMax: 1 },
  });
  const verified = await requestJson(`${REST_BASE}/endpoints/${encodeURIComponent(id)}?includeWorkers=true`, key);
  if (finite(verified?.workersMin, -1) !== min || finite(verified?.workersMax, -1) !== 1) {
    throw new Error(`AVANTIQO_DEEP_WARM_CONTROL_PATCH_VERIFY_FAILED:min=${finite(verified?.workersMin, -1)}:max=${finite(verified?.workersMax, -1)}:expected_min=${min}`);
  }
}

async function parkFast(id, key) {
  await requestJson(`${REST_BASE}/endpoints/${encodeURIComponent(id)}`, key, {
    method: "PATCH",
    body: { workersMin: 0, workersMax: 0 },
  });
  const verified = await requestJson(`${REST_BASE}/endpoints/${encodeURIComponent(id)}?includeWorkers=true`, key);
  if (finite(verified?.workersMin, -1) !== 0 || finite(verified?.workersMax, -1) !== 0) {
    throw new Error(`AVANTIQO_DEEP_WARM_CONTROL_FAST_PARK_VERIFY_FAILED:min=${finite(verified?.workersMin, -1)}:max=${finite(verified?.workersMax, -1)}`);
  }
}

const mainCommit = validateCurrentMain();
if (text(process.env[APPROVAL]).toUpperCase() !== "YES") throw new Error(`${APPROVAL}=YES_REQUIRED`);
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const runtimeKey = text(process.env.RUNPOD_API_KEY || managementKey);
if (!managementKey || !runtimeKey) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");

let state = await endpoints(managementKey);
let deep = resolveOne(state, DEEP_NAME);
let fast = resolveOne(state, FAST_NAME);
const deepId = text(deep?.id);
const fastId = text(fast?.id);
if (!deepId || !fastId) throw new Error("AVANTIQO_DEEP_WARM_CONTROL_ENDPOINT_IDS_REQUIRED");

const [deepHealthBefore, fastHealthBefore, fastWorkersBodyBefore] = await Promise.all([
  requestJson(`${QUEUE_BASE}/${encodeURIComponent(deepId)}/health`, runtimeKey),
  requestJson(`${QUEUE_BASE}/${encodeURIComponent(fastId)}/health`, runtimeKey),
  requestJson(`${CONTROL_BASE}/serverless/${encodeURIComponent(fastId)}/workers`, managementKey),
]);
const before = { deep: healthSummary(deepHealthBefore), fast: healthSummary(fastHealthBefore) };
const fastWorkersBeforeRecovery = safeWorkers(fastWorkersBodyBefore);
if (before.deep.jobs.in_queue || before.deep.jobs.in_progress || before.fast.jobs.in_queue || before.fast.jobs.in_progress) {
  throw new Error("AVANTIQO_DEEP_WARM_CONTROL_ZERO_JOBS_REQUIRED");
}

const deepMinBefore = finite(deep?.workersMin, -1);
const deepMaxBefore = finite(deep?.workersMax, -1);
const fastMinBefore = finite(fast?.workersMin, -1);
const fastMaxBefore = finite(fast?.workersMax, -1);
const parkedBefore = deepMinBefore === 0 && deepMaxBefore === 1 && fastMinBefore === 0 && fastMaxBefore === 0;
const dualEnabledBefore = deepMinBefore === 0 && deepMaxBefore === 1 && fastMinBefore === 0 && fastMaxBefore === 1;
let recoveredDualEnabledSlot = false;

if (!parkedBefore && !dualEnabledBefore) {
  throw new Error(`AVANTIQO_DEEP_WARM_CONTROL_PARKED_OR_RECOVERABLE_STATE_REQUIRED:deep_min=${deepMinBefore}:deep_max=${deepMaxBefore}:fast_min=${fastMinBefore}:fast_max=${fastMaxBefore}`);
}

if (dualEnabledBefore) {
  const activeFastRuntime =
    before.fast.workers.initializing > 0 ||
    before.fast.workers.running > 0 ||
    before.fast.workers.unhealthy > 0 ||
    fastWorkersBeforeRecovery.some((worker) => ["INITIALIZING", "RUNNING", "UNHEALTHY"].includes(worker.status));
  if (activeFastRuntime) {
    throw new Error(`AVANTIQO_DEEP_WARM_CONTROL_DUAL_SLOT_FAST_RUNTIME_ACTIVE:health=${JSON.stringify(before.fast.workers)}:workers=${JSON.stringify(fastWorkersBeforeRecovery)}`);
  }
  await parkFast(fastId, managementKey);
  recoveredDualEnabledSlot = true;
  console.log("AVANTIQO_INTELLIGENCE_DEEP_WARM_CONTROL_DUAL_SLOT_RECOVERED=true");
  console.log("AVANTIQO_INTELLIGENCE_FAST_PARKED_BEFORE_DEEP_CONTROL=true");
  state = await endpoints(managementKey);
  deep = resolveOne(state, DEEP_NAME);
  fast = resolveOne(state, FAST_NAME);
  if (
    finite(deep?.workersMin, -1) !== 0 ||
    finite(deep?.workersMax, -1) !== 1 ||
    finite(fast?.workersMin, -1) !== 0 ||
    finite(fast?.workersMax, -1) !== 0
  ) {
    throw new Error("AVANTIQO_DEEP_WARM_CONTROL_RECOVERED_PARKED_STATE_VERIFY_FAILED");
  }
}

let cleanupPassed = false;
let workerSeen = false;
let workers = [];
let finalHealth = before.deep;
let timedOut = false;
const startedAt = Date.now();

try {
  await patchDeepMin(deepId, managementKey, 1);
  console.log("AVANTIQO_INTELLIGENCE_DEEP_WARM_CONTROL_REQUESTED=true");
  console.log("AVANTIQO_INTELLIGENCE_DEEP_WARM_CONTROL_GENERATION_SUBMITTED=false");
  while (Date.now() - startedAt <= TIMEOUT_MS) {
    const [workersBody, healthBody] = await Promise.all([
      requestJson(`${CONTROL_BASE}/serverless/${encodeURIComponent(deepId)}/workers`, managementKey),
      requestJson(`${QUEUE_BASE}/${encodeURIComponent(deepId)}/health`, runtimeKey),
    ]);
    workers = safeWorkers(workersBody);
    finalHealth = healthSummary(healthBody);
    workerSeen = workers.length > 0 || finalHealth.workers.initializing > 0 || finalHealth.workers.ready > 0 || finalHealth.workers.idle > 0 || finalHealth.workers.running > 0;
    console.log(JSON.stringify({
      event: "AVANTIQO_INTELLIGENCE_DEEP_WARM_CONTROL_PROGRESS",
      elapsed_seconds: Math.floor((Date.now() - startedAt) / 1000),
      worker_seen: workerSeen,
      workers,
      health: finalHealth,
      generation_submitted: false,
      secrets_printed: false,
    }));
    if (workerSeen) break;
    await sleep(POLL_MS);
  }
  timedOut = !workerSeen;
} finally {
  try {
    await patchDeepMin(deepId, managementKey, 0);
    cleanupPassed = true;
  } catch (error) {
    console.error(`AVANTIQO_INTELLIGENCE_DEEP_WARM_CONTROL_CLEANUP_FAILED=${redact(text(error?.message || error)).slice(0, 700)}`);
  }
}

const diagnosis = workerSeen
  ? "DEEP_WARM_WORKER_PROVISIONED"
  : "NO_DEEP_WORKER_PROVISIONED_DURING_WARM_LEASE";
const nextAction = workerSeen
  ? "FAST_ENDPOINT_SPECIFIC_SCHEDULER_FAILURE_CONFIRMED_REPAIR_OR_RECREATE_FAST_ENDPOINT"
  : "SHARED_BLACKWELL_CAPACITY_OR_ACCOUNT_SCHEDULER_CONSTRAINT_LIKELY";

console.log(JSON.stringify({
  success: cleanupPassed,
  contract: CONTRACT,
  mode: "DEEP_WARM_CONTROL_NO_INFERENCE",
  main_commit: mainCommit,
  timeout_ms: TIMEOUT_MS,
  elapsed_seconds: Math.floor((Date.now() - startedAt) / 1000),
  before,
  slot_state_before: {
    deep_workers_min: deepMinBefore,
    deep_workers_max: deepMaxBefore,
    fast_workers_min: fastMinBefore,
    fast_workers_max: fastMaxBefore,
  },
  recovered_dual_enabled_slot: recoveredDualEnabledSlot,
  fast_workers_before_recovery: fastWorkersBeforeRecovery,
  worker_seen: workerSeen,
  workers,
  final_deep_health: finalHealth,
  timed_out: timedOut,
  diagnosis,
  next_action: nextAction,
  deep_min_reset_to_zero: cleanupPassed,
  canonical_slot_state_expected_after: { deep_workers_max: 1, fast_workers_max: 0 },
  generation_submitted: false,
  inference_performed: false,
  endpoint_mutation_performed: true,
  production_deploy_performed: false,
  secrets_in_output: false,
}, null, 2));

if (!cleanupPassed) process.exitCode = 1;