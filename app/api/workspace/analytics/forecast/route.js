export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import { ANALYTICS_METRIC_BY_ID } from "@/lib/analytics/semantic/AnalyticsMetricCatalog";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MODEL_VERSION = "analytics-statistical-v1";
const METHODS = new Set(["LINEAR_TREND", "MOVING_AVERAGE", "SEASONAL_NAIVE"]);

function clean(value) {
  return String(value ?? "").trim();
}

function dayNumber(dateString) {
  const time = new Date(`${dateString}T00:00:00.000Z`).getTime();
  return Number.isFinite(time) ? Math.round(time / 86400000) : null;
}

function datePlusDays(dateString, days) {
  const base = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(base.getTime())) return null;
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

function linearModel(points) {
  const baseX = points[0].x;
  const normalized = points.map((point) => ({ x: point.x - baseX, y: point.y }));
  const xMean = mean(normalized.map((point) => point.x));
  const yMean = mean(normalized.map((point) => point.y));
  const numerator = normalized.reduce((sum, point) => sum + (point.x - xMean) * (point.y - yMean), 0);
  const denominator = normalized.reduce((sum, point) => sum + (point.x - xMean) ** 2, 0);
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;
  const predict = (absoluteX) => intercept + slope * (absoluteX - baseX);
  const residuals = points.map((point) => point.y - predict(point.x));
  return { predict, error: standardDeviation(residuals), slope, intercept, baseX };
}

function movingAverageModel(points, windowSize = 7) {
  const values = points.slice(-Math.min(windowSize, points.length)).map((point) => point.y);
  const predicted = mean(values);
  return { predict: () => predicted, error: standardDeviation(values), windowSize: values.length };
}

