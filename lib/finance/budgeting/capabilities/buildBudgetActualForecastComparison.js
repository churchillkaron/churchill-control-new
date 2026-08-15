import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { calculateBudgetVariance } from "./calculateBudgetVariance";
import buildRevenueForecast, {
  getRevenueAccountIds,
  getRevenueEntries,
  inclusiveCalendarDays,
} from "./buildRevenueForecast";
import { getApprovedForecastScenarioVersion } from "../repositories/ForecastScenarioVersionRepository";

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function percentage(delta, base) {
  const denominator = Number(base || 0);
  if (denominator === 0) return null;
  return Number(((Number(delta || 0) / denominator) * 100).toFixed(2));
}

function formatPercent(value) {
  return value === null || value === undefined
    ? "-"
    : `${Number(value).toFixed(2)}%`;
}

function periodLabel(period) {
  if (period?.period_name) return period.period_name;
  if (!period?.fiscal_year || !period?.fiscal_month) return "Selected Period";
  return `${period.fiscal_year}-${String(period.fiscal_month).padStart(2, "0")}`;
}

function accountKeys(accounts, fields) {
  return new Set(
    accounts
      .flatMap(account => fields.map(field => normalize(account?.[field])))
      .filter(Boolean)
  );
}

function selectRevenueBudgetRows(varianceRows, revenueAccounts) {
  const broadKeys = accountKeys(
    revenueAccounts,
    ["account_category", "account_type"]
  );
  const detailedKeys = accountKeys(
    revenueAccounts,
    ["account_name", "account_code"]
  );

  const broadRows = varianceRows.filter(row =>
    broadKeys.has(normalize(row.category))
  );

  if (broadRows.length) {
    return {
      rows: broadRows,
      mapping: "account category/type",
    };
  }

  return {
    rows: varianceRows.filter(row =>
      detailedKeys.has(normalize(row.category))
    ),
    mapping: "account name/code",
  };
}

function varianceSectionRows(varianceRows) {
  if (!varianceRows.length) {
    return [
      {
        label: "Budget categories",
        value: "No budget rows configured for this period",
      },
    ];
  }

  return varianceRows.flatMap(row => [
    {
      label: `${row.category} — Budget`,
      amount: row.budget,
    },
    {
      label: `${row.category} — Actual`,
      amount: row.actual,
    },
    {
      label: `${row.category} — Variance`,
      amount: row.variance,
    },
    {
      label: `${row.category} — Variance %`,
      value: formatPercent(row.variance_percent),
    },
  ]);
}

function forecastAmountRow(label, amount, forecastReady, unavailableValue) {
  if (!forecastReady) {
    return {
      label,
      value: unavailableValue,
    };
  }

  return {
    label,
    amount,
  };
}

function normalizeForecastSource(value) {
  const source = String(value || "live").trim().toLowerCase();
  if (!["live", "approved"].includes(source)) {
    throw new Error("Invalid forecast_source");
  }
  return source;
}

