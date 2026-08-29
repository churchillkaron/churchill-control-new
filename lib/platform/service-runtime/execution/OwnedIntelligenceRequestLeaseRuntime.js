import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CONTRACT = "AVANTIQO_INTELLIGENCE_REQUEST_SAFE_LEASE_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const OWNED_PROVIDER = "avantiqo-intelligence";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CLEANUP_TIMEOUT_MS = 180000;
const POLL_MS = 5000;
const DEFAULT_TTL_SECONDS = 900;
const OPEN_PROPAGATION_SETTLE_MS = 5000;

const LANES = Object.freeze({
  fast: {
    leaseLane: "intelligence-fast",
    endpointName: "avantiqo-intelligence-fast-v1",
    endpointEnv: "RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID",
    queueKeyEnv: "RUNPOD_AVANTIQO_INTELLIGENCE_FAST_API_KEY",
  },
  deep: {
    leaseLane: "intelligence-deep",
    endpointName: "avantiqo-intelligence-v1",
    endpointEnv: "RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID",
    queueKeyEnv: "RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY",
  },
});

const CAPABILITY_DEFAULT_LANE = Object.freeze({
  "ai.text.generate": "fast",
  "ai.reasoning.execute": "deep",
});

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeListResponse(value, candidateKeys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...candidateKeys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalized = normalizeListResponse(value[key], candidateKeys, depth + 1);
    if (normalized) return normalized;
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function managementKey() {
  const key = text(process.env.RUNPOD_MANAGEMENT_API_KEY) || text(process.env.RUNPOD_API_KEY);
  if (!key) throw new Error("AVANTIQO_INTELLIGENCE_REQUEST_LEASE_RUNPOD_MANAGEMENT_KEY_REQUIRED");
  return key;
}

function queueKeyCandidates(config) {
  const candidates = [];
  const add = (source, value) => {
    const key = text(value);
    if (!key || candidates.some((candidate) => candidate.key === key)) return;
    candidates.push({ source, key });
  };
  add(config.queueKeyEnv, process.env[config.queueKeyEnv]);
  add("RUNPOD_API_KEY", process.env.RUNPOD_API_KEY);
  add("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_MANAGEMENT_API_KEY);
  if (!candidates.length) {
    throw new Error("AVANTIQO_INTELLIGENCE_REQUEST_LEASE_RUNPOD_QUEUE_KEY_REQUIRED");
  }
  return candidates;
}

function validateEndpointId(value) {
  const endpointId = text(value);
  if (!/^[A-Za-z0-9_-]+$/.test(endpointId)) {
    throw new Error("AVANTIQO_INTELLIGENCE_REQUEST_LEASE_ENDPOINT_INVALID");
  }
  return endpointId;
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
    cache: "no-store",
    signal: AbortSignal.timeout(options.timeoutMs || 30000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = null;
  }
  if (!response.ok) {
    const error = new Error(`AVANTIQO_INTELLIGENCE_REQUEST_LEASE_HTTP_${response.status}`);
    Object.defineProperty(error, "httpStatus", {
      value: Number(response.status),
      enumerable: false,
      configurable: true,
    });
    throw error;
  }
  if (body === null) {
    throw new Error("AVANTIQO_INTELLIGENCE_REQUEST_LEASE_RESPONSE_INVALID");
  }
  return body;
}

async function rest(pathname, options = {}) {
  return requestJson(`${REST_BASE}${pathname}`, managementKey(), options);
}

async function queue(endpointId, pathname, config, options = {}) {
  const candidates = queueKeyCandidates(config);
  let lastAuthError = null;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    try {
      return await requestJson(
        `${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`,
        candidate.key,
        options,
      );
    } catch (error) {
      const status = Number(error?.httpStatus || 0);
      const authFailure = status === 401 || status === 403;
      const anotherCandidate = index < candidates.length - 1;
      if (!authFailure || !anotherCandidate) throw error;
      lastAuthError = error;
    }
  }
  throw lastAuthError || new Error("AVANTIQO_INTELLIGENCE_REQUEST_LEASE_RUNPOD_QUEUE_KEY_REQUIRED");
}

function activeWorkers(endpoint = {}) {
  const terminal = new Set(["STOPPED", "TERMINATED", "EXITED", "FAILED"]);
  return list(endpoint.workers).filter((worker) => {
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    if (status && !terminal.has(status)) return true;
    if (desired && !terminal.has(desired)) return true;
    return !status && !desired;
  });
}

function healthJobs(body = {}) {
  const jobs = body?.jobs || {};
  return {
    inQueue: finite(jobs.inQueue ?? jobs.in_queue, 0),
    inProgress: finite(jobs.inProgress ?? jobs.in_progress, 0),
  };
}

async function discoverEndpoint(config) {
  const explicit = text(process.env[config.endpointEnv]);
  if (explicit) return validateEndpointId(explicit);

  const body = await rest("/endpoints?includeTemplate=false&includeWorkers=false");
  const endpoints = normalizeListResponse(body, ["endpoints", "serverlessEndpoints"]);
  if (!endpoints) throw new Error("AVANTIQO_INTELLIGENCE_REQUEST_LEASE_ENDPOINT_LIST_INVALID");
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === config.endpointName);
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_REQUEST_LEASE_ENDPOINT_RESOLUTION_FAILED:${config.endpointName}:${matches.length}`,
    );
  }
  return validateEndpointId(matches[0]?.id);
}

async function endpointState(endpointId) {
  return rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=true`);
}

