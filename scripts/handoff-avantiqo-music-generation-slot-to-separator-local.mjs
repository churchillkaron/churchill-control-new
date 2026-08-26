#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_SLOT_HANDOFF_V1";
const GENERATION_NAME = "avantiqo-audio-v1";
const SEPARATOR_NAME = "avantiqo-music-separator-v1";
const POLL_MS = 2000;
const DRAIN_TIMEOUT_MS = Math.max(30_000, Math.min(5 * 60 * 1000, Number(process.env.AVANTIQO_MUSIC_SEPARATOR_SLOT_DRAIN_TIMEOUT_MS || 120_000)));
const STATE_PATH = resolve(process.env.AVANTIQO_MUSIC_SEPARATOR_SLOT_STATE_FILE || "/tmp/avantiqo-music-separator-slot-handoff.json");

const text = (value) => String(value ?? "").trim();
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const list = (value) => Array.isArray(value) ? value : [];
const yes = (value) => text(value).toUpperCase() === "YES";
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function endpointVolumeIds(endpoint = {}) {
  return [...new Set([
    text(endpoint.networkVolumeId),
    ...list(endpoint.networkVolumeIds).map(text),
  ].filter(Boolean))];
}

function healthCounters(body = {}) {
  const jobs = body?.jobs || {};
  const workers = body?.workers || {};
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

function activeWorkers(health = {}) {
  return Object.values(health.workers || {}).reduce((sum, value) => sum + Math.max(0, finite(value)), 0);
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
    const detail = text(body?.detail || body?.message || body?.error || raw).slice(0, 1000);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

async function endpoints(key) {
  const body = await requestJson(`${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`, key);
  if (!Array.isArray(body)) throw new Error("AVANTIQO_MUSIC_SEPARATOR_SLOT_ENDPOINT_LIST_INVALID");
  return body;
}

async function health(endpointId, queueKey) {
  return healthCounters(await requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, queueKey));
}

function exactEndpoint(rows, name) {
  const matches = rows.filter((row) => text(row?.name) === name);
  if (matches.length !== 1) throw new Error(`AVANTIQO_MUSIC_SEPARATOR_SLOT_ENDPOINT_RESOLUTION_FAILED:${name}:matches=${matches.length}`);
  return matches[0];
}

function safeEndpoint(endpoint, endpointHealth) {
  return {
    id: text(endpoint?.id) || null,
    name: text(endpoint?.name) || null,
    workers_min: finite(endpoint?.workersMin, null),
    workers_max: finite(endpoint?.workersMax, null),
    network_volume_ids: endpointVolumeIds(endpoint),
    health: endpointHealth,
  };
}

async function snapshot(managementKey, queueKey) {
  const rows = await endpoints(managementKey);
  const generation = exactEndpoint(rows, GENERATION_NAME);
  const separator = exactEndpoint(rows, SEPARATOR_NAME);
  if (endpointVolumeIds(separator).length) throw new Error("AVANTIQO_MUSIC_SEPARATOR_SLOT_SEPARATOR_NETWORK_VOLUME_FORBIDDEN");
  const [generationHealth, separatorHealth] = await Promise.all([
    health(text(generation.id), queueKey),
    health(text(separator.id), queueKey),
  ]);
  return { generation, separator, generationHealth, separatorHealth };
}

function assertQueuesIdle(state) {
  for (const [label, h] of [["GENERATION", state.generationHealth], ["SEPARATOR", state.separatorHealth]]) {
    if (h.jobs.in_queue !== 0 || h.jobs.in_progress !== 0 || activeWorkers(h) !== 0) {
      throw new Error(`AVANTIQO_MUSIC_SEPARATOR_SLOT_${label}_NOT_IDLE`);
    }
  }
}

async function waitFor(managementKey, queueKey, predicate, code) {
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await snapshot(managementKey, queueKey);
    if (predicate(latest)) return latest;
    await sleep(POLL_MS);
  }
  throw new Error(`${code}:${JSON.stringify({
    generation: safeEndpoint(latest?.generation, latest?.generationHealth),
    separator: safeEndpoint(latest?.separator, latest?.separatorHealth),
  })}`);
}

