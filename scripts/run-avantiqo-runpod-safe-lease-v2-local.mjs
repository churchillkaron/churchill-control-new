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
const READY_GUARD_PATH = path.resolve(
  process.cwd(),
  "scripts/lib/avantiqo-runpod-safe-lease-endpoint-ready-fetch-guard.mjs",
);
const LEASE_DIR = String(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_DIR || "").trim() ||
  path.join(os.tmpdir(), "avantiqo-runpod-safe-leases-v2");
const TERMINAL = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
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
function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}
function nodeOptionsWithReadyGuard() {
  const existing = text(process.env.NODE_OPTIONS);
  const guardOption = `--import=${READY_GUARD_PATH}`;
  if (existing.includes(READY_GUARD_PATH)) return existing;
  return [guardOption, existing].filter(Boolean).join(" ");
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
    throw new Error(
      `RUNPOD_HTTP_${response.status}:${redact(body?.message || body?.error || raw).slice(0, 900)}`,
    );
  }
  return body ?? {};
}
function rest(pathname, key, options = {}) {
  return requestJson(`${REST_BASE}${pathname}`, key, options);
}
function queue(endpointId, pathname, key, options = {}) {
  return requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, key, options);
}
function endpointsFrom(body) {
  return Array.isArray(body) ? body : list(body?.endpoints || body?.data || body?.items || body?.results);
}
function healthSummary(body = {}) {
  const jobs = body.jobs || {};
  return {
    in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
    in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
  };
}
function isActiveWorker(worker = {}) {
  const status = text(worker.status ?? worker.workerStatus ?? worker.runtimeStatus).toUpperCase();
  const desired = text(worker.desiredStatus ?? worker.desired_status).toUpperCase();
  if (status && !TERMINAL.has(status)) return true;
  if (desired && !TERMINAL.has(desired)) return true;
  return !status && !desired;
}
function activeWorkers(endpoint = {}) {
  return list(endpoint.workers).filter(isActiveWorker);
}
function hourlyCost(endpoint = {}) {
  return activeWorkers(endpoint).reduce(
    (sum, worker) => sum + Math.max(0, finite(worker.adjustedCostPerHr ?? worker.costPerHr, 0)),
    0,
  );
}
function parseArgs() {
  const split = process.argv.indexOf("--");
  const control = split < 0 ? process.argv.slice(2) : process.argv.slice(2, split);
  const command = split < 0 ? [] : process.argv.slice(split + 1);
  const get = (prefix) => text(control.find((entry) => entry.startsWith(prefix))?.slice(prefix.length));
  return { lane: get("--lane="), ttlMs: finite(get("--ttl-ms="), null), command };
}
function laneQueueKeyCandidates(lane) {
  const map = {
    code: ["RUNPOD_AVANTIQO_CODE_API_KEY"],
    image: ["RUNPOD_AVANTIQO_IMAGE_API_KEY"],
    cinema: ["RUNPOD_AVANTIQO_VIDEO_API_KEY"],
    audio: ["RUNPOD_AVANTIQO_AUDIO_API_KEY"],
    "music-transform-candidate": ["RUNPOD_AVANTIQO_AUDIO_API_KEY"],
    "music-extend": ["RUNPOD_AVANTIQO_AUDIO_API_KEY"],
    "music-vocal-correction": ["RUNPOD_AVANTIQO_AUDIO_API_KEY"],
    "music-separator": ["RUNPOD_AVANTIQO_AUDIO_API_KEY"],
    "voice-tts": ["RUNPOD_AVANTIQO_VOICE_TTS_API_KEY", "RUNPOD_AVANTIQO_VOICE_API_KEY"],
    "voice-stt": ["RUNPOD_AVANTIQO_VOICE_STT_API_KEY", "RUNPOD_AVANTIQO_VOICE_API_KEY"],
    lipsync: ["RUNPOD_AVANTIQO_LIPSYNC_API_KEY", "RUNPOD_AVANTIQO_VIDEO_API_KEY"],
    "intelligence-deep": ["RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY"],
    "intelligence-fast": ["RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY"],
    "intelligence-trainer": ["RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY"],
    "intelligence-benchmark": ["RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY"],
    "intelligence-candidate": ["RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY"],
    "intelligence-fast-candidate": ["RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY"],
    "intelligence-deep-eager-candidate": ["RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY"],
  };
  return map[text(lane)] || [];
}
function resolveTargetQueueKey(lane, fallbackKey) {
  const explicit = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_TARGET_QUEUE_API_KEY);
  if (explicit) return { key: explicit, source: "EXPLICIT_TARGET_QUEUE_OVERRIDE" };
  for (const envName of laneQueueKeyCandidates(lane)) {
    const value = text(process.env[envName]);
    if (value) return { key: value, source: envName };
  }
  return { key: fallbackKey, source: "RUNPOD_API_KEY_OR_MANAGEMENT_FALLBACK" };
}
function laneWorkerHourlyLimit(policy, lane) {
  return finite(
    policy?.lane_max_worker_hourly_usd?.[lane],
    finite(policy.default_max_worker_hourly_usd, 4),
  );
}

