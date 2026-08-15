import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import buildForecastAccuracyReport from "./buildForecastAccuracyReport";
import { listApprovedForecastScenarioVersionsForEntity } from "../repositories/ForecastScenarioVersionRepository";

const APPROVED_SCENARIO_KIND = "SCENARIOS_VS_BUDGET";
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;

function normalizeLimit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(numeric), MAX_LIMIT);
}

function average(values) {
  const finite = values.filter(value => Number.isFinite(Number(value)));
  if (!finite.length) return null;
  return Number((finite.reduce((sum, value) => sum + Number(value), 0) / finite.length).toFixed(2));
}

function formatPercent(value) {
  return value === null || value === undefined
    ? "Unavailable"
    : `${Number(value).toFixed(2)}%`;
}

function errorChangeRows(latest, previous) {
  if (!latest || !previous) {
    return [{
      label: "Trend",
      value: "At least two final forecast periods are required for change analysis",
    }];
  }

  const metrics = [
    ["revenue", "Revenue"],
    ["cogs", "COGS / Direct Costs"],
    ["operating_expenses", "Operating Expenses"],
    ["operating_profit", "Operating Profit"],
  ];

  return metrics.map(([key, label]) => {
    const latestError = latest.comparisons?.[key]?.absolute_error_percent;
    const previousError = previous.comparisons?.[key]?.absolute_error_percent;
    const delta =
      latestError === null || latestError === undefined ||
      previousError === null || previousError === undefined
        ? null
        : Number((Number(latestError) - Number(previousError)).toFixed(2));

    return {
      label: `${label} absolute-error change`,
      value: delta === null
        ? "Unavailable"
        : `${delta.toFixed(2)} pts (negative means improved accuracy)`,
    };
  });
}

function periodHistoryRows(history) {
  if (!history.length) {
    return [{
      label: "Approved forecast history",
      value: "No approved forecast versions exist for this entity",
    }];
  }

  return history.map(row => {
    const revenueError = row.comparisons?.revenue?.absolute_error_percent;
    const operatingProfitError = row.comparisons?.operating_profit?.absolute_error_percent;

    return {
      label: `${row.period_name} — v${row.version_number}`,
      value: [
        `Status ${row.accuracy_status}`,
        `Revenue error ${formatPercent(revenueError)}`,
        `Operating profit error ${formatPercent(operatingProfitError)}`,
      ].join(" · "),
    };
  });
}

