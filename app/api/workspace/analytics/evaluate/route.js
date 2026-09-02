export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import { ANALYTICS_METRICS, ANALYTICS_METRIC_CATALOG_VERSION } from "@/lib/analytics/semantic/AnalyticsMetricCatalog";
import { computeAnalyticsMetric } from "@/lib/analytics/runtime/AnalyticsMetricRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { localDateString } from "@/lib/shared/time/organizationTime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function conditionMatches(rule, observed, comparison = null) {
  const threshold = number(rule.threshold_value);
  const upper = number(rule.threshold_upper);
  const current = number(observed);
  const previous = number(comparison);
  if (current === null) return false;

  switch (rule.condition_type) {
    case "ABOVE": return threshold !== null && current > threshold;
    case "BELOW": return threshold !== null && current < threshold;
    case "OUTSIDE_RANGE": return threshold !== null && upper !== null && (current < threshold || current > upper);
    case "CHANGE_ABOVE": return threshold !== null && previous !== null && current - previous > threshold;
    case "CHANGE_BELOW": return threshold !== null && previous !== null && current - previous < threshold;
    case "OFF_TARGET": return threshold !== null && current !== threshold;
    default: return false;
  }
}

async function previousSnapshot({ organizationId, entityId, metricId, snapshotDate }) {
  let query = supabaseAdmin
    .from("analytics_metric_snapshots")
    .select("snapshot_date,value,currency_code,metric_status,source_watermark")
    .eq("organization_id", organizationId)
    .eq("metric_id", metricId)
    .lt("snapshot_date", snapshotDate);
  query = entityId ? query.eq("entity_id", entityId) : query.is("entity_id", null);
  const { data, error } = await query.order("snapshot_date", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function existingSnapshot({ organizationId, entityId, metricId, snapshotDate }) {
  let query = supabaseAdmin
    .from("analytics_metric_snapshots")
    .select("id,snapshot_date,value,currency_code,metric_status,source_watermark,evidence,created_at")
    .eq("organization_id", organizationId)
    .eq("metric_id", metricId)
    .eq("snapshot_date", snapshotDate);
  query = entityId ? query.eq("entity_id", entityId) : query.is("entity_id", null);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const entityId = clean(body.entityId || body.entity_id);
    const periodId = clean(body.periodId || body.period_id);

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

    const snapshotDate = localDateString(new Date(), context.timezone || "UTC");
    const computed = await Promise.all(
      ANALYTICS_METRICS.map((metric) => computeAnalyticsMetric({
        organizationId: context.organizationId,
        entityId: context.entityId || null,
        currency: context.currency || null,
        metricId: metric.id,
      }).catch((error) => ({
        ...metric,
        error: error?.message || "Metric calculation failed",
        value: null,
      })))
    );

    const snapshots = [];
    const skipped = [];

    for (const metric of computed) {
      if (metric.error || metric.value === null || metric.value === undefined || metric.mixedCurrency) {
        skipped.push({ metricId: metric.id, reason: metric.error || (metric.mixedCurrency ? "mixed_currency" : "no_value") });
        continue;
      }

      const prior = await previousSnapshot({
        organizationId: context.organizationId,
        entityId: context.entityId || null,
        metricId: metric.id,
        snapshotDate,
      });
      const exists = await existingSnapshot({
        organizationId: context.organizationId,
        entityId: context.entityId || null,
        metricId: metric.id,
        snapshotDate,
      });

      if (exists) {
        snapshots.push({ ...exists, metricId: metric.id, created: false, previousValue: prior?.value ?? null });
        continue;
      }

      const { data, error } = await supabaseAdmin
        .from("analytics_metric_snapshots")
        .insert({
          organization_id: context.organizationId,
          entity_id: context.entityId || null,
          metric_id: metric.id,
          snapshot_date: snapshotDate,
          value: metric.value,
          unit: metric.unit,
          currency_code: metric.currency || null,
          metric_status: "CAPTURED",
          source_watermark: metric.watermark || null,
          evidence: {
            catalog_version: ANALYTICS_METRIC_CATALOG_VERSION,
            source_tables: metric.sourceTables || [],
            evidence_count: metric.evidenceCount || 0,
            aggregation: metric.aggregation || null,
          },
        })
        .select("id,snapshot_date,value,currency_code,metric_status,source_watermark,evidence,created_at")
        .single();
      if (error) throw error;
      snapshots.push({ ...data, metricId: metric.id, created: true, previousValue: prior?.value ?? null });
    }

    let rulesQuery = supabaseAdmin
      .from("analytics_metric_alert_rules")
      .select("id,metric_id,name,condition_type,threshold_value,threshold_upper,comparison_period,active,notification_channels,cooldown_minutes")
      .eq("organization_id", context.organizationId)
      .eq("active", true);
    rulesQuery = context.entityId
      ? rulesQuery.or(`entity_id.eq.${context.entityId},entity_id.is.null`)
      : rulesQuery.is("entity_id", null);
    const { data: rules, error: rulesError } = await rulesQuery.limit(500);
    if (rulesError) throw rulesError;

    const snapshotByMetric = new Map(snapshots.map((entry) => [entry.metricId, entry]));
    const computedByMetric = new Map(computed.map((entry) => [entry.id, entry]));
    const triggered = [];

    for (const rule of rules || []) {
      const metric = computedByMetric.get(rule.metric_id);
      const captured = snapshotByMetric.get(rule.metric_id);
      if (!metric || metric.value === null || metric.value === undefined || metric.mixedCurrency) continue;

      const comparisonValue = captured?.previousValue ?? null;
      if (!conditionMatches(rule, metric.value, comparisonValue)) continue;

      const cooldownMinutes = Math.max(0, Number(rule.cooldown_minutes || 0));
      const cutoff = new Date(Date.now() - cooldownMinutes * 60000).toISOString();
      let recentQuery = supabaseAdmin
        .from("analytics_metric_alert_events")
        .select("id,triggered_at,status")
        .eq("organization_id", context.organizationId)
        .eq("rule_id", rule.id)
        .gte("triggered_at", cutoff);
      recentQuery = context.entityId ? recentQuery.eq("entity_id", context.entityId) : recentQuery.is("entity_id", null);
      const { data: recent, error: recentError } = await recentQuery.order("triggered_at", { ascending: false }).limit(1).maybeSingle();
      if (recentError) throw recentError;
      if (recent) continue;

      const { data: event, error: eventError } = await supabaseAdmin
        .from("analytics_metric_alert_events")
        .insert({
          organization_id: context.organizationId,
          entity_id: context.entityId || null,
          rule_id: rule.id,
          metric_id: rule.metric_id,
          observed_value: metric.value,
          comparison_value: comparisonValue,
          threshold_value: rule.threshold_value,
          status: "OPEN",
          evidence: {
            rule_name: rule.name,
            condition_type: rule.condition_type,
            threshold_upper: rule.threshold_upper,
            snapshot_date: snapshotDate,
            source_watermark: metric.watermark || null,
            evidence_count: metric.evidenceCount || 0,
            notification_channels: rule.notification_channels || [],
          },
        })
        .select("id,metric_id,status,observed_value,comparison_value,threshold_value,triggered_at,evidence")
        .single();
      if (eventError) throw eventError;
      triggered.push(event);
    }

    return NextResponse.json({
      success: true,
      snapshotDate,
      captured: snapshots.length,
      created: snapshots.filter((row) => row.created).length,
      skipped,
      triggered,
    });
  } catch (error) {
    console.error("ANALYTICS_EVALUATE_FAILED", error);
    return NextResponse.json({ success: false, error: error?.message || "Analytics evaluation failed" }, { status: 500 });
  }
}
