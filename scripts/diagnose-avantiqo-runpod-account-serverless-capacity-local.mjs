import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const GRAPHQL_URL = "https://api.runpod.io/graphql";
const REST_BASE = "https://rest.runpod.io/v1";
const CONTROL_BASE = "https://api.runpod.io/v2";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_RUNPOD_SERVERLESS_ACCOUNT_CAPACITY_DIAGNOSTIC_V1";
const EXPECTED_MAIN_ENV = "AVANTIQO_RUNPOD_ACCOUNT_CAPACITY_EXPECTED_MAIN";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

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
  const expectedMain = text(process.env[EXPECTED_MAIN_ENV]);
  if (expectedMain && !/^[0-9a-f]{40}$/i.test(expectedMain)) {
    throw new Error(`AVANTIQO_RUNPOD_ACCOUNT_CAPACITY_EXPECTED_MAIN_INVALID:${expectedMain.slice(0, 80)}`);
  }
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_RUNPOD_ACCOUNT_CAPACITY_GIT_BRANCH_FAILED");
  if (branch !== "main") {
    throw new Error(`AVANTIQO_RUNPOD_ACCOUNT_CAPACITY_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  }
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_RUNPOD_ACCOUNT_CAPACITY_GIT_HEAD_FAILED");
  if (expectedMain) {
    if (head !== expectedMain) {
      throw new Error(`AVANTIQO_RUNPOD_ACCOUNT_CAPACITY_PINNED_MAIN_MISMATCH:head=${head}:expected=${expectedMain}`);
    }
    return head;
  }
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_RUNPOD_ACCOUNT_CAPACITY_GIT_FETCH_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_RUNPOD_ACCOUNT_CAPACITY_GIT_REMOTE_FAILED");
  if (head !== remote) {
    throw new Error(`AVANTIQO_RUNPOD_ACCOUNT_CAPACITY_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
  }
  return head;
}

