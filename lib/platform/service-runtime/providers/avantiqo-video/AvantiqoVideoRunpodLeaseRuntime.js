import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_VIDEO_RUNPOD_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const LANE = "cinema-production";
const ENDPOINT_NAME = "avantiqo-cinema-production-v1";
const ENDPOINT_ENV = "RUNPOD_AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_ID";
const MAX_CONCURRENT_PAID_LEASES = 4;
const MAX_ACCOUNT_HOURLY_USD = 16;
const MAX_WORKER_HOURLY_USD = 10;
const DEFAULT_TTL_SECONDS = 900;
const MAX_TTL_SECONDS = 1800;
const CLEANUP_POLL_MS = 3000;
const CLEANUP_TIMEOUT_MS = 180000;
const TERMINAL_WORKER_STATUSES = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function activeWorkers(endpoint = {}) {
  return list(endpoint.workers).filter((worker) => {
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    if (status && !TERMINAL_WORKER_STATUSES.has(status)) return true;
    if (desired && !TERMINAL_WORKER_STATUSES.has(desired)) return true;
    return !status && !desired;
  });
}

function endpointHourlyCost(endpoint = {}) {
  return activeWorkers(endpoint).reduce(
    (sum, worker) => sum + Math.max(0, finite(worker?.adjustedCostPerHr ?? worker?.costPerHr, 0) || 0),
    0,
  );
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

function managementKey() {
  return required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
}
function queueKey() {
  return required("RUNPOD_AVANTIQO_VIDEO_API_KEY", process.env.RUNPOD_API_KEY || managementKey());
}

async function runpodJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`AVANTIQO_VIDEO_RUNPOD_HTTP_${response.status}`);
  return body ?? {};
}

async function rest(pathname, options = {}) {
  return runpodJson(`${REST_BASE}${pathname}`, managementKey(), options);
}
async function queue(endpointId, pathname, options = {}) {
  return runpodJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, queueKey(), options);
}

async function accountSnapshot() {
  const endpoints = endpointsFrom(await rest("/endpoints?includeTemplate=false&includeWorkers=true"));
  return {
    endpoints,
    rows: endpoints.map((endpoint) => ({
      id: text(endpoint?.id),
      name: text(endpoint?.name),
      workers_min: finite(endpoint?.workersMin, null),
      workers_max: finite(endpoint?.workersMax, null),
      active_workers: activeWorkers(endpoint).length,
      hourly_cost_usd: endpointHourlyCost(endpoint),
    })),
  };
}

async function resolveTarget() {
  const snapshot = await accountSnapshot();
  const configuredId = required(ENDPOINT_ENV);
  const matches = snapshot.endpoints.filter((endpoint) => text(endpoint?.id) === configuredId);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_VIDEO_RUNPOD_LEASE_TARGET_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  const endpoint = matches[0];
  if (text(endpoint?.name) !== ENDPOINT_NAME) {
    throw new Error(`AVANTIQO_VIDEO_RUNPOD_LEASE_TARGET_NAME_MISMATCH:${text(endpoint?.name)}`);
  }
  return { snapshot, endpoint };
}

function assertAccountPolicy(snapshot, targetId) {
  const badMin = snapshot.rows.filter((row) => row.workers_min !== 0);
  if (badMin.length) throw new Error("AVANTIQO_VIDEO_RUNPOD_LEASE_WORKERS_MIN_ZERO_REQUIRED");
  const badMax = snapshot.rows.filter((row) => ![0, 1].includes(row.workers_max));
  if (badMax.length) throw new Error("AVANTIQO_VIDEO_RUNPOD_LEASE_WORKERS_MAX_BOUNDED_REQUIRED");
  const open = snapshot.rows.filter((row) => row.workers_max === 1);
  if (open.length >= MAX_CONCURRENT_PAID_LEASES) {
    throw new Error("AVANTIQO_VIDEO_RUNPOD_LEASE_PARALLEL_LIMIT");
  }
  const accountHourly = snapshot.rows.reduce((sum, row) => sum + row.hourly_cost_usd, 0);
  if (accountHourly > MAX_ACCOUNT_HOURLY_USD) {
    throw new Error("AVANTIQO_VIDEO_RUNPOD_LEASE_ACCOUNT_HOURLY_LIMIT");
  }
  const target = snapshot.rows.find((row) => row.id === targetId);
  if (!target || target.workers_min !== 0 || target.workers_max !== 0) {
    throw new Error("AVANTIQO_VIDEO_RUNPOD_LEASE_TARGET_MUST_START_0_0");
  }
  if (target.hourly_cost_usd > MAX_WORKER_HOURLY_USD) {
    throw new Error("AVANTIQO_VIDEO_RUNPOD_LEASE_WORKER_HOURLY_LIMIT");
  }
}

