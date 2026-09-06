export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { fetchCompleteFinancePopulation } from "@/lib/finance/data/fetchCompleteFinancePopulation";
import { buildFinanceReviewerEvidence } from "@/lib/finance/practice/FinanceReviewerEvidenceRuntime";
import { evaluateFinanceReviewEvidenceFreshness } from "@/lib/finance/practice/FinanceReviewEvidenceFreshness";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const FRESHNESS_CONCURRENCY = 4;
const MAX_SIGNED_REVIEWS_PER_SCAN = 250;

function clean(value) {
  return String(value ?? "").trim();
}

function jsonError(message, status = 400, details = undefined) {
  return NextResponse.json({ success: false, error: message, ...(details ? { details } : {}) }, { status });
}

async function mapWithConcurrency(rows, limit, mapper) {
  const results = new Array(rows.length);
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(rows[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), rows.length || 1) }, worker));
  return results;
}

async function loadNames(organizationIds) {
  const ids = [...new Set(organizationIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await supabaseAdmin.from("organizations").select("id,name").in("id", ids);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.id, row.name || "Client organization"]));
}

async function loadReviewerAssignments(accountingFirmId, organizationIds) {
  const ids = [...new Set(organizationIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from("accounting_client_profiles")
    .select("organization_id,assigned_reviewer_id,assigned_reviewer_name,assigned_partner_id,assigned_partner_name")
    .eq("accounting_firm_id", accountingFirmId)
    .in("organization_id", ids);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.organization_id, row]));
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = clean(searchParams.get("organizationId") || searchParams.get("organization_id"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const runPopulation = await fetchCompleteFinancePopulation({
      label: "Finance review freshness active runs",
      buildQuery: (from, to) => supabaseAdmin
        .from("accounting_engagement_runs")
        .select("id,organization_id,entity_id,period_id,engagement_id,status,due_at,locked_at,updated_at")
        .eq("accounting_firm_id", access.organizationId)
        .is("locked_at", null)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    });
    const runIds = runPopulation.rows.map((row) => row.id).filter(Boolean);
    if (!runIds.length) {
      return NextResponse.json({ success: true, exceptions: [], scanned: 0, integrity: { complete: true, source: "LIVE_SIGNED_REVIEW_FRESHNESS" } });
    }

    const workPopulation = await fetchCompleteFinancePopulation({
      label: "Finance signed reviewer workpapers",
      buildQuery: (from, to) => supabaseAdmin
        .from("accounting_engagement_work_items")
        .select("id,run_id,organization_id,entity_id,title,finance_review_item_id,status,completed_at,updated_at")
        .eq("accounting_firm_id", access.organizationId)
        .in("run_id", runIds)
        .not("finance_review_item_id", "is", null)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    });
    const reviewItemIds = [...new Set(workPopulation.rows.map((row) => row.finance_review_item_id).filter(Boolean))];
    if (!reviewItemIds.length) {
      return NextResponse.json({ success: true, exceptions: [], scanned: 0, integrity: { complete: true, source: "LIVE_SIGNED_REVIEW_FRESHNESS" } });
    }

    const { data: reviewerSignoffs, error: signoffError } = await supabaseAdmin
      .from("finance_review_signoffs")
      .select("id,review_item_id,signoff_role,signed_by,signed_at,metadata,revoked_at")
      .in("review_item_id", reviewItemIds)
      .eq("signoff_role", "REVIEWER")
      .is("revoked_at", null);
    if (signoffError) throw signoffError;
    const signoffByReview = new Map((reviewerSignoffs || []).map((row) => [row.review_item_id, row]));
    const candidates = workPopulation.rows.filter((row) => signoffByReview.has(row.finance_review_item_id));

    if (candidates.length > MAX_SIGNED_REVIEWS_PER_SCAN) {
      return jsonError(
        "Signed-review freshness population exceeds the interactive scan boundary",
        503,
        { signed_reviews: candidates.length, maximum: MAX_SIGNED_REVIEWS_PER_SCAN, complete: false },
      );
    }

    const runById = new Map(runPopulation.rows.map((row) => [row.id, row]));
    const clientIds = candidates.map((row) => row.organization_id).filter(Boolean);
    const [names, assignments] = await Promise.all([
      loadNames(clientIds),
      loadReviewerAssignments(access.organizationId, clientIds),
    ]);

    const evaluated = await mapWithConcurrency(candidates, FRESHNESS_CONCURRENCY, async (workItem) => {
      const signoff = signoffByReview.get(workItem.finance_review_item_id) || null;
      const evidence = await buildFinanceReviewerEvidence({
        accountingFirmId: access.organizationId,
        runId: workItem.run_id,
        workItemId: workItem.id,
      });
      const freshness = evaluateFinanceReviewEvidenceFreshness({ evidence, reviewerSignoff: signoff });
      const run = runById.get(workItem.run_id) || {};
      const assignment = assignments.get(workItem.organization_id) || {};
      return {
        id: workItem.finance_review_item_id,
        work_item_id: workItem.id,
        run_id: workItem.run_id,
        organization_id: workItem.organization_id,
        entity_id: workItem.entity_id || run.entity_id || null,
        period_id: run.period_id || null,
        client_name: names.get(workItem.organization_id) || "Client organization",
        title: workItem.title || "Finance review",
        work_status: workItem.status || null,
        run_status: run.status || null,
        due_at: run.due_at || null,
        reviewer_id: assignment.assigned_reviewer_id || null,
        reviewer_name: assignment.assigned_reviewer_name || null,
        partner_id: assignment.assigned_partner_id || null,
        partner_name: assignment.assigned_partner_name || null,
        signed_at: signoff?.signed_at || null,
        freshness_state: freshness.state,
        trusted: freshness.trusted === true,
        reason: freshness.reason,
        changed_sections: freshness.changed_sections || [],
        changed_labels: freshness.changed_labels || [],
        review_href: `/workspace/${access.organizationId}/finance/review`,
      };
    });

    const exceptions = evaluated
      .filter((row) => row.trusted !== true)
      .sort((a, b) => {
        const rank = (value) => value === "STALE" ? 0 : 1;
        return rank(a.freshness_state) - rank(b.freshness_state)
          || String(a.due_at || "9999-12-31").localeCompare(String(b.due_at || "9999-12-31"))
          || a.client_name.localeCompare(b.client_name)
          || a.title.localeCompare(b.title);
      });

    return NextResponse.json({
      success: true,
      exceptions,
      scanned: evaluated.length,
      stale: exceptions.filter((row) => row.freshness_state === "STALE").length,
      unproven: exceptions.filter((row) => row.freshness_state === "UNPROVEN").length,
      integrity: {
        complete: runPopulation.complete !== false && workPopulation.complete !== false,
        source: "LIVE_SIGNED_REVIEW_FRESHNESS",
        maximum_interactive_signed_reviews: MAX_SIGNED_REVIEWS_PER_SCAN,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error?.message || "Unable to evaluate signed Finance review freshness";
    const status = /permission denied/i.test(message) ? 403 : /completeness boundary|scan boundary|silently truncated/i.test(message) ? 503 : 500;
    return jsonError(message, status);
  }
}