async function patchEndpoint(endpointId, body, managementKey) {
  await requestJson(`${REST_BASE}/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body,
  });
}

function report(event, payload = {}) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    event,
    provider_job_submitted: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
    ...payload,
  }, null, 2));
}

const action = process.argv.includes("--restore") ? "RESTORE" : process.argv.includes("--acquire") ? "ACQUIRE" : "PLAN";
if (action !== "PLAN" && !yes(process.env.AVANTIQO_MUSIC_SEPARATOR_SLOT_HANDOFF_APPROVED)) {
  throw new Error("AVANTIQO_MUSIC_SEPARATOR_SLOT_HANDOFF_APPROVED=YES_REQUIRED");
}
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const queueKey = text(process.env.RUNPOD_API_KEY || process.env.RUNPOD_MANAGEMENT_API_KEY);
if (!managementKey || !queueKey) throw new Error("AVANTIQO_MUSIC_SEPARATOR_SLOT_RUNPOD_KEYS_REQUIRED");

if (action === "RESTORE") {
  const stateFile = JSON.parse(await readFile(STATE_PATH, "utf8"));
  if (stateFile?.contract !== CONTRACT || stateFile?.acquired !== true) throw new Error("AVANTIQO_MUSIC_SEPARATOR_SLOT_VALID_STATE_REQUIRED");
  let current = await snapshot(managementKey, queueKey);
  if (text(current.generation.id) !== text(stateFile.generation_endpoint_id) || text(current.separator.id) !== text(stateFile.separator_endpoint_id)) {
    throw new Error("AVANTIQO_MUSIC_SEPARATOR_SLOT_ENDPOINT_IDENTITY_CHANGED");
  }
  if (current.separatorHealth.jobs.in_queue !== 0 || current.separatorHealth.jobs.in_progress !== 0) {
    throw new Error("AVANTIQO_MUSIC_SEPARATOR_SLOT_SEPARATOR_JOB_ACTIVE_DURING_RESTORE");
  }
  await patchEndpoint(text(current.separator.id), { workersMin: 0, workersMax: 0 }, managementKey);
  current = await waitFor(
    managementKey,
    queueKey,
    (s) => finite(s.separator.workersMin, -1) === 0 && finite(s.separator.workersMax, -1) === 0 && activeWorkers(s.separatorHealth) === 0 && s.separatorHealth.jobs.in_queue === 0 && s.separatorHealth.jobs.in_progress === 0,
    "AVANTIQO_MUSIC_SEPARATOR_SLOT_SEPARATOR_DRAIN_TIMEOUT",
  );
  if (current.generationHealth.jobs.in_queue !== 0 || current.generationHealth.jobs.in_progress !== 0 || activeWorkers(current.generationHealth) !== 0) {
    throw new Error("AVANTIQO_MUSIC_SEPARATOR_SLOT_GENERATION_BECAME_BUSY_BEFORE_RESTORE");
  }
  await patchEndpoint(text(current.generation.id), {
    workersMin: Number(stateFile.generation_workers_min),
    workersMax: Number(stateFile.generation_workers_max),
  }, managementKey);
  const restored = await waitFor(
    managementKey,
    queueKey,
    (s) => finite(s.generation.workersMin, -1) === Number(stateFile.generation_workers_min) && finite(s.generation.workersMax, -1) === Number(stateFile.generation_workers_max) && finite(s.separator.workersMin, -1) === 0 && finite(s.separator.workersMax, -1) === 0,
    "AVANTIQO_MUSIC_SEPARATOR_SLOT_GENERATION_RESTORE_TIMEOUT",
  );
  await writeFile(STATE_PATH, `${JSON.stringify({ ...stateFile, acquired: false, restored: true, restored_at: new Date().toISOString() }, null, 2)}\n`, "utf8");
  report("RESTORED", {
    state_file: STATE_PATH,
    generation_endpoint: safeEndpoint(restored.generation, restored.generationHealth),
    separator_endpoint: safeEndpoint(restored.separator, restored.separatorHealth),
  });
  process.exit(0);
}

const initial = await snapshot(managementKey, queueKey);
assertQueuesIdle(initial);
const generationMax = finite(initial.generation.workersMax, -1);
const generationMin = finite(initial.generation.workersMin, -1);
const separatorMax = finite(initial.separator.workersMax, -1);
const separatorMin = finite(initial.separator.workersMin, -1);
if (generationMin !== 0 || generationMax < 1) {
  throw new Error(`AVANTIQO_MUSIC_SEPARATOR_SLOT_GENERATION_SCALING_UNSUPPORTED:min=${generationMin}:max=${generationMax}`);
}
if (separatorMin !== 0 || separatorMax !== 0) {
  throw new Error(`AVANTIQO_MUSIC_SEPARATOR_SLOT_SEPARATOR_MUST_BE_PARKED:min=${separatorMin}:max=${separatorMax}`);
}

report("PLAN", {
  action,
  state_file: STATE_PATH,
  generation_endpoint: safeEndpoint(initial.generation, initial.generationHealth),
  separator_endpoint: safeEndpoint(initial.separator, initial.separatorHealth),
  planned_generation_workers_max: generationMax - 1,
  planned_separator_workers_max: 1,
});
if (action === "PLAN") process.exit(0);

const fresh = await snapshot(managementKey, queueKey);
assertQueuesIdle(fresh);
if (
  text(fresh.generation.id) !== text(initial.generation.id) ||
  text(fresh.separator.id) !== text(initial.separator.id) ||
  finite(fresh.generation.workersMin, -1) !== generationMin ||
  finite(fresh.generation.workersMax, -1) !== generationMax ||
  finite(fresh.separator.workersMin, -1) !== 0 ||
  finite(fresh.separator.workersMax, -1) !== 0
) {
  throw new Error("AVANTIQO_MUSIC_SEPARATOR_SLOT_STATE_CHANGED_BEFORE_ACQUIRE");
}

await patchEndpoint(text(fresh.generation.id), { workersMin: 0, workersMax: generationMax - 1 }, managementKey);
const generationReduced = await waitFor(
  managementKey,
  queueKey,
  (s) => finite(s.generation.workersMin, -1) === 0 && finite(s.generation.workersMax, -1) === generationMax - 1 && s.generationHealth.jobs.in_queue === 0 && s.generationHealth.jobs.in_progress === 0 && activeWorkers(s.generationHealth) === 0,
  "AVANTIQO_MUSIC_SEPARATOR_SLOT_GENERATION_DRAIN_TIMEOUT",
);

try {
  await patchEndpoint(text(generationReduced.separator.id), { workersMin: 0, workersMax: 1 }, managementKey);
  const acquired = await waitFor(
    managementKey,
    queueKey,
    (s) => finite(s.generation.workersMax, -1) === generationMax - 1 && finite(s.separator.workersMin, -1) === 0 && finite(s.separator.workersMax, -1) === 1,
    "AVANTIQO_MUSIC_SEPARATOR_SLOT_SEPARATOR_ENABLE_TIMEOUT",
  );
  const stateFile = {
    success: true,
    contract: CONTRACT,
    acquired: true,
    restored: false,
    acquired_at: new Date().toISOString(),
    generation_endpoint_id: text(acquired.generation.id),
    separator_endpoint_id: text(acquired.separator.id),
    generation_workers_min: generationMin,
    generation_workers_max: generationMax,
    borrowed_generation_workers_max: generationMax - 1,
    separator_workers_max: 1,
    provider_job_submitted: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  };
  await writeFile(STATE_PATH, `${JSON.stringify(stateFile, null, 2)}\n`, "utf8");
  report("ACQUIRED", {
    state_file: STATE_PATH,
    generation_endpoint: safeEndpoint(acquired.generation, acquired.generationHealth),
    separator_endpoint: safeEndpoint(acquired.separator, acquired.separatorHealth),
  });
} catch (error) {
  await patchEndpoint(text(generationReduced.generation.id), { workersMin: generationMin, workersMax: generationMax }, managementKey).catch(() => {});
  throw error;
}
