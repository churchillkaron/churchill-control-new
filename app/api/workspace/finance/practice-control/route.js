export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ACTIVE_ENGAGEMENT_STATUSES = ["active", "ACTIVE", "enabled", "ENABLED"];
const OPEN_REVIEW_STATUSES = ["OPEN", "IN_PREPARATION", "READY_FOR_REVIEW", "CHANGES_REQUESTED", "REVIEWED"];

function clean(value) {
  return String(value ?? "").trim();
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : null;
}

function earliestDate(values) {
  return values.filter(Boolean).map(dateOnly).sort()[0] || null;
}

function isOverdue(value, today) {
  const date = dateOnly(value);
  return Boolean(date && today && date < today);
}

async function requireFinanceView(access) {
  await checkFinancePermission({
    organizationId: access.organizationId,
    userId: access.user?.id,
    permissionKey: "finance.view",
    fullAccess: access.permissions?.includes("*") === true,
  });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(
      url.searchParams.get("organizationId") || url.searchParams.get("organization_id"),
    );

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }
    await requireFinanceView(access);

    const { data: engagements, error: engagementError } = await supabaseAdmin
      .from("accounting_engagements")
      .select("id, organization_id, service_package, status, renewal_date, year_end_date, bookkeeping_enabled, vat_enabled, payroll_enabled, tax_enabled, reporting_enabled, audit_enabled")
      .eq("accounting_firm_id", access.organizationId)
      .in("status", ACTIVE_ENGAGEMENT_STATUSES)
      .order("created_at", { ascending: true })
      .limit(500);
    if (engagementError) throw engagementError;

    const clientIds = [...new Set((engagements || []).map((row) => row.organization_id).filter(Boolean))];
    if (!clientIds.length) {
      return NextResponse.json({
        success: true,
        summary: { active_clients: 0, attention: 0, ready_for_review: 0, overdue: 0, open_review_points: 0 },
        clients: [],
        generated_at: new Date().toISOString(),
      });
    }

    const [organizationsResult, profilesResult, reviewsResult] = await Promise.all([
      supabaseAdmin.from("organizations").select("id,name").in("id", clientIds),
      supabaseAdmin
        .from("accounting_client_profiles")
        .select("organization_id, assigned_accountant_id, assigned_accountant_name, assigned_reviewer_id, assigned_reviewer_name, status")
        .eq("accounting_firm_id", access.organizationId)
        .in("organization_id", clientIds),
      supabaseAdmin
        .from("finance_review_items")
        .select("id, organization_id, entity_id, period_id, capability_id, record_key, record_label, status, priority, due_at, preparer_id, reviewer_id, updated_at")
        .in("organization_id", clientIds)
        .in("status", OPEN_REVIEW_STATUSES)
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("updated_at", { ascending: false })
        .limit(5000),
    ]);

    if (organizationsResult.error) throw organizationsResult.error;
    if (profilesResult.error) throw profilesResult.error;
    if (reviewsResult.error) throw reviewsResult.error;

    const reviews = reviewsResult.data || [];
    const reviewIds = reviews.map((row) => row.id).filter(Boolean);
    let notes = [];
    if (reviewIds.length) {
      const { data, error } = await supabaseAdmin
        .from("finance_review_notes")
        .select("id, review_item_id, status, assigned_to, created_at")
        .in("review_item_id", reviewIds)
        .neq("status", "RESOLVED")
        .limit(5000);
      if (error) throw error;
      notes = data || [];
    }

    const organizationMap = new Map((organizationsResult.data || []).map((row) => [row.id, row]));
    const profileMap = new Map((profilesResult.data || []).map((row) => [row.organization_id, row]));
    const reviewsByClient = new Map();
    for (const review of reviews) {
      if (!reviewsByClient.has(review.organization_id)) reviewsByClient.set(review.organization_id, []);
      reviewsByClient.get(review.organization_id).push(review);
    }
    const openPointsByReview = new Map();
    for (const note of notes) {
      openPointsByReview.set(note.review_item_id, (openPointsByReview.get(note.review_item_id) || 0) + 1);
    }

    const today = new Date().toISOString().slice(0, 10);
    const clients = (engagements || []).map((engagement) => {
      const organization = organizationMap.get(engagement.organization_id) || {};
      const profile = profileMap.get(engagement.organization_id) || {};
      const clientReviews = reviewsByClient.get(engagement.organization_id) || [];
      const ready = clientReviews.filter((row) => row.status === "READY_FOR_REVIEW").length;
      const changesRequested = clientReviews.filter((row) => row.status === "CHANGES_REQUESTED").length;
      const inPreparation = clientReviews.filter((row) => ["OPEN", "IN_PREPARATION"].includes(row.status)).length;
      const reviewedPendingPartner = clientReviews.filter((row) => row.status === "REVIEWED").length;
      const overdue = clientReviews.filter((row) => isOverdue(row.due_at, today)).length;
      const openReviewPoints = clientReviews.reduce(
        (total, row) => total + (openPointsByReview.get(row.id) || 0),
        0,
      );
      const nextDeadline = earliestDate([
        ...clientReviews.map((row) => row.due_at),
        engagement.year_end_date,
        engagement.renewal_date,
      ]);
      const attention = overdue > 0 || changesRequested > 0 || openReviewPoints > 0;

      return {
        organization_id: engagement.organization_id,
        name: organization.name || "Client organization",
        service_package: engagement.service_package || null,
        assigned_accountant: profile.assigned_accountant_name || null,
        assigned_reviewer: profile.assigned_reviewer_name || null,
        year_end_date: engagement.year_end_date || null,
        renewal_date: engagement.renewal_date || null,
        next_deadline: nextDeadline,
        workload: {
          open: clientReviews.length,
          in_preparation: inPreparation,
          ready_for_review: ready,
          changes_requested: changesRequested,
          reviewed_pending_partner: reviewedPendingPartner,
          overdue,
          open_review_points: openReviewPoints,
        },
        attention,
        status: attention ? "ATTENTION" : ready > 0 || reviewedPendingPartner > 0 ? "REVIEW" : clientReviews.length ? "IN_PROGRESS" : "CLEAR",
      };
    });

    clients.sort((a, b) => {
      const rank = { ATTENTION: 0, REVIEW: 1, IN_PROGRESS: 2, CLEAR: 3 };
      return (rank[a.status] ?? 9) - (rank[b.status] ?? 9) ||
        String(a.next_deadline || "9999-12-31").localeCompare(String(b.next_deadline || "9999-12-31")) ||
        a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      success: true,
      summary: {
        active_clients: clients.length,
        attention: clients.filter((client) => client.status === "ATTENTION").length,
        ready_for_review: clients.reduce((total, client) => total + client.workload.ready_for_review, 0),
        partner_clearance: clients.reduce((total, client) => total + client.workload.reviewed_pending_partner, 0),
        overdue: clients.reduce((total, client) => total + client.workload.overdue, 0),
        open_review_points: clients.reduce((total, client) => total + client.workload.open_review_points, 0),
      },
      clients,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("FINANCE_PRACTICE_CONTROL_FAILED", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load Finance practice control" },
      { status: /permission denied/i.test(error?.message || "") ? 403 : 500 },
    );
  }
}