function approvedForecastContext(version, periodDays) {
  if (!version) {
    const reason = "No approved Scenarios vs Budget forecast exists for this entity and period";
    return {
      forecastReady: false,
      forecastReason: reason,
      periodForecast: null,
      averageDailyRevenue: null,
      projected30DayRevenue: null,
      observationDays: 0,
      observationStartDate: null,
      observationEndDate: null,
      forecast: {
        success: true,
        forecast_ready: false,
        forecast_reason: reason,
      },
      source: {
        type: "approved_scenario_version",
        version_id: null,
        version_number: null,
        scenario_kind: "SCENARIOS_VS_BUDGET",
        approved_at: null,
        source_generated_at: null,
      },
    };
  }

  const snapshot = version.result_snapshot || {};
  const baseScenario = Array.isArray(snapshot.scenarios)
    ? snapshot.scenarios.find(row => row?.id === "base") || null
    : null;
  const baseForecast = snapshot.base_forecast || {};
  const revenueForecast = baseForecast.revenue || {};
  const revenue = baseScenario?.revenue;
  const forecastReady =
    version.forecast_ready === true &&
    baseScenario?.forecast_ready !== false &&
    revenue !== null &&
    revenue !== undefined;
  const forecastReason = forecastReady
    ? null
    : "The approved forecast version is not ready for revenue projection";
  const averageDailyRevenue = forecastReady
    ? baseForecast.average_daily_revenue ?? Number(revenue) / periodDays
    : null;
  const projected30DayRevenue = forecastReady
    ? baseForecast.projected_30_day_revenue ?? Number(averageDailyRevenue) * 30
    : null;

  return {
    forecastReady,
    forecastReason,
    periodForecast: forecastReady ? Number(revenue) : null,
    averageDailyRevenue,
    projected30DayRevenue,
    observationDays: Number(revenueForecast.observation_days || 0),
    observationStartDate: revenueForecast.observation_start_date || null,
    observationEndDate: revenueForecast.observation_end_date || null,
    forecast: {
      success: true,
      forecast_ready: forecastReady,
      forecast_reason: forecastReason,
      average_daily_revenue: averageDailyRevenue,
      projected_30_day_revenue: projected30DayRevenue,
      observation_days: Number(revenueForecast.observation_days || 0),
      observation_start_date: revenueForecast.observation_start_date || null,
      observation_end_date: revenueForecast.observation_end_date || null,
      approved_version: version,
    },
    source: {
      type: "approved_scenario_version",
      version_id: version.id,
      version_number: version.version_number,
      scenario_kind: version.scenario_kind,
      approved_at: version.approved_at || null,
      source_generated_at: version.source_generated_at || null,
    },
  };
}

function liveForecastContext(forecast, periodDays) {
  if (!forecast?.success) {
    throw new Error(forecast?.error || "Revenue forecast failed");
  }

  const forecastReady = forecast.forecast_ready === true;
  const forecastReason = forecastReady
    ? null
    : forecast.forecast_reason || "Revenue forecast is not ready";

  return {
    forecastReady,
    forecastReason,
    periodForecast: forecastReady
      ? Number(forecast.average_daily_revenue || 0) * periodDays
      : null,
    averageDailyRevenue: forecastReady
      ? Number(forecast.average_daily_revenue || 0)
      : null,
    projected30DayRevenue: forecastReady
      ? Number(forecast.projected_30_day_revenue || 0)
      : null,
    observationDays: Number(forecast.observation_days || 0),
    observationStartDate: forecast.observation_start_date || null,
    observationEndDate: forecast.observation_end_date || null,
    forecast,
    source: {
      type: "live_run_rate",
      version_id: null,
      version_number: null,
      scenario_kind: null,
      approved_at: null,
      source_generated_at: forecast.generated_at || null,
    },
  };
}

