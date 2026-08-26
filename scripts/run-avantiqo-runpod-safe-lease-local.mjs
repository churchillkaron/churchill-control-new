import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V1";
const POLICY_PATH = "config/avantiqo-runpod-safe-lease-policy.json";
const APPROVAL_ENV = "AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED";

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const finite = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
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
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

async function rest(path, key, options = {}) {
  return requestJson(`${REST_BASE}${path}`, key, options);
}

async function queue(endpointId, path, key, options = {}) {
  return requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`, key, options);
}

function endpointsFrom(body) {
  if (Array.isArray(body)) return body;
  return list(body?.endpoints || body?.data || body?.items || body?.results);
}

function healthSummary(body = {}) {
  const jobs = body?.jobs || {};
  const workers = body?.workers || {};
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

function endpointCostPerHour(endpoint = {}) {
  return list(endpoint?.workers).reduce((sum, worker) => {
    const cost = finite(worker?.adjustedCostPerHr ?? worker?.costPerHr, 0);
    return sum + Math.max(0, cost || 0);
  }, 0);
}

function parseArgs() {
  const separator = process.argv.indexOf("--");
  const controlArgs = separator === -1 ? process.argv.slice(2) : process.argv.slice(2, separator);
  const command = separator === -1 ? [] : process.argv.slice(separator + 1);
  const laneArg = controlArgs.find((entry) => entry.startsWith("--lane="));
  const ttlArg = controlArgs.find((entry) => entry.startsWith("--ttl-ms="));
  const maxHourlyArg = controlArgs.find((entry) => entry.startsWith("--max-hourly-usd="));
  return {
    lane: text(laneArg?.slice("--lane=".length)),
    ttlMs: ttlArg ? finite(ttlArg.slice("--ttl-ms=".length), null) : null,
    maxHourlyUsd: maxHourlyArg ? finite(maxHourlyArg.slice("--max-hourly-usd=".length), null) : null,
    command,
  };
}

async function patchScaling(endpointId, workersMax, managementKey) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMin: 0, workersMax },
  });
  const verified = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=true`,
    managementKey,
  );
  if (finite(verified?.workersMin, -1) !== 0 || finite(verified?.workersMax, -1) !== workersMax) {
    throw new Error(`${CONTRACT}_SCALING_VERIFY_FAILED:${text(verified?.name)}:min=${finite(verified?.workersMin)}:max=${finite(verified?.workersMax)}:expected=0/${workersMax}`);
  }
  return verified;
}

async function parkAll(managementKey) {
  const endpoints = endpointsFrom(await rest(
    "/endpoints?includeTemplate=false&includeWorkers=true",
    managementKey,
  ));
  const results = [];
  for (const endpoint of endpoints) {
    const id = text(endpoint?.id);
    if (!id) continue;
    try {
      if (finite(endpoint?.workersMin, -1) !== 0 || finite(endpoint?.workersMax, -1) !== 0) {
        await patchScaling(id, 0, managementKey);
      }
      results.push({ endpoint_id: id, endpoint_name: text(endpoint?.name) || null, success: true });
    } catch (error) {
      results.push({ endpoint_id: id, endpoint_name: text(endpoint?.name) || null, success: false, error: redact(error?.message).slice(0, 300) });
    }
  }
  return results;
}

async function purgeAllQueues(endpoints, queueKey) {
  const results = [];
  for (const endpoint of endpoints) {
    const id = text(endpoint?.id);
    if (!id) continue;
    try {
      const body = await queue(id, "/purge-queue", queueKey, { method: "POST" });
      results.push({ endpoint_id: id, endpoint_name: text(endpoint?.name) || null, success: true, removed: finite(body?.removed, null) });
    } catch (error) {
      results.push({ endpoint_id: id, endpoint_name: text(endpoint?.name) || null, success: false, error: redact(error?.message).slice(0, 300) });
    }
  }
  return results;
}