async function patchScaling(endpointId, workersMax) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, {
    method: "PATCH",
    body: { workersMin: 0, workersMax },
  });
  const verified = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=true`);
  if (finite(verified?.workersMin, -1) !== 0 || finite(verified?.workersMax, -1) !== workersMax) {
    throw new Error(`AVANTIQO_VIDEO_RUNPOD_LEASE_SCALING_VERIFY_FAILED:${workersMax}`);
  }
  return verified;
}

async function acquireDatabaseLease({ organizationId, endpointId, ownerRequestId, ttlSeconds }) {
  const { data, error } = await supabaseAdmin.rpc("acquire_avantiqo_video_runpod_lease_v2", {
    p_organization_id: organizationId,
    p_lane: LANE,
    p_endpoint_id: endpointId,
    p_endpoint_name: ENDPOINT_NAME,
    p_owner_request_id: ownerRequestId,
    p_ttl_seconds: ttlSeconds,
  });
  if (error) throw new Error(`AVANTIQO_VIDEO_RUNPOD_LEASE_ACQUIRE_FAILED:${error.code || "RPC"}`);
  if (!data?.id || data?.contract !== AVANTIQO_VIDEO_RUNPOD_LEASE_CONTRACT || data?.state !== "ACTIVE") {
    throw new Error("AVANTIQO_VIDEO_RUNPOD_LEASE_ACQUIRE_INVALID");
  }
  return data;
}

async function releaseDatabaseLease({ leaseId, ownerRequestId, state, reason }) {
  const { data, error } = await supabaseAdmin.rpc("release_avantiqo_video_runpod_lease_v2", {
    p_lease_id: leaseId,
    p_owner_request_id: ownerRequestId,
    p_state: state,
    p_reason: text(reason) || null,
  });
  if (error) throw new Error(`AVANTIQO_VIDEO_RUNPOD_LEASE_RELEASE_FAILED:${error.code || "RPC"}`);
  return data;
}

export async function validateVideoRunpodDistributedLease({ leaseId, ownerRequestId, endpointId }) {
  if (!leaseId || !ownerRequestId || !endpointId) {
    throw new Error("AVANTIQO_VIDEO_RUNPOD_DISTRIBUTED_LEASE_REQUIRED");
  }
  const { data, error } = await supabaseAdmin
    .from("avantiqo_video_runpod_leases")
    .select("id,contract,lane,endpoint_id,endpoint_name,owner_request_id,state,expires_at")
    .eq("id", leaseId)
    .eq("owner_request_id", ownerRequestId)
    .maybeSingle();
  if (error) throw new Error(`AVANTIQO_VIDEO_RUNPOD_DISTRIBUTED_LEASE_LOOKUP_FAILED:${error.code || "DB"}`);
  if (
    !data || data.contract !== AVANTIQO_VIDEO_RUNPOD_LEASE_CONTRACT || data.lane !== LANE ||
    data.endpoint_id !== endpointId || data.endpoint_name !== ENDPOINT_NAME || data.state !== "ACTIVE" ||
    Date.parse(data.expires_at) - Date.now() < 5000
  ) {
    throw new Error("AVANTIQO_VIDEO_RUNPOD_DISTRIBUTED_LEASE_INVALID");
  }
  return data;
}

export async function acquireVideoRunpodWebLease({
  organizationId,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  ownerRequestId = crypto.randomUUID(),
}) {
  const organization = text(organizationId);
  if (!organization) throw new Error("AVANTIQO_VIDEO_RUNPOD_LEASE_ORGANIZATION_REQUIRED");
  const requestedTtl = Math.max(60, Math.min(MAX_TTL_SECONDS, finite(ttlSeconds, DEFAULT_TTL_SECONDS)));
  const { snapshot, endpoint } = await resolveTarget();
  const endpointId = text(endpoint?.id);
  assertAccountPolicy(snapshot, endpointId);

  const health = healthSummary(await queue(endpointId, "/health"));
  if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0) {
    throw new Error("AVANTIQO_VIDEO_RUNPOD_LEASE_TARGET_QUEUE_NOT_EMPTY");
  }
  if (health.workers.unhealthy !== 0 || health.workers.throttled !== 0) {
    throw new Error("AVANTIQO_VIDEO_RUNPOD_LEASE_TARGET_HEALTH_BLOCKED");
  }

  const lease = await acquireDatabaseLease({
    organizationId: organization,
    endpointId,
    ownerRequestId,
    ttlSeconds: requestedTtl,
  });

  let scalingOpenAttempted = false;
  try {
    const refreshed = await accountSnapshot();
    assertAccountPolicy(refreshed, endpointId);
    scalingOpenAttempted = true;
    await patchScaling(endpointId, 1);
    return {
      contract: AVANTIQO_VIDEO_RUNPOD_LEASE_CONTRACT,
      lease_id: lease.id,
      owner_request_id: ownerRequestId,
      lane: LANE,
      endpoint_id: endpointId,
      endpoint_name: ENDPOINT_NAME,
      expires_at: lease.expires_at,
    };
  } catch (error) {
    if (scalingOpenAttempted) {
      await patchScaling(endpointId, 0).catch(() => null);
    }
    await releaseDatabaseLease({
      leaseId: lease.id,
      ownerRequestId,
      state: "FAILED",
      reason: error?.message || "VIDEO_WEB_LEASE_OPEN_FAILED",
    }).catch(() => null);
    throw error;
  }
}

export async function refreshVideoRunpodWebLease({ leaseId, ownerRequestId, ttlSeconds = DEFAULT_TTL_SECONDS }) {
  const requestedTtl = Math.max(60, Math.min(MAX_TTL_SECONDS, finite(ttlSeconds, DEFAULT_TTL_SECONDS)));
  const { data, error } = await supabaseAdmin.rpc("refresh_avantiqo_video_runpod_lease_v2", {
    p_lease_id: leaseId,
    p_owner_request_id: ownerRequestId,
    p_ttl_seconds: requestedTtl,
  });
  if (error) throw new Error(`AVANTIQO_VIDEO_RUNPOD_LEASE_REFRESH_FAILED:${error.code || "RPC"}`);
  if (!data?.id || data?.state !== "ACTIVE") throw new Error("AVANTIQO_VIDEO_RUNPOD_LEASE_REFRESH_INVALID");
  return data;
}

async function waitForRest(endpointId) {
  const deadline = Date.now() + CLEANUP_TIMEOUT_MS;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=true`);
    const health = healthSummary(await queue(endpointId, "/health"));
    if (
      finite(latest?.workersMin, -1) === 0 && finite(latest?.workersMax, -1) === 0 &&
      activeWorkers(latest).length === 0 && endpointHourlyCost(latest) === 0 &&
      health.jobs.in_queue === 0 && health.jobs.in_progress === 0
    ) {
      return { endpoint: latest, health };
    }
    await new Promise((resolve) => setTimeout(resolve, CLEANUP_POLL_MS));
  }
  throw new Error("AVANTIQO_VIDEO_RUNPOD_LEASE_RELEASE_TIMEOUT");
}

