import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const CONTROL_BASE = "https://api.runpod.io/v2";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_UNSCHEDULED_MODEL_PROBE_RECOVERY_V1";
const EXPECTED_MAIN_ENV = "AVANTIQO_INTELLIGENCE_FAST_UNSCHEDULED_MODEL_PROBE_RECOVERY_EXPECTED_MAIN";
const APPROVAL_ENV = "AVANTIQO_INTELLIGENCE_FAST_UNSCHEDULED_MODEL_PROBE_RECOVERY_APPROVED";
const RESTORE_GRACE_MS = 30_000;

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const approved = (name) => text(process.env[name]).toUpperCase() === "YES";

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(
      /((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi,
      "$1[REDACTED]",
    );
}

function shell(name, args, code, env = process.env) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
  });
  if (result.status !== 0) {
    throw new Error(
      `${code}:${redact(result.stderr || result.stdout).slice(0, 1200)}`,
    );
  }
  return text(result.stdout);
}

function validateMain() {
  const expectedMain = text(process.env[EXPECTED_MAIN_ENV]);
  if (expectedMain && !/^[0-9a-f]{40}$/i.test(expectedMain)) {
    throw new Error(`${CONTRACT}_EXPECTED_MAIN_INVALID`);
  }
  const branch = shell("git", ["branch", "--show-current"], `${CONTRACT}_GIT_BRANCH_FAILED`);
  if (branch !== "main") {
    throw new Error(`${CONTRACT}_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  }
  const head = shell("git", ["rev-parse", "HEAD"], `${CONTRACT}_GIT_HEAD_FAILED`);
  if (expectedMain) {
    if (head !== expectedMain) {
      throw new Error(`${CONTRACT}_PINNED_MAIN_MISMATCH:head=${head}:expected=${expectedMain}`);
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
  if (!response.ok || (!options.allowEmpty && body === null)) {
    const detail = redact(body?.message || body?.error || body?.detail || raw).slice(0, 900);
    throw new Error(`${CONTRACT}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function rest(path, key, options = {}) {
  return requestJson(`${REST_BASE}${path}`, key, options);
}

async function graphql(query, variables, key, { optional = false } = {}) {
  try {
    const response = await requestJson(GRAPHQL_URL, key, {
      method: "POST",
      body: { query, variables },
      timeoutMs: 30_000,
    });
    if (Array.isArray(response?.errors) && response.errors.length > 0) {
      const message = redact(response.errors.map((entry) => entry?.message).filter(Boolean).join(" | ")).slice(0, 900);
      if (optional) return { ok: false, error: message, data: null };
      throw new Error(`${CONTRACT}_GRAPHQL:${message}`);
    }
    return optional
      ? { ok: true, error: null, data: response?.data ?? null }
      : response;
  } catch (error) {
    if (optional) {
      return {
        ok: false,
        error: redact(error instanceof Error ? error.message : error).slice(0, 900),
        data: null,
      };
    }
    throw error;
  }
}

async function queueHealth(endpointId, key) {
  return requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, key, {
    timeoutMs: 20_000,
  });
}

async function purgeQueue(endpointId, key) {
  return requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/purge-queue`, key, {
    method: "POST",
    timeoutMs: 20_000,
  });
}

async function controlWorkers(endpointId, key) {
  return requestJson(
    `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`,
    key,
    { timeoutMs: 20_000 },
  );
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

function healthSummary(body = {}) {
  const jobs = object(body?.jobs);
  const workers = object(body?.workers);
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

function controlWorkerRows(body = {}) {
  return list(body?.workers).map((worker) => ({
    id_present: Boolean(text(worker?.id)),
    status: text(worker?.status).toUpperCase() || null,
    desired_status: text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase() || null,
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    is_stale: worker?.isStale === true,
  }));
}

function activeControlWorkers(body = {}) {
  return controlWorkerRows(body).filter((worker) => {
    const status = text(worker.status).toUpperCase();
    const desired = text(worker.desired_status).toUpperCase();
    return ![status, desired].some((value) =>
      ["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(value),
    );
  });
}

function endpointSummary(endpoint = {}) {
  return {
    id: text(endpoint?.id) || null,
    name: text(endpoint?.name) || null,
    workers_min: finite(endpoint?.workersMin, -1),
    workers_max: finite(endpoint?.workersMax, -1),
    gpu_count: finite(endpoint?.gpuCount, null),
    gpu_type_ids: list(endpoint?.gpuTypeIds).map(text).filter(Boolean),
    data_center_ids: list(endpoint?.dataCenterIds).map(text).filter(Boolean),
    min_cuda_version: text(endpoint?.minCudaVersion) || null,
    allowed_cuda_versions: list(endpoint?.allowedCudaVersions).map(text).filter(Boolean),
  };
}

function canonical(deep, fast, deepHealth, fastHealth) {
  return (
    finite(deep?.workersMin, -1) === 0 &&
    finite(deep?.workersMax, -1) === 1 &&
    finite(fast?.workersMin, -1) === 0 &&
    finite(fast?.workersMax, -1) === 0 &&
    deepHealth.jobs.in_queue === 0 &&
    deepHealth.jobs.in_progress === 0 &&
    fastHealth.jobs.in_queue === 0 &&
    fastHealth.jobs.in_progress === 0
  );
}

const ACCOUNT_QUERY = `
query AvantiqoFastUnscheduledProbeAccount {
  myself {
    underBalance
    minBalance
    maxServerlessConcurrency
    clientBalance
  }
}`;

const CAPACITY_QUERY = `
query AvantiqoFastUnscheduledProbeGpuCapacity {
  dataCenters {
    id
    name
    location
    gpuAvailability {
      gpuTypeId
      displayName
      stockStatus
    }
  }
}`;

async function accountState(key) {
  const result = await graphql(ACCOUNT_QUERY, {}, key, { optional: true });
  if (!result.ok) return result;
  const account = result.data?.myself;
  if (!account) return { ok: false, error: "ACCOUNT_STATE_MISSING", data: null };
  return {
    ok: true,
    error: null,
    data: {
      under_balance: account?.underBalance === true,
      min_balance_usd: finite(account?.minBalance),
      client_balance_usd: finite(account?.clientBalance),
      max_serverless_concurrency: finite(account?.maxServerlessConcurrency),
    },
  };
}

async function gpuCapacity(fastEndpoint, key) {
  const result = await graphql(CAPACITY_QUERY, {}, key, { optional: true });
  if (!result.ok) return result;
  const accepted = new Set(list(fastEndpoint?.gpuTypeIds).map(text).filter(Boolean));
  const rows = [];
  for (const dc of list(result.data?.dataCenters)) {
    for (const availability of list(dc?.gpuAvailability)) {
      const gpuTypeId = text(availability?.gpuTypeId);
      if (accepted.size > 0 && !accepted.has(gpuTypeId)) continue;
      rows.push({
        data_center_id: text(dc?.id) || null,
        location: text(dc?.location || dc?.name) || null,
        gpu_type_id: gpuTypeId || null,
        display_name: text(availability?.displayName) || null,
        stock_status: text(availability?.stockStatus) || null,
      });
    }
  }
  return { ok: true, error: null, data: rows };
}

async function loadLive(managementKey, runtimeKey) {
  const endpointsRaw = await rest(
    "/endpoints?includeTemplate=false&includeWorkers=true",
    managementKey,
  );
  const endpoints = normalizeRows(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
  const deep = resolveOne(endpoints, DEEP_NAME, `${CONTRACT}_DEEP_RESOLUTION_FAILED`);
  const fast = resolveOne(endpoints, FAST_NAME, `${CONTRACT}_FAST_RESOLUTION_FAILED`);
  const deepId = text(deep?.id);
  const fastId = text(fast?.id);
  const [deepHealthRaw, fastHealthRaw, fastControlRaw] = await Promise.all([
    queueHealth(deepId, runtimeKey),
    queueHealth(fastId, runtimeKey),
    controlWorkers(fastId, managementKey),
  ]);
  return {
    endpoints,
    deep,
    fast,
    deepId,
    fastId,
    deepHealth: healthSummary(deepHealthRaw),
    fastHealth: healthSummary(fastHealthRaw),
    fastControlRaw,
  };
}

async function accountConcurrency(endpoints, managementKey) {
  const rows = [];
  for (const endpoint of endpoints) {
    const endpointId = text(endpoint?.id);
    if (!endpointId) continue;
    try {
      const raw = await controlWorkers(endpointId, managementKey);
      const workers = activeControlWorkers(raw);
      if (workers.length > 0) {
        rows.push({
          endpoint_id: endpointId,
          endpoint_name: text(endpoint?.name) || null,
          active_control_worker_count: workers.length,
          workers,
        });
      }
    } catch (error) {
      rows.push({
        endpoint_id: endpointId,
        endpoint_name: text(endpoint?.name) || null,
        active_control_worker_count: null,
        workers: [],
        read_error: redact(error instanceof Error ? error.message : error).slice(0, 500),
      });
    }
  }
  return rows;
}

function classify({ account, activeRows, fastHealth, fastControl, gpu }) {
  const hard = [];
  if (account?.under_balance === true) hard.push("ACCOUNT_UNDER_BALANCE");
  if (account?.client_balance_usd !== null && account?.client_balance_usd <= 0) {
    hard.push("CLIENT_BALANCE_NON_POSITIVE");
  }
  if (
    account?.client_balance_usd !== null &&
    account?.min_balance_usd !== null &&
    account.client_balance_usd < account.min_balance_usd
  ) {
    hard.push("CLIENT_BALANCE_BELOW_MINIMUM");
  }
  const totalActive = activeRows.reduce(
    (sum, row) => sum + (Number.isFinite(row.active_control_worker_count) ? row.active_control_worker_count : 0),
    0,
  );
  if (
    Number.isFinite(account?.max_serverless_concurrency) &&
    totalActive >= account.max_serverless_concurrency
  ) {
    hard.push("SERVERLESS_CONCURRENCY_LIMIT_EXHAUSTED");
  }
  const stockValues = list(gpu).map((row) => text(row?.stock_status).toLowerCase()).filter(Boolean);
  const anyKnownStock = stockValues.some((value) => !["none", "unavailable", "out of stock", "no stock"].includes(value));
  if (stockValues.length > 0 && !anyKnownStock) hard.push("FAST_ACCEPTED_GPU_POOL_NO_STOCK");

  let diagnosis = "RUNPOD_FAST_SCHEDULER_DID_NOT_ALLOCATE_WORKER";
  if (hard.some((entry) => entry.includes("BALANCE"))) {
    diagnosis = "RUNPOD_ACCOUNT_BALANCE_BLOCKER_CONFIRMED";
  } else if (hard.includes("SERVERLESS_CONCURRENCY_LIMIT_EXHAUSTED")) {
    diagnosis = "RUNPOD_SERVERLESS_CONCURRENCY_BLOCKER_CONFIRMED";
  } else if (hard.includes("FAST_ACCEPTED_GPU_POOL_NO_STOCK")) {
    diagnosis = "RUNPOD_FAST_GPU_CAPACITY_BLOCKER_CONFIRMED";
  } else if (
    fastHealth.jobs.in_queue === 1 &&
    fastHealth.jobs.in_progress === 0 &&
    fastControl.length === 0
  ) {
    diagnosis = "RUNPOD_FAST_UNSCHEDULED_PROBE_NO_CONTROL_WORKER";
  }
  return { diagnosis, hard_blockers: hard, total_active_control_workers: totalActive };
}

const apply = process.argv.includes("--apply");
if (apply && !approved(APPROVAL_ENV)) {
  throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
}

const main = validateMain();
const managementKey = managementCredential();
const runtimeKey = runtimeCredential(managementKey);
const live = await loadLive(managementKey, runtimeKey);
const [account, gpu, activeRows] = await Promise.all([
  accountState(managementKey),
  gpuCapacity(live.fast, managementKey),
  accountConcurrency(live.endpoints, managementKey),
]);
const fastControl = activeControlWorkers(live.fastControlRaw);
const classified = classify({
  account: account.ok ? account.data : null,
  activeRows,
  fastHealth: live.fastHealth,
  fastControl,
  gpu: gpu.ok ? gpu.data : [],
});

const alreadyCanonical = canonical(
  live.deep,
  live.fast,
  live.deepHealth,
  live.fastHealth,
);
const exactOwnedStaleProbe =
  finite(live.fast?.workersMin, -1) === 0 &&
  finite(live.fast?.workersMax, -1) === 1 &&
  live.fastHealth.jobs.in_queue === 1 &&
  live.fastHealth.jobs.in_progress === 0 &&
  fastControl.length === 0 &&
  live.fastHealth.workers.initializing === 0 &&
  live.fastHealth.workers.running === 0;

const report = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_commit: main.head,
  pinned_main: main.pinned,
  account: account.ok ? account.data : { unavailable: true, error: account.error },
  account_serverless_usage: {
    total_active_control_workers: classified.total_active_control_workers,
    max_serverless_concurrency: account.ok ? account.data.max_serverless_concurrency : null,
    concurrency_remaining:
      account.ok && Number.isFinite(account.data.max_serverless_concurrency)
        ? account.data.max_serverless_concurrency - classified.total_active_control_workers
        : null,
    endpoints_with_active_control_workers: activeRows,
  },
  fast_gpu_capacity: gpu.ok ? gpu.data : { unavailable: true, error: gpu.error },
  deep: {
    endpoint: endpointSummary(live.deep),
    health: live.deepHealth,
  },
  fast: {
    endpoint: endpointSummary(live.fast),
    health: live.fastHealth,
    active_control_workers: fastControl,
  },
  diagnosis: classified.diagnosis,
  hard_blockers: classified.hard_blockers,
  already_canonical: alreadyCanonical,
  exact_owned_stale_probe: exactOwnedStaleProbe,
  proposed_action: alreadyCanonical
    ? "NONE"
    : exactOwnedStaleProbe
      ? "PURGE_SINGLE_UNSCHEDULED_FAST_PROBE_THEN_RECOVER_CANONICAL_LANES"
      : "REFUSE_MUTATION_REVIEW_LIVE_STATE",
  generation_submitted: false,
  inference_performed: false,
  gpu_activation_performed: false,
  endpoint_mutation_performed: false,
  queue_mutation_performed: false,
  production_deploy_performed: false,
  secrets_in_output: false,
};

if (!apply || alreadyCanonical) {
  console.log(JSON.stringify({ ...report, mutation_performed: false }, null, 2));
  console.log(`${CONTRACT}=${alreadyCanonical ? "ALREADY_RECOVERED" : "PLAN_READY"}`);
  process.exit(0);
}

if (!exactOwnedStaleProbe) {
  console.log(JSON.stringify({ ...report, mutation_performed: false }, null, 2));
  throw new Error(`${CONTRACT}_MUTATION_REFUSED_LIVE_STATE_NOT_EXACT_OWNED_STALE_PROBE`);
}

await purgeQueue(live.fastId, runtimeKey);
let purgeVerified = false;
for (let attempt = 0; attempt < 20; attempt += 1) {
  const health = healthSummary(await queueHealth(live.fastId, runtimeKey));
  if (health.jobs.in_queue === 0 && health.jobs.in_progress === 0) {
    purgeVerified = true;
    break;
  }
  await sleep(1000);
}
if (!purgeVerified) throw new Error(`${CONTRACT}_PURGE_VERIFY_FAILED`);

let restoredByExistingProcess = false;
let restoredByRecovery = false;
const restoreStarted = Date.now();
while (Date.now() - restoreStarted < RESTORE_GRACE_MS) {
  const afterPurge = await loadLive(managementKey, runtimeKey);
  if (
    canonical(
      afterPurge.deep,
      afterPurge.fast,
      afterPurge.deepHealth,
      afterPurge.fastHealth,
    )
  ) {
    restoredByExistingProcess = true;
    break;
  }
  await sleep(3000);
}

if (!restoredByExistingProcess) {
  shell(
    "node",
    ["--env-file=.env.local", "scripts/manage-avantiqo-intelligence-lane-slot-local.mjs", "--restore-deep"],
    `${CONTRACT}_RESTORE_DEEP_FAILED`,
    {
      ...process.env,
      AVANTIQO_INTELLIGENCE_FAST_SLOT_RESTORE_APPROVED: "YES",
    },
  );
  restoredByRecovery = true;
}

const finalLive = await loadLive(managementKey, runtimeKey);
const finalCanonical = canonical(
  finalLive.deep,
  finalLive.fast,
  finalLive.deepHealth,
  finalLive.fastHealth,
);
if (!finalCanonical) {
  throw new Error(`${CONTRACT}_FINAL_CANONICAL_VERIFY_FAILED`);
}

console.log(
  JSON.stringify(
    {
      ...report,
      mode: "APPLY",
      stale_probe_purged: true,
      purge_verified: true,
      restored_by_existing_process: restoredByExistingProcess,
      restored_by_recovery: restoredByRecovery,
      final_deep: {
        endpoint: endpointSummary(finalLive.deep),
        health: finalLive.deepHealth,
      },
      final_fast: {
        endpoint: endpointSummary(finalLive.fast),
        health: finalLive.fastHealth,
      },
      canonical_deep_active_fast_parked_after: true,
      mutation_performed: true,
      queue_mutation_performed: true,
      endpoint_mutation_performed: restoredByRecovery,
      generation_submitted: false,
      inference_performed: false,
      gpu_activation_performed: false,
      production_deploy_performed: false,
      next_action: "FIX_PREFLIGHT_TRANSPORT_AND_GATE_ON_RUNPOD_SCHEDULING_CAPACITY_BEFORE_COLD_START_PROFILE",
    },
    null,
    2,
  ),
);
console.log(`${CONTRACT}=PASS`);
