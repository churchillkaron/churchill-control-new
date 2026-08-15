import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import buildForecastAccuracyHistoryReport from "./buildForecastAccuracyHistoryReport";

const DEFAULT_HISTORY_LIMIT = 12;
const MAX_HISTORY_LIMIT = 24;
const ENTITY_CONCURRENCY = 4;

function normalizeLimit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_HISTORY_LIMIT;
  return Math.min(Math.floor(numeric), MAX_HISTORY_LIMIT);
}

function finiteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function average(values) {
  const finite = values
    .map(finiteNumber)
    .filter(value => value !== null);

  if (!finite.length) return null;

  return Number(
    (finite.reduce((sum, value) => sum + value, 0) / finite.length).toFixed(2)
  );
}

function formatPercent(value) {
  const numeric = finiteNumber(value);
  return numeric === null ? "Unavailable" : `${numeric.toFixed(2)}%`;
}

function entityName(entity) {
  return entity?.display_name || entity?.legal_name || "Legal Entity";
}

function latestFinalRow(report) {
  const preferredPeriodId = report?.summary?.latest_final_period_id;
  const history = Array.isArray(report?.history) ? report.history : [];

  return (
    history.find(
      row =>
        row?.period_id === preferredPeriodId &&
        row?.accuracy_ready === true &&
        row?.accuracy_status === "final"
    ) ||
    history.find(
      row => row?.accuracy_ready === true && row?.accuracy_status === "final"
    ) ||
    null
  );
}

async function buildEntityRow({ organizationId, entity, historyLimit }) {
  try {
    const report = await buildForecastAccuracyHistoryReport({
      organizationId,
      entityId: entity.id,
      limit: historyLimit,
    });

    const latestFinal = latestFinalRow(report);
    const summary = report.summary || {};
    const trend = report.trend || {};

    return {
      entity_id: entity.id,
      entity_name: entityName(entity),
      currency_code: entity.currency || null,
      measurement_status: "available",
      measurement_error: null,
      approved_periods: summary.approved_periods || 0,
      final_measured_periods: summary.final_measured_periods || 0,
      preliminary_periods: summary.preliminary_periods || 0,
      unavailable_periods: summary.unavailable_periods || 0,
      latest_final_period_id: latestFinal?.period_id || null,
      latest_final_period_name: latestFinal?.period_name || null,
      latest_revenue_absolute_error_percent:
        latestFinal?.comparisons?.revenue?.absolute_error_percent ?? null,
      latest_operating_profit_absolute_error_percent:
        latestFinal?.comparisons?.operating_profit?.absolute_error_percent ?? null,
      rolling_revenue_absolute_error_percent:
        summary.average_revenue_absolute_error_percent ?? null,
      rolling_operating_profit_absolute_error_percent:
        summary.average_operating_profit_absolute_error_percent ?? null,
      average_revenue_bias_percent:
        summary.average_revenue_bias_percent ?? null,
      average_operating_profit_bias_percent:
        summary.average_operating_profit_bias_percent ?? null,
      trend_available: trend.available === true,
      revenue_absolute_error_change_points:
        trend.revenue_absolute_error_change_points ?? null,
      operating_profit_absolute_error_change_points:
        trend.operating_profit_absolute_error_change_points ?? null,
    };
  } catch (error) {
    return {
      entity_id: entity.id,
      entity_name: entityName(entity),
      currency_code: entity.currency || null,
      measurement_status: "error",
      measurement_error:
        error?.message || "Forecast accuracy portfolio measurement failed",
      approved_periods: 0,
      final_measured_periods: 0,
      preliminary_periods: 0,
      unavailable_periods: 0,
      latest_final_period_id: null,
      latest_final_period_name: null,
      latest_revenue_absolute_error_percent: null,
      latest_operating_profit_absolute_error_percent: null,
      rolling_revenue_absolute_error_percent: null,
      rolling_operating_profit_absolute_error_percent: null,
      average_revenue_bias_percent: null,
      average_operating_profit_bias_percent: null,
      trend_available: false,
      revenue_absolute_error_change_points: null,
      operating_profit_absolute_error_change_points: null,
    };
  }
}

async function buildRows({ organizationId, entities, historyLimit }) {
  const rows = [];

  for (let offset = 0; offset < entities.length; offset += ENTITY_CONCURRENCY) {
    const batch = entities.slice(offset, offset + ENTITY_CONCURRENCY);
    const batchRows = await Promise.all(
      batch.map(entity =>
        buildEntityRow({ organizationId, entity, historyLimit })
      )
    );
    rows.push(...batchRows);
  }

  return rows;
}

