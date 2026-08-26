import crypto from "node:crypto";

const VOICE_LANES = new Set(["voice-tts", "voice-stt"]);
const CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SYSTEM_ORGANIZATION_ID = "00000000-0000-0000-0000-000000000000";

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function supabaseBaseUrl() {
  return required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
}

function supabaseServiceRoleKey() {
  return required("SUPABASE_SERVICE_ROLE_KEY");
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
    const code = text(parsed?.message || parsed?.details || parsed?.hint || parsed?.code || raw)
      .replace(/\s+/g, " ")
      .slice(0, 500);
    const error = new Error(
      `AVANTIQO_VOICE_DISTRIBUTED_LEASE_REQUEST_FAILED:${response.status}:${code || "UNKNOWN"}`,
    );
    error.httpStatus = response.status;
    error.supabaseCode = text(parsed?.code) || null;
    error.detail = code || null;
    throw error;
  }

  return parsed;
}

async function rpc(name, body) {
  return supabaseRequest(`/rest/v1/rpc/${name}`, {
    method: "POST",
    body,
  });
}

function isSchemaNotInstalled(error) {
  const code = text(error?.supabaseCode).toUpperCase();
  const detail = text(error?.detail || error?.message).toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    ((Number(error?.httpStatus) === 404 || Number(error?.httpStatus) === 400) &&
      detail.includes("avantiqo_voice_runpod_leases") &&
      (detail.includes("schema cache") || detail.includes("does not exist") || detail.includes("could not find")))
  );
}

export function isVoiceRunpodLane(lane) {
  return VOICE_LANES.has(text(lane));
}

export async function listActiveVoiceRunpodDistributedLeases() {
  const now = encodeURIComponent(new Date().toISOString());
  let rows;
  try {
    rows = await supabaseRequest(
      `/rest/v1/avantiqo_voice_runpod_leases?select=id,contract,lane,endpoint_id,endpoint_name,state,expires_at&state=eq.ACTIVE&expires_at=gt.${now}`,
    );
  } catch (error) {
    // The migration is intentionally staged before final release. Until it is
    // installed, there cannot be a web/distributed Voice lease to protect.
    if (isSchemaNotInstalled(error)) return [];
    throw error;
  }

  if (!Array.isArray(rows)) {
    throw new Error("AVANTIQO_VOICE_DISTRIBUTED_LEASE_LIST_INVALID");
  }
  return rows.filter((lease) =>
    lease?.contract === CONTRACT &&
    lease?.state === "ACTIVE" &&
    isVoiceRunpodLane(lease?.lane) &&
    text(lease?.endpoint_id)
  );
}

export async function acquireVoiceRunpodDistributedLease({
  lane,
  endpointId,
  endpointName,
  ttlMs,
  organizationId = SYSTEM_ORGANIZATION_ID,
  ownerRequestId = crypto.randomUUID(),
}) {
  if (!isVoiceRunpodLane(lane)) {
    throw new Error(`AVANTIQO_VOICE_DISTRIBUTED_LEASE_LANE_INVALID:${text(lane) || "missing"}`);
  }
  if (!text(endpointId) || !text(endpointName)) {
    throw new Error("AVANTIQO_VOICE_DISTRIBUTED_LEASE_ENDPOINT_REQUIRED");
  }

  const ttlSeconds = Math.max(60, Math.min(1800, Math.ceil(Number(ttlMs || 900_000) / 1000)));
  const lease = await rpc("acquire_avantiqo_voice_runpod_lease_v2", {
    p_organization_id: text(organizationId) || SYSTEM_ORGANIZATION_ID,
    p_lane: text(lane),
    p_endpoint_id: text(endpointId),
    p_endpoint_name: text(endpointName),
    p_owner_request_id: ownerRequestId,
    p_ttl_seconds: ttlSeconds,
  });

  if (!lease?.id || lease?.contract !== CONTRACT || lease?.state !== "ACTIVE") {
    throw new Error("AVANTIQO_VOICE_DISTRIBUTED_LEASE_ACQUIRE_INVALID");
  }

  return {
    ...lease,
    owner_request_id: ownerRequestId,
  };
}

export async function refreshVoiceRunpodDistributedLease({ leaseId, ownerRequestId, ttlMs }) {
  const ttlSeconds = Math.max(60, Math.min(1800, Math.ceil(Number(ttlMs || 900_000) / 1000)));
  const lease = await rpc("refresh_avantiqo_voice_runpod_lease_v2", {
    p_lease_id: leaseId,
    p_owner_request_id: ownerRequestId,
    p_ttl_seconds: ttlSeconds,
  });

  if (!lease?.id || lease?.contract !== CONTRACT || lease?.state !== "ACTIVE") {
    throw new Error("AVANTIQO_VOICE_DISTRIBUTED_LEASE_REFRESH_INVALID");
  }

  return lease;
}

export async function releaseVoiceRunpodDistributedLease({
  leaseId,
  ownerRequestId,
  state = "RELEASED",
  reason = null,
}) {
  if (!leaseId || !ownerRequestId) return null;
  return rpc("release_avantiqo_voice_runpod_lease_v2", {
    p_lease_id: leaseId,
    p_owner_request_id: ownerRequestId,
    p_state: text(state).toUpperCase() || "RELEASED",
    p_reason: text(reason) || null,
  });
}
