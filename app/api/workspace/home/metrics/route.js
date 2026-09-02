export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import { generateProfitAndLoss } from "@/lib/finance/reporting/reports/generateProfitAndLoss";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) {
  return String(value ?? "").trim();
}

function nextDay(dateValue) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function metric(value, source, extra = {}) {
  return {
    value: Number.isFinite(Number(value)) ? Number(value) : 0,
    status: "connected",
    source,
    ...extra,
  };
}

function failedMetric(source, error) {
  return {
    value: null,
    status: "error",
    source,
    error: text(error?.message || error) || "Data source unavailable",
  };
}

async function runMetric(source, task) {
  try {
    return await task();
  } catch (error) {
    console.error("HOME_BUSINESS_METRIC_FAILED", { source, error });
    return failedMetric(source, error);
  }
}

function applyEntity(query, entityId) {
  return entityId ? query.eq("entity_id", entityId) : query;
}

function applyPeriodDates(query, { startDate, endDate }) {
  if (!startDate || !endDate) return query;
  const exclusiveEnd = nextDay(endDate);
  if (!exclusiveEnd) return query;
  return query
    .gte("created_at", `${startDate}T00:00:00.000Z`)
    .lt("created_at", `${exclusiveEnd}T00:00:00.000Z`);
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(
      url.searchParams.get("organizationId") ||
        url.searchParams.get("organization_id"),
    );
    const entityId = text(
      url.searchParams.get("entityId") || url.searchParams.get("entity_id"),
    );
    const periodId = text(
      url.searchParams.get("periodId") || url.searchParams.get("period_id"),
    );

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }

    const context = await resolveBusinessContext({
      organizationId: access.organizationId,
      entityId: entityId || null,
      periodId: periodId || null,
      request,
      access,
    });

    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error },
        { status: context.status || 400 },
      );
    }

    const startDate = context.period?.start_date || null;
    const endDate = context.period?.end_date || null;
    const resolvedEntityId = context.entityId || null;

    const [revenue, orders, approvals, inventoryAlerts] = await Promise.all([
      runMetric("posted_general_ledger", async () => {
        if (!resolvedEntityId || !startDate || !endDate) {
          return failedMetric(
            "posted_general_ledger",
            new Error("Legal entity and accounting period are required"),
          );
        }

        const report = await generateProfitAndLoss({
          organizationId: context.organizationId,
          entityId: resolvedEntityId,
          startDate,
          endDate,
        });

        return metric(report.revenue, "posted_general_ledger", {
          basis: report.basis,
        });
      }),
      runMetric("sales_orders", async () => {
        let query = supabaseAdmin
          .from("sales_orders")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", context.organizationId);
        query = applyEntity(query, resolvedEntityId);
        query = applyPeriodDates(query, { startDate, endDate });
        const { count, error } = await query;
        if (error) throw error;
        return metric(count || 0, "sales_orders");
      }),
      runMetric("approval_requests", async () => {
        const { count, error } = await supabaseAdmin
          .from("approval_requests")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", context.organizationId)
          .eq("status", "pending");
        if (error) throw error;
        return metric(count || 0, "approval_requests");
      }),
      runMetric("inventory_alerts", async () => {
        let query = supabaseAdmin
          .from("inventory_alerts")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", context.organizationId)
          .eq("resolved", false);
        query = applyEntity(query, resolvedEntityId);
        const { count, error } = await query;
        if (error) throw error;
        return metric(count || 0, "inventory_alerts");
      }),
    ]);

    return NextResponse.json({
      success: true,
      context: {
        organization_id: context.organizationId,
        entity_id: resolvedEntityId,
        period_id: context.periodId || null,
        period_start: startDate,
        period_end: endDate,
        currency: context.currency || null,
      },
      metrics: {
        revenue,
        orders,
        approvals,
        inventory_alerts: inventoryAlerts,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("HOME_BUSINESS_METRICS_FAILED", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load Home business metrics",
      },
      { status: 500 },
    );
  }
}