export default async function buildBudgetActualForecastComparison({
  organizationId,
  entityId,
  periodId,
  forecastSource = "live",
  scenarioKind = "SCENARIOS_VS_BUDGET",
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) throw new Error("entityId required");
  if (!periodId) throw new Error("periodId required");

  const normalizedForecastSource = normalizeForecastSource(forecastSource);
  const normalizedScenarioKind = normalize(scenarioKind);
  if (
    normalizedForecastSource === "approved" &&
    normalizedScenarioKind !== "SCENARIOS_VS_BUDGET"
  ) {
    throw new Error("Approved budget comparison requires SCENARIOS_VS_BUDGET");
  }

  const [{ data: entity, error: entityError }, { data: period, error: periodError }] =
    await Promise.all([
      supabaseAdmin
        .from("legal_entities")
        .select("id, legal_name, display_name, currency")
        .eq("organization_id", organizationId)
        .eq("id", entityId)
        .eq("is_active", true)
        .maybeSingle(),
      supabaseAdmin
        .from("accounting_periods")
        .select("id, period_name, fiscal_year, fiscal_month, start_date, end_date")
        .eq("organization_id", organizationId)
        .eq("entity_id", entityId)
        .eq("id", periodId)
        .maybeSingle(),
    ]);

  if (entityError) throw entityError;
  if (!entity) throw new Error("Invalid entity for organization");
  if (periodError) throw periodError;
  if (!period) throw new Error("Invalid accounting period for entity");

  const [varianceRows, forecastInput, revenueAccountIds] = await Promise.all([
    calculateBudgetVariance({
      organizationId,
      entityId,
      periodId,
    }),
    normalizedForecastSource === "approved"
      ? getApprovedForecastScenarioVersion({
          organizationId,
          entityId,
          periodId,
          scenarioKind: normalizedScenarioKind,
        })
      : buildRevenueForecast({
          organization_id: organizationId,
          entity_id: entityId,
        }),
    getRevenueAccountIds(organizationId, entityId),
  ]);

  let revenueAccounts = [];
  if (revenueAccountIds.length) {
    const { data, error } = await supabaseAdmin
      .from("chart_of_accounts")
      .select("id, account_code, account_name, account_category, account_type")
      .eq("organization_id", organizationId)
      .in("id", revenueAccountIds);

    if (error) throw error;
    revenueAccounts = data || [];
  }

  const periodRevenueEntries = revenueAccountIds.length
    ? await getRevenueEntries({
        organizationId,
        entityId,
        accountIds: revenueAccountIds,
        startDate: period.start_date,
        endDate: period.end_date,
      })
    : [];

  const actualRevenue = periodRevenueEntries.reduce(
    (sum, row) =>
      sum +
      Number(row.credit || 0) -
      Number(row.debit || 0),
    0
  );

  const periodDays = inclusiveCalendarDays(
    period.start_date,
    period.end_date
  );
  const forecastContext = normalizedForecastSource === "approved"
    ? approvedForecastContext(forecastInput, periodDays)
    : liveForecastContext(forecastInput, periodDays);
  const {
    forecastReady,
    forecastReason,
    periodForecast,
  } = forecastContext;

  const revenueBudgetSelection = selectRevenueBudgetRows(
    varianceRows,
    revenueAccounts
  );
  const hasRevenueBudget = revenueBudgetSelection.rows.length > 0;
  const revenueBudget = hasRevenueBudget
    ? revenueBudgetSelection.rows.reduce(
        (sum, row) => sum + Number(row.budget || 0),
        0
      )
    : null;

  const actualVsBudget = hasRevenueBudget
    ? actualRevenue - revenueBudget
    : null;
  const forecastVsBudget = hasRevenueBudget && forecastReady
    ? periodForecast - revenueBudget
    : null;
  const forecastVsActual = forecastReady
    ? periodForecast - actualRevenue
    : null;

  const comparison = {
    organization_id: organizationId,
    entity_id: entityId,
    period_id: periodId,
    currency_code: entity.currency || null,
    period_days: periodDays,
    forecast_source: forecastContext.source.type,
    forecast_version_id: forecastContext.source.version_id,
    forecast_version_number: forecastContext.source.version_number,
    forecast_scenario_kind: forecastContext.source.scenario_kind,
    forecast_approved_at: forecastContext.source.approved_at,
    forecast_source_generated_at: forecastContext.source.source_generated_at,
    forecast_ready: forecastReady,
    forecast_reason: forecastReason,
    forecast_observation_days: forecastContext.observationDays,
    forecast_observation_start_date: forecastContext.observationStartDate,
    forecast_observation_end_date: forecastContext.observationEndDate,
    revenue_budget: hasRevenueBudget ? roundMoney(revenueBudget) : null,
    actual_revenue: roundMoney(actualRevenue),
    forecast_revenue: forecastReady ? roundMoney(periodForecast) : null,
    projected_30_day_revenue: forecastReady
      ? roundMoney(forecastContext.projected30DayRevenue)
      : null,
    average_daily_revenue: forecastReady
      ? roundMoney(forecastContext.averageDailyRevenue)
      : null,
    actual_vs_budget: hasRevenueBudget
      ? roundMoney(actualVsBudget)
      : null,
    actual_vs_budget_percent: hasRevenueBudget
      ? percentage(actualVsBudget, revenueBudget)
      : null,
    forecast_vs_budget: hasRevenueBudget && forecastReady
      ? roundMoney(forecastVsBudget)
      : null,
    forecast_vs_budget_percent: hasRevenueBudget && forecastReady
      ? percentage(forecastVsBudget, revenueBudget)
      : null,
    forecast_vs_actual: forecastReady
      ? roundMoney(forecastVsActual)
      : null,
    forecast_vs_actual_percent: forecastReady
      ? percentage(forecastVsActual, actualRevenue)
      : null,
    revenue_budget_mapping: hasRevenueBudget
      ? revenueBudgetSelection.mapping
      : null,
  };

  const forecastLabel = normalizedForecastSource === "approved"
    ? "Approved Base Forecast"
    : "Live Run-rate Forecast";
  const revenueRows = [
    {
      label: "Revenue Budget",
      ...(hasRevenueBudget
        ? { amount: comparison.revenue_budget }
        : { value: "No mapped revenue budget" }),
    },
    {
      label: "Actual Revenue",
      amount: comparison.actual_revenue,
    },
    forecastAmountRow(
      forecastLabel,
      comparison.forecast_revenue,
      forecastReady,
      forecastReason
    ),
    {
      label: "Actual vs Budget",
      ...(hasRevenueBudget
        ? { amount: comparison.actual_vs_budget }
        : { value: "-" }),
    },
    {
      label: "Actual vs Budget %",
      value: formatPercent(comparison.actual_vs_budget_percent),
    },
    {
      label: "Forecast vs Budget",
      ...(hasRevenueBudget && forecastReady
        ? { amount: comparison.forecast_vs_budget }
        : { value: "-" }),
    },
    {
      label: "Forecast vs Budget %",
      value: formatPercent(comparison.forecast_vs_budget_percent),
    },
    forecastAmountRow(
      "Forecast vs Actual",
      comparison.forecast_vs_actual,
      forecastReady,
      "-"
    ),
    {
      label: "Forecast vs Actual %",
      value: formatPercent(comparison.forecast_vs_actual_percent),
    },
  ];

  const sourceRows = normalizedForecastSource === "approved"
    ? [
        {
          label: "Forecast Source",
          value: "Approved Scenarios vs Budget — Base scenario",
        },
        {
          label: "Approved Version",
          value: comparison.forecast_version_number
            ? `Version ${comparison.forecast_version_number}`
            : "No approved version",
        },
        {
          label: "Approved At",
          value: comparison.forecast_approved_at || "-",
        },
        {
          label: "Snapshot Generated At",
          value: comparison.forecast_source_generated_at || "-",
        },
      ]
    : [
        {
          label: "Forecast Source",
          value: "Current posted-ledger run-rate",
        },
      ];

  const document = {
    title: normalizedForecastSource === "approved"
      ? "Budget vs Actual vs Approved Forecast"
      : "Budget vs Actual vs Live Forecast",
    entity: {
      id: entity.id,
      name: entity.display_name || entity.legal_name || "Legal Entity",
    },
    period: {
      id: period.id,
      name: periodLabel(period),
      start_date: period.start_date,
      end_date: period.end_date,
    },
    currency: {
      code: entity.currency || null,
    },
    sections: [
      {
        title: "Revenue Comparison",
        rows: revenueRows,
      },
      {
        title: "Budget vs Actual by Category",
        rows: varianceSectionRows(varianceRows),
      },
      {
        title: "Forecast Basis",
        rows: [
          ...sourceRows,
          {
            label: "Forecast Readiness",
            value: forecastReady ? "Ready" : "Not ready",
          },
          ...(forecastReason
            ? [
                {
                  label: "Forecast Reason",
                  value: forecastReason,
                },
              ]
            : []),
          forecastAmountRow(
            "Average Daily Revenue",
            comparison.average_daily_revenue,
            forecastReady,
            "Unavailable"
          ),
          forecastAmountRow(
            "30-day Revenue Run-rate",
            comparison.projected_30_day_revenue,
            forecastReady,
            "Unavailable"
          ),
          {
            label: "Observed History",
            value: `${comparison.forecast_observation_days} calendar days`,
          },
          {
            label: "Selected Period Length",
            value: `${periodDays} calendar days`,
          },
          {
            label: "Forecast Method",
            value: normalizedForecastSource === "approved"
              ? "Immutable approved scenario snapshot; no live fallback"
              : "Latest 30-calendar-day ledger revenue run-rate",
          },
        ],
      },
    ],
    generated_at: new Date().toISOString(),
  };

  return {
    success: true,
    comparison,
    variance: varianceRows,
    forecast: forecastContext.forecast,
    approved_version:
      normalizedForecastSource === "approved" ? forecastInput || null : null,
    document,
  };
}
