import { mkdir, open, readFile, readdir, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  acquireVoiceRunpodDistributedLease,
  isVoiceRunpodLane,
  listActiveVoiceRunpodDistributedLeases,
  releaseVoiceRunpodDistributedLease,
} from "./avantiqo-voice-runpod-distributed-lease.mjs";
import {
  acquireCodeRunpodDistributedLease,
  isCodeRunpodLane,
  listActiveCodeRunpodDistributedLeases,
  releaseCodeRunpodDistributedLease,
} from "./avantiqo-code-runpod-distributed-lease.mjs";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const POLICY_PATH = "config/avantiqo-runpod-safe-lease-policy.json";
const LEASE_DIR = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_DIR) || path.join(os.tmpdir(), "avantiqo-runpod-safe-leases-v2");
const TERMINAL = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function finite(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`RUNPOD_HTTP_${response.status}:${redact(body?.message || body?.error || raw).slice(0, 900)}`);
  return body ?? {};
}
async function rest(pathname, key, options = {}) { return requestJson(`${REST_BASE}${pathname}`, key, options); }
async function queue(endpointId, pathname, key, options = {}) { return requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, key, options); }
function endpointsFrom(body) { return Array.isArray(body) ? body : list(body?.endpoints || body?.data || body?.items || body?.results); }
function healthSummary(body = {}) {
  const jobs = body.jobs || {};
  return { in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0), in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0) };
}
function isActiveWorker(worker = {}) {
  const status = text(worker.status ?? worker.workerStatus ?? worker.runtimeStatus).toUpperCase();
  const desired = text(worker.desiredStatus ?? worker.desired_status).toUpperCase();
  if (status && !TERMINAL.has(status)) return true;
  if (desired && !TERMINAL.has(desired)) return true;
  return !status && !desired;
}
function activeWorkers(endpoint = {}) { return list(endpoint.workers).filter(isActiveWorker); }
function hourlyCost(endpoint = {}) {
  return activeWorkers(endpoint).reduce((sum, worker) => sum + Math.max(0, finite(worker.adjustedCostPerHr ?? worker.costPerHr, 0)), 0);
}
function parseArgs() {
  const split = process.argv.indexOf("--");
  const control = split < 0 ? process.argv.slice(2) : process.argv.slice(2, split);
  const command = split < 0 ? [] : process.argv.slice(split + 1);
  const get = (prefix) => text(control.find((entry) => entry.startsWith(prefix))?.slice(prefix.length));
  return { lane: get("--lane="), ttlMs: finite(get("--ttl-ms="), null), command };
}
async function patch(endpointId, workersMax, key) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, key, { method: "PATCH", body: { workersMin: 0, workersMax } });
  const endpoint = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=true`, key);
  if (finite(endpoint.workersMin, -1) !== 0 || finite(endpoint.workersMax, -1) !== workersMax) {
    throw new Error(`${CONTRACT}_PATCH_VERIFY_FAILED:${text(endpoint.name)}:${finite(endpoint.workersMin)}/${finite(endpoint.workersMax)}`);
  }
  return endpoint;
}
async function snapshot(managementKey, queueKey) {
  const endpoints = endpointsFrom(await rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey));
  const rows = [];
  for (const endpoint of endpoints) {
    const id = text(endpoint.id);
    if (!id) continue;
    let health = null;
    let healthError = null;
    try { health = healthSummary(await queue(id, "/health", queueKey)); } catch (error) { healthError = redact(error.message).slice(0, 250); }
    rows.push({
      id,
      name: text(endpoint.name) || null,
      workers_min: finite(endpoint.workersMin, null),
      workers_max: finite(endpoint.workersMax, null),
      active_workers: activeWorkers(endpoint).length,
      hourly_cost_usd: hourlyCost(endpoint),
      health,
      health_error: healthError,
      jobs: health ? health.in_queue + health.in_progress : null,
    });
  }
  return { endpoints, rows, hourly_cost_usd: rows.reduce((sum, row) => sum + row.hourly_cost_usd, 0) };
}

function leaseFile(endpointId) { return path.join(LEASE_DIR, `lease-${endpointId}.json`); }
async function pruneLeases() {
  await mkdir(LEASE_DIR, { recursive: true });
  const files = (await readdir(LEASE_DIR).catch(() => [])).filter((name) => /^lease-.+\.json$/.test(name));
  for (const name of files) {
    const file = path.join(LEASE_DIR, name);
    let lease = null;
    try { lease = JSON.parse(await readFile(file, "utf8")); } catch {}
    const expires = Date.parse(text(lease?.expires_at));
    const sameHostDead = text(lease?.hostname) === os.hostname() && Number.isInteger(Number(lease?.pid)) && (() => {
      try { process.kill(Number(lease.pid), 0); return false; } catch { return true; }
    })();
    if (!lease || !Number.isFinite(expires) || expires <= Date.now() || sameHostDead) await unlink(file).catch(() => {});
  }
}
async function leases() {
  await pruneLeases();
  const rows = [];
  for (const name of (await readdir(LEASE_DIR)).filter((entry) => /^lease-.+\.json$/.test(entry))) {
    try { rows.push(JSON.parse(await readFile(path.join(LEASE_DIR, name), "utf8"))); } catch {}
  }
  return rows;
}
async function acquireLease(endpointId, endpointName, lane, ttlMs, maxLeases, expiresAt = null) {
  await mkdir(LEASE_DIR, { recursive: true });
  const lockPath = path.join(LEASE_DIR, ".acquire.lock");
  let lock = null;
  const deadline = Date.now() + 10_000;
  while (!lock && Date.now() < deadline) {
    try { lock = await open(lockPath, "wx", 0o600); } catch (error) { if (error.code !== "EEXIST") throw error; await sleep(100); }
  }
  if (!lock) throw new Error(`${CONTRACT}_LEASE_LOCK_TIMEOUT`);
  try {
    const current = await leases();
    if (current.length >= maxLeases) throw new Error(`${CONTRACT}_PARALLEL_LEASE_LIMIT:${current.length}:max=${maxLeases}`);
    if (current.some((lease) => text(lease.endpoint_id) === endpointId)) throw new Error(`${CONTRACT}_ENDPOINT_ALREADY_LEASED:${endpointName}`);
    const lease = { contract: CONTRACT, endpoint_id: endpointId, endpoint_name: endpointName, lane, pid: process.pid, hostname: os.hostname(), acquired_at: new Date().toISOString(), expires_at: text(expiresAt) || new Date(Date.now() + ttlMs).toISOString() };
    const handle = await open(leaseFile(endpointId), "wx", 0o600);
    try { await handle.writeFile(`${JSON.stringify(lease, null, 2)}\n`, "utf8"); } finally { await handle.close(); }
    return lease;
  } finally {
    await lock.close().catch(() => {});
    await unlink(lockPath).catch(() => {});
  }
}
async function releaseLease(endpointId) { await unlink(leaseFile(endpointId)).catch(() => {}); }

async function purge(endpointId, key) {
  try { const result = await queue(endpointId, "/purge-queue", key, { method: "POST" }); return { success: true, removed: finite(result.removed, null) }; }
  catch (error) { return { success: false, error: redact(error.message).slice(0, 300) }; }
}
async function waitForZero(endpointId, managementKey, queueKey, timeoutMs, pollMs) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    latest = (await snapshot(managementKey, queueKey)).rows.find((row) => row.id === endpointId) || null;
    if (latest && latest.workers_min === 0 && latest.workers_max === 0 && latest.jobs === 0 && latest.active_workers === 0 && latest.hourly_cost_usd === 0) return latest;
    await sleep(pollMs);
  }
  throw new Error(`${CONTRACT}_RELEASE_TIMEOUT:${JSON.stringify(latest)}`);
}
async function enforce(snapshotValue, policy, targetId, managementKey) {
  const [currentLeases, distributedVoiceLeases, distributedCodeLeases] = await Promise.all([
    leases(),
    listActiveVoiceRunpodDistributedLeases(),
    listActiveCodeRunpodDistributedLeases(),
  ]);
  const leaseIds = new Set([
    ...currentLeases.map((lease) => text(lease.endpoint_id)),
    ...distributedVoiceLeases.map((lease) => text(lease.endpoint_id)),
    ...distributedCodeLeases.map((lease) => text(lease.endpoint_id)),
  ].filter(Boolean));
  const badMin = snapshotValue.rows.filter((row) => row.workers_min !== 0);
  if (badMin.length) throw new Error(`${CONTRACT}_WORKERS_MIN_ZERO_REQUIRED:${badMin.map((row) => row.name).join(",")}`);
  const badMax = snapshotValue.rows.filter((row) => ![0, 1].includes(row.workers_max));
  if (badMax.length) throw new Error(`${CONTRACT}_WORKERS_MAX_BOUNDED_REQUIRED:${badMax.map((row) => row.name).join(",")}`);
  for (const row of snapshotValue.rows.filter((row) => row.workers_max === 1 && !leaseIds.has(row.id))) {
    if (row.health_error || row.jobs !== 0) throw new Error(`${CONTRACT}_UNLEASED_ACTIVE_ENDPOINT:${row.name}`);
    await patch(row.id, 0, managementKey);
    console.log(`${CONTRACT}_ORPHAN_REAP=${JSON.stringify({ endpoint_name: row.name })}`);
  }
  const refreshed = await snapshot(managementKey, queueKey);
  const open = refreshed.rows.filter((row) => row.workers_max === 1);
  if (open.length > finite(policy.max_concurrent_paid_leases, 1)) throw new Error(`${CONTRACT}_OPEN_ENDPOINT_LIMIT:${open.length}`);
  if (refreshed.hourly_cost_usd > finite(policy.default_max_account_hourly_usd, 4)) throw new Error(`${CONTRACT}_ACCOUNT_HOURLY_LIMIT:${refreshed.hourly_cost_usd}`);
  const target = refreshed.rows.find((row) => row.id === targetId);
  if (!target || target.workers_min !== 0 || target.workers_max !== 1) throw new Error(`${CONTRACT}_TARGET_LEASE_STATE_INVALID`);
  if (target.health_error) throw new Error(`${CONTRACT}_TARGET_HEALTH_UNKNOWN`);
  if (target.jobs > finite(policy.max_jobs_per_lease, 1)) throw new Error(`${CONTRACT}_TARGET_JOB_LIMIT:${target.jobs}`);
  if (target.hourly_cost_usd > finite(policy.default_max_worker_hourly_usd, 4)) throw new Error(`${CONTRACT}_WORKER_HOURLY_LIMIT:${target.hourly_cost_usd}`);
  return { refreshed, currentLeases, distributedVoiceLeases, distributedCodeLeases, target };
}

async function runChild(command, lease, managementKey, queueKey, policy) {
  if (!command.length) throw new Error(`${CONTRACT}_COMMAND_REQUIRED_AFTER_DOUBLE_DASH`);
  const child = spawn(command[0], command.slice(1), {
    cwd: process.cwd(),
    env: { ...process.env, AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE: "YES", AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT: CONTRACT, AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID: lease.endpoint_id, AVANTIQO_RUNPOD_SAFE_LEASE_LANE: lease.lane, AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT: lease.expires_at },
    stdio: "inherit",
  });
  let exit = null;
  child.on("exit", (code, signal) => { exit = { code, signal }; });
  const acquired = Date.parse(lease.acquired_at);
  const expires = Date.parse(lease.expires_at);
  let idleWorkerSince = null;
  while (!exit) {
    if (Date.now() >= expires) { child.kill("SIGTERM"); await sleep(3000); if (!exit) child.kill("SIGKILL"); throw new Error(`${CONTRACT}_TTL_EXCEEDED`); }
    const state = await enforce(await snapshot(managementKey, queueKey), policy, lease.endpoint_id, managementKey);
    if (state.target.jobs === 0 && state.target.active_workers > 0) {
      idleWorkerSince ||= Date.now();
      if (Date.now() - idleWorkerSince > finite(policy.idle_open_endpoint_grace_ms, 90_000)) {
        await patch(lease.endpoint_id, 0, managementKey);
        child.kill("SIGTERM");
        throw new Error(`${CONTRACT}_IDLE_BILLING_WORKER_REAPED`);
      }
    } else {
      idleWorkerSince = null;
    }
    const protectedEndpointIds = new Set([
      ...state.currentLeases.map((entry) => text(entry.endpoint_id)),
      ...state.distributedVoiceLeases.map((entry) => text(entry.endpoint_id)),
      ...state.distributedCodeLeases.map((entry) => text(entry.endpoint_id)),
    ].filter(Boolean));
    console.log(`${CONTRACT}_WATCHDOG=${JSON.stringify({ elapsed_seconds: Math.floor((Date.now() - acquired) / 1000), lane: lease.lane, open_leases: protectedEndpointIds.size, target_jobs: state.target.jobs, target_hourly_cost_usd: state.target.hourly_cost_usd, account_hourly_cost_usd: state.refreshed.hourly_cost_usd })}`);
    await sleep(finite(policy.watchdog_poll_ms, 5000));
  }
  if (exit.signal) throw new Error(`${CONTRACT}_CHILD_SIGNAL:${exit.signal}`);
  if (exit.code !== 0) throw new Error(`${CONTRACT}_CHILD_EXIT_${exit.code}`);
}

const args = parseArgs();
if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED).toUpperCase() !== "YES") throw new Error("AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED=YES_REQUIRED");
const policy = JSON.parse(await readFile(POLICY_PATH, "utf8"));
if (policy.contract !== "AVANTIQO_RUNPOD_SAFE_LEASE_POLICY_V2" || policy.workers_min_one_allowed !== false || policy.parallel_work_allowed !== true) throw new Error(`${CONTRACT}_POLICY_INVALID`);
const laneName = text(policy?.lanes?.[args.lane]);
if (!laneName) throw new Error(`${CONTRACT}_LANE_REQUIRED:${Object.keys(policy?.lanes || {}).join(",")}`);
const ttlMs = args.ttlMs ?? finite(policy.default_lease_ttl_ms, 900_000);
if (ttlMs < 60_000 || ttlMs > finite(policy.max_lease_ttl_ms, 1_800_000)) throw new Error(`${CONTRACT}_TTL_INVALID:${ttlMs}`);
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const queueKey = text(process.env.RUNPOD_API_KEY) || managementKey;
let targetId = null;
let lease = null;
let distributedVoiceLease = null;
let distributedCodeLease = null;
let endpointOpened = false;
let failure = null;
let childSucceeded = false;
let release = null;

try {
  const baseline = await snapshot(managementKey, queueKey);
  const matches = baseline.endpoints.filter((endpoint) => text(endpoint.name) === laneName);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_TARGET_RESOLUTION_FAILED:${laneName}:matches=${matches.length}`);
  targetId = text(matches[0].id);
  const target = baseline.rows.find((row) => row.id === targetId);
  if (!target || target.workers_min !== 0 || target.workers_max !== 0 || target.jobs !== 0 || target.health_error) throw new Error(`${CONTRACT}_TARGET_MUST_START_CLEAN_0_0`);
  if (isVoiceRunpodLane(args.lane)) {
    distributedVoiceLease = await acquireVoiceRunpodDistributedLease({
      lane: args.lane,
      endpointId: targetId,
      endpointName: laneName,
      ttlMs,
    });
  }
  if (isCodeRunpodLane(args.lane)) {
    distributedCodeLease = await acquireCodeRunpodDistributedLease({
      lane: args.lane,
      endpointId: targetId,
      endpointName: laneName,
      ttlMs,
    });
  }
  lease = await acquireLease(
    targetId,
    laneName,
    args.lane,
    ttlMs,
    finite(policy.max_concurrent_paid_leases, 4),
    distributedVoiceLease?.expires_at || distributedCodeLease?.expires_at || null,
  );
  await patch(targetId, 1, managementKey);
  endpointOpened = true;
  await enforce(await snapshot(managementKey, queueKey), policy, targetId, managementKey);
  console.log(`${CONTRACT}_ACQUIRED=${JSON.stringify({ lane: args.lane, endpoint_name: laneName, workers_min: 0, workers_max: 1, expires_at: lease.expires_at, voice_distributed_lease: Boolean(distributedVoiceLease) })}`);
  await runChild(args.command, lease, managementKey, queueKey, policy);
  childSucceeded = true;
} catch (error) {
  failure = error;
} finally {
  if (targetId && endpointOpened) {
    const purgeBefore = await purge(targetId, queueKey);
    try { await patch(targetId, 0, managementKey); } catch (error) { if (!failure) failure = error; }
    const purgeAfter = await purge(targetId, queueKey);
    try {
      const final = await waitForZero(targetId, managementKey, queueKey, finite(policy.cleanup_timeout_ms, 180_000), finite(policy.watchdog_poll_ms, 5000));
      release = { success: true, purge_before: purgeBefore, purge_after: purgeAfter, workers_min: final.workers_min, workers_max: final.workers_max, jobs: final.jobs, active_workers: final.active_workers, hourly_cost_usd: final.hourly_cost_usd };
    } catch (error) {
      release = { success: false, error: redact(error.message).slice(0, 1200) };
      if (!failure) failure = error;
    }
  } else if (targetId) {
    release = { success: true, endpoint_was_not_opened: true };
  }

  if (targetId && lease) {
    await releaseLease(targetId);
  }

  if (distributedCodeLease) {
    try {
      await releaseCodeRunpodDistributedLease({
        ownerRequestId: distributedCodeLease.owner_request_id,
        state: childSucceeded && release?.success === true && !failure ? "RELEASED" : "FAILED",
        reason: failure
          ? redact(failure.message).slice(0, 300)
          : childSucceeded && release?.success === true
            ? "LOCAL_V2_CHILD_COMPLETE"
            : "LOCAL_V2_CLEANUP_INCOMPLETE",
      });
    } catch (error) {
      if (!failure) failure = error;
    }
  }

  if (distributedVoiceLease) {
    try {
      await releaseVoiceRunpodDistributedLease({
        leaseId: distributedVoiceLease.id,
        ownerRequestId: distributedVoiceLease.owner_request_id,
        state: childSucceeded && release?.success === true && !failure ? "RELEASED" : "FAILED",
        reason: failure
          ? redact(failure.message).slice(0, 300)
          : childSucceeded && release?.success === true
            ? "LOCAL_V2_CHILD_COMPLETE"
            : "LOCAL_V2_CLEANUP_INCOMPLETE",
      });
    } catch (error) {
      if (!failure) failure = error;
    }
  }
}

const success = childSucceeded && release?.success === true && !failure;
console.log(JSON.stringify({ success, contract: CONTRACT, lane: args.lane, endpoint_name: laneName, lease_acquired: Boolean(lease), child_succeeded: childSucceeded, failure: failure ? redact(failure.message).slice(0, 1200) : null, release, voice_distributed_lease_required: isVoiceRunpodLane(args.lane), voice_distributed_lease_acquired: Boolean(distributedVoiceLease), code_distributed_lease_required: isCodeRunpodLane(args.lane), code_distributed_lease_acquired: Boolean(distributedCodeLease), permanent_rest_state: "LEASE_ENDPOINT_0_0", parallel_work_allowed: true, workers_min_one_allowed: false, production_deploy_performed: false, secrets_printed: false }, null, 2));
console.log(`${CONTRACT}=${success ? "PASS" : "FAIL"}`);
if (!success) process.exit(3);