async function accountSnapshot(managementKey, queueKey) {
  const endpoints = endpointsFrom(await rest(
    "/endpoints?includeTemplate=false&includeWorkers=true",
    managementKey,
  ));
  const rows = [];
  let totalQueue = 0;
  let totalProgress = 0;
  for (const endpoint of endpoints) {
    const id = text(endpoint?.id);
    if (!id) continue;
    let health = null;
    let healthError = null;
    try {
      health = healthSummary(await queue(id, "/health", queueKey));
      totalQueue += health.jobs.in_queue;
      totalProgress += health.jobs.in_progress;
    } catch (error) {
      healthError = redact(error?.message).slice(0, 250);
    }
    rows.push({
      id,
      name: text(endpoint?.name) || null,
      workers_min: finite(endpoint?.workersMin, null),
      workers_max: finite(endpoint?.workersMax, null),
      active_worker_records: list(endpoint?.workers).length,
      hourly_cost_usd: endpointCostPerHour(endpoint),
      health,
      health_error: healthError,
    });
  }
  return { endpoints, rows, total_queue: totalQueue, total_in_progress: totalProgress };
}

function assertZeroBaseline(snapshot) {
  const violations = snapshot.rows.filter((row) => row.workers_min !== 0 || row.workers_max !== 0);
  const healthFailures = snapshot.rows.filter((row) => row.health_error);
  if (violations.length) {
    throw new Error(`${CONTRACT}_ZERO_BASELINE_SCALING_REQUIRED:${JSON.stringify(violations.map((row) => ({ name: row.name, min: row.workers_min, max: row.workers_max })))}`);
  }
  if (healthFailures.length) {
    throw new Error(`${CONTRACT}_ZERO_BASELINE_HEALTH_INCOMPLETE:${healthFailures.map((row) => row.name).join(",")}`);
  }
  if (snapshot.total_queue !== 0 || snapshot.total_in_progress !== 0) {
    throw new Error(`${CONTRACT}_ZERO_BASELINE_JOBS_REQUIRED:queue=${snapshot.total_queue}:progress=${snapshot.total_in_progress}`);
  }
}

function assertLeaseState(snapshot, targetId, maxHourlyUsd) {
  const open = snapshot.rows.filter((row) => row.workers_max > 0 || row.workers_min > 0);
  if (open.length !== 1 || open[0].id !== targetId || open[0].workers_min !== 0 || open[0].workers_max !== 1) {
    throw new Error(`${CONTRACT}_ACCOUNT_LEASE_VIOLATION:${JSON.stringify(open.map((row) => ({ name: row.name, min: row.workers_min, max: row.workers_max })))}`);
  }
  if (snapshot.total_queue + snapshot.total_in_progress > 1) {
    throw new Error(`${CONTRACT}_JOB_LIMIT_EXCEEDED:queue=${snapshot.total_queue}:progress=${snapshot.total_in_progress}`);
  }
  const target = snapshot.rows.find((row) => row.id === targetId);
  if (!target) throw new Error(`${CONTRACT}_TARGET_DISAPPEARED`);
  if (target.hourly_cost_usd > maxHourlyUsd) {
    throw new Error(`${CONTRACT}_HOURLY_COST_LIMIT_EXCEEDED:actual=${target.hourly_cost_usd}:limit=${maxHourlyUsd}`);
  }
}

async function waitForZero(managementKey, queueKey, timeoutMs, pollMs) {
  const started = Date.now();
  let latest = null;
  while (Date.now() - started <= timeoutMs) {
    latest = await accountSnapshot(managementKey, queueKey);
    const scalingOk = latest.rows.every((row) => row.workers_min === 0 && row.workers_max === 0);
    const jobsOk = latest.total_queue === 0 && latest.total_in_progress === 0;
    const workersGone = latest.rows.every((row) => row.active_worker_records === 0 && row.hourly_cost_usd === 0);
    console.log(`${CONTRACT}_RELEASE_VERIFY=${JSON.stringify({ elapsed_seconds: Math.floor((Date.now() - started) / 1000), scaling_zero: scalingOk, jobs_zero: jobsOk, worker_records_zero: workersGone, jobs_in_queue: latest.total_queue, jobs_in_progress: latest.total_in_progress })}`);
    if (scalingOk && jobsOk && workersGone) return latest;
    await sleep(pollMs);
  }
  throw new Error(`${CONTRACT}_RELEASE_TIMEOUT:${JSON.stringify(latest?.rows?.filter((row) => row.workers_max || row.active_worker_records || row.health?.jobs?.in_queue || row.health?.jobs?.in_progress) || [])}`);
}