function assertEndpointIdentity(endpoint, endpointId, config) {
  if (text(endpoint?.id) !== endpointId || text(endpoint?.name) !== config.endpointName) {
    throw new Error("AVANTIQO_INTELLIGENCE_REQUEST_LEASE_ENDPOINT_IDENTITY_INVALID");
  }
  if (finite(endpoint?.workersMin, -1) !== 0) {
    throw new Error("AVANTIQO_INTELLIGENCE_REQUEST_LEASE_WORKERS_MIN_ZERO_REQUIRED");
  }
}

async function assertResting(endpointId, config) {
  const endpoint = await endpointState(endpointId);
  assertEndpointIdentity(endpoint, endpointId, config);
  if (finite(endpoint?.workersMax, -1) !== 0 || activeWorkers(endpoint).length !== 0) {
    throw new Error("AVANTIQO_INTELLIGENCE_REQUEST_LEASE_REST_STATE_REQUIRED");
  }
  const health = healthJobs(await queue(endpointId, "/health", config));
  if (health.inQueue !== 0 || health.inProgress !== 0) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_REQUEST_LEASE_QUEUE_NOT_EMPTY:${health.inQueue}:${health.inProgress}`,
    );
  }
  return endpoint;
}

async function patchWorkers(endpointId, workersMax, config) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, {
    method: "PATCH",
    body: { workersMin: 0, workersMax },
  });
  const endpoint = await endpointState(endpointId);
  assertEndpointIdentity(endpoint, endpointId, config);
  if (finite(endpoint?.workersMax, -1) !== workersMax) {
    throw new Error("AVANTIQO_INTELLIGENCE_REQUEST_LEASE_PATCH_VERIFY_FAILED");
  }
  if (activeWorkers(endpoint).length > 1) {
    throw new Error("AVANTIQO_INTELLIGENCE_REQUEST_LEASE_WORKER_LIMIT");
  }
  if (workersMax === 1) {
    await sleep(OPEN_PROPAGATION_SETTLE_MS);
  }
  return endpoint;
}

async function acquireDistributed({ organizationId, config, endpointId, ownerRequestId, ttlSeconds }) {
  const { data, error } = await supabaseAdmin.rpc(
    "acquire_avantiqo_intelligence_runpod_lease_v2",
    {
      p_organization_id: organizationId,
      p_lane: config.leaseLane,
      p_endpoint_id: endpointId,
      p_endpoint_name: config.endpointName,
      p_owner_request_id: ownerRequestId,
      p_ttl_seconds: ttlSeconds,
    },
  );
  if (error) throw new Error(`AVANTIQO_INTELLIGENCE_REQUEST_LEASE_DB_ACQUIRE_FAILED:${error.code || "UNKNOWN"}`);
  if (!data || text(data.state) !== "ACTIVE" || text(data.endpoint_id) !== endpointId) {
    throw new Error("AVANTIQO_INTELLIGENCE_REQUEST_LEASE_DB_ACQUIRE_INVALID");
  }
  return data;
}

async function releaseDistributed({ leaseId, ownerRequestId, state, reason }) {
  const { error } = await supabaseAdmin.rpc(
    "release_avantiqo_intelligence_runpod_lease_v2",
    {
      p_lease_id: leaseId,
      p_owner_request_id: ownerRequestId,
      p_state: state,
      p_reason: reason,
    },
  );
  if (error) throw new Error(`AVANTIQO_INTELLIGENCE_REQUEST_LEASE_RELEASE_FAILED:${error.code || "UNKNOWN"}`);
}

async function parkAndVerify(endpointId, config) {
  await patchWorkers(endpointId, 0, config);
  const deadline = Date.now() + CLEANUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const endpoint = await endpointState(endpointId);
    assertEndpointIdentity(endpoint, endpointId, config);
    const health = healthJobs(await queue(endpointId, "/health", config));
    if (
      finite(endpoint?.workersMax, -1) === 0 &&
      activeWorkers(endpoint).length === 0 &&
      health.inQueue === 0 &&
      health.inProgress === 0
    ) {
      return;
    }
    await sleep(POLL_MS);
  }
  throw new Error("AVANTIQO_INTELLIGENCE_REQUEST_LEASE_CLEANUP_TIMEOUT");
}

function normalizeLane(payload = {}, capability = null) {
  const explicit = text(payload?.execution_lane || payload?.executionLane).toLowerCase();
  const capabilityLane = CAPABILITY_DEFAULT_LANE[
    text(capability || payload?.capability).toLowerCase()
  ];
  const lane = explicit || capabilityLane || "deep";
  if (!LANES[lane]) throw new Error(`AVANTIQO_INTELLIGENCE_REQUEST_LEASE_LANE_INVALID:${lane}`);
  return lane;
}

export async function withOwnedIntelligenceRequestLease({
  provider,
  organizationId,
  capability = null,
  payload = {},
  execute,
} = {}) {
  if (provider !== OWNED_PROVIDER) return execute({});
  if (!organizationId) throw new Error("AVANTIQO_INTELLIGENCE_REQUEST_LEASE_ORGANIZATION_REQUIRED");
  if (typeof execute !== "function") throw new Error("AVANTIQO_INTELLIGENCE_REQUEST_LEASE_EXECUTOR_REQUIRED");

  const lane = normalizeLane(payload, capability);
  const config = LANES[lane];
  const endpointId = await discoverEndpoint(config);
  await assertResting(endpointId, config);

  const ownerRequestId = randomUUID();
  const ttlSeconds = Math.max(
    60,
    Math.min(1800, Math.floor(finite(process.env.AVANTIQO_INTELLIGENCE_REQUEST_LEASE_TTL_SECONDS, DEFAULT_TTL_SECONDS))),
  );
  const lease = await acquireDistributed({
    organizationId,
    config,
    endpointId,
    ownerRequestId,
    ttlSeconds,
  });
  const leaseId = text(lease.id);
  let endpointOpened = false;
  let executionError = null;

  try {
    await assertResting(endpointId, config);
    endpointOpened = true;
    await patchWorkers(endpointId, 1, config);

    return await execute({
      intelligence_safe_lease_guard_contract: CONTRACT,
      intelligence_safe_lease_contract: SAFE_LEASE_CONTRACT,
      intelligence_safe_lease_safe_contract: SAFE_LEASE_CONTRACT,
      intelligence_safe_lease_lane: config.leaseLane,
      intelligence_safe_lease_endpoint_id: endpointId,
      intelligence_safe_lease_expires_at: text(lease.expires_at),
      intelligence_safe_lease_id: leaseId,
      intelligence_safe_lease_owner_request_id: ownerRequestId,
    });
  } catch (error) {
    executionError = error;
    throw error;
  } finally {
    let cleanupError = null;
    if (endpointOpened) {
      try {
        await parkAndVerify(endpointId, config);
      } catch (error) {
        cleanupError = error;
      }
    }
    try {
      await releaseDistributed({
        leaseId,
        ownerRequestId,
        state: executionError || cleanupError ? "FAILED" : "RELEASED",
        reason: executionError
          ? "OWNED_INTELLIGENCE_EXECUTION_FAILED"
          : cleanupError
            ? "OWNED_INTELLIGENCE_CLEANUP_FAILED"
            : "OWNED_INTELLIGENCE_REQUEST_COMPLETE",
      });
    } catch (error) {
      cleanupError ||= error;
    }
    if (!executionError && cleanupError) throw cleanupError;
  }
}

export const OwnedIntelligenceRequestLeaseRuntime = Object.freeze({
  contract: CONTRACT,
  safeLeaseContract: SAFE_LEASE_CONTRACT,
  withLease: withOwnedIntelligenceRequestLease,
});
