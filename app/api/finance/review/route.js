export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const REVIEW_STATUSES = new Set([
  "OPEN",
  "IN_PREPARATION",
  "READY_FOR_REVIEW",
  "CHANGES_REQUESTED",
  "REVIEWED",
  "CLEARED",
  "LOCKED",
]);

const REVIEW_ROLES = new Set(["PREPARER", "REVIEWER", "PARTNER"]);
const NOTE_TYPES = new Set(["REVIEW", "QUERY", "TODO", "RESOLUTION"]);
const MANAGE_PERMISSIONS = [
  "finance.accounting.manage",
  "finance.receivables.manage",
  "finance.payables.manage",
  "finance.banking.manage",
  "finance.tax.manage",
  "finance.reports.manage",
  "finance.configuration.manage",
  "finance.close.execute",
];

function jsonError(message, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

async function requireView(access) {
  await checkFinancePermission({
    organizationId: access.organizationId,
    userId: access.user?.id,
    permissionKey: "finance.view",
    fullAccess: access.permissions?.includes("*") === true,
  });
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
  throw lastError || new Error("Finance review permission denied");
}

async function findReviewItem({ organizationId, capabilityId, recordKey, periodId }) {
  let query = supabaseAdmin
    .from("finance_review_items")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("capability_id", capabilityId)
    .eq("record_key", recordKey);

  if (periodId) query = query.eq("period_id", periodId);
  else query = query.is("period_id", null);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

async function audit({ access, action, entityId, beforeData = null, afterData = null, metadata = {} }) {
  try {
    await supabaseAdmin.from("organization_audit_logs").insert({
      organization_id: access.organizationId,
      entity_type: "finance_review",
      entity_id: String(entityId || ""),
      action,
      before_data: beforeData,
      after_data: afterData,
      metadata,
      actor_email: access.user?.email || null,
    });
  } catch (error) {
    console.warn("FINANCE_REVIEW_AUDIT_WRITE_FAILED", error?.message || error);
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId") || searchParams.get("organization_id");
    const capabilityId = searchParams.get("capabilityId") || searchParams.get("capability_id");
    const recordKey = searchParams.get("recordKey") || searchParams.get("record_key");
    const entityId = searchParams.get("entityId") || searchParams.get("entity_id");
    const periodId = searchParams.get("periodId") || searchParams.get("period_id");

    if (!capabilityId) return jsonError("capabilityId required");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status);
    await requireView(access);

    const savedViewsPromise = supabaseAdmin
      .from("finance_saved_views")
      .select("id,name,configuration,is_default,updated_at")
      .eq("organization_id", access.organizationId)
      .eq("user_id", access.user.id)
      .eq("capability_id", capabilityId)
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false });

    let reviewItem = null;
    let notes = [];
    let signoffs = [];
    let documents = [];
    let auditEvents = [];

    if (recordKey) {
      reviewItem = await findReviewItem({
        organizationId: access.organizationId,
        capabilityId,
        recordKey,
        periodId,
      });

      if (reviewItem) {
        const [notesResult, signoffsResult] = await Promise.all([
          supabaseAdmin
            .from("finance_review_notes")
            .select("*")
            .eq("organization_id", access.organizationId)
            .eq("review_item_id", reviewItem.id)
            .order("created_at", { ascending: false }),
          supabaseAdmin
            .from("finance_review_signoffs")
            .select("*")
            .eq("organization_id", access.organizationId)
            .eq("review_item_id", reviewItem.id)
            .order("signed_at", { ascending: false }),
        ]);
        if (notesResult.error) throw notesResult.error;
        if (signoffsResult.error) throw signoffsResult.error;
        notes = notesResult.data || [];
        signoffs = signoffsResult.data || [];
      }

      const auditQuery = supabaseAdmin
        .from("organization_audit_logs")
        .select("id,entity_type,entity_id,action,before_data,after_data,metadata,actor_email,created_at")
        .eq("organization_id", access.organizationId)
        .eq("entity_id", String(reviewItem?.id || recordKey))
        .order("created_at", { ascending: false })
        .limit(50);

      const documentQuery = isUuid(recordKey)
        ? supabaseAdmin
            .from("organization_documents")
            .select("id,file_name,mime_type,status,approval_required,approved_at,created_at,file_url,destination_module,destination_record_id")
            .eq("organization_id", access.organizationId)
            .eq("destination_record_id", recordKey)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [], error: null });

      const [auditResult, documentResult] = await Promise.all([auditQuery, documentQuery]);
      if (auditResult.error) throw auditResult.error;
      if (documentResult.error) throw documentResult.error;
      auditEvents = auditResult.data || [];
      documents = documentResult.data || [];
    }

    const savedViewsResult = await savedViewsPromise;
    if (savedViewsResult.error) throw savedViewsResult.error;

    return NextResponse.json({
      success: true,
      review_item: reviewItem,
      notes,
      signoffs,
      documents,
      audit_events: auditEvents,
      saved_views: savedViewsResult.data || [],
      context: {
        organization_id: access.organizationId,
        entity_id: entityId || null,
        period_id: periodId || null,
        capability_id: capabilityId,
        record_key: recordKey || null,
      },
    });
  } catch (error) {
    const message = error?.message || "Unable to load Finance review evidence";
    return jsonError(message, /permission denied/i.test(message) ? 403 : 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organizationId || body.organization_id;
    const capabilityId = String(body.capabilityId || body.capability_id || "").trim();
    const recordKey = String(body.recordKey || body.record_key || "").trim();
    const action = String(body.action || "").trim().toLowerCase();
    const entityId = body.entityId || body.entity_id || null;
    const periodId = body.periodId || body.period_id || null;

    if (!capabilityId) return jsonError("capabilityId required");
    if (!action) return jsonError("action required");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status);

    if (["save_view", "delete_view"].includes(action)) await requireView(access);
    else await requireManage(access);

    if (action === "save_view") {
      const name = String(body.name || "").trim();
      if (!name) return jsonError("View name required");
      const configuration = body.configuration && typeof body.configuration === "object"
        ? body.configuration
        : {};
      if (body.is_default === true) {
        await supabaseAdmin
          .from("finance_saved_views")
          .update({ is_default: false, updated_at: new Date().toISOString() })
          .eq("organization_id", access.organizationId)
          .eq("user_id", access.user.id)
          .eq("capability_id", capabilityId);
      }
      const { data, error } = await supabaseAdmin
        .from("finance_saved_views")
        .upsert({
          organization_id: access.organizationId,
          user_id: access.user.id,
          capability_id: capabilityId,
          name,
          configuration,
          is_default: body.is_default === true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "organization_id,user_id,capability_id,name" })
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, saved_view: data });
    }

    if (action === "delete_view") {
      const viewId = body.view_id || body.viewId;
      if (!viewId) return jsonError("viewId required");
      const { error } = await supabaseAdmin
        .from("finance_saved_views")
        .delete()
        .eq("id", viewId)
        .eq("organization_id", access.organizationId)
        .eq("user_id", access.user.id)
        .eq("capability_id", capabilityId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (!recordKey) return jsonError("recordKey required");

    let reviewItem = await findReviewItem({
      organizationId: access.organizationId,
      capabilityId,
      recordKey,
      periodId,
    });

    if (!reviewItem) {
      const { data, error } = await supabaseAdmin
        .from("finance_review_items")
        .insert({
          organization_id: access.organizationId,
          entity_id: entityId,
          period_id: periodId,
          capability_id: capabilityId,
          record_key: recordKey,
          record_type: body.record_type || body.recordType || null,
          record_label: body.record_label || body.recordLabel || null,
          status: "OPEN",
          priority: body.priority || "NORMAL",
          preparer_id: access.user.id,
          created_by: access.user.id,
          metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
        })
        .select("*")
        .single();
      if (error) throw error;
      reviewItem = data;
      await audit({ access, action: "FINANCE_REVIEW_CREATED", entityId: reviewItem.id, afterData: reviewItem, metadata: { capability_id: capabilityId, record_key: recordKey } });
    }

    if (action === "ensure_review") {
      return NextResponse.json({ success: true, review_item: reviewItem });
    }

    if (action === "set_status") {
      const nextStatus = String(body.status || "").trim().toUpperCase();
      if (!REVIEW_STATUSES.has(nextStatus)) return jsonError("Invalid review status");
      const before = reviewItem;
      const { data, error } = await supabaseAdmin
        .from("finance_review_items")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", reviewItem.id)
        .eq("organization_id", access.organizationId)
        .select("*")
        .single();
      if (error) throw error;
      await audit({ access, action: "FINANCE_REVIEW_STATUS_CHANGED", entityId: reviewItem.id, beforeData: before, afterData: data, metadata: { capability_id: capabilityId, record_key: recordKey } });
      return NextResponse.json({ success: true, review_item: data });
    }

    if (action === "add_note") {
      const noteType = String(body.note_type || body.noteType || "REVIEW").trim().toUpperCase();
      const noteBody = String(body.body || "").trim();
      if (!NOTE_TYPES.has(noteType)) return jsonError("Invalid review note type");
      if (!noteBody) return jsonError("Review note required");
      const { data, error } = await supabaseAdmin
        .from("finance_review_notes")
        .insert({
          organization_id: access.organizationId,
          review_item_id: reviewItem.id,
          note_type: noteType,
          body: noteBody,
          assigned_to: body.assigned_to || body.assignedTo || null,
          created_by: access.user.id,
        })
        .select("*")
        .single();
      if (error) throw error;
      await audit({ access, action: "FINANCE_REVIEW_NOTE_ADDED", entityId: reviewItem.id, afterData: data, metadata: { capability_id: capabilityId, record_key: recordKey } });
      return NextResponse.json({ success: true, note: data });
    }

    if (action === "resolve_note") {
      const noteId = body.note_id || body.noteId;
      if (!noteId) return jsonError("noteId required");
      const { data, error } = await supabaseAdmin
        .from("finance_review_notes")
        .update({
          status: "RESOLVED",
          resolved_by: access.user.id,
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", noteId)
        .eq("review_item_id", reviewItem.id)
        .eq("organization_id", access.organizationId)
        .select("*")
        .single();
      if (error) throw error;
      await audit({ access, action: "FINANCE_REVIEW_NOTE_RESOLVED", entityId: reviewItem.id, afterData: data, metadata: { capability_id: capabilityId, record_key: recordKey } });
      return NextResponse.json({ success: true, note: data });
    }

    if (action === "signoff") {
      const signoffRole = String(body.signoff_role || body.signoffRole || "").trim().toUpperCase();
      if (!REVIEW_ROLES.has(signoffRole)) return jsonError("Invalid sign-off role");

      const [openNotesResult, signoffsResult] = await Promise.all([
        supabaseAdmin
          .from("finance_review_notes")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", access.organizationId)
          .eq("review_item_id", reviewItem.id)
          .neq("status", "RESOLVED"),
        supabaseAdmin
          .from("finance_review_signoffs")
          .select("signoff_role")
          .eq("organization_id", access.organizationId)
          .eq("review_item_id", reviewItem.id),
      ]);
      if (openNotesResult.error) throw openNotesResult.error;
      if (signoffsResult.error) throw signoffsResult.error;

      const signedRoles = new Set((signoffsResult.data || []).map((row) => row.signoff_role));
      if (signoffRole === "REVIEWER" && !signedRoles.has("PREPARER")) {
        return jsonError("Preparer sign-off is required before reviewer sign-off", 409);
      }
      if (signoffRole === "PARTNER" && !signedRoles.has("REVIEWER")) {
        return jsonError("Reviewer sign-off is required before partner clearance", 409);
      }
      if (["REVIEWER", "PARTNER"].includes(signoffRole) && Number(openNotesResult.count || 0) > 0) {
        return jsonError("Resolve all open review points before final review clearance", 409);
      }

      const { data, error } = await supabaseAdmin
        .from("finance_review_signoffs")
        .upsert({
          organization_id: access.organizationId,
          review_item_id: reviewItem.id,
          signoff_role: signoffRole,
          signed_by: access.user.id,
          signed_at: new Date().toISOString(),
          note: body.note || null,
          metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
        }, { onConflict: "review_item_id,signoff_role" })
        .select("*")
        .single();
      if (error) throw error;

      const nextStatus = signoffRole === "PREPARER"
        ? "READY_FOR_REVIEW"
        : signoffRole === "REVIEWER"
          ? "REVIEWED"
          : "CLEARED";
      const { data: updatedItem, error: updateError } = await supabaseAdmin
        .from("finance_review_items")
        .update({
          status: nextStatus,
          preparer_id: signoffRole === "PREPARER" ? access.user.id : reviewItem.preparer_id,
          reviewer_id: signoffRole === "REVIEWER" ? access.user.id : reviewItem.reviewer_id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", reviewItem.id)
        .eq("organization_id", access.organizationId)
        .select("*")
        .single();
      if (updateError) throw updateError;
      await audit({ access, action: `FINANCE_${signoffRole}_SIGNOFF`, entityId: reviewItem.id, afterData: data, metadata: { capability_id: capabilityId, record_key: recordKey, review_status: nextStatus } });
      return NextResponse.json({ success: true, signoff: data, review_item: updatedItem });
    }

    return jsonError("Unsupported Finance review action");
  } catch (error) {
    const message = error?.message || "Finance review action failed";
    return jsonError(message, /permission denied/i.test(message) ? 403 : 500);
  }
}
