export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { fetchCompleteFinancePopulation } from "@/lib/finance/data/fetchCompleteFinancePopulation";
import {
  buildFinanceClosePackageSnapshot,
  evaluateFinanceClosePackageFreshness,
} from "@/lib/finance/period-close/runtime/FinanceClosePackageFreshness";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const FRESHNESS_CONCURRENCY = 3;
const MAX_CLOSE_PACKAGES_PER_SCAN = 80;
const RECENT_CLOSE_WINDOW_DAYS = 450;
const FINAL_CLOSE_STATUSES = new Set(["closed", "complete", "completed", "success", "succeeded", "locked"]);

function clean(value) {
  return String(value ?? "").trim();
}

function normalizedStatus(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_");
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

function latestCloseRuns(rows) {
  const latest = new Map();
  for (const row of rows || []) {
    if (!row?.organization_id || !row?.entity_id || !row?.period_id) continue;
    if (!row.closed_at && !FINAL_CLOSE_STATUSES.has(normalizedStatus(row.status))) continue;
    const key = `${row.organization_id}:${row.entity_id}:${row.period_id}`;
    const current = latest.get(key);
    const rowDate = row.closed_at || row.created_at || "";
    const currentDate = current?.closed_at || current?.created_at || "";
    if (!current || String(rowDate) > String(currentDate)) latest.set(key, row);
  }
  return [...latest.values()].sort((left, right) =>
    String(right.closed_at || right.created_at || "").localeCompare(String(left.closed_at || left.created_at || "")),
  );
}

async function loadOrganizationNames(organizationIds) {
  if (!organizationIds.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id,name")
    .in("id", organizationIds);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.id, row.name || "Client organization"]));
}

async function loadPeriods(periodIds) {
  if (!periodIds.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from("accounting_periods")
    .select("id,organization_id,entity_id,start_date,end_date,status,closed_at")
    .in("id", periodIds);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.id, row]));
}

