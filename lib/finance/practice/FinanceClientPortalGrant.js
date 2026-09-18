import { createHash, randomBytes } from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) { return String(value ?? "").trim(); }
function tokenHash(token) { return createHash("sha256").update(clean(token)).digest("hex"); }

export function createFinanceClientPortalToken() { return randomBytes(32).toString("base64url"); }
export function hashFinanceClientPortalToken(token) { return tokenHash(token); }

export async function issueFinanceClientPortalGrant({ accountingFirmId, organizationId, entityId = null, engagementId, clientName = null, clientEmail = null, issuedBy = null, ttlDays = 30 }) {
  const token = createFinanceClientPortalToken();
  const now = new Date();
  const expires = new Date(now.getTime() + Math.max(1, Math.min(Number(ttlDays) || 30, 90)) * 86400000);
  const { data, error } = await supabaseAdmin.from("accounting_client_portal_grants").insert({
    accounting_firm_id: accountingFirmId, organization_id: organizationId, entity_id: entityId || null, engagement_id: engagementId,
    token_hash: tokenHash(token), client_name: clean(clientName) || null, client_email: clean(clientEmail) || null,
    issued_by: issuedBy || null, issued_at: now.toISOString(), expires_at: expires.toISOString(), metadata: { authority: "ACCOUNTING_ENGAGEMENT_PORTAL", scope: entityId ? "ENTITY" : "ORGANIZATION", general_erp_access: false },
  }).select("*").single();
  if (error) throw error;
  return { token, grant: data };
}

export async function resolveFinanceClientPortalGrant(token, { markViewed = false } = {}) {
  const raw = clean(token);
  if (raw.length < 32 || raw.length > 200) return null;
  const hash = tokenHash(raw);
  const { data, error } = await supabaseAdmin.from("accounting_client_portal_grants").select("*").eq("token_hash", hash).limit(2);
  if (error) throw error;
  if (!Array.isArray(data) || data.length !== 1) return null;
  const grant = data[0];
  if (grant.revoked_at || !grant.expires_at || Date.parse(grant.expires_at) <= Date.now()) return null;
  if (markViewed) {
    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabaseAdmin.from("accounting_client_portal_grants").update({ last_viewed_at: now, updated_at: now }).eq("id", grant.id).eq("token_hash", hash).select("*").single();
    if (updateError) throw updateError;
    return updated;
  }
  return grant;
}

export async function revokeFinanceClientPortalGrant({ grantId, accountingFirmId, revokedBy = null, reason = "STAFF_REVOKED" }) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from("accounting_client_portal_grants").update({ revoked_at: now, revoked_by: revokedBy || null, revocation_reason: clean(reason) || "STAFF_REVOKED", updated_at: now }).eq("id", grantId).eq("accounting_firm_id", accountingFirmId).is("revoked_at", null).select("*").maybeSingle();
  if (error) throw error;
  return data;
}
