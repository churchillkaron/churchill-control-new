import { spawnSync } from "node:child_process";
import https from "node:https";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTROL_BASE = "https://api.runpod.io/v2/serverless";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_REPLACEMENT_CANDIDATE_SCHEDULER_CONTROL_V1";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const CANDIDATE_NAME = "avantiqo-intelligence-fast-replacement-candidate-v1";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const DEEP_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const EXPECTED_MAIN_ENV = "AVANTIQO_INTELLIGENCE_FAST_REPLACEMENT_SCHEDULER_CONTROL_EXPECTED_MAIN";
const APPROVAL_ENV = "AVANTIQO_INTELLIGENCE_FAST_REPLACEMENT_SCHEDULER_CONTROL_SPEND_APPROVED";
const MODEL_TIMEOUT_MS = Number(
  process.env.AVANTIQO_INTELLIGENCE_FAST_REPLACEMENT_SCHEDULER_CONTROL_MODEL_TIMEOUT_MS || 360_000,
);
const UNSCHEDULED_TIMEOUT_SECONDS = Number(
  process.env.AVANTIQO_INTELLIGENCE_FAST_REPLACEMENT_SCHEDULER_CONTROL_UNSCHEDULED_TIMEOUT_SECONDS || 90,
);
const WORKER_DRAIN_TIMEOUT_MS = Number(
  process.env.AVANTIQO_INTELLIGENCE_FAST_REPLACEMENT_SCHEDULER_CONTROL_WORKER_DRAIN_TIMEOUT_MS || 180_000,
);
const REQUEST_CLEANUP_TIMEOUT_MS = 600_000;
const POLL_MS = 10_000;
const EXPECTED_GPU_TYPES = [
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA H200",
  "NVIDIA B200",
];

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(
      /((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    );
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

function validateConfiguration() {
  if (text(process.env[APPROVAL_ENV]).toUpperCase() !== "YES") {
    throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
  }
  if (!Number.isInteger(MODEL_TIMEOUT_MS) || MODEL_TIMEOUT_MS < 240_000 || MODEL_TIMEOUT_MS > 600_000) {
    throw new Error(`${CONTRACT}_MODEL_TIMEOUT_INVALID:${MODEL_TIMEOUT_MS}`);
  }
  if (
    !Number.isInteger(UNSCHEDULED_TIMEOUT_SECONDS) ||
    UNSCHEDULED_TIMEOUT_SECONDS < 60 ||
    UNSCHEDULED_TIMEOUT_SECONDS > 180
  ) {
    throw new Error(`${CONTRACT}_UNSCHEDULED_TIMEOUT_INVALID:${UNSCHEDULED_TIMEOUT_SECONDS}`);
  }
  if (
    !Number.isInteger(WORKER_DRAIN_TIMEOUT_MS) ||
    WORKER_DRAIN_TIMEOUT_MS < 60_000 ||
    WORKER_DRAIN_TIMEOUT_MS > 600_000
  ) {
    throw new Error(`${CONTRACT}_WORKER_DRAIN_TIMEOUT_INVALID:${WORKER_DRAIN_TIMEOUT_MS}`);
  }
}

function validateMain() {
  const expected = text(process.env[EXPECTED_MAIN_ENV]);
  if (expected && !/^[0-9a-f]{40}$/i.test(expected)) {
    throw new Error(`${CONTRACT}_EXPECTED_MAIN_INVALID`);
  }
  const branch = shell("git", ["branch", "--show-current"], `${CONTRACT}_GIT_BRANCH_FAILED`);
  if (branch !== "main") {
    throw new Error(`${CONTRACT}_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  }
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
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
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

async function queueHealth(endpointId, key) {
  return requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, key, {
    timeoutMs: 20_000,
  });
}

async function controlWorkers(endpointId, key) {
  return requestJson(`${CONTROL_BASE}/${encodeURIComponent(endpointId)}/workers`, key, {
    timeoutMs: 20_000,
  });
}

async function graphql(query, key) {
  const response = await requestJson(GRAPHQL_URL, key, {
    method: "POST",
    body: { query },
    timeoutMs: 30_000,
  });
  if (Array.isArray(response?.errors) && response.errors.length > 0) {
    throw new Error(`${CONTRACT}_GRAPHQL:${redact(response.errors[0]?.message).slice(0, 700)}`);
  }
  return response;
}

function normalizeRows(value, keys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function resolveOne(rows, name, code) {
  const matches = normalizeRows(rows).filter((row) => text(row?.name) === name);
  if (matches.length !== 1) {
    throw new Error(`${code}:name=${name}:matches=${matches.length}`);
  }
  return matches[0];
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

function activeWorkers(rows) {
  const terminal = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
  return list(rows).filter((worker) => {
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    if (status && !terminal.has(status)) return true;
    if (desired && !terminal.has(desired)) return true;
    return false;
  });
}

function safeWorker(worker) {
  return {
    id: text(worker?.id || worker?.workerId || worker?.worker_id) || null,
    status: text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus) || null,
    desired_status: text(worker?.desiredStatus ?? worker?.desired_status) || null,
    gpu_type_id:
      text(worker?.gpuTypeId ?? worker?.gpu_type_id ?? worker?.gpuType?.id ?? worker?.gpu?.id) || null,
    data_center_id:
      text(worker?.dataCenterId ?? worker?.data_center_id ?? worker?.dataCenter?.id) || null,
  };
}

function templateId(endpoint = {}) {
  return text(endpoint?.templateId || endpoint?.template?.id);
}

function assertFastTemplate(endpoint, code) {
  const serialized = JSON.stringify(object(endpoint?.template));
  if (!templateId(endpoint)) throw new Error(`${code}_TEMPLATE_ID_REQUIRED`);
  if (!serialized.includes(FAST_MODEL)) throw new Error(`${code}_FAST_MODEL_BINDING_MISSING`);
  if (serialized.includes(DEEP_MODEL)) throw new Error(`${code}_DEEP_MODEL_BINDING_PRESENT`);
  if (/reasoning[_-]?parser|--reasoning-parser/i.test(serialized)) {
    throw new Error(`${code}_REASONING_PARSER_PRESENT`);
  }
}

function arraysEqual(left, right) {
  return JSON.stringify(list(left).map(text).filter(Boolean)) ===
    JSON.stringify(list(right).map(text).filter(Boolean));
}

async function loadThree(managementKey, runtimeKey) {
  const raw = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
  const endpoints = normalizeRows(raw, ["endpoints", "serverlessEndpoints"]);
  const deep = resolveOne(endpoints, DEEP_NAME, `${CONTRACT}_DEEP_RESOLUTION_FAILED`);
  const fast = resolveOne(endpoints, FAST_NAME, `${CONTRACT}_FAST_RESOLUTION_FAILED`);
  const candidate = resolveOne(
    endpoints,
    CANDIDATE_NAME,
    `${CONTRACT}_CANDIDATE_RESOLUTION_FAILED`,
  );
  const [deepHealthRaw, fastHealthRaw, candidateHealthRaw] = await Promise.all([
    queueHealth(text(deep?.id), runtimeKey),
    queueHealth(text(fast?.id), runtimeKey),
    queueHealth(text(candidate?.id), runtimeKey),
  ]);
  return {
    endpoints,
    deep,
    fast,
    candidate,
    deepHealth: healthSummary(deepHealthRaw),
    fastHealth: healthSummary(fastHealthRaw),
    candidateHealth: healthSummary(candidateHealthRaw),
  };
}

function assertZeroJobs(summary, code) {
  if (summary.jobs.in_queue !== 0 || summary.jobs.in_progress !== 0) {
    throw new Error(
      `${code}_ACTIVE_JOBS:queue=${summary.jobs.in_queue}:progress=${summary.jobs.in_progress}`,
    );
  }
}

function assertInitialState(state) {
  assertFastTemplate(state.fast, `${CONTRACT}_SOURCE_FAST_TEMPLATE`);
  assertFastTemplate(state.candidate, `${CONTRACT}_CANDIDATE_TEMPLATE`);
  if (templateId(state.fast) !== templateId(state.candidate)) {
    throw new Error(`${CONTRACT}_CANDIDATE_TEMPLATE_ID_MISMATCH`);
  }
  const sourceGpu = list(state.fast?.gpuTypeIds).map(text).filter(Boolean);
  const candidateGpu = list(state.candidate?.gpuTypeIds).map(text).filter(Boolean);
  if (!arraysEqual(sourceGpu, EXPECTED_GPU_TYPES)) {
    throw new Error(`${CONTRACT}_SOURCE_FAST_GPU_PRIORITY_UNEXPECTED:${JSON.stringify(sourceGpu)}`);
  }
  if (!arraysEqual(sourceGpu, candidateGpu)) {
    throw new Error(`${CONTRACT}_CANDIDATE_GPU_PRIORITY_MISMATCH:${JSON.stringify(candidateGpu)}`);
  }
  if (finite(state.deep?.workersMin, -1) !== 0 || finite(state.deep?.workersMax, -1) !== 1) {
    throw new Error(`${CONTRACT}_DEEP_NOT_CANONICAL_0_1`);
  }
  if (finite(state.fast?.workersMin, -1) !== 0 || finite(state.fast?.workersMax, -1) !== 0) {
    throw new Error(`${CONTRACT}_OLD_FAST_NOT_PARKED_0_0`);
  }
  if (
    finite(state.candidate?.workersMin, -1) !== 0 ||
    finite(state.candidate?.workersMax, -1) !== 0
  ) {
    throw new Error(`${CONTRACT}_CANDIDATE_NOT_PARKED_0_0`);
  }
  assertZeroJobs(state.deepHealth, `${CONTRACT}_DEEP`);
  assertZeroJobs(state.fastHealth, `${CONTRACT}_OLD_FAST`);
  assertZeroJobs(state.candidateHealth, `${CONTRACT}_CANDIDATE`);
}

async function patchWorkers(endpointId, workersMax, managementKey, code) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMin: 0, workersMax },
  });
  const verified = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
  );
  if (finite(verified?.workersMin, -1) !== 0 || finite(verified?.workersMax, -1) !== workersMax) {
    throw new Error(
      `${code}_PATCH_VERIFY_FAILED:min=${finite(verified?.workersMin)}:max=${finite(verified?.workersMax)}:expected=${workersMax}`,
    );
  }
  return verified;
}

async function monitorEndpoint(endpointId, managementKey, runtimeKey) {
  const [healthRaw, controlRaw, endpoint] = await Promise.all([
    queueHealth(endpointId, runtimeKey),
    controlWorkers(endpointId, managementKey),
    rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=true`, managementKey),
  ]);
  const health = healthSummary(healthRaw);
  const control = activeWorkers(controlRaw?.workers);
  const management = activeWorkers(endpoint?.workers);
  const healthWorkerCount =
    health.workers.idle +
    health.workers.initializing +
    health.workers.ready +
    health.workers.running +
    health.workers.throttled +
    health.workers.unhealthy;
  return {
    health,
    control_workers: control.map(safeWorker),
    management_workers: management.map(safeWorker),
    worker_visible: control.length > 0 || management.length > 0 || healthWorkerCount > 0,
  };
}

async function waitWorkersGone(endpointId, managementKey, runtimeKey, timeoutMs, code) {
  const startedAt = Date.now();
  let last = null;
  while (Date.now() - startedAt <= timeoutMs) {
    last = await monitorEndpoint(endpointId, managementKey, runtimeKey);
    if (!last.worker_visible) return last;
    console.log(
      JSON.stringify({
        event: `${CONTRACT}_WORKER_DRAIN_PROGRESS`,
        lane: code,
        elapsed_seconds: Math.floor((Date.now() - startedAt) / 1000),
        health: last.health,
        control_workers: last.control_workers,
        management_workers: last.management_workers,
      }),
    );
    await sleep(POLL_MS);
  }
  throw new Error(`${code}_WORKER_DRAIN_TIMEOUT:${JSON.stringify(last)}`);
}

async function admissionGate(endpoints, managementKey) {
  const accountQuery = `query { myself { underBalance minBalance maxServerlessConcurrency clientBalance } }`;
  const response = await graphql(accountQuery, managementKey);
  const account = response?.data?.myself;
  if (!account) throw new Error(`${CONTRACT}_ACCOUNT_GATE_INVALID`);

  let activeCount = 0;
  let controlReadFailures = 0;
  const activeEndpoints = [];
  for (const endpoint of endpoints) {
    const endpointId = text(endpoint?.id);
    if (!endpointId) continue;
    try {
      const control = await controlWorkers(endpointId, managementKey);
      const active = activeWorkers(control?.workers);
      if (active.length > 0) {
        activeCount += active.length;
        activeEndpoints.push({
          name: text(endpoint?.name) || null,
          active_workers: active.length,
        });
      }
    } catch {
      controlReadFailures += 1;
    }
  }

  const maxConcurrency = finite(account?.maxServerlessConcurrency, null);
  const clientBalance = finite(account?.clientBalance, null);
  const minBalance = finite(account?.minBalance, null);
  const configuredWorkersMax = endpoints.reduce(
    (sum, endpoint) => sum + Math.max(0, finite(endpoint?.workersMax, 0)),
    0,
  );
  const blockers = [];
  if (account?.underBalance === true) blockers.push("ACCOUNT_UNDER_BALANCE");
  if (clientBalance !== null && clientBalance <= 0) blockers.push("CLIENT_BALANCE_NON_POSITIVE");
  if (clientBalance !== null && minBalance !== null && clientBalance < minBalance) {
    blockers.push("CLIENT_BALANCE_BELOW_MINIMUM");
  }
  if (controlReadFailures > 0) blockers.push("CONTROL_WORKER_STATE_INCOMPLETE");
  if (maxConcurrency === null) blockers.push("SERVERLESS_CONCURRENCY_UNKNOWN");
  else {
    if (activeCount >= maxConcurrency) blockers.push("SERVERLESS_CONCURRENCY_EXHAUSTED");
    if (configuredWorkersMax + 1 > maxConcurrency) {
      blockers.push("CONFIGURED_WORKER_QUOTA_WOULD_BE_EXCEEDED");
    }
  }
  const result = {
    under_balance: account?.underBalance === true,
    client_balance_usd: clientBalance,
    min_balance_usd: minBalance,
    max_serverless_concurrency: maxConcurrency,
    active_control_workers: activeCount,
    concurrency_remaining: maxConcurrency === null ? null : maxConcurrency - activeCount,
    configured_workers_max_after_deep_park: configuredWorkersMax,
    configured_workers_max_if_candidate_activated: configuredWorkersMax + 1,
    active_endpoints: activeEndpoints,
    control_read_failures: controlReadFailures,
    hard_blockers: blockers,
  };
  console.log(`${CONTRACT}_ADMISSION_GATE=${JSON.stringify(result)}`);
  if (blockers.length > 0) {
    throw new Error(`${CONTRACT}_ADMISSION_GATE_BLOCKED:${blockers.join(",")}`);
  }
  return result;
}

function startModelsRequest(endpointId, runtimeKey, timeoutMs) {
  let request = null;
  let settled = false;
  let rejectOuter = null;
  const startedAt = Date.now();
  const promise = new Promise((resolve, reject) => {
    rejectOuter = reject;
    const deadline = setTimeout(() => {
      if (request && !settled) {
        request.destroy(new Error(`${CONTRACT}_MODEL_ROUTE_TOTAL_TIMEOUT_MS_${timeoutMs}`));
      }
    }, timeoutMs);
    deadline.unref?.();

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      callback(value);
    };

    request = https.request(
      `https://api.runpod.ai/v2/${encodeURIComponent(endpointId)}/openai/v1/models`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${runtimeKey}`,
          Accept: "application/json",
        },
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
          if (raw.length > 5_000_000) {
            request.destroy(new Error(`${CONTRACT}_MODEL_ROUTE_RESPONSE_TOO_LARGE`));
          }
        });
        response.on("end", () => {
          let body = null;
          try {
            body = raw ? JSON.parse(raw) : null;
          } catch {
            body = null;
          }
          finish(resolve, {
            http_status: Number(response.statusCode || 0),
            body,
            raw,
            elapsed_ms: Date.now() - startedAt,
          });
        });
        response.on("error", (error) => finish(reject, error));
      },
    );
    request.on("error", (error) => finish(reject, error));
    request.end();
  });

  return {
    promise,
    cancel(reason) {
      if (settled) return;
      if (request) request.destroy(new Error(reason));
      else if (rejectOuter) rejectOuter(new Error(reason));
    },
  };
}

async function cleanupOwnedCandidateRequest(candidateId, runtimeKey) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= REQUEST_CLEANUP_TIMEOUT_MS) {
    const health = healthSummary(await queueHealth(candidateId, runtimeKey));
    if (health.jobs.in_progress > 0) {
      console.log(
        `${CONTRACT}_CLEANUP_WAIT_IN_PROGRESS=${JSON.stringify({
          elapsed_seconds: Math.floor((Date.now() - startedAt) / 1000),
          jobs: health.jobs,
        })}`,
      );
      await sleep(POLL_MS);
      continue;
    }
    if (health.jobs.in_queue > 1) {
      throw new Error(`${CONTRACT}_CLEANUP_REFUSED_MULTIPLE_QUEUED:${health.jobs.in_queue}`);
    }
    if (health.jobs.in_queue === 1) {
      await requestJson(`${QUEUE_BASE}/${encodeURIComponent(candidateId)}/purge-queue`, runtimeKey, {
        method: "POST",
        timeoutMs: 20_000,
      });
      await sleep(1000);
      continue;
    }
    return health;
  }
  throw new Error(`${CONTRACT}_CLEANUP_TIMEOUT`);
}

async function verifyFinalState(managementKey, runtimeKey) {
  const state = await loadThree(managementKey, runtimeKey);
  if (finite(state.deep?.workersMin, -1) !== 0 || finite(state.deep?.workersMax, -1) !== 1) {
    throw new Error(`${CONTRACT}_FINAL_DEEP_NOT_0_1`);
  }
  if (finite(state.fast?.workersMin, -1) !== 0 || finite(state.fast?.workersMax, -1) !== 0) {
    throw new Error(`${CONTRACT}_FINAL_OLD_FAST_NOT_0_0`);
  }
  if (
    finite(state.candidate?.workersMin, -1) !== 0 ||
    finite(state.candidate?.workersMax, -1) !== 0
  ) {
    throw new Error(`${CONTRACT}_FINAL_CANDIDATE_NOT_0_0`);
  }
  assertZeroJobs(state.deepHealth, `${CONTRACT}_FINAL_DEEP`);
  assertZeroJobs(state.fastHealth, `${CONTRACT}_FINAL_OLD_FAST`);
  assertZeroJobs(state.candidateHealth, `${CONTRACT}_FINAL_CANDIDATE`);
  return {
    deep_workers_min: finite(state.deep?.workersMin),
    deep_workers_max: finite(state.deep?.workersMax),
    old_fast_workers_min: finite(state.fast?.workersMin),
    old_fast_workers_max: finite(state.fast?.workersMax),
    candidate_workers_min: finite(state.candidate?.workersMin),
    candidate_workers_max: finite(state.candidate?.workersMax),
    deep_jobs: state.deepHealth.jobs,
    old_fast_jobs: state.fastHealth.jobs,
    candidate_jobs: state.candidateHealth.jobs,
  };
}

validateConfiguration();
const main = validateMain();
const managementKey = managementCredential();
const runtimeKey = runtimeCredential(managementKey);
let deepWasParkedByProbe = false;
let candidateWasActivatedByProbe = false;
let modelsTransport = null;
let primaryError = null;
let result = null;

console.log("============================================================");
console.log("AVANTIQO FAST INTELLIGENCE - FRESH ENDPOINT SCHEDULER CONTROL");
console.log("============================================================");
console.log(`${CONTRACT}_MAIN=${main.head}`);
console.log(`${CONTRACT}_EXPECTED_MODEL=${FAST_MODEL}`);
console.log(`${CONTRACT}_MODEL_TIMEOUT_MS=${MODEL_TIMEOUT_MS}`);
console.log(`${CONTRACT}_UNSCHEDULED_TIMEOUT_SECONDS=${UNSCHEDULED_TIMEOUT_SECONDS}`);
console.log(`${CONTRACT}_GENERATION_SUBMITTED=NO`);
console.log(`${CONTRACT}_PRODUCTION_DEPLOY_PERFORMED=NO`);
console.log(`${CONTRACT}_OLD_FAST_MUTATION=NO`);
console.log(`${CONTRACT}_TEMPLATE_MUTATION=NO`);
console.log(`${CONTRACT}_ENV_MUTATION=NO`);

try {
  const initial = await loadThree(managementKey, runtimeKey);
  assertInitialState(initial);
  const candidateId = text(initial.candidate?.id);
  const deepId = text(initial.deep?.id);
  const oldFastId = text(initial.fast?.id);
  console.log(
    `${CONTRACT}_INITIAL_STATE=${JSON.stringify({
      deep_endpoint_id: deepId,
      old_fast_endpoint_id: oldFastId,
      candidate_endpoint_id: candidateId,
      candidate_template_id: templateId(initial.candidate),
      candidate_gpu_type_ids: list(initial.candidate?.gpuTypeIds).map(text).filter(Boolean),
      deep_workers: [finite(initial.deep?.workersMin), finite(initial.deep?.workersMax)],
      old_fast_workers: [finite(initial.fast?.workersMin), finite(initial.fast?.workersMax)],
      candidate_workers: [finite(initial.candidate?.workersMin), finite(initial.candidate?.workersMax)],
      deep_jobs: initial.deepHealth.jobs,
      old_fast_jobs: initial.fastHealth.jobs,
      candidate_jobs: initial.candidateHealth.jobs,
    })}`,
  );

  console.log(`${CONTRACT}_ACTION=PARK_DEEP_FOR_SINGLE_INTELLIGENCE_SLOT`);
  await patchWorkers(deepId, 0, managementKey, `${CONTRACT}_DEEP_PARK`);
  deepWasParkedByProbe = true;
  await waitWorkersGone(
    deepId,
    managementKey,
    runtimeKey,
    WORKER_DRAIN_TIMEOUT_MS,
    "DEEP",
  );

  const afterDeepPark = await loadThree(managementKey, runtimeKey);
  if (finite(afterDeepPark.deep?.workersMax, -1) !== 0) {
    throw new Error(`${CONTRACT}_DEEP_PARK_NOT_PERSISTED`);
  }
  if (finite(afterDeepPark.fast?.workersMax, -1) !== 0) {
    throw new Error(`${CONTRACT}_OLD_FAST_CHANGED_DURING_DEEP_PARK`);
  }
  if (finite(afterDeepPark.candidate?.workersMax, -1) !== 0) {
    throw new Error(`${CONTRACT}_CANDIDATE_CHANGED_BEFORE_ACTIVATION`);
  }
  assertZeroJobs(afterDeepPark.deepHealth, `${CONTRACT}_DEEP_AFTER_PARK`);
  assertZeroJobs(afterDeepPark.fastHealth, `${CONTRACT}_OLD_FAST_AFTER_DEEP_PARK`);
  assertZeroJobs(afterDeepPark.candidateHealth, `${CONTRACT}_CANDIDATE_AFTER_DEEP_PARK`);

  await admissionGate(afterDeepPark.endpoints, managementKey);

  console.log(`${CONTRACT}_ACTION=ACTIVATE_FRESH_CANDIDATE_ONLY`);
  await patchWorkers(candidateId, 1, managementKey, `${CONTRACT}_CANDIDATE_ACTIVATE`);
  candidateWasActivatedByProbe = true;
  const activated = await loadThree(managementKey, runtimeKey);
  if (
    finite(activated.deep?.workersMax, -1) !== 0 ||
    finite(activated.fast?.workersMax, -1) !== 0 ||
    finite(activated.candidate?.workersMax, -1) !== 1
  ) {
    throw new Error(`${CONTRACT}_SINGLE_SLOT_ACTIVATION_VERIFY_FAILED`);
  }
  const intelligenceWorkersMax =
    Math.max(0, finite(activated.deep?.workersMax, 0)) +
    Math.max(0, finite(activated.fast?.workersMax, 0)) +
    Math.max(0, finite(activated.candidate?.workersMax, 0));
  if (intelligenceWorkersMax !== 1) {
    throw new Error(`${CONTRACT}_INTELLIGENCE_SINGLE_SLOT_VIOLATION:${intelligenceWorkersMax}`);
  }
  assertZeroJobs(activated.candidateHealth, `${CONTRACT}_CANDIDATE_BEFORE_MODELS`);
  console.log(`${CONTRACT}_SINGLE_INTELLIGENCE_SLOT=PASS`);

  const transport = startModelsRequest(candidateId, runtimeKey, MODEL_TIMEOUT_MS);
  modelsTransport = transport;
  let modelSettled = false;
  let modelResponse = null;
  let modelError = null;
  transport.promise
    .then((value) => {
      modelResponse = value;
      modelSettled = true;
    })
    .catch((error) => {
      modelError = error;
      modelSettled = true;
    });

  const monitorStartedAt = Date.now();
  let firstWorkerSeconds = null;
  let firstWorkerEvidence = null;
  let unscheduled = false;

  while (!modelSettled) {
    await sleep(POLL_MS);
    const elapsedSeconds = Math.floor((Date.now() - monitorStartedAt) / 1000);
    const snapshot = await monitorEndpoint(candidateId, managementKey, runtimeKey);
    console.log(
      `${CONTRACT}_PROGRESS=${JSON.stringify({
        elapsed_seconds: elapsedSeconds,
        jobs: snapshot.health.jobs,
        workers: snapshot.health.workers,
        worker_visible: snapshot.worker_visible,
        control_workers: snapshot.control_workers,
        management_workers: snapshot.management_workers,
      })}`,
    );
    if (snapshot.worker_visible && firstWorkerSeconds === null) {
      firstWorkerSeconds = elapsedSeconds;
      firstWorkerEvidence = snapshot;
      console.log(`${CONTRACT}_FIRST_WORKER_VISIBLE_SECONDS=${firstWorkerSeconds}`);
    }
    if (firstWorkerSeconds === null && elapsedSeconds >= UNSCHEDULED_TIMEOUT_SECONDS) {
      unscheduled = true;
      console.log(`${CONTRACT}_UNSCHEDULED_ABORT_SECONDS=${elapsedSeconds}`);
      transport.cancel(`${CONTRACT}_UNSCHEDULED_ABORT`);
      try {
        await transport.promise;
      } catch {
        // Expected when aborting an unscheduled route request.
      }
      modelSettled = true;
      break;
    }
  }

  if (unscheduled) {
    throw new Error(
      `${CONTRACT}_RUNPOD_FRESH_CANDIDATE_WORKER_NOT_SCHEDULED_WITHIN_${UNSCHEDULED_TIMEOUT_SECONDS}_SECONDS`,
    );
  }

  if (modelError) {
    throw new Error(`${CONTRACT}_MODEL_ROUTE_TRANSPORT_FAILED:${redact(modelError?.message || modelError)}`);
  }
  if (!modelResponse) {
    throw new Error(`${CONTRACT}_MODEL_ROUTE_EMPTY_RESULT`);
  }
  if (modelResponse.http_status < 200 || modelResponse.http_status >= 300 || !modelResponse.body) {
    const detail = redact(
      modelResponse.body?.error?.message ||
        modelResponse.body?.message ||
        modelResponse.raw ||
        "EMPTY_BODY",
    ).slice(0, 700);
    throw new Error(`${CONTRACT}_MODEL_ROUTE_HTTP_${modelResponse.http_status}:${detail}`);
  }
  const servedModels = list(modelResponse.body?.data)
    .map((entry) => text(entry?.id))
    .filter(Boolean);
  if (!servedModels.includes(FAST_MODEL)) {
    throw new Error(
      `${CONTRACT}_EXPECTED_MODEL_NOT_SERVED:expected=${FAST_MODEL}:served=${servedModels.join(",") || "NONE"}`,
    );
  }
  if (firstWorkerSeconds === null) {
    const finalSnapshot = await monitorEndpoint(candidateId, managementKey, runtimeKey).catch(() => null);
    if (finalSnapshot?.worker_visible) {
      firstWorkerSeconds = Math.floor((Date.now() - monitorStartedAt) / 1000);
      firstWorkerEvidence = finalSnapshot;
    }
  }

  result = {
    scheduler_control_passed: true,
    candidate_endpoint_id: candidateId,
    first_worker_visible_seconds: firstWorkerSeconds,
    first_worker_evidence: firstWorkerEvidence
      ? {
          control_workers: firstWorkerEvidence.control_workers,
          management_workers: firstWorkerEvidence.management_workers,
        }
      : null,
    models_latency_ms: modelResponse.elapsed_ms,
    expected_model_served: true,
    served_models: servedModels,
    interpretation:
      "FRESH_FAST_ENDPOINT_SCHEDULED_AND_SERVED_MODEL_OLD_FAST_ENDPOINT_RECORD_IS_DEFECTIVE",
  };
} catch (error) {
  primaryError = error instanceof Error ? error : new Error(String(error));
} finally {
  if (modelsTransport) {
    modelsTransport.cancel(`${CONTRACT}_FINAL_CLEANUP`);
    try {
      await modelsTransport.promise;
    } catch {
      // Transport may already be closed or deliberately aborted.
    }
  }

  let cleanupError = null;
  try {
    const current = await loadThree(managementKey, runtimeKey);
    const candidateId = text(current.candidate?.id);
    const deepId = text(current.deep?.id);

    if (candidateWasActivatedByProbe || finite(current.candidate?.workersMax, -1) === 1) {
      await cleanupOwnedCandidateRequest(candidateId, runtimeKey);
      const refreshedCandidate = await rest(
        `/endpoints/${encodeURIComponent(candidateId)}?includeTemplate=false&includeWorkers=true`,
        managementKey,
      );
      if (finite(refreshedCandidate?.workersMax, -1) === 1) {
        await patchWorkers(candidateId, 0, managementKey, `${CONTRACT}_CANDIDATE_PARK`);
      } else if (finite(refreshedCandidate?.workersMax, -1) !== 0) {
        throw new Error(`${CONTRACT}_CANDIDATE_UNEXPECTED_MAX_DURING_CLEANUP`);
      }
      await waitWorkersGone(
        candidateId,
        managementKey,
        runtimeKey,
        WORKER_DRAIN_TIMEOUT_MS,
        "CANDIDATE",
      );
      candidateWasActivatedByProbe = false;
    }

    const beforeDeepRestore = await loadThree(managementKey, runtimeKey);
    if (finite(beforeDeepRestore.fast?.workersMax, -1) !== 0) {
      throw new Error(`${CONTRACT}_CLEANUP_REFUSED_OLD_FAST_NOT_PARKED`);
    }
    if (finite(beforeDeepRestore.candidate?.workersMax, -1) !== 0) {
      throw new Error(`${CONTRACT}_CLEANUP_REFUSED_CANDIDATE_NOT_PARKED`);
    }
    if (deepWasParkedByProbe) {
      if (finite(beforeDeepRestore.deep?.workersMin, -1) !== 0) {
        throw new Error(`${CONTRACT}_CLEANUP_REFUSED_DEEP_MIN_NOT_ZERO`);
      }
      if (finite(beforeDeepRestore.deep?.workersMax, -1) === 0) {
        await patchWorkers(deepId, 1, managementKey, `${CONTRACT}_DEEP_RESTORE`);
      } else if (finite(beforeDeepRestore.deep?.workersMax, -1) !== 1) {
        throw new Error(`${CONTRACT}_DEEP_UNEXPECTED_MAX_DURING_RESTORE`);
      }
      deepWasParkedByProbe = false;
    }

    const finalState = await verifyFinalState(managementKey, runtimeKey);
    console.log(`${CONTRACT}_FINAL_STATE=${JSON.stringify(finalState)}`);
    console.log(`${CONTRACT}_RESTORE=PASS`);
  } catch (error) {
    cleanupError = error instanceof Error ? error : new Error(String(error));
    console.error(`${CONTRACT}_RESTORE=FAIL:${redact(cleanupError.message)}`);
  }

  if (cleanupError && !primaryError) primaryError = cleanupError;
  else if (cleanupError && primaryError) {
    primaryError = new Error(
      `${primaryError.message}:RESTORE_FAILURE=${redact(cleanupError.message)}`,
    );
  }
}

if (primaryError) {
  console.error(`${CONTRACT}=FAIL`);
  console.error(`${CONTRACT}_REASON=${redact(primaryError.message)}`);
  console.error(`${CONTRACT}_GENERATION_SUBMITTED=NO`);
  console.error(`${CONTRACT}_PRODUCTION_DEPLOY_PERFORMED=NO`);
  process.exit(1);
}

console.log(`${CONTRACT}_RESULT=${JSON.stringify(result)}`);
console.log(`${CONTRACT}=PASS`);
console.log(`${CONTRACT}_GENERATION_SUBMITTED=NO`);
console.log(`${CONTRACT}_PRODUCTION_DEPLOY_PERFORMED=NO`);
