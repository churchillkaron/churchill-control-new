import { createHash, randomBytes } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ACTIVE_REQUEST_STATUSES = new Set(["SENT", "VIEWED", "IN_PROGRESS", "CHANGES_REQUESTED"]);
const DEFAULT_TTL_DAYS = 14;

function clean(value) {
  return String(value ?? "").trim();
}

function tokenHash(token) {
  return createHash("sha256").update(clean(token)).digest("hex");
}

function grantFrom(request) {
  const grant = request?.metadata?.client_access;
  return grant && typeof grant === "object" && !Array.isArray(grant) ? grant : null;
}

function activeGrant(request, now = Date.now()) {
  const grant = grantFrom(request);
  if (!grant?.token_hash || !grant?.expires_at) return null;
  const expiresAt = Date.parse(grant.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
  if (grant.revoked_at) return null;
  return grant;
}

export function createClientEvidenceToken() {
  return randomBytes(32).toString("base64url");
}

export function hashClientEvidenceToken(token) {
  return tokenHash(token);
}

export async function issueClientEvidenceGrant({ requestRow, actorId = null, ttlDays = DEFAULT_TTL_DAYS }) {
  if (!requestRow?.id) throw new Error("Client request required");
  const token = createClientEvidenceToken();
  const now = new Date();
  const expires = new Date(now.getTime() + Math.max(1, Math.min(Number(ttlDays) || DEFAULT_TTL_DAYS, 30)) * 86400000);
  const previous = grantFrom(requestRow);
  const metadata = {
    ...(requestRow.metadata || {}),
    client_access: {
      token_hash: tokenHash(token),
      issued_at: now.toISOString(),
      issued_by: actorId || null,
      expires_at: expires.toISOString(),
      revoked_at: null,
      generation: Number(previous?.generation || 0) + 1,
    },
  };

  const { data, error } = await supabaseAdmin
    .from("accounting_client_requests")
    .update({ metadata, updated_at: now.toISOString() })
    .eq("id", requestRow.id)
    .eq("accounting_firm_id", requestRow.accounting_firm_id)
    .select("*")
    .single();
  if (error) throw error;
  return { token, request: data, expires_at: expires.toISOString() };
}

export async function revokeClientEvidenceGrant({ requestRow, actorId = null, reason = null }) {
  if (!requestRow?.id) throw new Error("Client request required");
  const grant = grantFrom(requestRow);
  if (!grant?.token_hash || grant.revoked_at) return requestRow;
  const now = new Date().toISOString();
  const metadata = {
    ...(requestRow.metadata || {}),
    client_access: {
      ...grant,
      revoked_at: now,
      revoked_by: actorId || null,
      revocation_reason: clean(reason) || null,
    },
  };
  const { data, error } = await supabaseAdmin
    .from("accounting_client_requests")
    .update({ metadata, updated_at: now })
    .eq("id", requestRow.id)
    .eq("accounting_firm_id", requestRow.accounting_firm_id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function resolveClientEvidenceGrant(token) {
  const raw = clean(token);
  if (raw.length < 32 || raw.length > 200) return null;
  const hash = tokenHash(raw);
  const { data, error } = await supabaseAdmin
    .from("accounting_client_requests")
    .select("*")
    .contains("metadata", { client_access: { token_hash: hash } })
    .limit(2);
  if (error) throw error;
  if (!Array.isArray(data) || data.length !== 1) return null;
  const requestRow = data[0];
  if (!ACTIVE_REQUEST_STATUSES.has(String(requestRow.status || "").toUpperCase())) return null;
  const grant = activeGrant(requestRow);
  if (!grant || grant.token_hash !== hash) return null;
  return { request: requestRow, grant };
}

export async function markClientEvidenceViewed(requestRow) {
  if (!requestRow?.id) return requestRow;
  const now = new Date().toISOString();
  const patch = {
    metadata: {
      ...(requestRow.metadata || {}),
      client_access: {
        ...(grantFrom(requestRow) || {}),
        last_viewed_at: now,
      },
    },
    updated_at: now,
  };
  if (requestRow.status === "SENT") patch.status = "VIEWED";
  const { data, error } = await supabaseAdmin
    .from("accounting_client_requests")
    .update(patch)
    .eq("id", requestRow.id)
    .eq("accounting_firm_id", requestRow.accounting_firm_id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function expireClientEvidenceGrantOnCompletion(requestRow, actorId = null) {
  return revokeClientEvidenceGrant({
    requestRow,
    actorId,
    reason: "REQUEST_COMPLETED",
  });
}