async function runChild(command, leaseContext, managementKey, queueKey, policy, targetId, ttlMs, maxHourlyUsd) {
  if (!command.length) throw new Error(`${CONTRACT}_COMMAND_REQUIRED_AFTER_DOUBLE_DASH`);
  const child = spawn(command[0], command.slice(1), {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE: "YES",
      AVANTIQO_RUNPOD_SAFE_LEASE_LANE: leaseContext.lane,
      AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID: targetId,
      AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT: new Date(Date.now() + ttlMs).toISOString(),
    },
    stdio: ["inherit", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));

  let exit = null;
  child.on("exit", (code, signal) => { exit = { code, signal }; });
  const started = Date.now();
  let violation = null;

  while (!exit) {
    if (Date.now() - started > ttlMs) {
      violation = new Error(`${CONTRACT}_LEASE_TTL_EXCEEDED:${ttlMs}`);
      child.kill("SIGTERM");
      await sleep(3000);
      if (!exit) child.kill("SIGKILL");
      break;
    }
    try {
      const snapshot = await accountSnapshot(managementKey, queueKey);
      assertLeaseState(snapshot, targetId, maxHourlyUsd);
      const target = snapshot.rows.find((row) => row.id === targetId);
      console.log(`${CONTRACT}_WATCHDOG=${JSON.stringify({ elapsed_seconds: Math.floor((Date.now() - started) / 1000), lane: leaseContext.lane, hourly_cost_usd: target?.hourly_cost_usd ?? null, jobs_in_queue: snapshot.total_queue, jobs_in_progress: snapshot.total_in_progress })}`);
    } catch (error) {
      violation = error;
      child.kill("SIGTERM");
      await sleep(3000);
      if (!exit) child.kill("SIGKILL");
      break;
    }
    await sleep(policy.watchdog_poll_ms);
  }

  while (!exit) await sleep(100);
  if (violation) throw violation;
  if (exit.signal) throw new Error(`${CONTRACT}_CHILD_SIGNAL:${exit.signal}`);
  if (exit.code !== 0) throw new Error(`${CONTRACT}_CHILD_EXIT_${exit.code}`);
  return exit;
}

const args = parseArgs();
if (text(process.env[APPROVAL_ENV]).toUpperCase() !== "YES") {
  throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
}

const policy = JSON.parse(await readFile(POLICY_PATH, "utf8"));
if (policy?.contract !== "AVANTIQO_RUNPOD_SAFE_LEASE_POLICY_V1") throw new Error(`${CONTRACT}_POLICY_INVALID`);
if (policy?.workers_min_one_allowed !== false || policy?.resting_workers_min !== 0 || policy?.resting_workers_max !== 0) {
  throw new Error(`${CONTRACT}_POLICY_ZERO_BASELINE_REQUIRED`);
}
if (!args.lane || !policy?.intelligence_lanes?.[args.lane]) {
  throw new Error(`${CONTRACT}_LANE_REQUIRED:${Object.keys(policy?.intelligence_lanes || {}).join(",")}`);
}

