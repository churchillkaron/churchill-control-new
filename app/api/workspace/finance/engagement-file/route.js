export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CLOSED_RUN_STATUSES = new Set(["COMPLETE", "CANCELLED"]);
const CLOSED_ITEM_STATUSES = new Set(["COMPLETE", "SKIPPED"]);
const CLOSED_REQUEST_STATUSES = new Set(["ACCEPTED", "CANCELLED"]);

function clean(value) {
  return String(value ?? "").trim();
}

function jsonError(message, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : null;
}

function isOverdue(value, today) {
  const date = dateOnly(value);
  return Boolean(date && date < today);
}

async function requireFinanceView(access) {
  await checkFinancePermission({
    organizationId: access.organizationId,
    userId: access.user?.id,
    permissionKey: "finance.view",
    fullAccess: access.permissions?.includes("*") === true,
  });
}

function currentCapacity(rows, staffId, today) {
  if (!staffId) return null;
  const candidates = (rows || [])
    .filter((row) => row.staff_account_id === staffId && row.status === "ACTIVE")
    .filter((row) => row.effective_from <= today && (!row.effective_to || row.effective_to >= today))
    .sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)));
  return candidates[0] || null;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = clean(searchParams.get("organizationId") || searchParams.get("organization_id"));
    const engagementId = clean(searchParams.get("engagementId") || searchParams.get("engagement_id"));
    if (!engagementId) return jsonError("engagementId is required");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireFinanceView(access);

    const { data: engagement, error: engagementError } = await supabaseAdmin
      .from("accounting_engagements")
      .select("*")
      .eq("id", engagementId)
      .eq("accounting_firm_id", access.organizationId)
      .maybeSingle();
    if (engagementError) throw engagementError;
    if (!engagement) return jsonError("Accounting engagement not found for this firm", 404);

    const [organizationResult, profileResult, entityResult, runsResult, reviewsResult, documentsResult, capacityResult] = await Promise.all([
      supabaseAdmin.from("organizations").select("id,name").eq("id", engagement.organization_id).maybeSingle(),
      supabaseAdmin
        .from("accounting_client_profiles")
        .select("organization_id,contact_name,contact_email,contact_phone,tax_id,vat_number,status,assigned_accountant_id,assigned_accountant_name,assigned_reviewer_id,assigned_reviewer_name,assigned_partner_id,assigned_partner_name")
        .eq("accounting_firm_id", access.organizationId)
        .eq("organization_id", engagement.organization_id)
        .maybeSingle(),
      engagement.entity_id
        ? supabaseAdmin.from("legal_entities").select("id,code,legal_name,display_name,tax_id,registration_number,country,currency,is_active,is_default_accounting_entity,timezone,locale").eq("id", engagement.entity_id).eq("organization_id", engagement.organization_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabaseAdmin
        .from("accounting_engagement_runs")
        .select("id,entity_id,engagement_id,template_id,period_id,run_key,cadence,status,start_at,due_at,completed_at,locked_at,completion_snapshot,rolled_from_run_id,metadata,created_at,updated_at")
        .eq("accounting_firm_id", access.organizationId)
        .eq("engagement_id", engagement.id)
        .order("created_at", { ascending: false })
        .limit(36),
      supabaseAdmin
        .from("finance_review_items")
        .select("id,entity_id,period_id,capability_id,record_key,record_type,record_label,status,priority,preparer_id,reviewer_id,due_at,metadata,created_at,updated_at")
        .eq("organization_id", engagement.organization_id)
        .order("updated_at", { ascending: false })
        .limit(500),
      supabaseAdmin
        .from("organization_documents")
        .select("id,file_url,file_name,mime_type,ai_module,ai_type,approval_required,financial_impact,status,destination_module,destination_record_id,approved_by,approved_at,created_at,updated_at")
        .eq("organization_id", engagement.organization_id)
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("accounting_practice_staff_capacity")
        .select("staff_account_id,display_name,primary_role,weekly_capacity_minutes,utilization_target,effective_from,effective_to,status")
        .eq("accounting_firm_id", access.organizationId)
        .eq("status", "ACTIVE")
        .order("effective_from", { ascending: false }),
    ]);

    for (const result of [organizationResult, profileResult, entityResult, runsResult, reviewsResult, documentsResult, capacityResult]) {
      if (result?.error) throw result.error;
    }

    const profile = profileResult.data || {};
    const runs = runsResult.data || [];
    const reviews = reviewsResult.data || [];
    const runIds = runs.map((row) => row.id);
    const templateIds = [...new Set(runs.map((row) => row.template_id).filter(Boolean))];
    const periodIds = [...new Set(runs.map((row) => row.period_id).filter(Boolean))];
    const reviewIds = reviews.map((row) => row.id);

    const [templatesResult, periodsResult, workItemsResult, requestsResult, notesResult, signoffsResult] = await Promise.all([
      templateIds.length
        ? supabaseAdmin.from("accounting_work_program_templates").select("id,template_key,name,service_key,cadence,version,is_system").in("id", templateIds)
        : Promise.resolve({ data: [], error: null }),
      periodIds.length
        ? supabaseAdmin.from("financial_periods").select("id,period_name,start_date,end_date,status,closed_at").in("id", periodIds)
        : Promise.resolve({ data: [], error: null }),
      runIds.length
        ? supabaseAdmin
            .from("accounting_engagement_work_items")
            .select("id,entity_id,run_id,template_step_id,step_key,sequence_no,title,description,work_type,required_role,assigned_to,status,start_at,due_at,completed_at,completed_by,blocked_reason,dependency_step_keys,capability_id,finance_review_item_id,evidence,conclusion,metadata,budget_minutes,scheduled_start_at,scheduled_end_at,updated_at")
            .eq("accounting_firm_id", access.organizationId)
            .in("run_id", runIds)
            .order("sequence_no", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      runIds.length
        ? supabaseAdmin
            .from("accounting_client_requests")
            .select("id,entity_id,run_id,work_item_id,title,instructions,status,due_at,sent_at,submitted_at,accepted_at,accepted_by,changes_requested_at,reminder_policy,client_response,metadata,updated_at")
            .eq("accounting_firm_id", access.organizationId)
            .in("run_id", runIds)
            .order("due_at", { ascending: true, nullsFirst: false })
        : Promise.resolve({ data: [], error: null }),
      reviewIds.length
        ? supabaseAdmin
            .from("finance_review_notes")
            .select("id,review_item_id,note_type,body,status,assigned_to,created_by,resolved_by,resolved_at,created_at,updated_at")
            .in("review_item_id", reviewIds)
            .order("created_at", { ascending: false })
            .limit(1000)
        : Promise.resolve({ data: [], error: null }),
      reviewIds.length
        ? supabaseAdmin
            .from("finance_review_signoffs")
            .select("id,review_item_id,signoff_role,signed_by,signed_at,note,cycle_no,revoked_at,revoked_by,revocation_reason")
            .in("review_item_id", reviewIds)
            .order("signed_at", { ascending: false })
            .limit(1000)
        : Promise.resolve({ data: [], error: null }),
    ]);

    for (const result of [templatesResult, periodsResult, workItemsResult, requestsResult, notesResult, signoffsResult]) {
      if (result?.error) throw result.error;
    }

    const templates = new Map((templatesResult.data || []).map((row) => [row.id, row]));
    const periods = new Map((periodsResult.data || []).map((row) => [row.id, row]));
    const items = workItemsResult.data || [];
    const requests = requestsResult.data || [];
    const notes = notesResult.data || [];
    const signoffs = signoffsResult.data || [];
    const documents = documentsResult.data || [];
    const today = new Date().toISOString().slice(0, 10);

    const notesByReview = new Map();
    for (const note of notes) {
      if (!notesByReview.has(note.review_item_id)) notesByReview.set(note.review_item_id, []);
      notesByReview.get(note.review_item_id).push(note);
    }
    const signoffsByReview = new Map();
    for (const signoff of signoffs) {
      if (!signoffsByReview.has(signoff.review_item_id)) signoffsByReview.set(signoff.review_item_id, []);
      signoffsByReview.get(signoff.review_item_id).push(signoff);
    }
    const reviewsById = new Map(reviews.map((row) => [row.id, row]));
    const itemsByRun = new Map();
    for (const item of items) {
      if (!itemsByRun.has(item.run_id)) itemsByRun.set(item.run_id, []);
      itemsByRun.get(item.run_id).push(item);
    }
    const requestsByRun = new Map();
    for (const clientRequest of requests) {
      if (!requestsByRun.has(clientRequest.run_id)) requestsByRun.set(clientRequest.run_id, []);
      requestsByRun.get(clientRequest.run_id).push(clientRequest);
    }

    const enrichedRuns = runs.map((run) => {
      const runItems = itemsByRun.get(run.id) || [];
      const runRequests = requestsByRun.get(run.id) || [];
      const complete = runItems.filter((item) => CLOSED_ITEM_STATUSES.has(item.status)).length;
      const openReviewPoints = runItems.reduce((total, item) => {
        if (!item.finance_review_item_id) return total;
        return total + (notesByReview.get(item.finance_review_item_id) || []).filter((note) => note.status !== "RESOLVED").length;
      }, 0);
      const verified = runItems.filter((item) => item.metadata?.system_gate?.applicable === true && item.metadata?.system_gate?.satisfied === true).length;
      const systemBlockers = runItems
        .filter((item) => item.metadata?.system_gate?.applicable === true && item.metadata?.system_gate?.satisfied === false)
        .flatMap((item) => (item.metadata?.system_gate?.blockers || []).map((blocker) => ({ work_item_id: item.id, title: item.title, blocker })));

      return {
        ...run,
        template: templates.get(run.template_id) || null,
        period: periods.get(run.period_id) || null,
        progress: {
          complete,
          total: runItems.length,
          percent: runItems.length ? Math.round((complete / runItems.length) * 100) : 0,
          budget_minutes: runItems.reduce((sum, item) => sum + Number(item.budget_minutes || 0), 0),
          open_review_points: openReviewPoints,
          system_verified_items: verified,
          system_blockers: systemBlockers.length,
          open_client_requests: runRequests.filter((row) => !CLOSED_REQUEST_STATUSES.has(row.status)).length,
        },
        work_items: runItems.map((item) => ({
          ...item,
          review: item.finance_review_item_id
            ? {
                ...(reviewsById.get(item.finance_review_item_id) || {}),
                notes: notesByReview.get(item.finance_review_item_id) || [],
                signoffs: signoffsByReview.get(item.finance_review_item_id) || [],
              }
            : null,
        })),
        client_requests: runRequests,
      };
    });

    const currentRun = enrichedRuns.find((run) => !CLOSED_RUN_STATUSES.has(run.status)) || enrichedRuns[0] || null;
    const currentReviewIds = new Set((currentRun?.work_items || []).map((item) => item.finance_review_item_id).filter(Boolean));
    const externalReviews = reviews
      .filter((review) => !currentReviewIds.has(review.id))
      .map((review) => ({ ...review, notes: notesByReview.get(review.id) || [], signoffs: signoffsByReview.get(review.id) || [] }));

    const financeDocuments = documents.filter((document) => {
      const module = String(document.destination_module || document.ai_module || "").toUpperCase();
      return module === "ACCOUNTING" || module === "FINANCE" || module === "REVIEW" || document.financial_impact === true;
    });

    const staffCapacity = capacityResult.data || [];
    const staff = {
      preparer: {
        id: profile.assigned_accountant_id || null,
        name: profile.assigned_accountant_name || null,
        capacity: currentCapacity(staffCapacity, profile.assigned_accountant_id, today),
      },
      reviewer: {
        id: profile.assigned_reviewer_id || null,
        name: profile.assigned_reviewer_name || null,
        capacity: currentCapacity(staffCapacity, profile.assigned_reviewer_id, today),
      },
      partner: {
        id: profile.assigned_partner_id || null,
        name: profile.assigned_partner_name || null,
        capacity: currentCapacity(staffCapacity, profile.assigned_partner_id, today),
      },
    };

    const openReviewPoints = notes.filter((note) => note.status !== "RESOLVED").length;
    const overdueWork = items.filter((item) => !CLOSED_ITEM_STATUSES.has(item.status) && isOverdue(item.due_at, today)).length;
    const overdueRequests = requests.filter((row) => !CLOSED_REQUEST_STATUSES.has(row.status) && isOverdue(row.due_at, today)).length;

    return NextResponse.json({
      success: true,
      engagement: {
        ...engagement,
        client: organizationResult.data || { id: engagement.organization_id, name: "Client organization" },
        profile,
        entity: entityResult.data || null,
        entity_required: !engagement.entity_id,
      },
      current_run: currentRun,
      history: enrichedRuns.filter((run) => run.id !== currentRun?.id),
      documents: financeDocuments,
      external_reviews: externalReviews,
      staff,
      summary: {
        runs: enrichedRuns.length,
        open_review_points: openReviewPoints,
        documents: financeDocuments.length,
        overdue_work: overdueWork,
        overdue_client_requests: overdueRequests,
        current_progress: currentRun?.progress?.percent || 0,
        current_budget_minutes: currentRun?.progress?.budget_minutes || 0,
        system_blockers: currentRun?.progress?.system_blockers || 0,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error?.message || "Unable to load accounting engagement file";
    console.error("FINANCE_ENGAGEMENT_FILE_FAILED", error);
    return jsonError(message, /permission denied/i.test(message) ? 403 : 500);
  }
}