function buildSummary(rows) {
  const successful = rows.filter(row => row.measurement_status === "available");

  return {
    active_entities: rows.length,
    entities_with_approved_forecasts: successful.filter(
      row => row.approved_periods > 0
    ).length,
    entities_without_approved_forecasts: successful.filter(
      row => row.approved_periods === 0
    ).length,
    entities_with_final_measurement: successful.filter(
      row => row.final_measured_periods > 0
    ).length,
    entities_without_final_measurement: successful.filter(
      row => row.final_measured_periods === 0
    ).length,
    entities_with_trend: successful.filter(row => row.trend_available).length,
    entities_with_measurement_errors: rows.filter(
      row => row.measurement_status === "error"
    ).length,
    approved_periods_total: successful.reduce(
      (sum, row) => sum + Number(row.approved_periods || 0),
      0
    ),
    final_measured_periods_total: successful.reduce(
      (sum, row) => sum + Number(row.final_measured_periods || 0),
      0
    ),
    preliminary_periods_total: successful.reduce(
      (sum, row) => sum + Number(row.preliminary_periods || 0),
      0
    ),
    unavailable_periods_total: successful.reduce(
      (sum, row) => sum + Number(row.unavailable_periods || 0),
      0
    ),
    unweighted_mean_latest_revenue_absolute_error_percent: average(
      successful.map(row => row.latest_revenue_absolute_error_percent)
    ),
    unweighted_mean_latest_operating_profit_absolute_error_percent: average(
      successful.map(row => row.latest_operating_profit_absolute_error_percent)
    ),
    unweighted_mean_rolling_revenue_absolute_error_percent: average(
      successful.map(row => row.rolling_revenue_absolute_error_percent)
    ),
    unweighted_mean_rolling_operating_profit_absolute_error_percent: average(
      successful.map(row => row.rolling_operating_profit_absolute_error_percent)
    ),
  };
}

function portfolioRows(rows) {
  if (!rows.length) {
    return [
      {
        label: "Legal entities",
        value: "No active legal entities are configured for this organization",
      },
    ];
  }

  return rows.map(row => ({
    label: row.entity_name,
    value:
      row.measurement_status === "error"
        ? `Measurement unavailable · ${row.measurement_error}`
        : [
            `Approved ${row.approved_periods}`,
            `Final ${row.final_measured_periods}`,
            `Latest revenue error ${formatPercent(
              row.latest_revenue_absolute_error_percent
            )}`,
            `Latest operating profit error ${formatPercent(
              row.latest_operating_profit_absolute_error_percent
            )}`,
          ].join(" · "),
  }));
}

export default async function buildForecastAccuracyPortfolioReport({
  organizationId,
  limit = DEFAULT_HISTORY_LIMIT,
} = {}) {
  if (!organizationId) throw new Error("organizationId required");

  const historyLimit = normalizeLimit(limit);
  const { data: entities, error } = await supabaseAdmin
    .from("legal_entities")
    .select("id, legal_name, display_name, currency")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("legal_name", { ascending: true });

  if (error) throw error;

  const rows = await buildRows({
    organizationId,
    entities: entities || [],
    historyLimit,
  });
  const summary = buildSummary(rows);
  const generatedAt = new Date().toISOString();

  const document = {
    title: "Approved Forecast Accuracy Portfolio",
    entity: {
      id: null,
      name: "Organization Forecast Portfolio",
    },
    period: {
      id: null,
      name: `Latest ${historyLimit} approved forecast periods per entity`,
    },
    currency: { code: null },
    sections: [
      {
        title: "Portfolio Coverage",
        rows: [
          { label: "Active Legal Entities", value: String(summary.active_entities) },
          {
            label: "Entities with Approved Forecasts",
            value: String(summary.entities_with_approved_forecasts),
          },
          {
            label: "Entities with Final Measurements",
            value: String(summary.entities_with_final_measurement),
          },
          {
            label: "Entities with Trend History",
            value: String(summary.entities_with_trend),
          },
          {
            label: "Measurement Errors",
            value: String(summary.entities_with_measurement_errors),
          },
        ],
      },
      {
        title: "Cross-entity Accuracy",
        rows: [
          {
            label: "Unweighted Mean Latest Revenue Absolute Error",
            value: formatPercent(
              summary.unweighted_mean_latest_revenue_absolute_error_percent
            ),
          },
          {
            label: "Unweighted Mean Latest Operating Profit Absolute Error",
            value: formatPercent(
              summary.unweighted_mean_latest_operating_profit_absolute_error_percent
            ),
          },
          {
            label: "Unweighted Mean Rolling Revenue Absolute Error",
            value: formatPercent(
              summary.unweighted_mean_rolling_revenue_absolute_error_percent
            ),
          },
          {
            label: "Unweighted Mean Rolling Operating Profit Absolute Error",
            value: formatPercent(
              summary.unweighted_mean_rolling_operating_profit_absolute_error_percent
            ),
          },
        ],
      },
      {
        title: "Entity Forecast Accuracy",
        rows: portfolioRows(rows),
      },
      {
        title: "Governance",
        rows: [
          {
            label: "Forecast Source",
            value: "Approved SCENARIOS_VS_BUDGET Base snapshots only",
          },
          {
            label: "Cross-currency Treatment",
            value:
              "No monetary amounts are aggregated across entities; the portfolio compares percentage-based forecast accuracy and coverage only",
          },
          {
            label: "Portfolio Mean Convention",
            value:
              "Cross-entity percentage means are unweighted entity means and do not imply revenue-weighted consolidation",
          },
          {
            label: "Final Measurement Rule",
            value:
              "Only closed or locked periods with ready approved forecasts and posted P&L activity contribute final accuracy measurements",
          },
        ],
      },
    ],
    generated_at: generatedAt,
  };

  return {
    success: true,
    organization_id: organizationId,
    scenario_kind: "SCENARIOS_VS_BUDGET",
    history_limit: historyLimit,
    summary,
    entities: rows,
    document,
    generated_at: generatedAt,
  };
}
