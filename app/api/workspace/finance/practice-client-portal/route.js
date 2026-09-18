export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { issueFinanceClientPortalGrant, revokeFinanceClientPortalGrant } from "@/lib/finance/practice/FinanceClientPortalGrant";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGE_PERMISSIONS = ["finance.accounting.manage", "finance.configuration.manage"];
function clean(value) { return String(value ?? "").trim(); }
function jsonError(error, status = 400) { return NextResponse.json({ success: false, error }, { status }); }
function portalStorageError(error) {
  const message = String(error?.message || error || "");
  if (/accounting_client_portal_grants|schema cache/i.test(message)) {
    return NextResponse.json({
      success: false,
      error: "Client portal storage is not deployed in this environment yet. Apply the pending Finance client-portal database migration before issuing or revoking client access.",
      code: "FINANCE_CLIENT_PORTAL_STORAGE_NOT_DEPLOYED",
      migration: "20260918093000_accounting_client_portal_grants.sql",
    }, { status: 503 });
  }
  return jsonError(message || "Unable to load client portal access", 500);
}
async function requireView(access) { await checkFinancePermission({ organizationId: access.organizationId, userId: access.user?.id, permissionKey: "finance.view", fullAccess: access.permissions?.includes("*") === true }); }
async function requireManage(access) { if (access.permissions?.includes("*") === true) return; let lastError = null; for (const permissionKey of MANAGE_PERMISSIONS) { try { await checkFinancePermission({ organizationId: access.organizationId, userId: access.user?.id, permissionKey, fullAccess: false }); return; } catch (error) { lastError = error; } } throw lastError || new Error("Finance client portal permission denied"); }
function staffId(access) { return access?.access?.staffAccountId || access?.staff?.id || null; }

export async function GET(request) {
  try {
    const url = new URL(request.url); const organizationId = clean(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const access = await requireOrganizationAccess({ organizationId, request }); if (!access.success) return jsonError(access.error, access.status || 403); await requireView(access);
    const { data: engagements, error: engagementError } = await supabaseAdmin.from("accounting_engagements").select("id,organization_id,entity_id,service_package,status").eq("accounting_firm_id", access.organizationId).order("created_at", { ascending: true }).limit(1000); if (engagementError) throw engagementError;
    const clientIds = [...new Set((engagements || []).map((row) => row.organization_id).filter(Boolean))];
    const [organizationsResult, grantsResult] = await Promise.all([
      clientIds.length ? supabaseAdmin.from("organizations").select("id,name").in("id", clientIds) : Promise.resolve({ data: [], error: null }),
      supabaseAdmin.from("accounting_client_portal_grants").select("id,organization_id,entity_id,engagement_id,client_name,client_email,issued_at,expires_at,revoked_at,last_viewed_at,metadata").eq("accounting_firm_id", access.organizationId).order("issued_at", { ascending: false }).limit(5000),
    ]); if (organizationsResult.error) throw organizationsResult.error; if (grantsResult.error) throw grantsResult.error;
    const orgMap = new Map((organizationsResult.data || []).map((row) => [row.id, row.name || "Client organization"]));
    const grantsByEngagement = new Map(); for (const grant of grantsResult.data || []) { const rows = grantsByEngagement.get(grant.engagement_id) || []; rows.push(grant); grantsByEngagement.set(grant.engagement_id, rows); }
    const now = Date.now();
    const rows = (engagements || []).map((engagement) => ({ ...engagement, client_name: orgMap.get(engagement.organization_id) || "Client organization", grants: grantsByEngagement.get(engagement.id) || [], active_grant: (grantsByEngagement.get(engagement.id) || []).find((grant) => !grant.revoked_at && Date.parse(grant.expires_at) > now) || null }));
    return NextResponse.json({ success: true, engagements: rows, summary: { clients: rows.length, active_portals: rows.filter((row) => row.active_grant).length }, generated_at: new Date().toISOString() });
  } catch (error) { return portalStorageError(error); }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({})); const organizationId = clean(body.organizationId || body.organization_id);
    const access = await requireOrganizationAccess({ organizationId, request }); if (!access.success) return jsonError(access.error, access.status || 403); await requireManage(access);
    const action = clean(body.action || "issue").toLowerCase();
    if (action === "revoke") {
      const grantId = clean(body.grantId || body.grant_id); if (!grantId) return jsonError("grantId is required");
      const grant = await revokeFinanceClientPortalGrant({ grantId, accountingFirmId: access.organizationId, revokedBy: staffId(access), reason: body.reason || "STAFF_REVOKED" });
      if (!grant) return jsonError("Active portal grant not found", 404); return NextResponse.json({ success: true, grant });
    }
    if (action !== "issue") return jsonError("Unsupported portal action", 400);
    const engagementId = clean(body.engagementId || body.engagement_id); const clientName = clean(body.clientName || body.client_name); const clientEmail = clean(body.clientEmail || body.client_email);
    if (!clientEmail) return jsonError("Client email is required; Avantiqo will not guess portal identity", 400);
    const { data: engagement, error: engagementError } = await supabaseAdmin.from("accounting_engagements").select("id,organization_id,entity_id,status").eq("id", engagementId).eq("accounting_firm_id", access.organizationId).maybeSingle(); if (engagementError) throw engagementError; if (!engagement) return jsonError("Accounting engagement not found", 404); if (!engagement.entity_id) return jsonError("Client legal entity must be configured before portal access", 409);
    const issued = await issueFinanceClientPortalGrant({ accountingFirmId: access.organizationId, organizationId: engagement.organization_id, entityId: engagement.entity_id, engagementId: engagement.id, clientName, clientEmail, issuedBy: staffId(access), ttlDays: body.ttlDays || 30 });
    return NextResponse.json({ success: true, grant: issued.grant, client_path: `/client/accounting/${issued.token}`, expires_at: issued.grant.expires_at, token_returned_once: true }, { status: 201 });
  } catch (error) { return portalStorageError(error); }
}
