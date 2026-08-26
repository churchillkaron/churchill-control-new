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

async function rpc(name, body) {
  const key = supabaseServiceRoleKey();
  const response = await fetch(`${supabaseBaseUrl()}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
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
    throw new Error(`AVANTIQO_VOICE_DISTRIBUTED_LEASE_RPC_FAILED:${name}:${response.status}:${code || "UNKNOWN"}`);
  }

  return parsed;
}

export function isVoiceRunpodLane(lane) {
  return VOICE_LANES.has(text(lane));
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