const ttlMs = args.ttlMs ?? finite(policy.default_lease_ttl_ms);
const maxTtlMs = finite(policy.max_lease_ttl_ms);
if (!Number.isFinite(ttlMs) || ttlMs < 60_000 || ttlMs > maxTtlMs) {
  throw new Error(`${CONTRACT}_TTL_INVALID:${ttlMs}:max=${maxTtlMs}`);
}
const maxHourlyUsd = args.maxHourlyUsd ?? finite(policy.default_max_worker_hourly_usd);
if (!Number.isFinite(maxHourlyUsd) || maxHourlyUsd <= 0 || maxHourlyUsd > 10) {
  throw new Error(`${CONTRACT}_HOURLY_LIMIT_INVALID:${maxHourlyUsd}`);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const queueKey = text(process.env.RUNPOD_API_KEY) || managementKey;
const targetName = text(policy.intelligence_lanes[args.lane]);
let acquired = false;
let childSucceeded = false;
let failure = null;
let release = null;

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  phase: "PREFLIGHT",
  lane: args.lane,
  endpoint_name: targetName,
  ttl_ms: ttlMs,
  max_hourly_usd: maxHourlyUsd,
  policy: {
    resting_workers: "0/0",
    lease_workers: "0/1",
    max_concurrent_paid_leases: 1,
    max_jobs_per_lease: 1,
    workers_min_one_allowed: false,
  },
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

try {
  const baseline = await accountSnapshot(managementKey, queueKey);
  assertZeroBaseline(baseline);
  const matches = baseline.endpoints.filter((endpoint) => text(endpoint?.name) === targetName);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_TARGET_RESOLUTION_FAILED:${targetName}:matches=${matches.length}`);
  const targetId = text(matches[0]?.id);
  await patchScaling(targetId, 1, managementKey);
  acquired = true;
  const afterAcquire = await accountSnapshot(managementKey, queueKey);
  assertLeaseState(afterAcquire, targetId, maxHourlyUsd);
  console.log(`${CONTRACT}_ACQUIRED=${JSON.stringify({ lane: args.lane, endpoint_name: targetName, workers_min: 0, workers_max: 1, expires_at: new Date(Date.now() + ttlMs).toISOString() })}`);
  await runChild(args.command, { lane: args.lane }, managementKey, queueKey, policy, targetId, ttlMs, maxHourlyUsd);
  childSucceeded = true;
} catch (error) {
  failure = error;
} finally {
  try {
    const beforeRelease = await accountSnapshot(managementKey, queueKey);
    const parkResults = await parkAll(managementKey);
    const purgeResults = await purgeAllQueues(beforeRelease.endpoints, queueKey);
    const final = await waitForZero(
      managementKey,
      queueKey,
      finite(policy.cleanup_timeout_ms),
      finite(policy.watchdog_poll_ms),
    );
    release = {
      success: true,
      park_results: parkResults,
      purge_results: purgeResults,
      final_workers_min_total: final.rows.reduce((sum, row) => sum + Math.max(0, row.workers_min || 0), 0),
      final_workers_max_total: final.rows.reduce((sum, row) => sum + Math.max(0, row.workers_max || 0), 0),
      final_active_worker_records: final.rows.reduce((sum, row) => sum + row.active_worker_records, 0),
      final_hourly_cost_usd: final.rows.reduce((sum, row) => sum + row.hourly_cost_usd, 0),
      final_jobs_in_queue: final.total_queue,
      final_jobs_in_progress: final.total_in_progress,
    };
  } catch (releaseError) {
    release = { success: false, error: redact(releaseError?.message).slice(0, 2000) };
    if (!failure) failure = releaseError;
  }
}

const success = childSucceeded && release?.success === true && !failure;
console.log(JSON.stringify({
  success,
  contract: CONTRACT,
  lane: args.lane,
  endpoint_name: targetName,
  lease_acquired: acquired,
  child_succeeded: childSucceeded,
  failure: failure ? redact(failure?.message).slice(0, 2000) : null,
  release,
  permanent_rest_state: "ALL_ENDPOINTS_0_0",
  workers_min_one_allowed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=${success ? "PASS" : "FAIL"}`);
if (!success) process.exit(3);
