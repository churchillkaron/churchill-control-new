export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { evaluateWorkProgramGate } from "@/lib/finance/practice/workProgramGates";
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
  throw lastError || new Error("Finance work program permission denied");
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = clean(body.organizationId || body.organization_id);
    const runId = clean(body.runId || body.run_id);
    const workItemId = clean(body.workItemId || body.work_item_id);
    if (!runId || !workItemId) return jsonError("runId and workItemId are required");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireManage(access);

    const [runResult, itemResult] = await Promise.all([
      supabaseAdmin
        .from("accounting_engagement_runs")
        .select("*")
        .eq("id", runId)
        .eq("accounting_firm_id", access.organizationId)
        .maybeSingle(),
      supabaseAdmin
        .from("accounting_engagement_work_items")
        .select("*")
        .eq("id", workItemId)
        .eq("run_id", runId)
        .eq("accounting_firm_id", access.organizationId)
        .maybeSingle(),
    ]);
    if (runResult.error) throw runResult.error;
    if (itemResult.error) throw itemResult.error;
    if (!runResult.data) return jsonError("Accounting engagement run not found", 404);
    if (!itemResult.data) return jsonError("Accounting work item not found", 404);
    if (runResult.data.locked_at) return jsonError("Completed work program is locked", 409);

    const gate = await evaluateWorkProgramGate({ run: runResult.data, item: itemResult.data });
    const now = new Date().toISOString();
    const currentMetadata = itemResult.data.metadata && typeof itemResult.data.metadata === "object"
      ? itemResult.data.metadata
      : {};
    const currentEvidence = itemResult.data.evidence && typeof itemResult.data.evidence === "object"
      ? itemResult.data.evidence
      : {};

    const { data: workItem, error: updateError } = await supabaseAdmin
      .from("accounting_engagement_work_items")
      .update({
        metadata: { ...currentMetadata, system_gate: gate },
        evidence: gate.applicable
          ? { ...currentEvidence, system_verified: gate.evidence, system_checked_at: gate.checked_at }
          : currentEvidence,
        blocked_reason: gate.applicable && !gate.satisfied ? gate.blockers.join("; ") : itemResult.data.blocked_reason,
        updated_at: now,
      })
      .eq("id", workItemId)
      .select("*")
      .single();
    if (updateError) throw updateError;

    const { error: auditError } = await supabaseAdmin.from("organization_audit_logs").insert({
      organization_id: access.organizationId,
      entity_type: "accounting_engagement_work_item",
      entity_id: workItemId,
      action: gate.satisfied ? "ACCOUNTING_WORK_ITEM_SYSTEM_VERIFIED" : "ACCOUNTING_WORK_ITEM_SYSTEM_BLOCKED",
      before_data: itemResult.data,
      after_data: workItem,
      metadata: { run_id: runId, capability_id: itemResult.data.capability_id, system_gate: gate },
      actor_email: access.user?.email || null,
    });
    if (auditError) throw auditError;

    return NextResponse.json({
      success: true,
      satisfied: gate.satisfied,
      applicable: gate.applicable,
      gate,
      work_item: workItem,
    }, { status: gate.applicable && !gate.satisfied ? 409 : 200 });
  } catch (error) {
    const message = error?.message || "Unable to verify accounting work item";
    return jsonError(message, /permission denied/i.test(message) ? 403 : 500);
  }
}
