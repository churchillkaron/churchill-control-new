export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import {
  ANALYTICS_METRICS,
  ANALYTICS_METRIC_CATALOG_VERSION,
  analyticsMetricHref,
} from "@/lib/analytics/semantic/AnalyticsMetricCatalog";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TERMINAL = new Set([
  "complete",
  "completed",
  "closed",
  "cancelled",
  "canceled",
  "rejected",
  "void",
  "voided",
  "done",
  "archived",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function number(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function terminal(value) {
  return TERMINAL.has(normalized(value));
}

function latestIso(rows, fields = ["updated_at", "created_at"]) {
  let latest = null;
  for (const row of rows || []) {
    for (const field of fields) {
      const value = row?.[field];
      if (!value) continue;
      const time = new Date(value).getTime();
      if (!Number.isFinite(time)) continue;
      if (!latest || time > latest.time) latest = { time, value };
    }
  }
  return latest?.value || null;
}

function applyEntity(query, entityId) {
  return entityId ? query.eq("entity_id", entityId) : query;
}

function currencyBreakdown(rows, amountField, currencyField, fallbackCurrency = null) {
  const totals = new Map();
  for (const row of rows || []) {
    const code = clean(row?.[currencyField] || fallbackCurrency || "UNSPECIFIED").toUpperCase();
    totals.set(code, (totals.get(code) || 0) + number(row?.[amountField]));
  }
  return [...totals.entries()]
    .map(([currency, value]) => ({ currency, value }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

function monetaryValue(rows, amountField, currencyField, contextCurrency = null) {
  const breakdown = currencyBreakdown(rows, amountField, currencyField, contextCurrency);
  const preferred = clean(contextCurrency).toUpperCase();
  const preferredRow = breakdown.find((entry) => entry.currency === preferred);
  return {
    value: breakdown.length === 1 ? breakdown[0].value : preferredRow?.value ?? null,
    currency: breakdown.length === 1 ? breakdown[0].currency : preferredRow?.currency || null,
    valuesByCurrency: breakdown,
    mixedCurrency: breakdown.length > 1,
  };
}

async function source(name, task, fallback = []) {
  const startedAt = Date.now();
  try {
    const data = await task();
    return {
      name,
      status: "connected",
      data: data ?? fallback,
      error: null,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    console.error("ANALYTICS_SOURCE_FAILED", { source: name, error });
    return {
      name,
      status: "error",
      data: fallback,
      error: error?.message || "Source unavailable",
      durationMs: Date.now() - startedAt,
    };
  }
}

function metricDefinition(id) {
  return ANALYTICS_METRICS.find((metric) => metric.id === id);
}

function metricResult({ id, value, currency = null, valuesByCurrency = null, mixedCurrency = false, evidenceCount = 0, watermark = null, status = "ready", detail = null, organizationId }) {
  const definition = metricDefinition(id);
  return {
    ...definition,
    value,
    currency,
    valuesByCurrency,
    mixedCurrency,
    evidenceCount,
    watermark,
    status,
    detail,
    href: analyticsMetricHref({ organizationId, metric: definition }),
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const entityId = clean(url.searchParams.get("entityId") || url.searchParams.get("entity_id"));
    const periodId = clean(url.searchParams.get("periodId") || url.searchParams.get("period_id"));

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 });
    }

    const context = await resolveBusinessContext({
      organizationId: access.organizationId,
      entityId: entityId || null,
      periodId: periodId || null,
      request,
      access,
    });
    if (!context.success) {
      return NextResponse.json({ success: false, error: context.error }, { status: context.status || 400 });
    }

    const resolvedEntityId = context.entityId || null;
    const today = new Date();
    const todayIso = today.toISOString();
    const trailing30 = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);

    const [
      customerInvoicesSource,
      vendorInvoicesSource,
      salesOrdersSource,
      quotationsSource,
      operationsSource,
      valuationSource,
      inventoryAlertsSource,
      attendanceSource,
      projectsSource,
      configurationsSource,
      alertsSource,
      snapshotsSource,
      forecastsSource,
    ] = await Promise.all([
      source("customer_invoices", async () => {
        let query = supabaseAdmin.from("customer_invoices")
          .select("id,outstanding_amount,outstanding_balance,status,currency_code,due_date,invoice_date,created_at,updated_at")
          .eq("organization_id", context.organizationId);
        query = applyEntity(query, resolvedEntityId);
        const { data, error } = await query.limit(5000);
        if (error) throw error;
        return data || [];
      }),
      source("vendor_invoices", async () => {
        let query = supabaseAdmin.from("vendor_invoices")
          .select("id,outstanding_amount,status,currency_code,due_date,invoice_date,created_at,updated_at")
          .eq("organization_id", context.organizationId);
        query = applyEntity(query, resolvedEntityId);
        const { data, error } = await query.limit(5000);
        if (error) throw error;
        return data || [];
      }),
      source("sales_orders", async () => {
        let query = supabaseAdmin.from("sales_orders")
          .select("id,status,payment_status,fulfillment_status,total_amount,paid_amount,remaining_balance,currency_code,created_at,updated_at")
          .eq("organization_id", context.organizationId);
        query = applyEntity(query, resolvedEntityId);
        const { data, error } = await query.limit(5000);
        if (error) throw error;
        return data || [];
      }),
      source("commercial_quotations", async () => {
        let query = supabaseAdmin.from("commercial_quotations")
          .select("id,status,total_amount,currency_code,valid_until,created_at,updated_at")
          .eq("organization_id", context.organizationId);
        query = applyEntity(query, resolvedEntityId);
        const { data, error } = await query.limit(5000);
        if (error) throw error;
        return data || [];
      }),
      source("operations_records", async () => {
        let query = supabaseAdmin.from("operations_records")
          .select("id,status,priority,due_at,completed_at,created_at,updated_at")
          .eq("organization_id", context.organizationId);
        query = applyEntity(query, resolvedEntityId);
        const { data, error } = await query.limit(5000);
        if (error) throw error;
        return data || [];
      }),
      source("inventory_valuation_snapshots", async () => {
        let query = supabaseAdmin.from("inventory_valuation_snapshots")
          .select("id,item_id,snapshot_date,inventory_value,created_at")
          .eq("organization_id", context.organizationId);
        query = applyEntity(query, resolvedEntityId);
        const { data, error } = await query.order("snapshot_date", { ascending: false }).limit(10000);
        if (error) throw error;
        return data || [];
      }),
      source("inventory_alerts", async () => {
        let query = supabaseAdmin.from("inventory_alerts")
          .select("id,resolved,alert_type,created_at,resolved_at")
          .eq("organization_id", context.organizationId);
        query = applyEntity(query, resolvedEntityId);
        const { data, error } = await query.limit(5000);
        if (error) throw error;
        return data || [];
      }),
      source("staff_attendance", async () => {
        let query = supabaseAdmin.from("staff_attendance")
          .select("id,shift_date,late_minutes,attendance_status,created_at")
          .eq("organization_id", context.organizationId)
          .gte("shift_date", trailing30);
        query = applyEntity(query, resolvedEntityId);
        const { data, error } = await query.limit(10000);
        if (error) throw error;
        return data || [];
      }),
      source("projects", async () => {
        let query = supabaseAdmin.from("projects")
          .select("id,status,start_date,end_date,created_at,updated_at")
          .eq("organization_id", context.organizationId);
        query = applyEntity(query, resolvedEntityId);
        const { data, error } = await query.limit(5000);
        if (error) throw error;
        return data || [];
      }),
      source("analytics_metric_configurations", async () => {
        let query = supabaseAdmin.from("analytics_metric_configurations")
          .select("metric_id,display_name,enabled,target_value,target_direction,warning_threshold,critical_threshold,lower_bound,upper_bound,tags,metadata,updated_at")
          .eq("organization_id", context.organizationId);
        query = resolvedEntityId ? query.or(`entity_id.eq.${resolvedEntityId},entity_id.is.null`) : query.is("entity_id", null);
        const { data, error } = await query.limit(500);
        if (error) throw error;
        return data || [];
      }),
      source("analytics_metric_alert_events", async () => {
        let query = supabaseAdmin.from("analytics_metric_alert_events")
          .select("id,metric_id,status,observed_value,threshold_value,triggered_at,evidence")
          .eq("organization_id", context.organizationId)
          .in("status", ["OPEN", "ACKNOWLEDGED"]);
        query = resolvedEntityId ? query.or(`entity_id.eq.${resolvedEntityId},entity_id.is.null`) : query.is("entity_id", null);
        const { data, error } = await query.order("triggered_at", { ascending: false }).limit(100);
        if (error) throw error;
        return data || [];
      }),
      source("analytics_metric_snapshots", async () => {
        let query = supabaseAdmin.from("analytics_metric_snapshots")
          .select("metric_id,snapshot_date,value,unit,currency_code,metric_status,source_watermark,created_at")
          .eq("organization_id", context.organizationId);
        query = resolvedEntityId ? query.or(`entity_id.eq.${resolvedEntityId},entity_id.is.null`) : query.is("entity_id", null);
        const { data, error } = await query.order("snapshot_date", { ascending: false }).limit(1000);
        if (error) throw error;
        return data || [];
      }),
      source("analytics_forecast_runs", async () => {
        let query = supabaseAdmin.from("analytics_forecast_runs")
          .select("metric_id,method,as_of_date,forecast_date,predicted_value,lower_bound,upper_bound,actual_value,model_version,created_at")
          .eq("organization_id", context.organizationId);
        query = resolvedEntityId ? query.or(`entity_id.eq.${resolvedEntityId},entity_id.is.null`) : query.is("entity_id", null);
        const { data, error } = await query.order("as_of_date", { ascending: false }).limit(500);
        if (error) throw error;
        return data || [];
      }),
    ]);

    const customerInvoices = customerInvoicesSource.data || [];
    const vendorInvoices = vendorInvoicesSource.data || [];
    const salesOrders = salesOrdersSource.data || [];
    const quotations = quotationsSource.data || [];
    const operations = operationsSource.data || [];
    const valuations = valuationSource.data || [];
    const inventoryAlerts = inventoryAlertsSource.data || [];
    const attendance = attendanceSource.data || [];
    const projects = projectsSource.data || [];

    const openCustomerInvoices = customerInvoices
      .map((row) => ({ ...row, __amount: number(row.outstanding_amount || row.outstanding_balance) }))
      .filter((row) => row.__amount > 0 && normalized(row.status) !== "cancelled" && normalized(row.status) !== "void");
    const arMoney = monetaryValue(openCustomerInvoices, "__amount", "currency_code", context.currency);

    const openVendorInvoices = vendorInvoices.filter((row) => number(row.outstanding_amount) > 0 && !terminal(row.status));
    const apMoney = monetaryValue(openVendorInvoices, "outstanding_amount", "currency_code", context.currency);

    const openOrders = salesOrders.filter((row) => !terminal(row.status) && number(row.remaining_balance) > 0);
    const orderMoney = monetaryValue(openOrders, "remaining_balance", "currency_code", context.currency);

    const openQuotes = quotations.filter((row) => !["converted", "rejected", "cancelled", "canceled", "closed", "expired"].includes(normalized(row.status)));
    const quoteMoney = monetaryValue(openQuotes, "total_amount", "currency_code", context.currency);

    const openOperations = operations.filter((row) => !terminal(row.status) && !row.completed_at);
    const overdueOperations = openOperations.filter((row) => row.due_at && new Date(row.due_at).getTime() < today.getTime());

    const latestValuationByItem = new Map();
    for (const row of valuations) {
      const itemId = row.item_id || row.id;
      if (!latestValuationByItem.has(itemId)) latestValuationByItem.set(itemId, row);
    }
    const latestValuations = [...latestValuationByItem.values()];
    const inventoryValue = latestValuations.reduce((total, row) => total + number(row.inventory_value), 0);
    const openInventoryAlerts = inventoryAlerts.filter((row) => row.resolved !== true);
    const lateMinutes = attendance.reduce((total, row) => total + Math.max(0, number(row.late_minutes)), 0);
    const activeProjects = projects.filter((row) => !terminal(row.status) && (!row.end_date || String(row.end_date) >= todayIso.slice(0, 10)));

    const metrics = [
      metricResult({ id: "finance.ar.outstanding", ...arMoney, evidenceCount: openCustomerInvoices.length, watermark: latestIso(customerInvoices), organizationId: context.organizationId }),
      metricResult({ id: "finance.ap.outstanding", ...apMoney, evidenceCount: openVendorInvoices.length, watermark: latestIso(vendorInvoices), organizationId: context.organizationId }),
      metricResult({ id: "commercial.orders.open_value", ...orderMoney, evidenceCount: openOrders.length, watermark: latestIso(salesOrders), organizationId: context.organizationId }),
      metricResult({ id: "commercial.quotations.pipeline", ...quoteMoney, evidenceCount: openQuotes.length, watermark: latestIso(quotations), organizationId: context.organizationId }),
      metricResult({ id: "operations.work.open", value: openOperations.length, evidenceCount: openOperations.length, watermark: latestIso(operations), organizationId: context.organizationId }),
      metricResult({ id: "operations.work.overdue", value: overdueOperations.length, evidenceCount: overdueOperations.length, watermark: latestIso(operations), status: overdueOperations.length ? "attention" : "ready", organizationId: context.organizationId }),
      metricResult({ id: "supply.inventory.value", value: inventoryValue, currency: context.currency || null, valuesByCurrency: context.currency ? [{ currency: context.currency, value: inventoryValue }] : null, evidenceCount: latestValuations.length, watermark: latestIso(valuations, ["snapshot_date", "created_at"]), organizationId: context.organizationId }),
      metricResult({ id: "supply.inventory.alerts.open", value: openInventoryAlerts.length, evidenceCount: openInventoryAlerts.length, watermark: latestIso(inventoryAlerts, ["created_at", "resolved_at"]), status: openInventoryAlerts.length ? "attention" : "ready", organizationId: context.organizationId }),
      metricResult({ id: "people.attendance.late_minutes_30d", value: lateMinutes, evidenceCount: attendance.length, watermark: latestIso(attendance, ["shift_date", "created_at"]), status: lateMinutes > 0 ? "attention" : "ready", organizationId: context.organizationId }),
      metricResult({ id: "projects.active", value: activeProjects.length, evidenceCount: activeProjects.length, watermark: latestIso(projects), organizationId: context.organizationId }),
    ];

    const configurationByMetric = new Map();
    for (const row of configurationsSource.data || []) {
      const current = configurationByMetric.get(row.metric_id);
      if (!current || (!current.entity_id && row.entity_id)) configurationByMetric.set(row.metric_id, row);
      else if (!current) configurationByMetric.set(row.metric_id, row);
    }

    const configuredMetrics = metrics
      .map((metric) => ({ ...metric, configuration: configurationByMetric.get(metric.id) || null }))
      .filter((metric) => metric.configuration?.enabled !== false);

    const sources = [
      customerInvoicesSource, vendorInvoicesSource, salesOrdersSource, quotationsSource,
      operationsSource, valuationSource, inventoryAlertsSource, attendanceSource, projectsSource,
      configurationsSource, alertsSource, snapshotsSource, forecastsSource,
    ].map(({ data, ...entry }) => ({ ...entry, rowCount: Array.isArray(data) ? data.length : data ? 1 : 0 }));

    const attention = configuredMetrics
      .filter((metric) => metric.status === "attention" || metric.mixedCurrency)
      .map((metric) => ({
        type: metric.mixedCurrency ? "currency" : "metric",
        metricId: metric.id,
        label: metric.label,
        detail: metric.mixedCurrency ? "Multiple currencies are present; values are intentionally not combined." : metric.description,
        href: metric.href,
      }));

    return NextResponse.json({
      success: true,
      ready: true,
      catalogVersion: ANALYTICS_METRIC_CATALOG_VERSION,
      generatedAt: new Date().toISOString(),
      context: {
        organization_id: context.organizationId,
        entity_id: resolvedEntityId,
        period_id: context.periodId || null,
        period_start: context.period?.start_date || null,
        period_end: context.period?.end_date || null,
        currency: context.currency || null,
        reporting_currency: context.reportingCurrency || null,
        timezone: context.timezone || null,
      },
      metrics: configuredMetrics,
      attention,
      alerts: alertsSource.data || [],
      snapshots: snapshotsSource.data || [],
      forecasts: forecastsSource.data || [],
      sources,
    });
  } catch (error) {
    console.error("ANALYTICS_COMMAND_CENTER_FAILED", error);
    return NextResponse.json({ success: false, error: error?.message || "Analytics workspace failed" }, { status: 500 });
  }
}