async function readJson(response, code) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
    throw new Error(`${code}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

async function accountGraphql(managementKey) {
  const query = `
    query AvantiqoRunpodServerlessAccountCapacityDiagnostic {
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
    const detail = text(
      body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw,
    ).slice(0, 1000);
    throw new Error(`AVANTIQO_RUNPOD_ACCOUNT_CAPACITY_GRAPHQL_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  return body.data.myself;
}

async function rest(path, managementKey) {
  return readJson(await fetch(`${REST_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_RUNPOD_ACCOUNT_CAPACITY_REST");
}

async function controlWorkers(endpointId, managementKey) {
  return readJson(await fetch(
    `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`,
    {
      headers: {
        Authorization: `Bearer ${managementKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    },
  ), "AVANTIQO_RUNPOD_ACCOUNT_CAPACITY_CONTROL");
}

async function queueHealth(endpointId, runtimeKey) {
  return readJson(await fetch(
    `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`,
    {
      headers: {
        Authorization: `Bearer ${runtimeKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    },
  ), "AVANTIQO_RUNPOD_ACCOUNT_CAPACITY_QUEUE");
}

function safeControlWorkers(body = {}) {
  return list(body?.workers).map((worker) => ({
    id_present: Boolean(text(worker?.id)),
    status: text(worker?.status).toUpperCase() || null,
    desired_status: text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase() || null,
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    is_stale: worker?.isStale === true,
  }));
}

function activeControlWorkerCount(body = {}) {
  return safeControlWorkers(body).filter(
    (worker) => !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(worker.status),
  ).length;
}

function healthSummary(body = {}) {
  const jobs = body?.jobs && typeof body.jobs === "object" ? body.jobs : {};
  const workers = body?.workers && typeof body.workers === "object" ? body.workers : {};
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

function endpointSummary(endpoint = {}) {
  return {
    id: text(endpoint?.id) || null,
    name: text(endpoint?.name) || null,
    version: finite(endpoint?.version),
    workers_min: finite(endpoint?.workersMin, 0),
    workers_max: finite(endpoint?.workersMax, 0),
    gpu_count: finite(endpoint?.gpuCount, 0),
    gpu_type_ids: list(endpoint?.gpuTypeIds).map(text).filter(Boolean),
    data_center_ids: list(endpoint?.dataCenterIds).map(text).filter(Boolean),
    min_cuda_version: text(endpoint?.minCudaVersion) || null,
    allowed_cuda_versions: list(endpoint?.allowedCudaVersions).map(text).filter(Boolean),
  };
}

function resolveOne(endpoints, name) {
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === name);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_RUNPOD_ACCOUNT_CAPACITY_ENDPOINT_RESOLUTION_FAILED:name=${name}:matches=${matches.length}`);
  }
  return matches[0];
}

const mainCommit = validateCurrentMain();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const runtimeKey = text(process.env.RUNPOD_API_KEY || managementKey);
if (!managementKey || !runtimeKey) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");

const [account, endpointsRaw] = await Promise.all([
  accountGraphql(managementKey),
  rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey),
]);

const endpoints = Array.isArray(endpointsRaw)
  ? endpointsRaw
  : list(endpointsRaw?.endpoints || endpointsRaw?.data || endpointsRaw?.items);
if (!endpoints.length) throw new Error("AVANTIQO_RUNPOD_ACCOUNT_CAPACITY_ENDPOINT_LIST_EMPTY");

const controlRows = [];
for (const endpoint of endpoints) {
  const id = text(endpoint?.id);
  if (!id) continue;
  try {
    const raw = await controlWorkers(id, managementKey);
    controlRows.push({
      endpoint_id: id,
      endpoint_name: text(endpoint?.name) || null,
      active_control_workers: activeControlWorkerCount(raw),
      control_workers: safeControlWorkers(raw),
      error: null,
    });
  } catch (error) {
    controlRows.push({
      endpoint_id: id,
      endpoint_name: text(endpoint?.name) || null,
      active_control_workers: null,
      control_workers: [],
      error: text(error?.message || error).slice(0, 600),
    });
  }
}

const totalActiveControlWorkers = controlRows.reduce(
  (sum, row) => sum + (Number.isFinite(row.active_control_workers) ? row.active_control_workers : 0),
  0,
);
const maxServerlessConcurrency = finite(account?.maxServerlessConcurrency, null);
const clientBalance = finite(account?.clientBalance, null);
const minBalance = finite(account?.minBalance, null);
const balanceMinusMinimum =
  clientBalance !== null && minBalance !== null
    ? Number((clientBalance - minBalance).toFixed(6))
    : null;

const deep = resolveOne(endpoints, DEEP_NAME);
const fast = resolveOne(endpoints, FAST_NAME);
const [deepHealthRaw, fastHealthRaw, deepWorkersRaw, fastWorkersRaw] = await Promise.all([
  queueHealth(text(deep?.id), runtimeKey),
  queueHealth(text(fast?.id), runtimeKey),
  controlWorkers(text(deep?.id), managementKey),
  controlWorkers(text(fast?.id), managementKey),
]);

const hardBlockers = [];
if (account?.underBalance === true) hardBlockers.push("ACCOUNT_UNDER_BALANCE");
if (clientBalance !== null && clientBalance <= 0) hardBlockers.push("CLIENT_BALANCE_NON_POSITIVE");
if (maxServerlessConcurrency !== null && maxServerlessConcurrency <= 0) {
  hardBlockers.push("SERVERLESS_CONCURRENCY_LIMIT_ZERO");
}
if (
  maxServerlessConcurrency !== null &&
  maxServerlessConcurrency > 0 &&
  totalActiveControlWorkers >= maxServerlessConcurrency
) {
  hardBlockers.push("SERVERLESS_CONCURRENCY_LIMIT_EXHAUSTED");
}
if (
  clientBalance !== null &&
  minBalance !== null &&
  clientBalance < minBalance
) {
  hardBlockers.push("CLIENT_BALANCE_BELOW_MINIMUM");
}

let diagnosis = "RUNPOD_ACCOUNT_ELIGIBLE_SERVERLESS_CONTROL_PLANE_OR_SCHEDULER_FAILURE";
let nextAction = "OPEN_RUNPOD_SUPPORT_WITH_ACCOUNT_CAPACITY_AND_INTELLIGENCE_ENDPOINT_EVIDENCE";
if (
  hardBlockers.includes("ACCOUNT_UNDER_BALANCE") ||
  hardBlockers.includes("CLIENT_BALANCE_NON_POSITIVE") ||
  hardBlockers.includes("CLIENT_BALANCE_BELOW_MINIMUM")
) {
  diagnosis = "RUNPOD_ACCOUNT_BALANCE_BLOCKER_CONFIRMED";
  nextAction = "RESTORE_RUNPOD_ACCOUNT_BALANCE_ABOVE_MINIMUM_THEN_REPEAT_WARM_CONTROL_NO_INFERENCE";
} else if (
  hardBlockers.includes("SERVERLESS_CONCURRENCY_LIMIT_ZERO") ||
  hardBlockers.includes("SERVERLESS_CONCURRENCY_LIMIT_EXHAUSTED")
) {
  diagnosis = "RUNPOD_SERVERLESS_CONCURRENCY_BLOCKER_CONFIRMED";
  nextAction = "FREE_OR_INCREASE_RUNPOD_SERVERLESS_CONCURRENCY_THEN_REPEAT_WARM_CONTROL_NO_INFERENCE";
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  main_commit: mainCommit,
  pinned_main: Boolean(text(process.env[EXPECTED_MAIN_ENV])),
  account: {
    under_balance: account?.underBalance === true,
    min_balance_usd: minBalance,
    client_balance_usd: clientBalance,
    balance_minus_minimum_usd: balanceMinusMinimum,
    max_serverless_concurrency: maxServerlessConcurrency,
  },
  account_serverless_usage: {
    endpoint_count: endpoints.length,
    configured_workers_min_total: endpoints.reduce((sum, endpoint) => sum + finite(endpoint?.workersMin, 0), 0),
    configured_workers_max_total: endpoints.reduce((sum, endpoint) => sum + finite(endpoint?.workersMax, 0), 0),
    total_active_control_workers: totalActiveControlWorkers,
    max_serverless_concurrency: maxServerlessConcurrency,
    concurrency_remaining:
      maxServerlessConcurrency !== null
        ? maxServerlessConcurrency - totalActiveControlWorkers
        : null,
    endpoints_with_active_control_workers: controlRows.filter(
      (row) => Number(row.active_control_workers) > 0,
    ),
    control_worker_read_errors: controlRows.filter((row) => row.error),
  },
  intelligence: {
    deep: {
      endpoint: endpointSummary(deep),
      health: healthSummary(deepHealthRaw),
      control_workers: safeControlWorkers(deepWorkersRaw),
    },
    fast: {
      endpoint: endpointSummary(fast),
      health: healthSummary(fastHealthRaw),
      control_workers: safeControlWorkers(fastWorkersRaw),
    },
  },
  hard_blockers: hardBlockers,
  diagnosis,
  next_action: nextAction,
  generation_submitted: false,
  inference_performed: false,
  gpu_activation_performed: false,
  endpoint_mutation_performed: false,
  queue_mutation_performed: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_in_output: false,
  account_identity_printed: false,
}, null, 2));
