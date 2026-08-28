#!/usr/bin/env node

import crypto from "node:crypto";

const CONTRACT = "AVANTIQO_VIDEO_PRODUCTION_DURABLE_LEASE_PROOF_V62";
const LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const ENDPOINT_NAME = "avantiqo-cinema-production-v1";
const LANE = "cinema-production";
const SYSTEM_ORGANIZATION_ID = "00000000-0000-0000-0000-000000000000";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CLEANUP_TIMEOUT_MS = 180_000;
const POLL_MS = 2_000;
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
function approved(name) {
  if (text(process.env[name]).toUpperCase() !== "YES") throw new Error(`${name}=YES_REQUIRED`);
}
function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}
function activeWorkers(endpoint = {}) {
  return list(endpoint.workers).filter((worker) => {
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    if (status && !TERMINAL.has(status)) return true;
    if (desired && !TERMINAL.has(desired)) return true;
    return !status && !desired;
  });
}
function hourlyCost(endpoint = {}) {
  return activeWorkers(endpoint).reduce(
    (sum, worker) => sum + Math.max(0, finite(worker?.adjustedCostPerHr ?? worker?.costPerHr, 0) || 0),
    0,
  );
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

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`${options.label || "HTTP"}_${response.status}:${redact(body?.message || body?.error || raw).slice(0, 700)}`);
  }
  return body ?? {};
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const queueKey = text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY || process.env.RUNPOD_API_KEY) || managementKey;
const endpointId = required("RUNPOD_AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_ID");
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const expectedProjectRef = required("AVANTIQO_VIDEO_LEASE_PROOF_EXPECTED_SUPABASE_PROJECT_REF");

function supabaseProjectRef() {
  try {
    const hostname = new URL(supabaseUrl).hostname;
    return text(hostname.split(".")[0]);
  } catch {
    throw new Error(`${CONTRACT}_SUPABASE_URL_INVALID`);
  }
}

function runpodRest(pathname, options = {}) {
  return jsonRequest(`${REST_BASE}${pathname}`, {
    ...options,
    headers: { Authorization: `Bearer ${managementKey}`, ...(options.headers || {}) },
    label: `${CONTRACT}_RUNPOD_REST`,
  });
}
function runpodQueue(pathname, options = {}) {
  return jsonRequest(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    ...options,
    headers: { Authorization: `Bearer ${queueKey}`, ...(options.headers || {}) },
    label: `${CONTRACT}_RUNPOD_QUEUE`,
  });
}
function supabase(pathname, options = {}) {
  return jsonRequest(`${supabaseUrl}${pathname}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: options.prefer || "return=representation",
      ...(options.headers || {}),
    },
    label: `${CONTRACT}_SUPABASE`,
  });
}

async function endpointSnapshot() {
  const [endpoint, healthRaw] = await Promise.all([
    runpodRest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=true`),
    runpodQueue("/health"),
  ]);
  return {
    endpoint,
    health: healthSummary(healthRaw),
    management_active_workers: activeWorkers(endpoint).length,
    management_hourly_cost_usd: hourlyCost(endpoint),
  };
}

function assertCleanRest(label, snapshot) {
  if (
    text(snapshot.endpoint?.name) !== ENDPOINT_NAME ||
    finite(snapshot.endpoint?.workersMin, -1) !== 0 ||
    finite(snapshot.endpoint?.workersMax, -1) !== 0 ||
    snapshot.health.jobs.in_queue !== 0 ||
    snapshot.health.jobs.in_progress !== 0 ||
    snapshot.management_active_workers !== 0 ||
    snapshot.management_hourly_cost_usd !== 0
  ) {
    throw new Error(`${CONTRACT}_${label}_NOT_CLEAN_0_0`);
  }
}