function seasonalNaiveModel(points) {
  const byWeekday = new Map();
  for (const point of points) {
    const weekday = new Date(`${point.date}T00:00:00.000Z`).getUTCDay();
    if (!byWeekday.has(weekday)) byWeekday.set(weekday, []);
    byWeekday.get(weekday).push(point.y);
  }
  const globalMean = mean(points.map((point) => point.y));
  return {
    predictDate(date) {
      const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
      const values = byWeekday.get(weekday) || [];
      return values.length ? values[values.length - 1] : globalMean;
    },
    errorForDate(date) {
      const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
      return standardDeviation(byWeekday.get(weekday) || []);
    },
  };
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const entityId = clean(body.entityId || body.entity_id);
    const periodId = clean(body.periodId || body.period_id);
    const metricId = clean(body.metricId || body.metric_id);
    const method = clean(body.method || "LINEAR_TREND").toUpperCase();
    const horizonDays = Math.max(1, Math.min(365, Math.round(Number(body.horizonDays || body.horizon_days || 30))));
    const lookbackDays = Math.max(7, Math.min(1095, Math.round(Number(body.lookbackDays || body.lookback_days || 90))));

    const metric = ANALYTICS_METRIC_BY_ID[metricId];
    if (!metric) return NextResponse.json({ success: false, error: "Unknown Analytics metric" }, { status: 400 });
    if (!METHODS.has(method)) return NextResponse.json({ success: false, error: "Unsupported forecast method" }, { status: 400 });

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 });

    const context = await resolveBusinessContext({
      organizationId: access.organizationId,
      entityId: entityId || null,
      periodId: periodId || null,
      request,
      access,
    });
    if (!context.success) return NextResponse.json({ success: false, error: context.error }, { status: context.status || 400 });

    const cutoff = new Date(Date.now() - lookbackDays * 86400000).toISOString().slice(0, 10);
    let snapshotQuery = supabaseAdmin
      .from("analytics_metric_snapshots")
      .select("snapshot_date,value,unit,currency_code,source_watermark,created_at")
      .eq("organization_id", context.organizationId)
      .eq("metric_id", metricId)
      .gte("snapshot_date", cutoff)
      .not("value", "is", null);
    snapshotQuery = context.entityId ? snapshotQuery.eq("entity_id", context.entityId) : snapshotQuery.is("entity_id", null);
    const { data: snapshots, error: snapshotError } = await snapshotQuery.order("snapshot_date", { ascending: true }).limit(2000);
    if (snapshotError) throw snapshotError;

    const points = (snapshots || [])
      .map((row) => ({ ...row, x: dayNumber(row.snapshot_date), y: Number(row.value) }))
      .filter((row) => row.x !== null && Number.isFinite(row.y));

    const minimum = method === "LINEAR_TREND" ? 3 : method === "SEASONAL_NAIVE" ? 7 : 2;
    if (points.length < minimum) {
      return NextResponse.json({
        success: false,
        error: `Forecast requires at least ${minimum} captured actual snapshots for ${method}`,
        evidenceCount: points.length,
      }, { status: 409 });
    }

    const asOfDate = points[points.length - 1].snapshot_date;
    const currencyCodes = [...new Set(points.map((point) => clean(point.currency_code)).filter(Boolean))];
    if (currencyCodes.length > 1) {
      return NextResponse.json({ success: false, error: "Forecast refuses mixed-currency snapshot history" }, { status: 409 });
    }

    let definitionQuery = supabaseAdmin
      .from("analytics_forecast_definitions")
      .select("id")
      .eq("organization_id", context.organizationId)
      .eq("metric_id", metricId)
      .eq("method", method)
      .eq("lookback_days", lookbackDays)
      .eq("horizon_days", horizonDays)
      .eq("active", true);
    definitionQuery = context.entityId ? definitionQuery.eq("entity_id", context.entityId) : definitionQuery.is("entity_id", null);
    let { data: definition, error: definitionError } = await definitionQuery.limit(1).maybeSingle();
    if (definitionError) throw definitionError;

    if (!definition) {
      const { data, error } = await supabaseAdmin
        .from("analytics_forecast_definitions")
        .insert({
          organization_id: context.organizationId,
          entity_id: context.entityId || null,
          metric_id: metricId,
          name: `${metric.label} · ${method}`,
          method,
          lookback_days: lookbackDays,
          horizon_days: horizonDays,
          active: true,
          metadata: { model_version: MODEL_VERSION, source: "analytics_metric_snapshots" },
        })
        .select("id")
        .single();
      if (error) throw error;
      definition = data;
    }

    const linear = method === "LINEAR_TREND" ? linearModel(points) : null;
    const moving = method === "MOVING_AVERAGE" ? movingAverageModel(points) : null;
    const seasonal = method === "SEASONAL_NAIVE" ? seasonalNaiveModel(points) : null;
    const z = 1.96;
    const rows = [];

    for (let offset = 1; offset <= horizonDays; offset += 1) {
      const forecastDate = datePlusDays(asOfDate, offset);
      const x = dayNumber(forecastDate);
      const predicted = method === "LINEAR_TREND"
        ? linear.predict(x)
        : method === "MOVING_AVERAGE"
          ? moving.predict(x)
          : seasonal.predictDate(forecastDate);
      const error = method === "LINEAR_TREND"
        ? linear.error
        : method === "MOVING_AVERAGE"
          ? moving.error
          : seasonal.errorForDate(forecastDate);

      rows.push({
        organization_id: context.organizationId,
        entity_id: context.entityId || null,
        definition_id: definition.id,
        metric_id: metricId,
        method,
        as_of_date: asOfDate,
        forecast_date: forecastDate,
        predicted_value: predicted,
        lower_bound: predicted - z * error,
        upper_bound: predicted + z * error,
        actual_value: null,
        model_version: MODEL_VERSION,
        evidence: {
          snapshot_count: points.length,
          lookback_days: lookbackDays,
          horizon_days: horizonDays,
          first_snapshot_date: points[0].snapshot_date,
          last_snapshot_date: asOfDate,
          unit: points[points.length - 1].unit,
          currency_code: currencyCodes[0] || null,
          confidence_interval: "approx_95pct",
          method_parameters: method === "LINEAR_TREND"
            ? { slope: linear.slope, residual_stddev: linear.error }
            : method === "MOVING_AVERAGE"
              ? { window_size: moving.windowSize, sample_stddev: moving.error }
              : { seasonality: "weekday", history_points: points.length },
        },
      });
    }

    const { error: deleteError } = await supabaseAdmin
      .from("analytics_forecast_runs")
      .delete()
      .eq("organization_id", context.organizationId)
      .eq("definition_id", definition.id)
      .eq("as_of_date", asOfDate);
    if (deleteError) throw deleteError;

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("analytics_forecast_runs")
      .insert(rows)
      .select("metric_id,method,as_of_date,forecast_date,predicted_value,lower_bound,upper_bound,model_version,evidence");
    if (insertError) throw insertError;

    return NextResponse.json({
      success: true,
      metricId,
      method,
      modelVersion: MODEL_VERSION,
      asOfDate,
      evidenceCount: points.length,
      horizonDays,
      forecast: inserted || [],
    });
  } catch (error) {
    console.error("ANALYTICS_FORECAST_FAILED", error);
    return NextResponse.json({ success: false, error: error?.message || "Analytics forecast failed" }, { status: 500 });
  }
}
