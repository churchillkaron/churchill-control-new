import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import buildForecastAccuracyPortfolioReport from "./buildForecastAccuracyPortfolioReport";

const DEFAULT_HISTORY_LIMIT = 12;
const SEVERITY_ORDER = {
  critical: 0,
  warning: 1,
  info: 2,
};

function periodName(period) {
  if (period?.period_name) return period.period_name;
  if (period?.fiscal_year && period?.fiscal_month) {
    return `${period.fiscal_year}-${String(period.fiscal_month).padStart(2, "0")}`;
  }
  return "Accounting Period";
}

function finiteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function percentPoints(value) {
  const numeric = finiteNumber(value);
  if (numeric === null) return "Unavailable";
  const prefix = numeric > 0 ? "+" : "";
  return `${prefix}${numeric.toFixed(2)} pts`;
}

async function loadLatestStartedPeriods({ organizationId, entityIds }) {
  if (!entityIds.length) return new Map();

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from("accounting_periods")
    .select(
      "id, entity_id, period_name, fiscal_year, fiscal_month, start_date, end_date, status"
    )
    .eq("organization_id", organizationId)
    .in("entity_id", entityIds)
    .lte("start_date", today)
    .order("start_date", { ascending: false })
    .order("end_date", { ascending: false });

  if (error) throw error;

  const latestByEntity = new Map();
  for (const period of data || []) {
    if (!period?.entity_id || latestByEntity.has(period.entity_id)) continue;
    latestByEntity.set(period.entity_id, period);
  }

  return latestByEntity;
}

function pushException(exceptions, input) {
  exceptions.push({
    id: `${input.entity_id}:${input.type}`,
    entity_id: input.entity_id,
    entity_name: input.entity_name,
    severity: input.severity,
    type: input.type,
    title: input.title,
    detail: input.detail,
    evidence: input.evidence || [],
    recommended_action: input.recommended_action,
  });
}

function buildEntityExceptions({ row, latestStartedPeriod }) {
  const exceptions = [];

  if (row.measurement_status === "error") {
    pushException(exceptions, {
      entity_id: row.entity_id,
      entity_name: row.entity_name,
      severity: "critical",
      type: "MEASUREMENT_ERROR",
      title: "Forecast measurement failed",
      detail:
        row.measurement_error ||
        "Forecast performance could not be measured for this entity.",
      evidence: ["Portfolio measurement status: error"],
      recommended_action:
        "Resolve the underlying forecast or accounting-data error, then refresh forecast performance.",
    });
    return exceptions;
  }

  if (Number(row.approved_periods || 0) === 0) {
    pushException(exceptions, {
      entity_id: row.entity_id,
      entity_name: row.entity_name,
      severity: "critical",
      type: "MISSING_APPROVED_FORECAST",
      title: "No approved forecast",
      detail:
        "No approved SCENARIOS_VS_BUDGET Base forecast exists in the measured history window.",
      evidence: ["Approved forecast periods: 0"],
      recommended_action:
        "Create and approve a forecast scenario for the current accounting period.",
    });
  }

  if (
    latestStartedPeriod &&
    row.latest_approved_period_end_date &&
    String(row.latest_approved_period_end_date) < String(latestStartedPeriod.end_date)
  ) {
    pushException(exceptions, {
      entity_id: row.entity_id,
      entity_name: row.entity_name,
      severity: "warning",
      type: "STALE_FORECAST_COVERAGE",
      title: "Forecast coverage is behind the current period",
      detail: `The newest approved forecast ends ${row.latest_approved_period_end_date}, before ${periodName(
        latestStartedPeriod
      )} ending ${latestStartedPeriod.end_date}.`,
      evidence: [
        `Latest approved forecast period: ${row.latest_approved_period_name || row.latest_approved_period_end_date}`,
        `Latest started accounting period: ${periodName(latestStartedPeriod)}`,
      ],
      recommended_action:
        "Generate and approve forecast coverage for the latest accounting period that has started.",
    });
  }

  const finalPeriods = Number(row.final_measured_periods || 0);
  if (Number(row.approved_periods || 0) > 0 && finalPeriods < 2) {
    pushException(exceptions, {
      entity_id: row.entity_id,
      entity_name: row.entity_name,
      severity: "info",
      type: "INSUFFICIENT_FINAL_HISTORY",
      title: "Insufficient final history for trend analysis",
      detail:
        finalPeriods === 0
          ? "No closed or locked forecast period is currently measurable as final."
          : "Only one final measured forecast period exists; at least two are required for accuracy trend analysis.",
      evidence: [`Final measured periods: ${finalPeriods}`],
      recommended_action:
        "Continue period close and forecast approval discipline until at least two final measured periods are available.",
    });
  }

  if (row.trend_available) {
    const revenueChange = finiteNumber(row.revenue_absolute_error_change_points);
    const operatingProfitChange = finiteNumber(
      row.operating_profit_absolute_error_change_points
    );
    const deterioratingRevenue = revenueChange !== null && revenueChange > 0;
    const deterioratingOperatingProfit =
      operatingProfitChange !== null && operatingProfitChange > 0;

    if (deterioratingRevenue || deterioratingOperatingProfit) {
      const evidence = [];
      if (revenueChange !== null) {
        evidence.push(`Revenue absolute-error change: ${percentPoints(revenueChange)}`);
      }
      if (operatingProfitChange !== null) {
        evidence.push(
          `Operating profit absolute-error change: ${percentPoints(operatingProfitChange)}`
        );
      }

      pushException(exceptions, {
        entity_id: row.entity_id,
        entity_name: row.entity_name,
        severity: "warning",
        type: "DETERIORATING_ACCURACY",
        title: "Forecast accuracy deteriorated",
        detail:
          "The latest final forecast period has a higher absolute error than the previous final period for at least one key metric.",
        evidence,
        recommended_action:
          "Review the latest approved assumptions and actual-vs-forecast drivers before approving the next forecast version.",
      });
    }
  }

  return exceptions;
}

