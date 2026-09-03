export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGE_PERMISSIONS = [
  "finance.accounting.manage",
  "finance.close.execute",
  "finance.configuration.manage",
];
const ALLOWED_ROLES = new Set(["REVIEWER", "PARTNER"]);

function clean(value) {
  return String(value ?? "").trim();
}

function jsonError(message, status = 400, details = undefined) {
  return NextResponse.json(
    { success: false, error: message, ...(details ? { details } : {}) },
    { status },
  );
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
  throw lastError || new Error("Finance review sign-off permission denied");
}

function actorIds(access) {
  return new Set([
    access?.user?.id,
    access?.access?.staffAccountId,
    access?.staff?.id,
  ].filter(Boolean).map(String));
}

function actorMatches(access, value) {
  if (!value) return false;
  return actorIds(access).has(String(value));
}

async function audit(access, action, reviewItem, workItem, metadata = {}) {
  const { error } = await supabaseAdmin.from("organization_audit_logs").insert({
    organization_id: access.organizationId,
    entity_type: "finance_review",
    entity_id: String(reviewItem.id),
    action,
    before_data: null,
    after_data: { review_item_id: reviewItem.id, work_item_id: workItem.id },
    metadata: { run_id: workItem.run_id, ...metadata },
    actor_email: access.user?.email || null,
  });
  if (error) throw error;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = clean(body.organizationId || body.organization_id);
    const runId = clean(body.runId || body.run_id);
    const workItemId = clean(body.workItemId || body.work_item_id);
    const signoffRole = clean(body.signoffRole || body.signoff_role).toUpperCase();

    if (!runId || !workItemId) return jsonError("runId and workItemId are required");
    if (!ALLOWED_ROLES.has(signoffRole)) return jsonError("signoffRole must be REVIEWER or PARTNER");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireManage(access);

    const { data: run, error: runError } = await supabaseAdmin
      .from("accounting_engagement_runs")
      .select("id,accounting_firm_id,organization_id,entity_id,period_id,engagement_id,status,locked_at")
      .eq("id", runId)
      .eq("accounting_firm_id", access.organizationId)
      .maybeSingle();
    if (runError) throw runError;
    if (!run) return jsonError("Accounting engagement run not found", 404);
    if (run.locked_at) return jsonError("Completed work program is locked and cannot be changed", 409);

    const { data: workItem, error: workItemError } = await supabaseAdmin
      .from("accounting_engagement_work_items")
      .select("id,run_id,organization_id,entity_id,title,required_role,assigned_to,status,finance_review_item_id,capability_id")
      .eq("id", workItemId)
      .eq("run_id", run.id)
      .eq("accounting_firm_id", access.organizationId)
      .maybeSingle();
    if (workItemError) throw workItemError;
    if (!workItem) return jsonError("Accounting work item not found", 404);
    if (!workItem.finance_review_item_id) return jsonError("This work item has no governed Finance review record", 409);

    if (signoffRole === "REVIEWER" && workItem.status !== "READY_FOR_REVIEW") {
      return jsonError(`Reviewer sign-off requires READY_FOR_REVIEW, not ${workItem.status}`, 409);
    }
    if (signoffRole === "PARTNER" && !["READY", "IN_PROGRESS"].includes(workItem.status)) {
      return jsonError(`Partner clearance cannot be recorded from ${workItem.status}`, 409);
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("accounting_client_profiles")
      .select("assigned_accountant_id,assigned_reviewer_id,assigned_partner_id")
      .eq("accounting_firm_id", access.organizationId)
      .eq("organization_id", run.organization_id)
      .maybeSingle();
    if (profileError) throw profileError;

    const assignedRoleId = signoffRole === "REVIEWER"
      ? profile?.assigned_reviewer_id
      : profile?.assigned_partner_id;
    if (assignedRoleId && !actorMatches(access, assignedRoleId)) {
      return jsonError(`Only the assigned ${signoffRole.toLowerCase()} can sign this engagement`, 403);
    }

    if (profile?.assigned_accountant_id && actorMatches(access, profile.assigned_accountant_id)) {
      return jsonError("Segregation of duties blocks the preparer from reviewer or partner sign-off", 409);
    }

    const { data: reviewItem, error: reviewError } = await supabaseAdmin
      .from("finance_review_items")
      .select("*")
      .eq("id", workItem.finance_review_item_id)
      .eq("organization_id", run.organization_id)
      .maybeSingle();
    if (reviewError) throw reviewError;
    if (!reviewItem) return jsonError("Finance review record not found", 404);

    const [openNotesResult, signoffsResult] = await Promise.all([
      supabaseAdmin
        .from("finance_review_notes")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", run.organization_id)
        .eq("review_item_id", reviewItem.id)
        .neq("status", "RESOLVED"),
      supabaseAdmin
        .from("finance_review_signoffs")
        .select("signoff_role,signed_by")
        .eq("organization_id", run.organization_id)
        .eq("review_item_id", reviewItem.id)
        .is("revoked_at", null),
    ]);
    if (openNotesResult.error) throw openNotesResult.error;
    if (signoffsResult.error) throw signoffsResult.error;

    const signoffs = signoffsResult.data || [];
    const signedRoles = new Set(signoffs.map((row) => row.signoff_role));
    const sameActorRoles = signoffs
      .filter((row) => row.signed_by && row.signed_by === access.user?.id)
      .map((row) => row.signoff_role);

    if (Number(openNotesResult.count || 0) > 0) {
      return jsonError("Resolve all open review points before reviewer or partner clearance", 409);
    }
    if (!signedRoles.has("PREPARER")) {
      return jsonError("Preparer sign-off is required before reviewer clearance", 409);
    }
    if (signoffRole === "PARTNER" && !signedRoles.has("REVIEWER")) {
      return jsonError("Reviewer sign-off is required before partner clearance", 409);
    }
    if (sameActorRoles.length) {
      return jsonError(
        `Segregation of duties blocks the same user from signing ${sameActorRoles.join(", ")} and ${signoffRole}`,
        409,
      );
    }

    const { data: signoff, error: signoffError } = await supabaseAdmin
      .from("finance_review_signoffs")
      .upsert({
        organization_id: run.organization_id,
        review_item_id: reviewItem.id,
        signoff_role: signoffRole,
        signed_by: access.user.id,
        signed_at: new Date().toISOString(),
        note: clean(body.note) || null,
        metadata: {
          source: "accounting_work_program",
          accounting_firm_id: access.organizationId,
          run_id: run.id,
          work_item_id: workItem.id,
        },
      }, { onConflict: "review_item_id,signoff_role" })
      .select("*")
      .single();
    if (signoffError) throw signoffError;

    const nextStatus = signoffRole === "REVIEWER" ? "REVIEWED" : "CLEARED";
    const { data: updatedReview, error: updateError } = await supabaseAdmin
      .from("finance_review_items")
      .update({
        status: nextStatus,
        reviewer_id: signoffRole === "REVIEWER" ? access.user.id : reviewItem.reviewer_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", reviewItem.id)
      .eq("organization_id", run.organization_id)
      .select("*")
      .single();
    if (updateError) throw updateError;

    await audit(
      access,
      signoffRole === "REVIEWER" ? "ACCOUNTING_REVIEWER_SIGNOFF" : "ACCOUNTING_PARTNER_CLEARANCE",
      updatedReview,
      workItem,
      { signoff_role: signoffRole, review_status: nextStatus },
    );

    return NextResponse.json({
      success: true,
      signoff,
      review_item: updatedReview,
      work_item_id: workItem.id,
      run_id: run.id,
    });
  } catch (error) {
    const message = error?.message || "Unable to record governed Finance review sign-off";
    return jsonError(message, /permission denied/i.test(message) ? 403 : 500);
  }
}
