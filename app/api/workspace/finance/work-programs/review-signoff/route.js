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

async function audit(access, action, reviewItemId, workItem, metadata = {}) {
  const { error } = await supabaseAdmin.from("organization_audit_logs").insert({
    organization_id: access.organizationId,
    entity_type: "finance_review",
    entity_id: String(reviewItemId),
    action,
    before_data: null,
    after_data: { review_item_id: reviewItemId, work_item_id: workItem.id },
    metadata: { run_id: workItem.run_id, ...metadata },
    actor_email: access.user?.email || null,
  });
  if (error) throw error;
}

async function scopedReviewItems(run) {
  let query = supabaseAdmin
    .from("finance_review_items")
    .select("*")
    .eq("organization_id", run.organization_id);
  query = run.entity_id ? query.eq("entity_id", run.entity_id) : query.is("entity_id", null);
  query = run.period_id ? query.eq("period_id", run.period_id) : query.is("period_id", null);
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(2000);
  if (error) throw error;
  return data || [];
}

async function loadReviewControl(reviewItemIds, organizationId) {
  if (!reviewItemIds.length) return { openNotes: 0, signoffs: [] };
  const [openNotesResult, signoffsResult] = await Promise.all([
    supabaseAdmin
      .from("finance_review_notes")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("review_item_id", reviewItemIds)
      .neq("status", "RESOLVED"),
    supabaseAdmin
      .from("finance_review_signoffs")
      .select("review_item_id,signoff_role,signed_by")
      .eq("organization_id", organizationId)
      .in("review_item_id", reviewItemIds)
      .is("revoked_at", null),
  ]);
  if (openNotesResult.error) throw openNotesResult.error;
  if (signoffsResult.error) throw signoffsResult.error;
  return {
    openNotes: Number(openNotesResult.count || 0),
    signoffs: signoffsResult.data || [],
  };
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

    if (signoffRole === "REVIEWER") {
      if (!workItem.finance_review_item_id) return jsonError("This work item has no governed Finance review record", 409);
      const { data: reviewItem, error: reviewError } = await supabaseAdmin
        .from("finance_review_items")
        .select("*")
        .eq("id", workItem.finance_review_item_id)
        .eq("organization_id", run.organization_id)
        .maybeSingle();
      if (reviewError) throw reviewError;
      if (!reviewItem) return jsonError("Finance review record not found", 404);

      const control = await loadReviewControl([reviewItem.id], run.organization_id);
      const signedRoles = new Set(control.signoffs.map((row) => row.signoff_role));
      const sameActorRoles = control.signoffs
        .filter((row) => row.signed_by && row.signed_by === access.user?.id)
        .map((row) => row.signoff_role);
      if (control.openNotes > 0) return jsonError("Resolve all open review points before reviewer clearance", 409);
      if (!signedRoles.has("PREPARER")) return jsonError("Preparer sign-off is required before reviewer clearance", 409);
      if (sameActorRoles.length) {
        return jsonError(`Segregation of duties blocks the same user from signing ${sameActorRoles.join(", ")} and REVIEWER`, 409);
      }

      const { data: signoff, error: signoffError } = await supabaseAdmin
        .from("finance_review_signoffs")
        .upsert({
          organization_id: run.organization_id,
          review_item_id: reviewItem.id,
          signoff_role: "REVIEWER",
          signed_by: access.user.id,
          signed_at: new Date().toISOString(),
          note: clean(body.note) || null,
          metadata: { source: "accounting_work_program", accounting_firm_id: access.organizationId, run_id: run.id, work_item_id: workItem.id },
        }, { onConflict: "review_item_id,signoff_role" })
        .select("*")
        .single();
      if (signoffError) throw signoffError;

      const { data: updatedReview, error: updateError } = await supabaseAdmin
        .from("finance_review_items")
        .update({ status: "REVIEWED", reviewer_id: access.user.id, updated_at: new Date().toISOString() })
        .eq("id", reviewItem.id)
        .eq("organization_id", run.organization_id)
        .select("*")
        .single();
      if (updateError) throw updateError;
      await audit(access, "ACCOUNTING_REVIEWER_SIGNOFF", updatedReview.id, workItem, { signoff_role: "REVIEWER", review_status: "REVIEWED" });
      return NextResponse.json({ success: true, signoff, review_item: updatedReview, work_item_id: workItem.id, run_id: run.id });
    }

    const reviewItems = await scopedReviewItems(run);
    if (!reviewItems.length) return jsonError("No Finance review records exist in this accounting scope", 409);
    const reviewItemIds = reviewItems.map((row) => row.id);
    const control = await loadReviewControl(reviewItemIds, run.organization_id);
    if (control.openNotes > 0) return jsonError("Resolve all open review points before partner clearance", 409);

    const signoffsByReview = new Map();
    for (const signoff of control.signoffs) {
      if (!signoffsByReview.has(signoff.review_item_id)) signoffsByReview.set(signoff.review_item_id, []);
      signoffsByReview.get(signoff.review_item_id).push(signoff);
    }

    const blockers = [];
    for (const reviewItem of reviewItems) {
      const itemSignoffs = signoffsByReview.get(reviewItem.id) || [];
      const roles = new Set(itemSignoffs.map((row) => row.signoff_role));
      const actorRoles = itemSignoffs.filter((row) => row.signed_by === access.user?.id).map((row) => row.signoff_role);
      if (reviewItem.status !== "REVIEWED") blockers.push({ review_item_id: reviewItem.id, record_label: reviewItem.record_label, reason: `Status is ${reviewItem.status}` });
      if (!roles.has("PREPARER")) blockers.push({ review_item_id: reviewItem.id, record_label: reviewItem.record_label, reason: "Preparer sign-off missing" });
      if (!roles.has("REVIEWER")) blockers.push({ review_item_id: reviewItem.id, record_label: reviewItem.record_label, reason: "Reviewer sign-off missing" });
      if (actorRoles.length) blockers.push({ review_item_id: reviewItem.id, record_label: reviewItem.record_label, reason: `Segregation of duties: partner already signed ${actorRoles.join(", ")}` });
    }
    if (blockers.length) return jsonError("Engagement is not ready for partner clearance", 409, blockers.slice(0, 100));

    const now = new Date().toISOString();
    const signoffRows = reviewItems.map((reviewItem) => ({
      organization_id: run.organization_id,
      review_item_id: reviewItem.id,
      signoff_role: "PARTNER",
      signed_by: access.user.id,
      signed_at: now,
      note: clean(body.note) || null,
      metadata: { source: "accounting_work_program_portfolio_clearance", accounting_firm_id: access.organizationId, run_id: run.id, work_item_id: workItem.id },
    }));
    const { data: partnerSignoffs, error: partnerSignoffError } = await supabaseAdmin
      .from("finance_review_signoffs")
      .upsert(signoffRows, { onConflict: "review_item_id,signoff_role" })
      .select("*");
    if (partnerSignoffError) throw partnerSignoffError;

    const { data: clearedReviews, error: clearError } = await supabaseAdmin
      .from("finance_review_items")
      .update({ status: "CLEARED", updated_at: now })
      .eq("organization_id", run.organization_id)
      .in("id", reviewItemIds)
      .select("id,status,record_label");
    if (clearError) throw clearError;

    await audit(access, "ACCOUNTING_PARTNER_PORTFOLIO_CLEARANCE", reviewItemIds[0], workItem, {
      signoff_role: "PARTNER",
      review_status: "CLEARED",
      review_item_count: reviewItemIds.length,
    });

    return NextResponse.json({
      success: true,
      signoffs: partnerSignoffs || [],
      review_items: clearedReviews || [],
      cleared_count: reviewItemIds.length,
      work_item_id: workItem.id,
      run_id: run.id,
    });
  } catch (error) {
    const message = error?.message || "Unable to record governed Finance review sign-off";
    return jsonError(message, /permission denied/i.test(message) ? 403 : 500);
  }
}
