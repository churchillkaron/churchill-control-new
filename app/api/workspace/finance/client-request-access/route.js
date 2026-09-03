export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  issueClientEvidenceGrant,
  revokeClientEvidenceGrant,
} from "@/lib/finance/practice/FinanceClientEvidenceGrant";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGE_PERMISSIONS = [
  "finance.accounting.manage",
  "finance.close.execute",
  "finance.configuration.manage",
];

function clean(value) {
  return String(value ?? "").trim();
}

function jsonError(message, status = 400, details = undefined) {
  return NextResponse.json({ success: false, error: message, ...(details ? { details } : {}) }, { status });
}

async function requireManage(access) {
  if (access.permissions?.includes("*") === true) return;
  let lastError = null;
  for (const permissionKey of MANAGE_PERMISSIONS) {
    try {
      await checkFinancePermission({
        organizationId: access.organizationId,
        userId: access.user?.id,
        permissionKey,
        fullAccess: false,
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Finance client-request permission denied");
}

async function audit(access, action, requestRow, metadata = {}) {
  const { error } = await supabaseAdmin.from("organization_audit_logs").insert({
    organization_id: access.organizationId,
    entity_type: "accounting_client_request",
    entity_id: String(requestRow.id),
    action,
    metadata: {
      client_organization_id: requestRow.organization_id,
      run_id: requestRow.run_id,
      work_item_id: requestRow.work_item_id,
      ...metadata,
    },
    actor_email: access.user?.email || null,
  });
  if (error) throw error;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = clean(body.organizationId || body.organization_id);
    const clientRequestId = clean(body.clientRequestId || body.client_request_id);
    const action = clean(body.action || "issue").toLowerCase();
    if (!clientRequestId) return jsonError("clientRequestId is required");
    if (!["issue", "revoke"].includes(action)) return jsonError("action must be issue or revoke");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireManage(access);

    const { data: requestRow, error: requestError } = await supabaseAdmin
      .from("accounting_client_requests")
      .select("*")
      .eq("id", clientRequestId)
      .eq("accounting_firm_id", access.organizationId)
      .maybeSingle();
    if (requestError) throw requestError;
    if (!requestRow) return jsonError("Client request not found", 404);

    const { data: run, error: runError } = await supabaseAdmin
      .from("accounting_engagement_runs")
      .select("id,organization_id,entity_id,period_id,engagement_id,status,locked_at")
      .eq("id", requestRow.run_id)
      .eq("accounting_firm_id", access.organizationId)
      .maybeSingle();
    if (runError) throw runError;
    if (!run) return jsonError("Accounting run not found", 404);
    if (run.locked_at) return jsonError("Completed work program is locked", 409);

    if (action === "revoke") {
      const updated = await revokeClientEvidenceGrant({
        requestRow,
        actorId: access.user?.id || null,
        reason: clean(body.reason) || "STAFF_REVOKED",
      });
      await audit(access, "ACCOUNTING_CLIENT_REQUEST_ACCESS_REVOKED", updated);
      return NextResponse.json({ success: true, client_request: updated });
    }

    if (!["DRAFT", "CHANGES_REQUESTED", "SENT", "VIEWED", "IN_PROGRESS"].includes(String(requestRow.status || "").toUpperCase())) {
      return jsonError(`Cannot issue client access from ${requestRow.status}`, 409);
    }

    const now = new Date().toISOString();
    let sentRequest = requestRow;
    if (["DRAFT", "CHANGES_REQUESTED"].includes(String(requestRow.status || "").toUpperCase())) {
      const { data, error } = await supabaseAdmin
        .from("accounting_client_requests")
        .update({
          status: "SENT",
          sent_at: requestRow.sent_at || now,
          updated_at: now,
        })
        .eq("id", requestRow.id)
        .eq("accounting_firm_id", access.organizationId)
        .select("*")
        .single();
      if (error) throw error;
      sentRequest = data;
      const { error: workError } = await supabaseAdmin
        .from("accounting_engagement_work_items")
        .update({ status: "WAITING_ON_CLIENT", blocked_reason: null, updated_at: now })
        .eq("id", requestRow.work_item_id)
        .eq("accounting_firm_id", access.organizationId);
      if (workError) throw workError;
    }

    const grant = await issueClientEvidenceGrant({
      requestRow: sentRequest,
      actorId: access.user?.id || null,
      ttlDays: Number(body.ttlDays || body.ttl_days || 14),
    });
    const clientPath = `/client/evidence/${grant.token}`;
    await audit(access, "ACCOUNTING_CLIENT_REQUEST_ACCESS_ISSUED", grant.request, {
      expires_at: grant.expires_at,
      generation: grant.request?.metadata?.client_access?.generation || null,
    });

    return NextResponse.json({
      success: true,
      client_request: grant.request,
      client_path: clientPath,
      expires_at: grant.expires_at,
      token_returned_once: true,
    });
  } catch (error) {
    const message = error?.message || "Unable to issue client evidence access";
    return jsonError(message, /permission denied/i.test(message) ? 403 : error?.status || 500);
  }
}