export async function releaseVideoRunpodWebLease({
  leaseId,
  ownerRequestId,
  endpointId,
  providerJobId = null,
  finalState = "RELEASED",
  reason = null,
  cancelExactJob = false,
}) {
  await validateVideoRunpodDistributedLease({ leaseId, ownerRequestId, endpointId });

  if (cancelExactJob && text(providerJobId)) {
    await queue(endpointId, `/cancel/${encodeURIComponent(providerJobId)}`, { method: "POST" }).catch(() => null);
  }

  await patchScaling(endpointId, 0);
  await waitForRest(endpointId);
  return releaseDatabaseLease({
    leaseId,
    ownerRequestId,
    state: finalState,
    reason,
  });
}

export async function listActiveVideoRunpodLeases() {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("avantiqo_video_runpod_leases")
    .select("id,contract,lane,endpoint_id,endpoint_name,state,expires_at")
    .eq("state", "ACTIVE")
    .gt("expires_at", now);
  if (error) throw new Error(`AVANTIQO_VIDEO_RUNPOD_LEASE_LIST_FAILED:${error.code || "DB"}`);
  return list(data).filter((lease) =>
    lease?.contract === AVANTIQO_VIDEO_RUNPOD_LEASE_CONTRACT &&
    lease?.lane === LANE && text(lease?.endpoint_id)
  );
}

export async function reapExpiredVideoRunpodLeases({ limit = 10 } = {}) {
  const now = new Date().toISOString();
  const { data: leases, error } = await supabaseAdmin
    .from("avantiqo_video_runpod_leases")
    .select("id,lane,endpoint_id,owner_request_id,expires_at")
    .eq("state", "ACTIVE")
    .lte("expires_at", now)
    .order("expires_at", { ascending: true })
    .limit(Math.max(1, Math.min(Number(limit) || 10, 25)));
  if (error) throw new Error(`AVANTIQO_VIDEO_RUNPOD_LEASE_REAPER_LOOKUP_FAILED:${error.code || "DB"}`);

  const results = [];
  for (const lease of list(leases)) {
    try {
      await patchScaling(lease.endpoint_id, 0);
      await waitForRest(lease.endpoint_id);
      await releaseDatabaseLease({
        leaseId: lease.id,
        ownerRequestId: lease.owner_request_id,
        state: "EXPIRED",
        reason: "TTL_EXPIRED_REAPED",
      });
      results.push({ lease_id: lease.id, endpoint_id: lease.endpoint_id, released: true });
    } catch (error) {
      results.push({ lease_id: lease.id, endpoint_id: lease.endpoint_id, released: false, error: text(error?.message).slice(0, 180) });
    }
  }
  return results;
}
