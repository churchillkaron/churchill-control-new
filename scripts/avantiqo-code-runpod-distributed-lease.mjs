import crypto from "node:crypto";

const CODE_LANES = new Set(["code"]);
const CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const DISTRIBUTED_CONTRACT = "AVANTIQO_CODE_DISTRIBUTED_RUNPOD_LEASE_V1";
const CERTIFICATION_ORGANIZATION_ID = "916fd3e7-b00b-4dd6-aaf3-bd01dd588e94";
const SERVICE_ID = "ai.code.debug";
const PROVIDER_ID = "avantiqo-code";
const METADATA_KEY = "runpod_safe_lease_v2";
const MAX_CAS_ATTEMPTS = 4;
const MAX_CODE_DISTRIBUTED_LEASE_TTL_MS = 3_600_000;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function supabaseBaseUrl() {
  return required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
}

function supabaseServiceRoleKey() {
  return required("SUPABASE_SERVICE_ROLE_KEY");
}

function leaseOrganizationId() {
  return text(
    process.env.AVANTIQO_CODE_DISTRIBUTED_LEASE_ORGANIZATION_ID ||
    process.env.AVANTIQO_CODE_PLANNER_CERT_ORGANIZATION_ID ||
    CERTIFICATION_ORGANIZATION_ID,
  );
}

async function supabaseRequest(pathname, options = {}) {
  const key = supabaseServiceRoleKey();
  const response = await fetch(`${supabaseBaseUrl()}${pathname}`, {
    method: options.method || "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.prefer ? { Prefer: options.prefer } : {}),
      "Cache-Control": "no-store",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });

  const raw = await response.text();
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const detail = text(parsed?.message || parsed?.details || parsed?.hint || parsed?.code || raw)
      .replace(/\s+/g, " ")
      .slice(0, 500);
    const error = new Error(
      `AVANTIQO_CODE_DISTRIBUTED_LEASE_REQUEST_FAILED:${response.status}:${detail || "UNKNOWN"}`,
    );
    error.httpStatus = response.status;
    error.detail = detail || null;
    throw error;
  }

  return parsed;
}

function activeLeaseFromMetadata(metadata, nowMs = Date.now()) {
  const lease = object(object(metadata)[METADATA_KEY]);
  const expiresAt = Date.parse(text(lease.expires_at));
  if (
    lease.distributed_contract !== DISTRIBUTED_CONTRACT ||
    lease.contract !== CONTRACT ||
    lease.state !== "ACTIVE" ||
    !isCodeRunpodLane(lease.lane) ||
    !text(lease.endpoint_id) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= nowMs
  ) {
    return null;
  }
  return lease;
}

async function readControlRow() {
  const organizationId = leaseOrganizationId();
  const rows = await supabaseRequest(
    `/rest/v1/organization_services?select=id,organization_id,service_id,managed_by,default_provider_id,usage_enabled,billing_enabled,metadata,updated_at&organization_id=eq.${encodeURIComponent(organizationId)}&service_id=eq.${encodeURIComponent(SERVICE_ID)}&limit=2`,
  );
  if (!Array.isArray(rows)) {
    throw new Error("AVANTIQO_CODE_DISTRIBUTED_LEASE_CONTROL_ROW_LIST_INVALID");
  }
  if (rows.length > 1) {
    throw new Error("AVANTIQO_CODE_DISTRIBUTED_LEASE_CONTROL_ROW_AMBIGUOUS");
  }
  const row = rows[0] || null;
  if (!row) return null;
  if (text(row.managed_by) !== "AVANTIQO_CERTIFICATION") {
    throw new Error("AVANTIQO_CODE_DISTRIBUTED_LEASE_CONTROL_ROW_SCOPE_UNSAFE");
  }
  if (text(row.default_provider_id) !== PROVIDER_ID) {
    throw new Error("AVANTIQO_CODE_DISTRIBUTED_LEASE_CONTROL_ROW_PROVIDER_UNSAFE");
  }
  if (!text(row.updated_at)) {
    throw new Error("AVANTIQO_CODE_DISTRIBUTED_LEASE_CONTROL_ROW_UPDATED_AT_REQUIRED");
  }
  return row;
}

async function compareAndSwapMetadata(row, metadata) {
  const nextUpdatedAt = new Date().toISOString();
  const rows = await supabaseRequest(
    `/rest/v1/organization_services?id=eq.${encodeURIComponent(row.id)}&updated_at=eq.${encodeURIComponent(row.updated_at)}&select=id,organization_id,service_id,managed_by,default_provider_id,usage_enabled,billing_enabled,metadata,updated_at`,
    {
      method: "PATCH",
      prefer: "return=representation",
      body: {
        metadata,
        updated_at: nextUpdatedAt,
      },
    },
  );
  if (!Array.isArray(rows)) {
    throw new Error("AVANTIQO_CODE_DISTRIBUTED_LEASE_CAS_RESPONSE_INVALID");
  }
  return rows[0] || null;
}

export function isCodeRunpodLane(lane) {
  return CODE_LANES.has(text(lane));
}

