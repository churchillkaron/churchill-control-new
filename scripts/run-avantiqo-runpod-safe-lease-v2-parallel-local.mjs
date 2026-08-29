import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  AVANTIQO_RUNPOD_SAFE_LEASE_PEER_GOVERNANCE,
  classifyAvantiqoRunpodUnleasedPeer,
} from "./lib/avantiqo-runpod-safe-lease-peer-governance.mjs";

const CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_PARALLEL_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const BASE_RUNNER = "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs";
const POLICY_PATH = "config/avantiqo-runpod-safe-lease-policy.json";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const TERMINAL = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
const BASE_FAILURE_PREFIX = `${SAFE_LEASE_CONTRACT}_FAILURE=`;

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
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
function parseArgs() {
  const split = process.argv.indexOf("--");
  const control = split < 0 ? process.argv.slice(2) : process.argv.slice(2, split);
  const command = split < 0 ? [] : process.argv.slice(split + 1);
  const lane = text(control.find((entry) => entry.startsWith("--lane="))?.slice("--lane=".length));
  const ttlMs = finite(
    control.find((entry) => entry.startsWith("--ttl-ms="))?.slice("--ttl-ms=".length),
    null,
  );
  return { control, command, lane, ttlMs };
}
function activeWorkers(endpoint = {}) {
  return list(endpoint?.workers).filter((worker) => {
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    if (status && !TERMINAL.has(status)) return true;
    if (desired && !TERMINAL.has(desired)) return true;
    return !status && !desired;
  });
}
function hourlyCost(endpoint = {}) {
  return activeWorkers(endpoint).reduce(
    (sum, worker) => sum + Math.max(0, finite(worker?.adjustedCostPerHr ?? worker?.costPerHr, 0)),
    0,
  );
}
async function requestJson(url, key, timeoutMs = 30_000) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`${CONTRACT}_HTTP_${response.status}:${redact(body?.message || body?.error || raw).slice(0, 500)}`);
  }
  return body ?? {};
}
function endpointsFrom(body) {
  return Array.isArray(body) ? body : list(body?.endpoints || body?.data || body?.items || body?.results);
}
function queueKeyCandidates(managementKey) {
  const values = [];
  const add = (source, value) => {
    const key = text(value);
    if (!key || values.some((entry) => entry.key === key)) return;
    values.push({ source, key });
  };
  for (const envName of Object.keys(process.env).filter((name) => /^RUNPOD_[A-Z0-9_]*API_KEY$/.test(name)).sort()) {
    add(envName, process.env[envName]);
  }
  add("RUNPOD_API_KEY", process.env.RUNPOD_API_KEY);
  add("RUNPOD_MANAGEMENT_API_KEY", managementKey);
  return values;
}
async function peerHealth(endpointId, keys) {
  const attempts = [];
  for (const candidate of keys) {
    try {
      const body = await requestJson(
        `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`,
        candidate.key,
        20_000,
      );
      const jobs = body?.jobs || {};
      return {
        jobs: finite(jobs?.inQueue ?? jobs?.in_queue, 0) + finite(jobs?.inProgress ?? jobs?.in_progress, 0),
        health_error: null,
        credential_source: candidate.source,
      };
    } catch (error) {
      attempts.push(`${candidate.source}:${redact(error?.message).slice(0, 100)}`);
    }
  }
  return {
    jobs: null,
    health_error: attempts.join("|").slice(0, 900) || "NO_QUEUE_CREDENTIAL",
    credential_source: null,
  };
}
async function inspectPeers({ lane, policy, managementKey }) {
  const endpoints = endpointsFrom(
    await requestJson(`${REST_BASE}/endpoints?includeTemplate=false&includeWorkers=true`, managementKey),
  );
  const targetName = text(policy?.lanes?.[lane]);
  const targets = endpoints.filter((endpoint) => text(endpoint?.name) === targetName);
  if (targets.length !== 1) {
    throw new Error(`${CONTRACT}_TARGET_RESOLUTION_FAILED:${targetName}:matches=${targets.length}`);
  }
  const targetId = text(targets[0]?.id);
  const keys = queueKeyCandidates(managementKey);
  const preserved = [];
  const intentionalIdle = [];
  const idleOrphans = [];
  const unsafe = [];

  for (const endpoint of endpoints) {
    const id = text(endpoint?.id);
    if (!id || id === targetId) continue;
    const workers = activeWorkers(endpoint);
    const rowBase = {
      id,
      name: text(endpoint?.name) || id,
      workers_min: finite(endpoint?.workersMin, 0),
      workers_max: finite(endpoint?.workersMax, 0),
      active_workers: workers.length,
      hourly_cost_usd: hourlyCost(endpoint),
    };
    if (
      rowBase.workers_min === 0 &&
      rowBase.workers_max === 0 &&
      rowBase.active_workers === 0 &&
      rowBase.hourly_cost_usd === 0
    ) continue;

    const health = await peerHealth(id, keys);
    const row = { ...rowBase, jobs: health.jobs, health_error: health.health_error };
    const classification = classifyAvantiqoRunpodUnleasedPeer({ row, policy, targetId });
    const item = { ...row, classification };
    if (classification.action === AVANTIQO_RUNPOD_SAFE_LEASE_PEER_GOVERNANCE.PRESERVE_ACTIVE_PEER) {
      preserved.push(item);
    } else if (classification.action === AVANTIQO_RUNPOD_SAFE_LEASE_PEER_GOVERNANCE.PRESERVE_INTENTIONAL_IDLE_CAPACITY) {
      intentionalIdle.push(item);
    } else if (classification.action === AVANTIQO_RUNPOD_SAFE_LEASE_PEER_GOVERNANCE.REAP_IDLE_ORPHAN) {
      idleOrphans.push(item);
    } else {
      unsafe.push(item);
    }
  }
  return { targetId, targetName, preserved, intentionalIdle, idleOrphans, unsafe };
}
async function createObserverLeaseDirectory(peers, ttlMs) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "avantiqo-safe-lease-parallel-"));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  for (const peer of peers) {
    const sentinel = {
      contract: SAFE_LEASE_CONTRACT,
      endpoint_id: peer.id,
      endpoint_name: peer.name,
      lane: "parallel-peer-observer",
      pid: process.pid,
      hostname: os.hostname(),
      acquired_at: now.toISOString(),
      expires_at: expiresAt,
      observer_only: true,
      ownership_claimed: false,
      mutation_authority: false,
      reason: "BOUNDED_ACTIVE_PARALLEL_PEER_PRESERVATION",
    };
    await writeFile(
      path.join(directory, `lease-${peer.id}.json`),
      `${JSON.stringify(sentinel, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  }
  return directory;
}
function baseEnvironment(args, leaseDirectory) {
  const env = {
    ...process.env,
    AVANTIQO_RUNPOD_SAFE_LEASE_DIR: leaseDirectory,
  };
  if (
    args.lane === "intelligence-fast" &&
    text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_API_KEY)
  ) {
    env.AVANTIQO_RUNPOD_SAFE_LEASE_TARGET_QUEUE_API_KEY =
      text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_API_KEY);
  }
  return env;
}
async function runBase(args, leaseDirectory) {
  return await new Promise((resolvePromise, rejectPromise) => {
    let pending = "";
    let baseFailure = null;
    const child = spawn(
      process.execPath,
      [BASE_RUNNER, ...args.control, "--", ...args.command],
      {
        cwd: process.cwd(),
        env: baseEnvironment(args, leaseDirectory),
        stdio: ["inherit", "pipe", "inherit"],
      },
    );
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      pending = `${pending}${chunk}`.slice(-5000);
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith(BASE_FAILURE_PREFIX)) continue;
        baseFailure = redact(line.slice(BASE_FAILURE_PREFIX.length)).slice(0, 1200) || "UNKNOWN";
      }
    });
    child.on("error", rejectPromise);
    child.on("exit", (code, signal) => {
      if (pending.startsWith(BASE_FAILURE_PREFIX)) {
        baseFailure = redact(pending.slice(BASE_FAILURE_PREFIX.length)).slice(0, 1200) || "UNKNOWN";
      }
      if (signal) return rejectPromise(new Error(`${CONTRACT}_BASE_RUNNER_SIGNAL:${signal}`));
      resolvePromise({ exitCode: Number(code || 0), baseFailure });
    });
  });
}

const args = parseArgs();
if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED=YES_REQUIRED");
}
if (!args.lane) throw new Error(`${CONTRACT}_LANE_REQUIRED`);
if (!args.command.length) throw new Error(`${CONTRACT}_COMMAND_REQUIRED_AFTER_DOUBLE_DASH`);

const policy = JSON.parse(await readFile(POLICY_PATH, "utf8"));
if (
  policy.contract !== "AVANTIQO_RUNPOD_SAFE_LEASE_POLICY_V2" ||
  policy.parallel_work_allowed !== true ||
  policy.workers_min_one_allowed !== false
) throw new Error(`${CONTRACT}_POLICY_INVALID`);
if (!text(policy?.lanes?.[args.lane])) throw new Error(`${CONTRACT}_UNKNOWN_LANE:${args.lane}`);

const ttlMs = args.ttlMs ?? finite(policy.default_lease_ttl_ms, 900_000);
const maxTtl = finite(policy?.lane_max_lease_ttl_ms?.[args.lane], finite(policy.max_lease_ttl_ms, 1_800_000));
if (ttlMs < 60_000 || ttlMs > maxTtl) throw new Error(`${CONTRACT}_TTL_INVALID:${ttlMs}:max=${maxTtl}`);

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const peers = await inspectPeers({ lane: args.lane, policy, managementKey });
if (peers.unsafe.length) {
  throw new Error(`${CONTRACT}_UNSAFE_PARALLEL_PEER:${JSON.stringify(peers.unsafe.map((item) => ({
    endpoint_name: item.name,
    reason: item.classification?.reason || null,
    workers_min: item.workers_min,
    workers_max: item.workers_max,
    active_workers: item.active_workers,
    jobs: item.jobs,
  })))}`);
}

console.log(`${CONTRACT}_MODE=BOUNDED_PEER_OBSERVER_THEN_CANONICAL_V2`);
console.log(`${CONTRACT}_PARALLEL_WORK_ALLOWED=true`);
console.log(`${CONTRACT}_PEER_MUTATION_PERFORMED=false`);
console.log(`${CONTRACT}_PEER_QUEUE_MUTATION_PERFORMED=false`);
console.log(`${CONTRACT}_PEER_OWNERSHIP_CLAIMED=false`);
console.log(`${CONTRACT}_PRESERVED_ACTIVE_PEERS=${JSON.stringify(peers.preserved.map((item) => ({
  endpoint_name: item.name,
  workers_min: item.workers_min,
  workers_max: item.workers_max,
  active_workers: item.active_workers,
  jobs: item.jobs,
  hourly_cost_usd: item.hourly_cost_usd,
  classification: item.classification?.reason || null,
})))}`);
console.log(`${CONTRACT}_PRESERVED_INTENTIONAL_IDLE_PEERS=${JSON.stringify(peers.intentionalIdle.map((item) => ({
  endpoint_name: item.name,
  workers_min: item.workers_min,
  workers_max: item.workers_max,
  jobs: item.jobs,
  classification: item.classification?.reason || null,
})))} `);
console.log(`${CONTRACT}_IDLE_ORPHANS_LEFT_FOR_CANONICAL_V2=${JSON.stringify(peers.idleOrphans.map((item) => item.name))}`);

let observerDirectory = null;
let exitCode = 1;
let baseFailure = null;
try {
  observerDirectory = await createObserverLeaseDirectory(peers.preserved, ttlMs);
  const baseResult = await runBase(args, observerDirectory);
  exitCode = baseResult.exitCode;
  baseFailure = baseResult.baseFailure;
} finally {
  if (observerDirectory) await rm(observerDirectory, { recursive: true, force: true });
}

console.log(JSON.stringify({
  success: exitCode === 0,
  contract: CONTRACT,
  delegated_contract: SAFE_LEASE_CONTRACT,
  lane: args.lane,
  target_name: peers.targetName,
  preserved_active_peer_count: peers.preserved.length,
  preserved_intentional_idle_peer_count: peers.intentionalIdle.length,
  idle_orphan_count: peers.idleOrphans.length,
  unsafe_peer_count: peers.unsafe.length,
  peer_mutation_performed: false,
  peer_queue_mutation_performed: false,
  peer_ownership_claimed: false,
  observer_state_persisted_after_exit: false,
  fast_target_queue_override_used: args.lane === "intelligence-fast" && Boolean(text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_API_KEY)),
  base_runner_exit_code: exitCode,
  base_runner_failure: exitCode === 0 ? null : (baseFailure || "BASE_FAILURE_MARKER_NOT_CAPTURED"),
  canonical_v2_exclusively_owns_scaling: true,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=${exitCode === 0 ? "PASS" : "FAIL"}`);
if (exitCode !== 0) {
  console.log(`${CONTRACT}_DELEGATED_FAILURE=${baseFailure || "BASE_FAILURE_MARKER_NOT_CAPTURED"}`);
  process.exit(exitCode);
}
