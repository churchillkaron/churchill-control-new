export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import { ANALYTICS_METRIC_BY_ID } from "@/lib/analytics/semantic/AnalyticsMetricCatalog";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function clean(value) {
  return String(value ?? "").trim();
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validMetric(metricId) {
  return ANALYTICS_METRIC_BY_ID[clean(metricId)] || null;
}

async function accessContext(request, body) {
  const organizationId = clean(body.organizationId || body.organization_id);
  const entityId = clean(body.entityId || body.entity_id);
  const periodId = clean(body.periodId || body.period_id);
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) return access;
  return resolveBusinessContext({
    organizationId: access.organizationId,
    entityId: entityId || null,
    periodId: periodId || null,
    request,
    access,
  });
}

async function existingMetricConfiguration(context, metricId) {
  let query = supabaseAdmin
    .from("analytics_metric_configurations")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("metric_id", metricId);
  query = context.entityId ? query.eq("entity_id", context.entityId) : query.is("entity_id", null);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = clean(body.action).toLowerCase();
    const context = await accessContext(request, body);
    if (!context.success) {
      return NextResponse.json({ success: false, error: context.error }, { status: context.status || 403 });
    }

    if (action === "configure_metric") {
      const metric = validMetric(body.metricId || body.metric_id);
      if (!metric) return NextResponse.json({ success: false, error: "Unknown Analytics metric" }, { status: 400 });

      const direction = clean(body.targetDirection || body.target_direction || "NONE").toUpperCase();
      if (!["NONE", "HIGHER_IS_BETTER", "LOWER_IS_BETTER", "RANGE"].includes(direction)) {
        return NextResponse.json({ success: false, error: "Invalid target direction" }, { status: 400 });
      }

      const payload = {
        organization_id: context.organizationId,
        entity_id: context.entityId || null,
        metric_id: metric.id,
        display_name: clean(body.displayName || body.display_name) || null,
        enabled: body.enabled !== false,
        target_value: finiteOrNull(body.targetValue ?? body.target_value),
        target_direction: direction,
        warning_threshold: finiteOrNull(body.warningThreshold ?? body.warning_threshold),
        critical_threshold: finiteOrNull(body.criticalThreshold ?? body.critical_threshold),
        lower_bound: finiteOrNull(body.lowerBound ?? body.lower_bound),
        upper_bound: finiteOrNull(body.upperBound ?? body.upper_bound),
        tags: Array.isArray(body.tags) ? body.tags.map(clean).filter(Boolean).slice(0, 50) : [],
        metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {},
        updated_at: new Date().toISOString(),
      };

      const existing = await existingMetricConfiguration(context, metric.id);
      let result;
      if (existing?.id) {
        const { data, error } = await supabaseAdmin
          .from("analytics_metric_configurations")
          .update(payload)
          .eq("id", existing.id)
          .select("*")
          .single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await supabaseAdmin
          .from("analytics_metric_configurations")
          .insert(payload)
          .select("*")
          .single();
        if (error) throw error;
        result = data;
      }

      return NextResponse.json({ success: true, action, configuration: result });
    }

    if (action === "create_alert_rule") {
      const metric = validMetric(body.metricId || body.metric_id);
      if (!metric) return NextResponse.json({ success: false, error: "Unknown Analytics metric" }, { status: 400 });
      const conditionType = clean(body.conditionType || body.condition_type).toUpperCase();
      if (!["ABOVE", "BELOW", "OUTSIDE_RANGE", "CHANGE_ABOVE", "CHANGE_BELOW", "OFF_TARGET"].includes(conditionType)) {
        return NextResponse.json({ success: false, error: "Invalid alert condition" }, { status: 400 });
      }

      const thresholdValue = finiteOrNull(body.thresholdValue ?? body.threshold_value);
      const thresholdUpper = finiteOrNull(body.thresholdUpper ?? body.threshold_upper);
      if (thresholdValue === null) return NextResponse.json({ success: false, error: "Alert threshold required" }, { status: 400 });
      if (conditionType === "OUTSIDE_RANGE" && (thresholdUpper === null || thresholdUpper < thresholdValue)) {
        return NextResponse.json({ success: false, error: "Valid upper threshold required" }, { status: 400 });
      }

      const { data, error } = await supabaseAdmin
        .from("analytics_metric_alert_rules")
        .insert({
          organization_id: context.organizationId,
          entity_id: context.entityId || null,
          metric_id: metric.id,
          name: clean(body.name) || `${metric.label} alert`,
          condition_type: conditionType,
          threshold_value: thresholdValue,
          threshold_upper: thresholdUpper,
          comparison_period: clean(body.comparisonPeriod || body.comparison_period) || null,
          active: body.active !== false,
          notification_channels: Array.isArray(body.notificationChannels || body.notification_channels)
            ? (body.notificationChannels || body.notification_channels).map(clean).filter(Boolean).slice(0, 20)
            : [],
          cooldown_minutes: Math.max(0, Math.round(finiteOrNull(body.cooldownMinutes ?? body.cooldown_minutes) ?? 60)),
        })
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, action, rule: data });
    }

    if (action === "set_alert_rule_active") {
      const ruleId = clean(body.ruleId || body.rule_id);
      if (!ruleId) return NextResponse.json({ success: false, error: "ruleId required" }, { status: 400 });
      let query = supabaseAdmin
        .from("analytics_metric_alert_rules")
        .update({ active: body.active === true, updated_at: new Date().toISOString() })
        .eq("id", ruleId)
        .eq("organization_id", context.organizationId);
      query = context.entityId ? query.eq("entity_id", context.entityId) : query.is("entity_id", null);
      const { data, error } = await query.select("*").maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ success: false, error: "Alert rule not found in scope" }, { status: 404 });
      return NextResponse.json({ success: true, action, rule: data });
    }

    if (action === "acknowledge_alert" || action === "resolve_alert" || action === "dismiss_alert") {
      const eventId = clean(body.eventId || body.event_id);
      if (!eventId) return NextResponse.json({ success: false, error: "eventId required" }, { status: 400 });
      const now = new Date().toISOString();
      const status = action === "acknowledge_alert" ? "ACKNOWLEDGED" : action === "resolve_alert" ? "RESOLVED" : "DISMISSED";
      const patch = {
        status,
        acknowledged_at: status === "ACKNOWLEDGED" ? now : undefined,
        resolved_at: status === "RESOLVED" ? now : undefined,
      };
      Object.keys(patch).forEach((key) => patch[key] === undefined && delete patch[key]);
      let query = supabaseAdmin
        .from("analytics_metric_alert_events")
        .update(patch)
        .eq("id", eventId)
        .eq("organization_id", context.organizationId);
      query = context.entityId ? query.eq("entity_id", context.entityId) : query.is("entity_id", null);
      const { data, error } = await query.select("*").maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ success: false, error: "Alert event not found in scope" }, { status: 404 });
      return NextResponse.json({ success: true, action, event: data });
    }

    return NextResponse.json({ success: false, error: "Unsupported Analytics control action" }, { status: 400 });
  } catch (error) {
    console.error("ANALYTICS_CONTROL_FAILED", error);
    return NextResponse.json({ success: false, error: error?.message || "Analytics control failed" }, { status: 500 });
  }
}