export function activeCodeRunpodDistributedLeaseFromMetadata(metadata, nowMs = Date.now()) {
  return activeLeaseFromMetadata(metadata, nowMs);
}

export async function listActiveCodeRunpodDistributedLeases() {
  const row = await readControlRow();
  if (!row) return [];
  const lease = activeLeaseFromMetadata(row.metadata);
  return lease ? [lease] : [];
}

export async function acquireCodeRunpodDistributedLease({
  lane,
  endpointId,
  endpointName,
  ttlMs,
  ownerRequestId = crypto.randomUUID(),
}) {
  if (!isCodeRunpodLane(lane)) {
    throw new Error(`AVANTIQO_CODE_DISTRIBUTED_LEASE_LANE_INVALID:${text(lane) || "missing"}`);
  }
  if (!text(endpointId) || !text(endpointName)) {
    throw new Error("AVANTIQO_CODE_DISTRIBUTED_LEASE_ENDPOINT_REQUIRED");
  }
  if (!text(endpointName).startsWith("avantiqo-code-v1")) {
    throw new Error("AVANTIQO_CODE_DISTRIBUTED_LEASE_ENDPOINT_NAME_INVALID");
  }

  const ttl = Math.max(60_000, Math.min(Number(ttlMs || 900_000), MAX_CODE_DISTRIBUTED_LEASE_TTL_MS));

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const row = await readControlRow();
    if (!row) {
      throw new Error("AVANTIQO_CODE_DISTRIBUTED_LEASE_CONTROL_ROW_REQUIRED");
    }

    const active = activeLeaseFromMetadata(row.metadata);
    if (active) {
      if (text(active.owner_request_id) === text(ownerRequestId)) return active;
      throw new Error(
        `AVANTIQO_CODE_DISTRIBUTED_LEASE_BUSY:${text(active.endpoint_name) || text(active.endpoint_id)}`,
      );
    }

    const acquiredAt = new Date();
    const lease = {
      distributed_contract: DISTRIBUTED_CONTRACT,
      contract: CONTRACT,
      lane: text(lane),
      endpoint_id: text(endpointId),
      endpoint_name: text(endpointName),
      organization_id: leaseOrganizationId(),
      owner_request_id: text(ownerRequestId),
      state: "ACTIVE",
      acquired_at: acquiredAt.toISOString(),
      expires_at: new Date(acquiredAt.getTime() + ttl).toISOString(),
    };
    const updated = await compareAndSwapMetadata(row, {
      ...object(row.metadata),
      [METADATA_KEY]: lease,
    });
    if (updated) {
      const verified = activeLeaseFromMetadata(updated.metadata);
      if (
        !verified ||
        text(verified.owner_request_id) !== text(ownerRequestId) ||
        text(verified.endpoint_id) !== text(endpointId)
      ) {
        throw new Error("AVANTIQO_CODE_DISTRIBUTED_LEASE_ACQUIRE_VERIFY_FAILED");
      }
      return verified;
    }

    await sleep(Math.min(100 * (attempt + 1), 400));
  }

  throw new Error("AVANTIQO_CODE_DISTRIBUTED_LEASE_CAS_RETRY_EXHAUSTED");
}

export async function releaseCodeRunpodDistributedLease({
  ownerRequestId,
  state = "RELEASED",
  reason = null,
}) {
  if (!text(ownerRequestId)) return null;
  const releaseState = text(state).toUpperCase() || "RELEASED";
  if (!["RELEASED", "FAILED", "EXPIRED"].includes(releaseState)) {
    throw new Error("AVANTIQO_CODE_DISTRIBUTED_LEASE_RELEASE_STATE_INVALID");
  }

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const row = await readControlRow();
    if (!row) return null;
    const metadata = object(row.metadata);
    const current = object(metadata[METADATA_KEY]);
    if (!Object.keys(current).length) return null;
    if (text(current.owner_request_id) !== text(ownerRequestId)) {
      throw new Error("AVANTIQO_CODE_DISTRIBUTED_LEASE_OWNER_MISMATCH");
    }
    if (current.state !== "ACTIVE") return current;

    const released = {
      ...current,
      state: releaseState,
      released_at: new Date().toISOString(),
      release_reason: text(reason) || null,
    };
    const updated = await compareAndSwapMetadata(row, {
      ...metadata,
      [METADATA_KEY]: released,
    });
    if (updated) {
      const verified = object(object(updated.metadata)[METADATA_KEY]);
      if (
        text(verified.owner_request_id) !== text(ownerRequestId) ||
        text(verified.state) !== releaseState
      ) {
        throw new Error("AVANTIQO_CODE_DISTRIBUTED_LEASE_RELEASE_VERIFY_FAILED");
      }
      return verified;
    }

    await sleep(Math.min(100 * (attempt + 1), 400));
  }

  throw new Error("AVANTIQO_CODE_DISTRIBUTED_LEASE_RELEASE_CAS_RETRY_EXHAUSTED");
}

export const AVANTIQO_CODE_DISTRIBUTED_LEASE_CONTRACT = DISTRIBUTED_CONTRACT;
