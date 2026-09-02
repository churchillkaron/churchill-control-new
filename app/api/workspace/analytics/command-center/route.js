export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import {
  ANALYTICS_METRICS,
  ANALYTICS_METRIC_CATALOG_VERSION,
  analyticsMetricHref,
} from "@/lib/analytics/semantic/AnalyticsMetricCatalog";
import { computeAnalyticsMetric } from "@/lib/analytics/runtime/AnalyticsMetricRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  return String(value ?? "").trim();
}

async function safeSource(name, task, fallback = []) {
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
    console.error("ANALYTICS_COMMAND_CENTER_SOURCE_FAILED", { source: name, error });
    return {
      name,
      status: "error",
      data: fallback,
      error: error?.message || "Source unavailable",
      durationMs: Date.now() - startedAt,
    };
  }
}

function scopedControlQuery(query, entityId) {
  return entityId
    ? query.or(`entity_id.eq.${entityId},entity_id.is.null`)
    : query.is("entity_id", null);
}

function chooseScopedRows(rows, entityId, key) {
  const selected = new Map();
  for (const row of rows || []) {
    const id = row?.[key];
    if (!id) continue;
    const current = selected.get(id);
    if (!current) {
      selected.set(id, row);
      continue;
    }
    const rowIsEntity = Boolean(entityId && row.entity_id === entityId);
    const currentIsEntity = Boolean(entityId && current.entity_id === entityId);
    if (rowIsEntity && !currentIsEntity) selected.set(id, row);
  }
  return selected;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(
      url.searchParams.get("organizationId") ||
        url.searchParams.get("organization_id"),
    );
    const entityId = clean(
      url.searchParams.get("entityId") || url.searchParams.get("entity_id"),
    );
    const periodId = clean(
      url.searchParams.get("periodId") || url.searchParams.get("period_id"),
    );

    const access = await requireOrganizationAccess({ organizationId, request });
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

    const resolvedEntityId = context.entityId || null;

    const metricSettlements = await Promise.all(
      ANALYTICS_METRICS.map(async (definition) => {
        const startedAt = Date.now();
        try {
          const metric = await computeAnalyticsMetric({
            organizationId: context.organizationId,
            entityId: resolvedEntityId,
            currency: context.currency || null,
            metricId: definition.id,
          });
          return {
            success: true,
            metric: {
              ...metric,
              status:
                metric.mixedCurrency ||
                ((definition.id === "operations.work.overdue" ||
                  definition.id === "supply.inventory.alerts.open" ||
                  definition.id === "people.attendance.late_minutes_30d") &&
                  Number(metric.value || 0) > 0)
                  ? "attention"
                  : "ready",
              href: analyticsMetricHref({
                organizationId: context.organizationId,
                metric: definition,
              }),
            },
            durationMs: Date.now() - startedAt,
          };
        } catch (error) {
          console.error("ANALYTICS_METRIC_FAILED", {
            metricId: definition.id,
            error,
          });
          return {
            success: false,
            metric: {
              ...definition,
              value: null,
              currency: null,
              valuesByCurrency: null,
              mixedCurrency: false,
              evidenceCount: 0,
              watermark: null,
              status: "error",
              error: error?.message || "Metric calculation failed",
              href: analyticsMetricHref({
                organizationId: context.organizationId,
                metric: definition,
              }),
            },
            durationMs: Date.now() - startedAt,
          };
        }
      }),
    );

    const [
      configurationsSource,
      alertRulesSource,
      alertsSource,
      snapshotsSource,
      forecastsSource,
      savedViewsSource,
      followsSource,
    ] = await Promise.all([
      safeSource("analytics_metric_configurations", async () => {
        let query = supabaseAdmin
          .from("analytics_metric_configurations")
          .select("id,entity_id,metric_id,display_name,enabled,target_value,target_direction,warning_threshold,critical_threshold,lower_bound,upper_bound,owner_staff_id,tags,metadata,updated_at")
          .eq("organization_id", context.organizationId);
        query = scopedControlQuery(query, resolvedEntityId);
        const { data, error } = await query.limit(500);
        if (error) throw error;
        return data || [];
      }),
      safeSource("analytics_metric_alert_rules", async () => {
        let query = supabaseAdmin
          .from("analytics_metric_alert_rules")
          .select("id,entity_id,metric_id,name,condition_type,threshold_value,threshold_upper,comparison_period,active,notification_channels,cooldown_minutes,updated_at")
          .eq("organization_id", context.organizationId);
        query = scopedControlQuery(query, resolvedEntityId);
        const { data, error } = await query
          .order("updated_at", { ascending: false })
          .limit(500);
        if (error) throw error;
        return data || [];
      }),
      safeSource("analytics_metric_alert_events", async () => {
        let query = supabaseAdmin
          .from("analytics_metric_alert_events")
          .select("id,entity_id,rule_id,metric_id,status,observed_value,comparison_value,threshold_value,triggered_at,acknowledged_at,resolved_at,evidence")
          .eq("organization_id", context.organizationId)
          .in("status", ["OPEN", "ACKNOWLEDGED"]);
        query = scopedControlQuery(query, resolvedEntityId);
        const { data, error } = await query
          .order("triggered_at", { ascending: false })
          .limit(250);
        if (error) throw error;
        return data || [];
      }),
      safeSource("analytics_metric_snapshots", async () => {
        let query = supabaseAdmin
          .from("analytics_metric_snapshots")
          .select("entity_id,metric_id,snapshot_date,value,unit,currency_code,metric_status,source_watermark,evidence,created_at")
          .eq("organization_id", context.organizationId);
        query = scopedControlQuery(query, resolvedEntityId);
        const { data, error } = await query
          .order("snapshot_date", { ascending: false })
          .limit(2500);
        if (error) throw error;
        return data || [];
      }),
      safeSource("analytics_forecast_runs", async () => {
        let query = supabaseAdmin
          .from("analytics_forecast_runs")
          .select("entity_id,metric_id,method,as_of_date,forecast_date,predicted_value,lower_bound,upper_bound,actual_value,model_version,evidence,created_at")
          .eq("organization_id", context.organizationId);
        query = scopedControlQuery(query, resolvedEntityId);
        const { data, error } = await query
          .order("as_of_date", { ascending: false })
          .order("forecast_date", { ascending: true })
          .limit(2500);
        if (error) throw error;
        return data || [];
      }),
      safeSource("analytics_saved_views", async () => {
        let query = supabaseAdmin
          .from("analytics_saved_views")
          .select("id,entity_id,staff_account_id,name,view_type,definition,is_default,is_shared,updated_at")
          .eq("organization_id", context.organizationId);
        query = scopedControlQuery(query, resolvedEntityId);
        const { data, error } = await query
          .order("updated_at", { ascending: false })
          .limit(250);
        if (error) throw error;
        return data || [];
      }),
      safeSource("analytics_metric_follows", async () => {
        let query = supabaseAdmin
          .from("analytics_metric_follows")
          .select("id,entity_id,staff_account_id,metric_id,favorite,alerts_enabled,updated_at")
          .eq("organization_id", context.organizationId);
        query = scopedControlQuery(query, resolvedEntityId);
        const { data, error } = await query
          .order("favorite", { ascending: false })
          .limit(1000);
        if (error) throw error;
        return data || [];
      }),
    ]);

    const configurationByMetric = chooseScopedRows(
      configurationsSource.data,
      resolvedEntityId,
      "metric_id",
    );

    const metrics = metricSettlements
      .map((settlement) => {
        const configuration = configurationByMetric.get(settlement.metric.id) || null;
        return {
          ...settlement.metric,
          label: configuration?.display_name || settlement.metric.label,
          configuration,
          calculationDurationMs: settlement.durationMs,
        };
      })
      .filter((metric) => metric.configuration?.enabled !== false);

    const attention = metrics
      .filter(
        (metric) =>
          metric.status === "attention" ||
          metric.status === "error" ||
          metric.mixedCurrency,
      )
      .map((metric) => ({
        type:
          metric.status === "error"
            ? "source"
            : metric.mixedCurrency
              ? "currency"
              : "metric",
        metricId: metric.id,
        label: metric.label,
        detail:
          metric.status === "error"
            ? metric.error
            : metric.mixedCurrency
              ? "Multiple currencies are present; values are intentionally not combined."
              : metric.description,
        href: metric.href,
      }));

    const domainSourceState = new Map();
    for (const settlement of metricSettlements) {
      for (const table of settlement.metric.sourceTables || []) {
        const current = domainSourceState.get(table);
        const next = {
          name: table,
          status: settlement.success ? "connected" : "error",
          error: settlement.success ? null : settlement.metric.error,
          rowCount: settlement.metric.evidenceCount || 0,
          durationMs: settlement.durationMs,
          watermark: settlement.metric.watermark || null,
        };
        if (!current || current.status === "connected") domainSourceState.set(table, next);
      }
    }

    const controlSources = [
      configurationsSource,
      alertRulesSource,
      alertsSource,
      snapshotsSource,
      forecastsSource,
      savedViewsSource,
      followsSource,
    ].map(({ data, ...entry }) => ({
      ...entry,
      rowCount: Array.isArray(data) ? data.length : data ? 1 : 0,
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
        timezone: context.timezone || null,
      },
      metrics,
      attention,
      alertRules: alertRulesSource.data || [],
      alerts: alertsSource.data || [],
      snapshots: snapshotsSource.data || [],
      forecasts: forecastsSource.data || [],
      savedViews: savedViewsSource.data || [],
      follows: followsSource.data || [],
      sources: [...domainSourceState.values(), ...controlSources],
    });
  } catch (error) {
    console.error("ANALYTICS_COMMAND_CENTER_FAILED", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Analytics workspace failed",
      },
      { status: 500 },
    );
  }
}
