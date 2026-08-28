#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_MUSIC_ELASTIC_RUNTIME_PROBE_ORCHESTRATOR_V1";
const PROVISION_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_RUNPOD_PROVISION_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const LANE = "music-elastic-audio";
const ENDPOINT_NAME = "avantiqo-music-elastic-audio-v1";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";

const text = (value) => String(value ?? "").trim();
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function approved(name) {
  if (text(process.env[name]).toUpperCase() !== "YES") throw new Error(`${name}=YES_REQUIRED`);
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function runNode(script, args = [], env = {}) {
  const child = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, ...env },
  });
  return child;
}

function printChild(child) {
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
}

function parseJsonOutput(raw, code) {
  const value = String(raw || "").trim();
  const start = value.indexOf("{");
  if (start < 0) throw new Error(`${code}:JSON_OBJECT_REQUIRED`);
  try {
    return JSON.parse(value.slice(start));
  } catch {
    throw new Error(`${code}:JSON_PARSE_FAILED`);
  }
}

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`${CONTRACT}_HTTP_${response.status}`);
  return body || {};
}

function workersMin(endpoint = {}) {
  return finite(endpoint.workersMin ?? endpoint.workers_min, -1);
}

function workersMax(endpoint = {}) {
  return finite(endpoint.workersMax ?? endpoint.workers_max, -1);
}

approved("AVANTIQO_MUSIC_ELASTIC_PROVISION_APPROVED");
approved("AVANTIQO_MUSIC_ELASTIC_RUNTIME_PROBE_SPEND_APPROVED");

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const queueKey = text(process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY) || required("RUNPOD_API_KEY");

console.log("============================================================");
console.log("AVANTIQO MUSIC ELASTIC LIVE RUNTIME PROBE");
console.log("============================================================");
console.log(`AVANTIQO_MUSIC_ELASTIC_ORCHESTRATOR_CONTRACT=${CONTRACT}`);
console.log("AVANTIQO_MUSIC_ELASTIC_AUDIO_RENDER_ALLOWED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_CERTIFICATION_ALLOWED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_SHARED_VOLUME_REQUIRED=false");

const audit = runNode("scripts/music-elastic-audio-runtime-audit.mjs");
printChild(audit);
if (audit.status !== 0) throw new Error(`${CONTRACT}_STATIC_AUDIT_FAILED:${audit.status ?? "UNKNOWN"}`);

const planChild = runNode("scripts/provision-avantiqo-music-elastic-runpod-local.mjs");
printChild(planChild);
if (planChild.status !== 0) throw new Error(`${CONTRACT}_PROVISION_PLAN_FAILED:${planChild.status ?? "UNKNOWN"}`);
const plan = parseJsonOutput(planChild.stdout, `${CONTRACT}_PLAN`);
if (
  plan.success !== true ||
  text(plan.contract) !== PROVISION_CONTRACT ||
  plan.production_certified !== false ||
  plan.runtime_probe_job_submitted !== false ||
  plan.audio_render_performed !== false
) throw new Error(`${CONTRACT}_PROVISION_PLAN_INVALID`);
console.log("AVANTIQO_MUSIC_ELASTIC_PROVISION_PLAN=PASS");