function unproven(error) {
  return {
    state: "UNPROVEN",
    trusted: false,
    reason: "Current accounting truth could not be completely rebuilt for this closed package.",
    changed_sections: [],
    changed_labels: [],
    control_error: error?.message || "Close-package evidence rebuild failed",
  };
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

    const profilePopulation = await fetchCompleteFinancePopulation({
      label: "Finance close freshness accounting-firm clients",
      buildQuery: (from, to) => supabaseAdmin
        .from("accounting_client_profiles")
        .select("organization_id,assigned_accountant_id,assigned_accountant_name,assigned_reviewer_id,assigned_reviewer_name,assigned_partner_id,assigned_partner_name")
        .eq("accounting_firm_id", access.organizationId)
        .order("organization_id", { ascending: true })
        .range(from, to),
    });
    const clientIds = [...new Set(profilePopulation.rows.map((row) => row.organization_id).filter(Boolean))];
    if (!clientIds.length) {
      return NextResponse.json({
        success: true,
        exceptions: [],
        scanned: 0,
        integrity: { complete: true, source: "LIVE_CLOSE_PACKAGE_FRESHNESS", recent_window_days: RECENT_CLOSE_WINDOW_DAYS },
      });
    }

    const windowStart = new Date(Date.now() - RECENT_CLOSE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const closePopulation = await fetchCompleteFinancePopulation({
      label: "Finance recent governed close-package population",
      buildQuery: (from, to) => supabaseAdmin
        .from("finance_period_close_runs")
        .select("id,organization_id,entity_id,period_id,close_type,status,result,closed_by,closed_at,created_at,updated_at")
        .in("organization_id", clientIds)
        .gte("created_at", windowStart)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    });

    const candidates = latestCloseRuns(closePopulation.rows);
    if (candidates.length > MAX_CLOSE_PACKAGES_PER_SCAN) {
      return jsonError(
        "Closed-package freshness population exceeds the interactive scan boundary",
        503,
        {
          closed_packages: candidates.length,
          maximum: MAX_CLOSE_PACKAGES_PER_SCAN,
          recent_window_days: RECENT_CLOSE_WINDOW_DAYS,
          complete: false,
        },
      );
    }

    const candidateClientIds = [...new Set(candidates.map((row) => row.organization_id).filter(Boolean))];
    const periodIds = [...new Set(candidates.map((row) => row.period_id).filter(Boolean))];
    const profileByClient = new Map(profilePopulation.rows.map((row) => [row.organization_id, row]));
    const [names, periods] = await Promise.all([
      loadOrganizationNames(candidateClientIds),
      loadPeriods(periodIds),
    ]);

    const evaluated = await mapWithConcurrency(candidates, FRESHNESS_CONCURRENCY, async (closeRun) => {
      let freshness;
      try {
        const snapshot = await buildFinanceClosePackageSnapshot({
          organizationId: closeRun.organization_id,
          entityId: closeRun.entity_id,
          periodId: closeRun.period_id,
        });
        freshness = evaluateFinanceClosePackageFreshness({ snapshot, closeRun });
      } catch (error) {
        freshness = unproven(error);
      }

      const period = periods.get(closeRun.period_id) || {};
      const assignment = profileByClient.get(closeRun.organization_id) || {};
      const params = new URLSearchParams({
        entityId: closeRun.entity_id,
        periodId: closeRun.period_id,
        source: "accounting-firm-close-freshness",
      });

      return {
        id: closeRun.id,
        organization_id: closeRun.organization_id,
        entity_id: closeRun.entity_id,
        period_id: closeRun.period_id,
        client_name: names.get(closeRun.organization_id) || "Client organization",
        close_type: closeRun.close_type || null,
        close_status: closeRun.status || null,
        closed_at: closeRun.closed_at || null,
        period_start: period.start_date || null,
        period_end: period.end_date || null,
        period_status: period.status || null,
        accountant_id: assignment.assigned_accountant_id || null,
        accountant_name: assignment.assigned_accountant_name || null,
        reviewer_id: assignment.assigned_reviewer_id || null,
        reviewer_name: assignment.assigned_reviewer_name || null,
        partner_id: assignment.assigned_partner_id || null,
        partner_name: assignment.assigned_partner_name || null,
        freshness_state: freshness.state || "UNPROVEN",
        trusted: freshness.trusted === true,
        reason: freshness.reason || null,
        changed_sections: freshness.changed_sections || [],
        changed_labels: freshness.changed_labels || [],
        control_error: freshness.control_error || null,
        close_href: `/workspace/${closeRun.organization_id}/finance/close?${params.toString()}`,
      };
    });

    const exceptions = evaluated
      .filter((row) => row.trusted !== true)
      .sort((left, right) => {
        const rank = (state) => state === "STALE" ? 0 : 1;
        return rank(left.freshness_state) - rank(right.freshness_state)
          || String(right.period_end || "").localeCompare(String(left.period_end || ""))
          || left.client_name.localeCompare(right.client_name);
      });

    return NextResponse.json({
      success: true,
      exceptions,
      scanned: evaluated.length,
      stale: exceptions.filter((row) => row.freshness_state === "STALE").length,
      unproven: exceptions.filter((row) => row.freshness_state === "UNPROVEN").length,
      integrity: {
        complete: profilePopulation.complete !== false && closePopulation.complete !== false,
        source: "LIVE_CLOSE_PACKAGE_FRESHNESS",
        recent_window_days: RECENT_CLOSE_WINDOW_DAYS,
        maximum_interactive_close_packages: MAX_CLOSE_PACKAGES_PER_SCAN,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error?.message || "Unable to evaluate closed Finance package freshness";
    const status = /permission denied|authentication|membership/i.test(message)
      ? 403
      : /completeness boundary|scan boundary|silently truncated/i.test(message)
        ? 503
        : 500;
    return jsonError(message, status);
  }
}