async function patchScaling(workersMax) {
  await runpodRest(`/endpoints/${encodeURIComponent(endpointId)}`, {
    method: "PATCH",
    body: { workersMin: 0, workersMax },
  });
  const endpoint = await runpodRest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=true`);
  if (finite(endpoint?.workersMin, -1) !== 0 || finite(endpoint?.workersMax, -1) !== workersMax) {
    throw new Error(`${CONTRACT}_SCALING_VERIFY_FAILED:${workersMax}`);
  }
  return endpoint;
}

async function waitForRest() {
  const deadline = Date.now() + CLEANUP_TIMEOUT_MS;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await endpointSnapshot();
    if (
      finite(latest.endpoint?.workersMin, -1) === 0 &&
      finite(latest.endpoint?.workersMax, -1) === 0 &&
      latest.health.jobs.in_queue === 0 &&
      latest.health.jobs.in_progress === 0 &&
      latest.management_active_workers === 0 &&
      latest.management_hourly_cost_usd === 0
    ) return latest;
    await sleep(POLL_MS);
  }
  throw new Error(`${CONTRACT}_RESTORE_TIMEOUT:${JSON.stringify({
    workers_min: finite(latest?.endpoint?.workersMin, null),
    workers_max: finite(latest?.endpoint?.workersMax, null),
    jobs: latest?.health?.jobs || null,
    management_active_workers: latest?.management_active_workers ?? null,
    management_hourly_cost_usd: latest?.management_hourly_cost_usd ?? null,
  })}`);
}

approved("AVANTIQO_VIDEO_PRODUCTION_DURABLE_LEASE_V62_APPROVED");

const actualProjectRef = supabaseProjectRef();
if (actualProjectRef !== expectedProjectRef) {
  throw new Error(`${CONTRACT}_SUPABASE_PROJECT_MISMATCH:${actualProjectRef || "UNKNOWN"}`);
}

console.log("============================================================");
console.log("AVANTIQO VIDEO PRODUCTION DURABLE LEASE LIVE PROOF V62");
console.log("============================================================");
console.log(`AVANTIQO_VIDEO_V62_SUPABASE_PROJECT_MATCH=${actualProjectRef === expectedProjectRef}`);
console.log("AVANTIQO_VIDEO_V62_GENERATION_ALLOWED=false");
console.log("AVANTIQO_VIDEO_V62_INFERENCE_ALLOWED=false");
console.log("AVANTIQO_VIDEO_V62_MODEL_DOWNLOAD_ALLOWED=false");
console.log("AVANTIQO_VIDEO_V62_IMAGE_MUTATION_ALLOWED=false");
console.log("AVANTIQO_VIDEO_V62_TRANSIENT_WORKER_SPEND_POSSIBLE=true");

const ownerRequestId = crypto.randomUUID();
let lease = null;
let scalingOpened = false;
let released = false;
let failure = null;
let openSnapshot = null;
let finalSnapshot = null;

try {
  const before = await endpointSnapshot();
  assertCleanRest("BASELINE", before);
  console.log(`AVANTIQO_VIDEO_V62_BASELINE=${JSON.stringify({
    endpoint_name: text(before.endpoint?.name),
    workers_min: finite(before.endpoint?.workersMin, null),
    workers_max: finite(before.endpoint?.workersMax, null),
    jobs: before.health.jobs,
    management_active_workers: before.management_active_workers,
    management_hourly_cost_usd: before.management_hourly_cost_usd,
  })}`);

  const activeBefore = await supabase(
    `/rest/v1/avantiqo_video_runpod_leases?select=id&state=eq.ACTIVE&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,
  );
  if (!Array.isArray(activeBefore) || activeBefore.length !== 0) {
    throw new Error(`${CONTRACT}_ACTIVE_LEASE_ALREADY_PRESENT`);
  }

  lease = await supabase("/rest/v1/rpc/acquire_avantiqo_video_runpod_lease_v2", {
    method: "POST",
    body: {
      p_organization_id: SYSTEM_ORGANIZATION_ID,
      p_lane: LANE,
      p_endpoint_id: endpointId,
      p_endpoint_name: ENDPOINT_NAME,
      p_owner_request_id: ownerRequestId,
      p_ttl_seconds: 300,
    },
  });
  if (
    !lease?.id || lease?.contract !== LEASE_CONTRACT || lease?.state !== "ACTIVE" ||
    text(lease?.endpoint_id) !== endpointId || text(lease?.endpoint_name) !== ENDPOINT_NAME
  ) {
    throw new Error(`${CONTRACT}_LEASE_ACQUIRE_INVALID`);
  }
  console.log("AVANTIQO_VIDEO_V62_DURABLE_LEASE_ACQUIRED=true");

  await patchScaling(1);
  scalingOpened = true;
  openSnapshot = await endpointSnapshot();
  if (
    finite(openSnapshot.endpoint?.workersMin, -1) !== 0 ||
    finite(openSnapshot.endpoint?.workersMax, -1) !== 1 ||
    openSnapshot.health.jobs.in_queue !== 0 ||
    openSnapshot.health.jobs.in_progress !== 0
  ) {
    throw new Error(`${CONTRACT}_LEASED_0_1_VERIFY_FAILED`);
  }
  console.log(`AVANTIQO_VIDEO_V62_LEASED_STATE=${JSON.stringify({
    workers_min: finite(openSnapshot.endpoint?.workersMin, null),
    workers_max: finite(openSnapshot.endpoint?.workersMax, null),
    jobs: openSnapshot.health.jobs,
    management_active_workers: openSnapshot.management_active_workers,
    management_hourly_cost_usd: openSnapshot.management_hourly_cost_usd,
  })}`);

  // Deliberately no /run call. This proof exists only to validate durable lease ownership
  // and the canonical 0/0 -> 0/1 -> 0/0 scaling lifecycle.
  console.log("AVANTIQO_VIDEO_V62_VIDEO_JOB_SUBMITTED=false");

  await patchScaling(0);
  scalingOpened = false;
  finalSnapshot = await waitForRest();

  const release = await supabase("/rest/v1/rpc/release_avantiqo_video_runpod_lease_v2", {
    method: "POST",
    body: {
      p_lease_id: lease.id,
      p_owner_request_id: ownerRequestId,
      p_state: "RELEASED",
      p_reason: "VIDEO_V62_NO_GENERATION_DURABLE_LEASE_PROOF_COMPLETE",
    },
  });
  if (!release?.id || release?.state !== "RELEASED") {
    throw new Error(`${CONTRACT}_LEASE_RELEASE_INVALID`);
  }
  released = true;

  const activeAfter = await supabase(
    `/rest/v1/avantiqo_video_runpod_leases?select=id&state=eq.ACTIVE&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,
  );
  if (!Array.isArray(activeAfter) || activeAfter.length !== 0) {
    throw new Error(`${CONTRACT}_ACTIVE_LEASE_REMAINS`);
  }

  assertCleanRest("FINAL", finalSnapshot);
} catch (error) {
  failure = error;
} finally {
  if (lease?.id && !released) {
    if (scalingOpened) {
      await patchScaling(0).catch(() => null);
      scalingOpened = false;
    }
    await waitForRest().catch(() => null);
    await supabase("/rest/v1/rpc/release_avantiqo_video_runpod_lease_v2", {
      method: "POST",
      body: {
        p_lease_id: lease.id,
        p_owner_request_id: ownerRequestId,
        p_state: "FAILED",
        p_reason: redact(failure?.message || "VIDEO_V62_PROOF_FAILED").slice(0, 300),
      },
    }).catch(() => null);
  }
}

const success = !failure && released && finalSnapshot &&
  finite(finalSnapshot.endpoint?.workersMin, -1) === 0 &&
  finite(finalSnapshot.endpoint?.workersMax, -1) === 0 &&
  finalSnapshot.health.jobs.in_queue === 0 &&
  finalSnapshot.health.jobs.in_progress === 0 &&
  finalSnapshot.management_active_workers === 0 &&
  finalSnapshot.management_hourly_cost_usd === 0;

console.log(JSON.stringify({
  success,
  contract: CONTRACT,
  lease_contract: LEASE_CONTRACT,
  endpoint_name: ENDPOINT_NAME,
  lease_acquired: Boolean(lease?.id),
  lease_released: released,
  runpod_scaling_mutation_performed: Boolean(lease?.id),
  video_job_submitted: false,
  inference_performed: false,
  model_download_performed: false,
  image_endpoint_mutated: false,
  open_state: openSnapshot ? {
    workers_min: finite(openSnapshot.endpoint?.workersMin, null),
    workers_max: finite(openSnapshot.endpoint?.workersMax, null),
    jobs: openSnapshot.health.jobs,
    management_active_workers: openSnapshot.management_active_workers,
    management_hourly_cost_usd: openSnapshot.management_hourly_cost_usd,
  } : null,
  final_state: finalSnapshot ? {
    workers_min: finite(finalSnapshot.endpoint?.workersMin, null),
    workers_max: finite(finalSnapshot.endpoint?.workersMax, null),
    jobs: finalSnapshot.health.jobs,
    management_active_workers: finalSnapshot.management_active_workers,
    management_hourly_cost_usd: finalSnapshot.management_hourly_cost_usd,
  } : null,
  permanent_rest_state: "0/0",
  transient_worker_spend_possible: true,
  failure: failure ? redact(failure.message).slice(0, 900) : null,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=${success ? "PASS" : "FAIL"}`);
console.log("VIDEO_GENERATION_SUBMITTED=false");
console.log("VIDEO_INFERENCE_PERFORMED=false");
console.log("MODEL_DOWNLOAD_PERFORMED=false");
console.log("IMAGE_ENDPOINT_MUTATED=false");

if (!success) process.exit(3);
