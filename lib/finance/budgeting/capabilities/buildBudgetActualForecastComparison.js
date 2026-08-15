import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { calculateBudgetVariance } from "./calculateBudgetVariance";
import buildRevenueForecast, {
  getRevenueAccountIds,
  getRevenueEntries,
  inclusiveCalendarDays,
} from "./buildRevenueForecast";

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

export default async function buildBudgetActualForecastComparison({
  organizationId,
  entityId,
  periodId,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) throw new Error("entityId required");
  if (!periodId) throw new Error("periodId required");

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

  const [varianceRows, forecast, revenueAccountIds] = await Promise.all([
    calculateBudgetVariance({
      organizationId,
      entityId,
      periodId,
    }),
    buildRevenueForecast({
      organization_id: organizationId,
      entity_id: entityId,
    }),
    getRevenueAccountIds(organizationId, entityId),
  ]);

  if (!forecast?.success) {
    throw new Error(forecast?.error || "Revenue forecast failed");
  }

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
  const periodForecast =
    Number(forecast.average_daily_revenue || 0) * periodDays;

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
  const forecastVsBudget = hasRevenueBudget
    ? periodForecast - revenueBudget
    : null;
  const forecastVsActual = periodForecast - actualRevenue;

  const comparison = {
    organization_id: organizationId,
    entity_id: entityId,
    period_id: periodId,
    currency_code: entity.currency || null,
    period_days: periodDays,
    revenue_budget: hasRevenueBudget ? roundMoney(revenueBudget) : null,
    actual_revenue: roundMoney(actualRevenue),
    forecast_revenue: roundMoney(periodForecast),
    projected_30_day_revenue: roundMoney(
      forecast.projected_30_day_revenue
    ),
    average_daily_revenue: roundMoney(
      forecast.average_daily_revenue
    ),
    actual_vs_budget: hasRevenueBudget
      ? roundMoney(actualVsBudget)
      : null,
    actual_vs_budget_percent: hasRevenueBudget
      ? percentage(actualVsBudget, revenueBudget)
      : null,
    forecast_vs_budget: hasRevenueBudget
      ? roundMoney(forecastVsBudget)
      : null,
    forecast_vs_budget_percent: hasRevenueBudget
      ? percentage(forecastVsBudget, revenueBudget)
      : null,
    forecast_vs_actual: roundMoney(forecastVsActual),
    forecast_vs_actual_percent: percentage(
      forecastVsActual,
      actualRevenue
    ),
    revenue_budget_mapping: hasRevenueBudget
      ? revenueBudgetSelection.mapping
      : null,
  };

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
    {
      label: "Run-rate Forecast",
      amount: comparison.forecast_revenue,
    },
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
      ...(hasRevenueBudget
        ? { amount: comparison.forecast_vs_budget }
        : { value: "-" }),
    },
    {
      label: "Forecast vs Budget %",
      value: formatPercent(comparison.forecast_vs_budget_percent),
    },
    {
      label: "Forecast vs Actual",
      amount: comparison.forecast_vs_actual,
    },
    {
      label: "Forecast vs Actual %",
      value: formatPercent(comparison.forecast_vs_actual_percent),
    },
  ];

  const document = {
    title: "Budget vs Actual vs Forecast",
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
          {
            label: "Average Daily Revenue",
            amount: comparison.average_daily_revenue,
          },
          {
            label: "30-day Revenue Run-rate",
            amount: comparison.projected_30_day_revenue,
          },
          {
            label: "Selected Period Length",
            value: `${periodDays} calendar days`,
          },
          {
            label: "Forecast Method",
            value: "Latest 30-calendar-day ledger revenue run-rate",
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
    forecast,
    document,
  };
}
