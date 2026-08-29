import { readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  listActiveVoiceRunpodDistributedLeases,
} from "./avantiqo-voice-runpod-distributed-lease.mjs";
import {
  listActiveCodeRunpodDistributedLeases,
} from "./avantiqo-code-runpod-distributed-lease.mjs";
import {
  listActiveVideoRunpodDistributedLeases,
} from "./avantiqo-video-runpod-distributed-lease.mjs";
import {
  AVANTIQO_RUNPOD_SAFE_LEASE_PEER_GOVERNANCE,
  classifyAvantiqoRunpodUnleasedPeer,
  readAvantiqoDistributedLeaseRegistryBestEffort,
} from "./lib/avantiqo-runpod-safe-lease-peer-governance.mjs";

const CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_RESILIENT_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const POLICY_PATH = "config/avantiqo-runpod-safe-lease-policy.json";
const BASE_RUNNER = "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs";
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
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
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
  const lane = text(control.find((entry) => entry.startsWith("--lane="))?.slice("--lane=".length));
  return { control, command, lane };
}
function boundedWaitMs() {
  const configured = finite(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_PREOPEN_WAIT_MS, 900_000);
  return Math.max(0, Math.min(configured, 3_600_000));
}
function pollMs() {
  const configured = finite(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_PREOPEN_POLL_MS, 5_000);
  return Math.max(1_000, Math.min(configured, 30_000));
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
    throw new Error(`HTTP_${response.status}:${redact(body?.message || body?.error || raw).slice(0, 500)}`);
  }
  return body ?? {};
}
function endpointsFrom(body) {
  return Array.isArray(body) ? body : list(body?.endpoints || body?.data || body?.items || body?.results);
}
function laneQueueKeyCandidates(lane) {
  const map = {
    code: ["RUNPOD_AVANTIQO_CODE_API_KEY"],
    image: ["RUNPOD_AVANTIQO_IMAGE_API_KEY"],
    cinema: ["RUNPOD_AVANTIQO_VIDEO_API_KEY"],
    audio: ["RUNPOD_AVANTIQO_AUDIO_API_KEY"],
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
function allQueueKeyCandidates(targetLane, managementKey) {
  const candidates = [];
  const add = (source, value) => {
    const key = text(value);
    if (!key || candidates.some((entry) => entry.key === key)) return;
    candidates.push({ source, key });
  };
  for (const envName of laneQueueKeyCandidates(targetLane)) add(envName, process.env[envName]);
  for (const envName of Object.keys(process.env).filter((name) => /^RUNPOD_[A-Z0-9_]*API_KEY$/.test(name)).sort()) {
    add(envName, process.env[envName]);
  }
  add("RUNPOD_API_KEY", process.env.RUNPOD_API_KEY);
  add("RUNPOD_MANAGEMENT_API_KEY", managementKey);
  return candidates;
}
async function healthFor(endpointId, queueKeys) {
  const attempts = [];
  for (const candidate of queueKeys) {
    try {
      const body = await requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, candidate.key, 20_000);
      const jobs = body?.jobs || {};
      return {
        jobs: finite(jobs.inQueue ?? jobs.in_queue, 0) + finite(jobs.inProgress ?? jobs.in_progress, 0),
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
async function localLeaseIds() {
  const ids = new Set();
  for (const name of await readdir(LEASE_DIR).catch(() => [])) {
    if (!/^lease-.+\.json$/.test(name)) continue;
    try {
      const parsed = JSON.parse(await readFile(path.join(LEASE_DIR, name), "utf8"));
      const expiresAt = Date.parse(text(parsed?.expires_at));
      if (
        parsed?.contract === SAFE_LEASE_CONTRACT &&
        text(parsed?.endpoint_id) &&
        Number.isFinite(expiresAt) &&
        expiresAt > Date.now()
      ) ids.add(text(parsed.endpoint_id));
    } catch {}
  }
  return ids;
}
async function distributedLeaseSnapshot(onDegraded) {
  const [voice, code, video] = await Promise.all([
    readAvantiqoDistributedLeaseRegistryBestEffort({
      name: "VOICE",
      reader: listActiveVoiceRunpodDistributedLeases,
      onDegraded,
    }),
    readAvantiqoDistributedLeaseRegistryBestEffort({
      name: "CODE",
      reader: listActiveCodeRunpodDistributedLeases,
      onDegraded,
    }),
    readAvantiqoDistributedLeaseRegistryBestEffort({
      name: "VIDEO",
      reader: listActiveVideoRunpodDistributedLeases,
      onDegraded,
    }),
  ]);
  return { registries: [voice, code, video], leases: [...voice.leases, ...code.leases, ...video.leases] };
}
async function preopenState({ lane, policy, managementKey }) {
  const endpointBody = await requestJson(`${REST_BASE}/endpoints?includeTemplate=false&includeWorkers=true`, managementKey);
  const endpoints = endpointsFrom(endpointBody);
  const targetName = text(policy?.lanes?.[lane]);
  const targets = endpoints.filter((endpoint) => text(endpoint?.name) === targetName);
  if (targets.length !== 1) {
    throw new Error(`${CONTRACT}_TARGET_RESOLUTION_FAILED:${targetName}:matches=${targets.length}`);
  }
  const targetId = text(targets[0]?.id);
  const queueKeys = allQueueKeyCandidates(lane, managementKey);
  const degraded = [];
  const [localIds, distributed] = await Promise.all([
    localLeaseIds(),
    distributedLeaseSnapshot((item) => degraded.push(item)),
  ]);
  const ownedIds = new Set([
    ...localIds,
    ...distributed.leases.map((lease) => text(lease?.endpoint_id)).filter(Boolean),
  ]);
  const blockers = [];
  const preservedOwned = [];
  for (const endpoint of endpoints) {
    const id = text(endpoint?.id);
    if (!id || id === targetId) continue;
    const workersMin = finite(endpoint?.workersMin, 0);
    const workersMax = finite(endpoint?.workersMax, 0);
    const workers = activeWorkers(endpoint);
    const cost = hourlyCost(endpoint);
    if (workersMin === 0 && workersMax === 0 && workers.length === 0 && cost === 0) continue;
    const health = await healthFor(id, queueKeys);
    const row = {
      id,
      name: text(endpoint?.name) || id,
      workers_min: workersMin,
      workers_max: workersMax,
      active_workers: workers.length,
      hourly_cost_usd: cost,
      jobs: health.jobs,
      health_error: health.health_error,
    };
    if (ownedIds.has(id)) {
      preservedOwned.push({ ...row, ownership: "RECOGNIZED_LEASE" });
      continue;
    }
    const classification = classifyAvantiqoRunpodUnleasedPeer({ row, policy, targetId });
    if (classification.action === AVANTIQO_RUNPOD_SAFE_LEASE_PEER_GOVERNANCE.REAP_IDLE_ORPHAN) {
      blockers.push({ ...row, classification, reason: "UNOWNED_IDLE_OPEN_ENDPOINT_MUST_BE_REAPED_BY_BASE_SAFE_LEASE" });
      continue;
    }
    blockers.push({ ...row, classification });
  }
  return {
    target_id: targetId,
    target_name: targetName,
    blockers,
    preserved_owned_peers: preservedOwned,
    degraded_registries: degraded,
  };
}
async function waitForSafeWindow({ lane, policy, managementKey }) {
  const maxWaitMs = boundedWaitMs();
  const startedAt = Date.now();
  let latest = null;
  while (true) {
    latest = await preopenState({ lane, policy, managementKey });
    const activeUnsafe = latest.blockers.filter((entry) =>
      entry.classification?.action === AVANTIQO_RUNPOD_SAFE_LEASE_PEER_GOVERNANCE.PRESERVE_ACTIVE_PEER ||
      entry.classification?.action === AVANTIQO_RUNPOD_SAFE_LEASE_PEER_GOVERNANCE.BLOCK_UNSAFE_PEER
    );
    const onlyIdleOrphans = latest.blockers.length > 0 && activeUnsafe.length === 0;
    if (latest.blockers.length === 0 || onlyIdleOrphans) {
      return {
        ...latest,
        waited_ms: Date.now() - startedAt,
        safe_to_delegate: true,
        idle_orphans_left_for_base_runner: onlyIdleOrphans,
      };
    }
    if (Date.now() - startedAt >= maxWaitMs) {
      throw new Error(
        `${CONTRACT}_SAFE_WINDOW_TIMEOUT:${JSON.stringify(activeUnsafe.map((entry) => ({
          endpoint_name: entry.name,
          classification: entry.classification?.reason || null,
          workers_min: entry.workers_min,
          workers_max: entry.workers_max,
          active_workers: entry.active_workers,
          jobs: entry.jobs,
        })))}`,
      );
    }
    console.log(`${CONTRACT}_WAIT=${JSON.stringify({
      elapsed_seconds: Math.floor((Date.now() - startedAt) / 1000),
      lane,
      target_name: latest.target_name,
      blockers: activeUnsafe.map((entry) => ({
        endpoint_name: entry.name,
        classification: entry.classification?.reason || null,
        active_workers: entry.active_workers,
        jobs: entry.jobs,
      })),
      target_opened: false,
      runpod_mutation_performed: false,
      provider_job_submitted: false,
    })}`);
    await sleep(pollMs());
  }
}
async function runBaseRunner(args) {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [BASE_RUNNER, ...args.control, "--", ...args.command], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", rejectPromise);
    child.on("exit", (code, signal) => {
      if (signal) {
        rejectPromise(new Error(`${CONTRACT}_BASE_RUNNER_SIGNAL:${signal}`));
        return;
      }
      resolvePromise(Number(code || 0));
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
) {
  throw new Error(`${CONTRACT}_POLICY_INVALID`);
}
if (!text(policy?.lanes?.[args.lane])) {
  throw new Error(`${CONTRACT}_UNKNOWN_LANE:${args.lane}`);
}
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");

console.log(`${CONTRACT}_MODE=PREOPEN_OWNERSHIP_SAFE_WAIT_THEN_V2`);
console.log(`${CONTRACT}_TARGET_OPENED_DURING_WAIT=false`);
console.log(`${CONTRACT}_RUNPOD_MUTATION_DURING_WAIT=false`);
console.log(`${CONTRACT}_PROVIDER_JOB_SUBMITTED_DURING_WAIT=false`);

const safeWindow = await waitForSafeWindow({ lane: args.lane, policy, managementKey });
console.log(`${CONTRACT}_SAFE_WINDOW=${JSON.stringify({
  lane: args.lane,
  target_name: safeWindow.target_name,
  waited_ms: safeWindow.waited_ms,
  preserved_owned_peer_count: safeWindow.preserved_owned_peers.length,
  degraded_registry_count: safeWindow.degraded_registries.length,
  idle_orphans_left_for_base_runner: safeWindow.idle_orphans_left_for_base_runner,
  target_opened: false,
  runpod_mutation_performed: false,
})}`);

const exitCode = await runBaseRunner(args);
console.log(JSON.stringify({
  success: exitCode === 0,
  contract: CONTRACT,
  delegated_contract: SAFE_LEASE_CONTRACT,
  lane: args.lane,
  waited_ms: safeWindow.waited_ms,
  preserved_owned_peer_count: safeWindow.preserved_owned_peers.length,
  degraded_registry_count: safeWindow.degraded_registries.length,
  base_runner_exit_code: exitCode,
  target_opened_during_wait: false,
  runpod_mutation_during_wait: false,
  provider_job_submitted_during_wait: false,
  permanent_rest_state_owned_by_base_runner: true,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=${exitCode === 0 ? "PASS" : "FAIL"}`);
if (exitCode !== 0) process.exit(exitCode);