export default async function buildForecastAccuracyHistoryReport({
  organizationId,
  entityId,
  limit = DEFAULT_LIMIT,
} = {}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) throw new Error("entityId required");

  const resolvedLimit = normalizeLimit(limit);
  const [{ data: entity, error: entityError }, versions] = await Promise.all([
    supabaseAdmin
      .from("legal_entities")
      .select("id, legal_name, display_name, currency")
      .eq("organization_id", organizationId)
      .eq("id", entityId)
      .eq("is_active", true)
      .maybeSingle(),
    listApprovedForecastScenarioVersionsForEntity({
      organizationId,
      entityId,
      scenarioKind: APPROVED_SCENARIO_KIND,
      limit: resolvedLimit,
    }),
  ]);

  if (entityError) throw entityError;
  if (!entity) throw new Error("Invalid entity for organization");

  const history = [];
  for (const version of versions) {
    const report = await buildForecastAccuracyReport({
      organizationId,
      entityId,
      periodId: version.period_id,
    });

    history.push({
      version_id: version.id,
      version_number: version.version_number,
      approved_at: version.approved_at,
      period_id: report.period_id,
      period_name: report.document?.period?.name || "Selected Period",
      period_start_date: report.document?.period?.start_date || null,
      period_end_date: report.document?.period?.end_date || null,
      period_status: report.document?.period?.status || null,
      accuracy_ready: report.accuracy_ready === true,
      accuracy_status: report.accuracy_status,
      accuracy_reason: report.accuracy_reason || null,
      actual: report.actual,
      approved_forecast: report.approved_forecast,
      comparisons: report.comparisons,
    });
  }

  history.sort((left, right) =>
    String(right.period_end_date || "").localeCompare(String(left.period_end_date || ""))
  );

  const finalHistory = history.filter(
    row => row.accuracy_ready && row.accuracy_status === "final"
  );
  const preliminaryHistory = history.filter(
    row => row.accuracy_status === "preliminary"
  );
  const unavailableHistory = history.filter(
    row => row.accuracy_status === "unavailable"
  );
  const latestFinal = finalHistory[0] || null;
  const previousFinal = finalHistory[1] || null;

  const summary = {
    approved_periods: history.length,
    final_measured_periods: finalHistory.length,
    preliminary_periods: preliminaryHistory.length,
    unavailable_periods: unavailableHistory.length,
    average_revenue_absolute_error_percent: average(
      finalHistory.map(row => row.comparisons?.revenue?.absolute_error_percent)
    ),
    average_cogs_absolute_error_percent: average(
      finalHistory.map(row => row.comparisons?.cogs?.absolute_error_percent)
    ),
    average_operating_expenses_absolute_error_percent: average(
      finalHistory.map(row => row.comparisons?.operating_expenses?.absolute_error_percent)
    ),
    average_operating_profit_absolute_error_percent: average(
      finalHistory.map(row => row.comparisons?.operating_profit?.absolute_error_percent)
    ),
    average_revenue_bias_percent: average(
      finalHistory.map(row => row.comparisons?.revenue?.variance_percent)
    ),
    average_operating_profit_bias_percent: average(
      finalHistory.map(row => row.comparisons?.operating_profit?.variance_percent)
    ),
    latest_final_period_id: latestFinal?.period_id || null,
    latest_final_period_name: latestFinal?.period_name || null,
    previous_final_period_id: previousFinal?.period_id || null,
    previous_final_period_name: previousFinal?.period_name || null,
  };

  const generatedAt = new Date().toISOString();
  const document = {
    title: "Approved Forecast Accuracy History",
    entity: {
      id: entity.id,
      name: entity.display_name || entity.legal_name || "Legal Entity",
    },
    period: {
      id: null,
      name: `Latest ${resolvedLimit} approved forecast periods`,
    },
    currency: { code: entity.currency || null },
    sections: [
      {
        title: "History Coverage",
        rows: [
          { label: "Approved Forecast Periods", value: String(summary.approved_periods) },
          { label: "Final Measured Periods", value: String(summary.final_measured_periods) },
          { label: "Preliminary Open Periods", value: String(summary.preliminary_periods) },
          { label: "Unavailable Periods", value: String(summary.unavailable_periods) },
          { label: "History Limit", value: String(resolvedLimit) },
        ],
      },
      {
        title: "Final-period Accuracy Summary",
        rows: [
          { label: "Average Revenue Absolute Error", value: formatPercent(summary.average_revenue_absolute_error_percent) },
          { label: "Average COGS Absolute Error", value: formatPercent(summary.average_cogs_absolute_error_percent) },
          { label: "Average Operating Expense Absolute Error", value: formatPercent(summary.average_operating_expenses_absolute_error_percent) },
          { label: "Average Operating Profit Absolute Error", value: formatPercent(summary.average_operating_profit_absolute_error_percent) },
          { label: "Average Revenue Bias", value: formatPercent(summary.average_revenue_bias_percent) },
          { label: "Average Operating Profit Bias", value: formatPercent(summary.average_operating_profit_bias_percent) },
        ],
      },
      { title: "Latest Final-period Change", rows: errorChangeRows(latestFinal, previousFinal) },
      { title: "Approved Forecast Period History", rows: periodHistoryRows(history) },
      {
        title: "Governance",
        rows: [
          { label: "Forecast Source", value: "Approved SCENARIOS_VS_BUDGET Base snapshots only" },
          { label: "Historical Score Population", value: "Only closed or locked periods with ready approved forecasts and posted P&L activity" },
          { label: "Open Period Treatment", value: "Preliminary results remain visible but are excluded from historical averages and trend comparison" },
          { label: "Trend Convention", value: "Latest final absolute-error percentage minus previous final absolute-error percentage; negative points indicate improved accuracy" },
        ],
      },
    ],
    generated_at: generatedAt,
  };

  return {
    success: true,
    organization_id: organizationId,
    entity_id: entityId,
    scenario_kind: APPROVED_SCENARIO_KIND,
    history_limit: resolvedLimit,
    currency_code: entity.currency || null,
    summary,
    history,
    document,
    generated_at: generatedAt,
  };
}
