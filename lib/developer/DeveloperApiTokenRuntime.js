import { createHash, randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function bearer(request) {
  const value = request?.headers?.get?.("authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function resolveDeveloperMachineIdentity(request) {
  const token = bearer(request);
  if (!token || !token.startsWith("avq_")) {
    return { success: false, status: 401, error: "Developer API token required" };
  }
  const credential = await supabaseAdmin
    .from("developer_api_credentials")
    .select("id,organization_id,environment_id,name,scopes,status,expires_at,revoked_at,developer_environments(id,environment_key,name,status,requests_per_minute,monthly_request_limit,max_active_credentials,max_active_webhooks)")
    .eq("token_hash", hash(token))
    .maybeSingle();
  if (credential.error) return { success: false, status: 500, error: credential.error.message };

  const row = credential.data;
  if (!row || row.status !== "ACTIVE" || row.revoked_at) {
    return { success: false, status: 401, error: "Developer API token invalid or revoked" };
  }
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return { success: false, status: 401, error: "Developer API token expired" };
  }
  const environment = Array.isArray(row.developer_environments)
    ? row.developer_environments[0]
    : row.developer_environments;
  if (!environment || environment.status !== "ACTIVE") {
    return { success: false, status: 403, error: "Developer environment disabled" };
  }
  await supabaseAdmin
    .from("developer_api_credentials")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id);
  return {
    success: true,
    credential_id: row.id,
    organization_id: row.organization_id,
    environment_id: row.environment_id,
    environment,
    permissions: Array.isArray(row.scopes) ? row.scopes : [],
    actor_id: null,
    role: "DEVELOPER_API",
  };
}

export async function claimDeveloperApiRateLimit(identity, limit = null) {
  const resolvedLimit = Math.max(
    1,
    Math.min(
      10_000,
      Number(limit || identity?.environment?.requests_per_minute || 120),
    ),
  );
  const result = await supabaseAdmin.rpc("claim_developer_api_rate_limit", {
    p_credential_id: identity.credential_id,
    p_limit: resolvedLimit,
  });
  if (result.error) throw result.error;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return {
    allowed: Boolean(row?.allowed),
    count: Number(row?.request_count || 0),
    limit: resolvedLimit,
    window_start: row?.window_start || null,
  };
}

export async function claimDeveloperEnvironmentRateLimit(identity) {
  const limit = Math.max(
    1,
    Math.min(10_000, Number(identity?.environment?.requests_per_minute || 120)),
  );
  const result = await supabaseAdmin.rpc("claim_developer_environment_rate_limit", {
    p_organization_id: identity.organization_id,
    p_environment_id: identity.environment_id,
    p_limit: limit,
  });
  if (result.error) throw result.error;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return {
    allowed: Boolean(row?.allowed),
    count: Number(row?.request_count || 0),
    limit,
    window_start: row?.window_start || null,
  };
}

export async function claimDeveloperEnvironmentQuota(identity) {
  const result = await supabaseAdmin.rpc("claim_developer_environment_quota", {
    p_organization_id: identity.organization_id,
    p_environment_id: identity.environment_id,
  });
  if (result.error) throw result.error;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return {
    allowed: Boolean(row?.allowed),
    count: Number(row?.request_count || 0),
    limit: row?.monthly_limit === null || row?.monthly_limit === undefined
      ? null
      : Number(row.monthly_limit),
    month_start: row?.month_start || null,
  };
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = canonicalValue(value[key]);
    }
    return out;
  }
  return value;
}

export function developerMutationRequestHash({ capabilityId, command, payload }) {
  const canonical = JSON.stringify(canonicalValue({
    capability_id: String(capabilityId || ""),
    command: String(command || ""),
    payload: payload || {},
  }));
  return createHash("sha256").update(canonical).digest("hex");
}

export async function claimDeveloperApiIdempotency({
  identity,
  idempotencyKey,
  capabilityId,
  command,
  requestHash,
}) {
  const result = await supabaseAdmin.rpc("claim_developer_api_idempotency", {
    p_organization_id: identity.organization_id,
    p_environment_id: identity.environment_id,
    p_credential_id: identity.credential_id,
    p_idempotency_key: idempotencyKey,
    p_capability_id: capabilityId,
    p_command: command,
    p_request_hash: requestHash,
  });
  if (result.error) throw result.error;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return {
    record_id: row?.record_id || null,
    claimed: Boolean(row?.claimed),
    matching_request: Boolean(row?.matching_request),
    state: row?.record_state || null,
    response_status: row?.response_status == null ? null : Number(row.response_status),
    response_body: row?.response_body ?? null,
  };
}

export async function settleDeveloperApiIdempotency({
  identity,
  recordId,
  requestHash,
  responseStatus,
  responseBody,
}) {
  const result = await supabaseAdmin.rpc("settle_developer_api_idempotency", {
    p_organization_id: identity.organization_id,
    p_environment_id: identity.environment_id,
    p_record_id: recordId,
    p_request_hash: requestHash,
    p_response_status: responseStatus,
    p_response_body: responseBody ?? {},
  });
  if (result.error) throw result.error;
  return Boolean(result.data);
}

export function developerRequestId(request) {
  const supplied = String(request?.headers?.get?.("x-request-id") || "").trim();
  return /^[0-9a-f-]{36}$/i.test(supplied) ? supplied : randomUUID();
}

export async function recordDeveloperApiRequest({
  requestId,
  identity,
  capabilityId,
  method,
  command = null,
  statusCode,
  latencyMs = 0,
  errorCode = null,
  idempotencyKey = null,
}) {
  const result = await supabaseAdmin.from("developer_api_requests").insert({
    request_id: requestId,
    organization_id: identity.organization_id,
    environment_id: identity.environment_id,
    credential_id: identity.credential_id,
    capability_id: capabilityId,
    method,
    command,
    status_code: statusCode,
    latency_ms: Math.max(0, Math.round(Number(latencyMs) || 0)),
    error_code: errorCode ? String(errorCode).slice(0, 160) : null,
    idempotency_key: idempotencyKey ? String(idempotencyKey).slice(0, 240) : null,
  });
  if (result.error) console.error("DEVELOPER_API_REQUEST_LOG_FAILED", result.error.message);
}