async function patch(endpointId, workersMax, key) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, key, {
    method: "PATCH",
    body: { workersMin: 0, workersMax },
  });
  const endpoint = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=true`,
    key,
  );
  if (finite(endpoint.workersMin, -1) !== 0 || finite(endpoint.workersMax, -1) !== workersMax) {
    throw new Error(
      `${CONTRACT}_PATCH_VERIFY_FAILED:${text(endpoint.name)}:${finite(endpoint.workersMin)}/${finite(endpoint.workersMax)}`,
    );
  }
  return endpoint;
}
function endpointQueueKeyCandidates(endpoint, managementKey, queueKey, targetId = null, targetQueueKey = null) {
  const id = text(endpoint?.id);
  const name = text(endpoint?.name).toLowerCase();
  const candidates = [];
  const add = (source, value) => {
    const key = text(value);
    if (!key || candidates.some((entry) => entry.key === key)) return;
    candidates.push({ source, key });
  };
  if (targetId && id === text(targetId)) add("TARGET_QUEUE_KEY", targetQueueKey);
  if (name === "avantiqo-image-v1" || id === text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID)) {
    add("RUNPOD_AVANTIQO_IMAGE_API_KEY", process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY);
  }
  if (name === "avantiqo-cinema-v1" || id === text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID)) {
    add("RUNPOD_AVANTIQO_VIDEO_API_KEY", process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY);
  }
  for (const envName of Object.keys(process.env).filter((key) => /^RUNPOD_[A-Z0-9_]*API_KEY$/.test(key)).sort()) {
    add(envName, process.env[envName]);
  }
  add("RUNPOD_API_KEY", queueKey);
  add("RUNPOD_MANAGEMENT_API_KEY", managementKey);
  return candidates;
}
async function endpointHealth(endpoint, managementKey, queueKey, targetId = null, targetQueueKey = null) {
  const id = text(endpoint?.id);
  const attempts = [];
  for (const candidate of endpointQueueKeyCandidates(endpoint, managementKey, queueKey, targetId, targetQueueKey)) {
    try {
      return {
        health: healthSummary(await queue(id, "/health", candidate.key)),
        credentialSource: candidate.source,
      };
    } catch (error) {
      attempts.push({ source: candidate.source, error: redact(error.message).slice(0, 180) });
    }
  }
  const sources = attempts.map((entry) => entry.source).join(",") || "NONE";
  throw new Error(`${CONTRACT}_PEER_HEALTH_UNREADABLE:${text(endpoint?.name) || id}:sources=${sources}`);
}
function scopedHealthChecksEnabled() {
  return Boolean(text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_TARGET_AND_OPEN_HEALTH_LANE));
}
function endpointRequiresQueueHealth(endpoint, targetId = null) {
  if (!scopedHealthChecksEnabled()) return true;
  const id = text(endpoint?.id);
  if (targetId && id === text(targetId)) return true;
  const workersMin = finite(endpoint?.workersMin, 0);
  const workersMax = finite(endpoint?.workersMax, 0);
  const active = activeWorkers(endpoint).length;
  const cost = hourlyCost(endpoint);
  return workersMin > 0 || workersMax > 0 || active > 0 || cost > 0;
}
async function snapshot(managementKey, queueKey, targetId = null, targetQueueKey = null) {
  const endpoints = endpointsFrom(await rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey));
  const rows = await Promise.all(endpoints.map(async (endpoint) => {
    const id = text(endpoint.id);
    if (!id) return null;
    const workers = activeWorkers(endpoint);
    const cost = hourlyCost(endpoint);
    const healthRequired = endpointRequiresQueueHealth(endpoint, targetId);
    let health = null;
    let healthError = null;
    let healthCredentialSource = null;
    if (healthRequired) {
      try {
        const result = await endpointHealth(endpoint, managementKey, queueKey, targetId, targetQueueKey);
        health = result.health;
        healthCredentialSource = result.credentialSource;
      } catch (error) {
        healthError = redact(error.message).slice(0, 250);
      }
    }
    return {
      id,
      name: text(endpoint.name) || null,
      workers_min: finite(endpoint.workersMin, null),
      workers_max: finite(endpoint.workersMax, null),
      active_workers: workers.length,
      hourly_cost_usd: cost,
      health,
      health_required: healthRequired,
      health_skipped_dormant_0_0: !healthRequired,
      health_credential_source: healthCredentialSource,
      health_error: healthError,
      jobs: health ? health.in_queue + health.in_progress : (healthRequired ? null : 0),
    };
  }));
  const filtered = rows.filter(Boolean);
  return {
    endpoints,
    rows: filtered,
    hourly_cost_usd: filtered.reduce((sum, row) => sum + row.hourly_cost_usd, 0),
  };
}

function leaseFile(endpointId) {
  return path.join(LEASE_DIR, `lease-${endpointId}.json`);
}
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
    if (!lease || !Number.isFinite(expires) || expires <= Date.now() || sameHostDead) {
      await unlink(file).catch(() => {});
    }
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
    try { lock = await open(lockPath, "wx", 0o600); }
    catch (error) {
      if (error.code !== "EEXIST") throw error;
      await sleep(100);
    }
  }
  if (!lock) throw new Error(`${CONTRACT}_LEASE_LOCK_TIMEOUT`);
  try {
    const current = await leases();
    if (current.length >= maxLeases) {
      throw new Error(`${CONTRACT}_PARALLEL_LEASE_LIMIT:${current.length}:max=${maxLeases}`);
    }
    if (current.some((lease) => text(lease.endpoint_id) === endpointId)) {
      throw new Error(`${CONTRACT}_ENDPOINT_ALREADY_LEASED:${endpointName}`);
    }
    const lease = {
      contract: CONTRACT,
      endpoint_id: endpointId,
      endpoint_name: endpointName,
      lane,
      pid: process.pid,
      hostname: os.hostname(),
      acquired_at: new Date().toISOString(),
      expires_at: text(expiresAt) || new Date(Date.now() + ttlMs).toISOString(),
    };
    const handle = await open(leaseFile(endpointId), "wx", 0o600);
    try { await handle.writeFile(`${JSON.stringify(lease, null, 2)}\n`, "utf8"); }
    finally { await handle.close(); }
    return lease;
  } finally {
    await lock.close().catch(() => {});
    await unlink(lockPath).catch(() => {});
  }
}
async function releaseLease(endpointId) {
  await unlink(leaseFile(endpointId)).catch(() => {});
}
async function purge(endpointId, key) {
  try {
    const result = await queue(endpointId, "/purge-queue", key, { method: "POST" });
    return { success: true, removed: finite(result.removed, null) };
  } catch (error) {
    return { success: false, error: redact(error.message).slice(0, 300) };
  }
}
async function waitForZero(endpointId, managementKey, queueKey, targetQueueKey, timeoutMs, pollMs) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    latest = (await snapshot(managementKey, queueKey, endpointId, targetQueueKey)).rows
      .find((row) => row.id === endpointId) || null;
    if (
      latest && latest.workers_min === 0 && latest.workers_max === 0 && latest.jobs === 0 &&
      latest.active_workers === 0 && latest.hourly_cost_usd === 0
    ) return latest;
    await sleep(pollMs);
  }
  throw new Error(`${CONTRACT}_RELEASE_TIMEOUT:${JSON.stringify(latest)}`);
}
function codeLaneAllowsInertUnboundedPeer(row, targetId, lane) {
  return (
    text(lane) === "code" && text(row?.id) !== text(targetId) && row?.workers_min === 0 &&
    finite(row?.workers_max, null) > 1 && row?.active_workers === 0 && row?.jobs === 0 &&
    row?.hourly_cost_usd === 0 && !row?.health_error
  );
}
function scopedLaneAllowsInertUnboundedPeer(row, targetId, lane) {
  const scopedLane = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_INERT_PEER_ISOLATION_LANE);
  return (
    Boolean(scopedLane) && text(lane) === scopedLane && text(row?.id) !== text(targetId) &&
    row?.workers_min === 0 && finite(row?.workers_max, null) >= 1 && row?.active_workers === 0 &&
    row?.jobs === 0 && row?.hourly_cost_usd === 0 && !row?.health_error
  );
}

async function enforce(snapshotValue, policy, targetId, managementKey, lane, targetQueueKey) {
  const [currentLeases, distributedVoiceLeases, distributedCodeLeases] = await Promise.all([
    leases(),
    listActiveVoiceRunpodDistributedLeases(),
    listActiveCodeRunpodDistributedLeases(),
  ]);
  const leaseIds = new Set(unique([
    ...currentLeases.map((lease) => lease.endpoint_id),
    ...distributedVoiceLeases.map((lease) => lease.endpoint_id),
    ...distributedCodeLeases.map((lease) => lease.endpoint_id),
  ]));
  const badMin = snapshotValue.rows.filter((row) => row.workers_min !== 0);
  if (badMin.length) {
    throw new Error(`${CONTRACT}_WORKERS_MIN_ZERO_REQUIRED:${badMin.map((row) => row.name).join(",")}`);
  }
  const badMax = snapshotValue.rows.filter((row) =>
    ![0, 1].includes(row.workers_max) &&
    !codeLaneAllowsInertUnboundedPeer(row, targetId, lane) &&
    !scopedLaneAllowsInertUnboundedPeer(row, targetId, lane)
  );
  if (badMax.length) {
    throw new Error(`${CONTRACT}_WORKERS_MAX_BOUNDED_REQUIRED:${badMax.map((row) => row.name).join(",")}`);
  }
  for (const row of snapshotValue.rows.filter((row) => row.workers_max === 1 && !leaseIds.has(row.id))) {
    if (scopedLaneAllowsInertUnboundedPeer(row, targetId, lane)) {
      console.log(`${CONTRACT}_INERT_PEER_PRESERVED=${JSON.stringify({
        endpoint_name: row.name,
        workers_min: row.workers_min,
        workers_max: row.workers_max,
        active_workers: row.active_workers,
        jobs: row.jobs,
        hourly_cost_usd: row.hourly_cost_usd,
      })}`);
      continue;
    }
    if (row.health_error || row.jobs !== 0) {
      throw new Error(`${CONTRACT}_UNLEASED_ACTIVE_ENDPOINT:${row.name}`);
    }
    await patch(row.id, 0, managementKey);
    console.log(`${CONTRACT}_ORPHAN_REAP=${JSON.stringify({ endpoint_name: row.name })}`);
  }

  const refreshed = await snapshot(managementKey, targetQueueKey, targetId, targetQueueKey);
  const open = refreshed.rows.filter((row) =>
    row.workers_max === 1 &&
    (leaseIds.has(row.id) || !scopedLaneAllowsInertUnboundedPeer(row, targetId, lane))
  );
  if (open.length > finite(policy.max_concurrent_paid_leases, 1)) {
    throw new Error(`${CONTRACT}_OPEN_ENDPOINT_LIMIT:${open.length}`);
  }
  if (refreshed.hourly_cost_usd > finite(policy.default_max_account_hourly_usd, 4)) {
    throw new Error(`${CONTRACT}_ACCOUNT_HOURLY_LIMIT:${refreshed.hourly_cost_usd}`);
  }
  const target = refreshed.rows.find((row) => row.id === targetId);
  if (!target || target.workers_min !== 0 || target.workers_max !== 1) {
    throw new Error(`${CONTRACT}_TARGET_LEASE_STATE_INVALID`);
  }
  if (target.health_error) throw new Error(`${CONTRACT}_TARGET_HEALTH_UNKNOWN`);
  if (target.jobs > finite(policy.max_jobs_per_lease, 1)) {
    throw new Error(`${CONTRACT}_TARGET_JOB_LIMIT:${target.jobs}`);
  }
  const workerLimit = laneWorkerHourlyLimit(policy, lane);
  if (target.hourly_cost_usd > workerLimit) {
    throw new Error(`${CONTRACT}_WORKER_HOURLY_LIMIT:${target.hourly_cost_usd}:limit=${workerLimit}:lane=${lane}`);
  }
  return { refreshed, currentLeases, distributedVoiceLeases, distributedCodeLeases, target };
}

async function runChild(command, lease, managementKey, queueKey, targetQueueKey, policy) {
  if (!command.length) throw new Error(`${CONTRACT}_COMMAND_REQUIRED_AFTER_DOUBLE_DASH`);
  const child = spawn(command[0], command.slice(1), {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptionsWithReadyGuard(),
      AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE: "YES",
      AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT: CONTRACT,
      AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID: lease.endpoint_id,
      AVANTIQO_RUNPOD_SAFE_LEASE_LANE: lease.lane,
      AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT: lease.expires_at,
    },
    stdio: "inherit",
  });
  let exit = null;
  child.on("exit", (code, signal) => { exit = { code, signal }; });
  const acquired = Date.parse(lease.acquired_at);
  const expires = Date.parse(lease.expires_at);
  let idleWorkerSince = null;
  while (!exit) {
    if (Date.now() >= expires) {
      child.kill("SIGTERM");
      await sleep(3000);
      if (!exit) child.kill("SIGKILL");
      throw new Error(`${CONTRACT}_TTL_EXCEEDED`);
    }
    const state = await enforce(
      await snapshot(managementKey, queueKey, lease.endpoint_id, targetQueueKey),
      policy,
      lease.endpoint_id,
      managementKey,
      lease.lane,
      targetQueueKey,
    );
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
    const protectedEndpointIds = new Set(unique([
      ...state.currentLeases.map((entry) => entry.endpoint_id),
      ...state.distributedVoiceLeases.map((entry) => entry.endpoint_id),
      ...state.distributedCodeLeases.map((entry) => entry.endpoint_id),
    ]));
    console.log(`${CONTRACT}_WATCHDOG=${JSON.stringify({
      elapsed_seconds: Math.floor((Date.now() - acquired) / 1000),
      lane: lease.lane,
      open_leases: protectedEndpointIds.size,
      target_jobs: state.target.jobs,
      target_hourly_cost_usd: state.target.hourly_cost_usd,
      target_hourly_cost_limit_usd: laneWorkerHourlyLimit(policy, lease.lane),
      account_hourly_cost_usd: state.refreshed.hourly_cost_usd,
    })}`);
    await sleep(finite(policy.watchdog_poll_ms, 5000));
  }
  if (exit.signal) throw new Error(`${CONTRACT}_CHILD_SIGNAL:${exit.signal}`);
  if (exit.code !== 0) throw new Error(`${CONTRACT}_CHILD_EXIT_${exit.code}`);
}

const args = parseArgs();
if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED=YES_REQUIRED");
}
const policy = JSON.parse(await readFile(POLICY_PATH, "utf8"));
if (
  policy.contract !== "AVANTIQO_RUNPOD_SAFE_LEASE_POLICY_V2" ||
  policy.workers_min_one_allowed !== false ||
  policy.parallel_work_allowed !== true
) throw new Error(`${CONTRACT}_POLICY_INVALID`);

const laneName = text(policy?.lanes?.[args.lane]);
if (!laneName) {
  throw new Error(`${CONTRACT}_LANE_REQUIRED:${Object.keys(policy?.lanes || {}).join(",")}`);
}
const ttlMs = args.ttlMs ?? finite(policy.default_lease_ttl_ms, 900_000);
const maxLeaseTtlMs = finite(
  policy?.lane_max_lease_ttl_ms?.[args.lane],
  finite(policy.max_lease_ttl_ms, 1_800_000),
);
if (ttlMs < 60_000 || ttlMs > maxLeaseTtlMs) {
  throw new Error(`${CONTRACT}_TTL_INVALID:${ttlMs}:max=${maxLeaseTtlMs}`);
}
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const queueKey = text(process.env.RUNPOD_API_KEY) || managementKey;
const targetQueue = resolveTargetQueueKey(args.lane, queueKey);
const targetQueueKey = targetQueue.key;
const scopedInertPeerIsolationLane = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_INERT_PEER_ISOLATION_LANE);
const scopedTargetAndOpenHealthLane = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_TARGET_AND_OPEN_HEALTH_LANE);
if (scopedInertPeerIsolationLane && scopedInertPeerIsolationLane !== args.lane) {
  throw new Error(`${CONTRACT}_INERT_PEER_ISOLATION_LANE_MISMATCH:${scopedInertPeerIsolationLane}:${args.lane}`);
}
if (scopedTargetAndOpenHealthLane && scopedTargetAndOpenHealthLane !== args.lane) {
  throw new Error(`${CONTRACT}_TARGET_AND_OPEN_HEALTH_LANE_MISMATCH:${scopedTargetAndOpenHealthLane}:${args.lane}`);
}

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
  if (matches.length !== 1) {
    throw new Error(`${CONTRACT}_TARGET_RESOLUTION_FAILED:${laneName}:matches=${matches.length}`);
  }
  targetId = text(matches[0].id);
  const targetBaseline = await snapshot(managementKey, queueKey, targetId, targetQueueKey);
  const target = targetBaseline.rows.find((row) => row.id === targetId);
  if (
    !target || target.workers_min !== 0 || target.workers_max !== 0 || target.jobs !== 0 || target.health_error
  ) throw new Error(`${CONTRACT}_TARGET_MUST_START_CLEAN_0_0`);

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
  await enforce(
    await snapshot(managementKey, queueKey, targetId, targetQueueKey),
    policy,
    targetId,
    managementKey,
    args.lane,
    targetQueueKey,
  );
  console.log(`${CONTRACT}_ACQUIRED=${JSON.stringify({
    lane: args.lane,
    endpoint_name: laneName,
    workers_min: 0,
    workers_max: 1,
    expires_at: lease.expires_at,
    voice_distributed_lease: Boolean(distributedVoiceLease),
    code_distributed_lease: Boolean(distributedCodeLease),
    target_queue_key_source: targetQueue.source,
    target_queue_key_override: targetQueueKey !== queueKey,
    endpoint_ready_guard: true,
    lane_worker_hourly_limit_usd: laneWorkerHourlyLimit(policy, args.lane),
    scoped_inert_peer_isolation: scopedInertPeerIsolationLane === args.lane,
    scoped_target_and_open_health: scopedTargetAndOpenHealthLane === args.lane,
  })}`);
  await runChild(args.command, lease, managementKey, queueKey, targetQueueKey, policy);
  childSucceeded = true;
} catch (error) {
  failure = error;
} finally {
  if (targetId && endpointOpened) {
    const purgeBefore = await purge(targetId, targetQueueKey);
    try { await patch(targetId, 0, managementKey); }
    catch (error) { if (!failure) failure = error; }
    const purgeAfter = await purge(targetId, targetQueueKey);
    try {
      const final = await waitForZero(
        targetId,
        managementKey,
        queueKey,
        targetQueueKey,
        finite(policy.cleanup_timeout_ms, 180_000),
        finite(policy.watchdog_poll_ms, 5000),
      );
      release = {
        success: true,
        purge_before: purgeBefore,
        purge_after: purgeAfter,
        workers_min: final.workers_min,
        workers_max: final.workers_max,
        jobs: final.jobs,
        active_workers: final.active_workers,
        hourly_cost_usd: final.hourly_cost_usd,
      };
    } catch (error) {
      release = { success: false, error: redact(error.message).slice(0, 1200) };
      if (!failure) failure = error;
    }
  } else if (targetId) {
    release = { success: true, endpoint_was_not_opened: true };
  }

  if (targetId && lease) await releaseLease(targetId);

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
console.log(JSON.stringify({
  success,
  contract: CONTRACT,
  lane: args.lane,
  endpoint_name: laneName,
  lease_acquired: Boolean(lease),
  child_succeeded: childSucceeded,
  failure: failure ? redact(failure.message).slice(0, 1200) : null,
  release,
  voice_distributed_lease_required: isVoiceRunpodLane(args.lane),
  voice_distributed_lease_acquired: Boolean(distributedVoiceLease),
  code_distributed_lease_required: isCodeRunpodLane(args.lane),
  code_distributed_lease_acquired: Boolean(distributedCodeLease),
  target_queue_key_source: targetQueue.source,
  target_queue_key_override: targetQueueKey !== queueKey,
  endpoint_ready_guard: true,
  lane_worker_hourly_limit_usd: laneWorkerHourlyLimit(policy, args.lane),
  scoped_inert_peer_isolation_lane: scopedInertPeerIsolationLane || null,
  scoped_target_and_open_health_lane: scopedTargetAndOpenHealthLane || null,
  permanent_rest_state: "LEASE_ENDPOINT_0_0",
  parallel_work_allowed: true,
  workers_min_one_allowed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=${success ? "PASS" : "FAIL"}`);
if (!success) {
  console.log(`${CONTRACT}_FAILURE=${redact(failure?.message || release?.error || "UNKNOWN").slice(0, 1200)}`);
  process.exit(3);
}
