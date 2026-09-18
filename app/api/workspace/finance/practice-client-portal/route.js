export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { issueFinanceClientPortalGrant, revokeFinanceClientPortalGrant } from "@/lib/finance/practice/FinanceClientPortalGrant";
import { deliverFinanceClientPortalAccess, getFinanceClientPortalDeliveryReadiness } from "@/lib/finance/practice/FinanceClientPortalDeliveryRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGE_PERMISSIONS = ["finance.accounting.manage", "finance.configuration.manage"];
function clean(value) { return String(value ?? "").trim(); }
function jsonError(error, status = 400) { return NextResponse.json({ success: false, error }, { status }); }
function portalStorageError(error) {
  const message = String(error?.message || error || "");
  if (/accounting_client_portal_grants|finance_client_portal_deliveries|schema cache/i.test(message)) {
    return NextResponse.json({
      success: false,
      error: "Client portal storage is not deployed in this environment yet. Apply the pending Finance client-portal database migration before issuing or revoking client access.",
      code: "FINANCE_CLIENT_PORTAL_STORAGE_NOT_DEPLOYED",
      migration: "20260918153000_finance_portal_delivery_native_esign.sql",
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
    const [organizationsResult, grantsResult, messagesResult, deliveriesResult, deliveryReadiness] = await Promise.all([
      clientIds.length ? supabaseAdmin.from("organizations").select("id,name").in("id", clientIds) : Promise.resolve({ data: [], error: null }),
      supabaseAdmin.from("accounting_client_portal_grants").select("id,organization_id,entity_id,engagement_id,client_name,client_email,issued_at,expires_at,revoked_at,last_viewed_at,metadata").eq("accounting_firm_id", access.organizationId).order("issued_at", { ascending: false }).limit(5000),
      supabaseAdmin.from("accounting_client_portal_messages").select("id,engagement_id,sender_type,sender_name,sender_email,body,read_by_client_at,read_by_firm_at,created_at").eq("accounting_firm_id", access.organizationId).order("created_at", { ascending: true }).limit(10000),
      supabaseAdmin.from("finance_client_portal_deliveries").select("id,portal_grant_id,engagement_id,recipient_email,provider_id,status,external_message_id,attempt_count,error_code,error_message,created_at,updated_at,sent_at").eq("accounting_firm_id", access.organizationId).order("created_at", { ascending: false }).limit(5000),
      getFinanceClientPortalDeliveryReadiness({ accountingFirmId: access.organizationId }),
    ]); if (organizationsResult.error) throw organizationsResult.error; if (grantsResult.error) throw grantsResult.error; if (messagesResult.error) throw messagesResult.error; if (deliveriesResult.error) throw deliveriesResult.error;
    const orgMap = new Map((organizationsResult.data || []).map((row) => [row.id, row.name || "Client organization"]));
    const grantsByEngagement = new Map(); for (const grant of grantsResult.data || []) { const rows = grantsByEngagement.get(grant.engagement_id) || []; rows.push(grant); grantsByEngagement.set(grant.engagement_id, rows); }
    const messagesByEngagement = new Map(); for (const message of messagesResult.data || []) { const rows = messagesByEngagement.get(message.engagement_id) || []; rows.push(message); messagesByEngagement.set(message.engagement_id, rows); }
    const deliveriesByGrant = new Map(); for (const delivery of deliveriesResult.data || []) { if (!deliveriesByGrant.has(delivery.portal_grant_id)) deliveriesByGrant.set(delivery.portal_grant_id, delivery); }
    const unreadIds = (messagesResult.data || []).filter((row) => row.sender_type === "CLIENT" && !row.read_by_firm_at).map((row) => row.id);
    if (unreadIds.length) { const { error: markError } = await supabaseAdmin.from("accounting_client_portal_messages").update({ read_by_firm_at: new Date().toISOString() }).eq("accounting_firm_id", access.organizationId).in("id", unreadIds); if (markError) throw markError; }
    const now = Date.now();
    const rows = (engagements || []).map((engagement) => { const messages = messagesByEngagement.get(engagement.id) || []; const activeGrant = (grantsByEngagement.get(engagement.id) || []).find((grant) => !grant.revoked_at && Date.parse(grant.expires_at) > now) || null; return { ...engagement, client_name: orgMap.get(engagement.organization_id) || "Client organization", grants: grantsByEngagement.get(engagement.id) || [], active_grant: activeGrant ? { ...activeGrant, delivery: deliveriesByGrant.get(activeGrant.id) || null } : null, messages: activeGrant ? messages : [], unread_client_messages: activeGrant ? messages.filter((row) => row.sender_type === "CLIENT" && !row.read_by_firm_at).length : 0 }; });
    return NextResponse.json({ success: true, engagements: rows, delivery_readiness: deliveryReadiness, summary: { clients: rows.length, active_portals: rows.filter((row) => row.active_grant).length, messages: rows.filter((row) => row.active_grant).reduce((sum, row) => sum + row.messages.length, 0) }, generated_at: new Date().toISOString() });
  } catch (error) { return portalStorageError(error); }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({})); const organizationId = clean(body.organizationId || body.organization_id);
    const access = await requireOrganizationAccess({ organizationId, request }); if (!access.success) return jsonError(access.error, access.status || 403); await requireManage(access);
    const action = clean(body.action || "issue").toLowerCase();
    if (action === "message") {
      const engagementId = clean(body.engagementId || body.engagement_id);
      const messageBody = clean(body.message || body.body);
      if (!engagementId) return jsonError("engagementId is required", 400);
      if (!messageBody) return jsonError("Message is required", 400);
      if (messageBody.length > 4000) return jsonError("Message must be 4,000 characters or fewer", 400);
      const { data: engagement, error: engagementError } = await supabaseAdmin.from("accounting_engagements").select("id,organization_id").eq("id", engagementId).eq("accounting_firm_id", access.organizationId).maybeSingle();
      if (engagementError) throw engagementError; if (!engagement) return jsonError("Accounting engagement not found", 404);
      const { data: grant, error: grantError } = await supabaseAdmin.from("accounting_client_portal_grants").select("id").eq("accounting_firm_id", access.organizationId).eq("engagement_id", engagement.id).is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("issued_at", { ascending: false }).limit(1).maybeSingle();
      if (grantError) throw grantError; if (!grant) return jsonError("Create an active client portal before sending portal messages", 409);
      const now = new Date().toISOString();
      const { data: message, error: messageError } = await supabaseAdmin.from("accounting_client_portal_messages").insert({ accounting_firm_id: access.organizationId, organization_id: engagement.organization_id, engagement_id: engagement.id, portal_grant_id: grant.id, sender_type: "ACCOUNTING_FIRM", sender_staff_id: staffId(access), sender_name: access?.staff?.name || access?.user?.email || "Accounting team", sender_email: access?.user?.email || null, body: messageBody, read_by_firm_at: now, metadata: { source: "finance_client_access" } }).select("id,engagement_id,sender_type,sender_name,sender_email,body,created_at").single();
      if (messageError) throw messageError;
      return NextResponse.json({ success: true, message }, { status: 201 });
    }
    if (action === "revoke") {
      const grantId = clean(body.grantId || body.grant_id); if (!grantId) return jsonError("grantId is required");
      const grant = await revokeFinanceClientPortalGrant({ grantId, accountingFirmId: access.organizationId, revokedBy: staffId(access), reason: body.reason || "STAFF_REVOKED" });
      if (!grant) return jsonError("Active portal grant not found", 404); return NextResponse.json({ success: true, grant });
    }
    if (action !== "issue") return jsonError("Unsupported portal action", 400);
    const engagementId = clean(body.engagementId || body.engagement_id); const clientName = clean(body.clientName || body.client_name); const clientEmail = clean(body.clientEmail || body.client_email);
    if (!clientEmail) return jsonError("Client email is required; Avantiqo will not guess portal identity", 400);
    const { data: engagement, error: engagementError } = await supabaseAdmin.from("accounting_engagements").select("id,organization_id,entity_id,status").eq("id", engagementId).eq("accounting_firm_id", access.organizationId).maybeSingle(); if (engagementError) throw engagementError; if (!engagement) return jsonError("Accounting engagement not found", 404);
    const issued = await issueFinanceClientPortalGrant({ accountingFirmId: access.organizationId, organizationId: engagement.organization_id, entityId: engagement.entity_id, engagementId: engagement.id, clientName, clientEmail, issuedBy: staffId(access), ttlDays: body.ttlDays || 30 });
    const firmResult = await supabaseAdmin.from("organizations").select("name").eq("id", access.organizationId).maybeSingle();
    if (firmResult.error) throw firmResult.error;
    const clientPath = `/client/accounting/${issued.token}`;
    const origin = new URL(request.url).origin;
    const delivery = await deliverFinanceClientPortalAccess({ grant: issued.grant, rawPortalUrl: `${origin}${clientPath}`, firmName: firmResult.data?.name || "Accounting team" });
    return NextResponse.json({ success: true, grant: issued.grant, client_path: clientPath, expires_at: issued.grant.expires_at, token_returned_once: true, delivery }, { status: 201 });
  } catch (error) { return portalStorageError(error); }
}