function sortExceptions(exceptions) {
  return [...exceptions].sort((left, right) => {
    const severityDelta =
      (SEVERITY_ORDER[left.severity] ?? 99) -
      (SEVERITY_ORDER[right.severity] ?? 99);
    if (severityDelta !== 0) return severityDelta;
    return String(left.entity_name || "").localeCompare(
      String(right.entity_name || "")
    );
  });
}

function buildSummary({ rows, exceptions }) {
  const affectedEntities = new Set(exceptions.map(item => item.entity_id));
  const countType = type => exceptions.filter(item => item.type === type).length;
  const countSeverity = severity =>
    exceptions.filter(item => item.severity === severity).length;

  return {
    active_entities: rows.length,
    entities_requiring_attention: affectedEntities.size,
    entities_without_exceptions: Math.max(rows.length - affectedEntities.size, 0),
    total_exceptions: exceptions.length,
    critical_exceptions: countSeverity("critical"),
    warning_exceptions: countSeverity("warning"),
    informational_exceptions: countSeverity("info"),
    missing_approved_forecast: countType("MISSING_APPROVED_FORECAST"),
    stale_forecast_coverage: countType("STALE_FORECAST_COVERAGE"),
    insufficient_final_history: countType("INSUFFICIENT_FINAL_HISTORY"),
    deteriorating_accuracy: countType("DETERIORATING_ACCURACY"),
    measurement_errors: countType("MEASUREMENT_ERROR"),
  };
}

function exceptionDocumentRows(exceptions) {
  if (!exceptions.length) {
    return [
      {
        label: "Forecast Controls",
        value: "No forecast management exceptions detected",
      },
    ];
  }

  return exceptions.map(item => ({
    label: `${item.entity_name} — ${item.title}`,
    value: `${item.severity.toUpperCase()} · ${item.detail} · Action: ${item.recommended_action}`,
  }));
}

export default async function buildForecastManagementExceptionsReport({
  organizationId,
  limit = DEFAULT_HISTORY_LIMIT,
} = {}) {
  if (!organizationId) throw new Error("organizationId required");

  const portfolio = await buildForecastAccuracyPortfolioReport({
    organizationId,
    limit,
  });
  const rows = Array.isArray(portfolio.entities) ? portfolio.entities : [];
  const latestPeriods = await loadLatestStartedPeriods({
    organizationId,
    entityIds: rows.map(row => row.entity_id).filter(Boolean),
  });

  const exceptions = sortExceptions(
    rows.flatMap(row =>
      buildEntityExceptions({
        row,
        latestStartedPeriod: latestPeriods.get(row.entity_id) || null,
      })
    )
  );
  const summary = buildSummary({ rows, exceptions });
  const generatedAt = new Date().toISOString();

  const document = {
    title: "Forecast Management Exceptions",
    entity: { id: null, name: "Organization Forecast Controls" },
    period: {
      id: null,
      name: `Latest ${portfolio.history_limit || limit} approved forecast periods per entity`,
    },
    currency: { code: null },
    sections: [
      {
        title: "Exception Summary",
        rows: [
          { label: "Active Legal Entities", value: String(summary.active_entities) },
          {
            label: "Entities Requiring Attention",
            value: String(summary.entities_requiring_attention),
          },
          {
            label: "Entities Without Exceptions",
            value: String(summary.entities_without_exceptions),
          },
          { label: "Critical Exceptions", value: String(summary.critical_exceptions) },
          { label: "Warning Exceptions", value: String(summary.warning_exceptions) },
          {
            label: "Informational Exceptions",
            value: String(summary.informational_exceptions),
          },
        ],
      },
      {
        title: "Management Exceptions",
        rows: exceptionDocumentRows(exceptions),
      },
      {
        title: "Control Definitions",
        rows: [
          {
            label: "Missing Approved Forecast",
            value:
              "No approved SCENARIOS_VS_BUDGET Base forecast exists in the measured history window",
          },
          {
            label: "Stale Forecast Coverage",
            value:
              "Newest approved forecast period ends before the newest accounting period that has already started",
          },
          {
            label: "Insufficient Final History",
            value:
              "Fewer than two closed or locked forecast periods are measurable as final",
          },
          {
            label: "Deteriorating Accuracy",
            value:
              "Latest final absolute-error percentage is higher than the previous final period for Revenue or Operating Profit",
          },
          {
            label: "Measurement Error",
            value:
              "The canonical entity forecast portfolio could not calculate forecast performance",
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
    history_limit: portfolio.history_limit,
    summary,
    exceptions,
    portfolio_summary: portfolio.summary,
    document,
    generated_at: generatedAt,
  };
}