const applyChild = runNode(
  "scripts/provision-avantiqo-music-elastic-runpod-local.mjs",
  ["--apply"],
  { AVANTIQO_MUSIC_ELASTIC_PROVISION_APPROVED: "YES" },
);
printChild(applyChild);
if (applyChild.status !== 0) throw new Error(`${CONTRACT}_PROVISION_APPLY_FAILED:${applyChild.status ?? "UNKNOWN"}`);
const applied = parseJsonOutput(applyChild.stdout, `${CONTRACT}_APPLY`);
const endpoint = applied.endpoint || {};
const endpointId = text(endpoint.id);
if (
  applied.success !== true ||
  text(applied.contract) !== PROVISION_CONTRACT ||
  applied.endpoint_exists !== true ||
  text(endpoint.name) !== ENDPOINT_NAME ||
  !endpointId ||
  workersMin(endpoint) !== 0 ||
  workersMax(endpoint) !== 0 ||
  !Array.isArray(endpoint.network_volume_ids) ||
  endpoint.network_volume_ids.length !== 0 ||
  applied.exact_image_digest_verified !== true ||
  applied.workers_opened !== false ||
  applied.runtime_probe_job_submitted !== false ||
  applied.audio_render_performed !== false ||
  applied.production_certified !== false
) throw new Error(`${CONTRACT}_PROVISION_APPLY_INVALID`);
console.log("AVANTIQO_MUSIC_ELASTIC_PARKED_ENDPOINT=PASS");
console.log(`AVANTIQO_MUSIC_ELASTIC_ENDPOINT_ID=${endpointId}`);
console.log("AVANTIQO_MUSIC_ELASTIC_WORKERS_BEFORE_PROBE=0/0");

const lease = spawnSync(
  process.execPath,
  [
    "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs",
    `--lane=${LANE}`,
    "--ttl-ms=600000",
    "--",
    process.execPath,
    "scripts/probe-avantiqo-music-elastic-safe-lease-local.mjs",
  ],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED: "YES",
      AVANTIQO_RUNPOD_SAFE_LEASE_TARGET_QUEUE_API_KEY: queueKey,
      AVANTIQO_RUNPOD_SAFE_LEASE_INERT_PEER_ISOLATION_LANE: LANE,
      AVANTIQO_RUNPOD_SAFE_LEASE_TARGET_AND_OPEN_HEALTH_LANE: LANE,
      AVANTIQO_MUSIC_ELASTIC_RUNTIME_PROBE_SPEND_APPROVED: "YES",
    },
  },
);
printChild(lease);

const finalEndpoint = await requestJson(
  `${REST_BASE}/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
const finalHealth = await requestJson(
  `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`,
  queueKey,
);
const finalQueue = finite(finalHealth?.jobs?.inQueue ?? finalHealth?.jobs?.in_queue, 0);
const finalProgress = finite(finalHealth?.jobs?.inProgress ?? finalHealth?.jobs?.in_progress, 0);
if (
  text(finalEndpoint.name) !== ENDPOINT_NAME ||
  workersMin(finalEndpoint) !== 0 ||
  workersMax(finalEndpoint) !== 0 ||
  finalQueue !== 0 ||
  finalProgress !== 0
) {
  throw new Error(
    `${CONTRACT}_FINAL_REST_STATE_INVALID:${workersMin(finalEndpoint)}/${workersMax(finalEndpoint)}:${finalQueue}/${finalProgress}`,
  );
}

console.log("AVANTIQO_MUSIC_ELASTIC_FINAL_WORKERS=0/0");
console.log("AVANTIQO_MUSIC_ELASTIC_FINAL_QUEUE=0/0");
console.log("AVANTIQO_MUSIC_ELASTIC_SHARED_VOLUME_MUTATION=false");
console.log("AVANTIQO_MUSIC_ELASTIC_AUDIO_RENDER_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_OUTPUT_UPLOAD_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_CERTIFIED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_HUMAN_LISTENING_REVIEW_REQUIRED=true");
console.log("AVANTIQO_MUSIC_ELASTIC_SECRETS_PRINTED=false");

if (lease.status !== 0) {
  throw new Error(`${CONTRACT}_SAFE_LEASE_PROBE_FAILED:${lease.status ?? "UNKNOWN"}`);
}

console.log("AVANTIQO_MUSIC_ELASTIC_LIVE_RUNTIME_PROBE=PASS");
console.log(`${SAFE_LEASE_CONTRACT}=PASS`);
console.log("AVANTIQO_MUSIC_ELASTIC_NEXT=CONTROLLED_AUDIO_RENDER_CERTIFICATION_WITH_HUMAN_LISTENING_REVIEW");
