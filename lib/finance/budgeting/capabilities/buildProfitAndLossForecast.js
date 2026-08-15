import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import buildRevenueForecast, {
  inclusiveCalendarDays,
} from "./buildRevenueForecast";
import {
  classifyStatementAccount,
} from "@/lib/finance/reporting/reports/loadLedgerAccountBalances";

const FORECAST_DAYS = 30;
const MIN_OBSERVATION_DAYS = 7;
const PAGE_SIZE = 1000;

function roundMoney(value) {
  if (value === null || value === undefined) return null;
  return Number(Number(value).toFixed(2));
}

function percentage(value, base) {
  const denominator = Number(base || 0);
  if (!Number.isFinite(denominator) || denominator === 0) return null;
  return Number(((Number(value || 0) / denominator) * 100).toFixed(2));
}

function parseDateUtc(dateValue) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid forecast date");
  }
  return date;
}

function addDays(dateValue, days) {
  const date = parseDateUtc(dateValue);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function loadEntity({ organizationId, entityId }) {
  if (!entityId) return null;

  const { data, error } = await supabaseAdmin
    .from("legal_entities")
    .select("id, legal_name, display_name, currency")
    .eq("organization_id", organizationId)
    .eq("id", entityId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Invalid entity for organization");
  return data;
}

async function loadOrganizationCurrency(organizationId) {
  const { data, error } = await supabaseAdmin
    .from("finance_organization_profiles")
    .select("functional_currency")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;
  return data?.functional_currency || null;
}

async function loadProjectionPeriod({ organizationId, entityId, periodId }) {
  if (!periodId) return null;
  if (!entityId) {
    throw new Error("entity_id required when period_id is supplied");
  }

  const { data, error } = await supabaseAdmin
    .from("accounting_periods")
    .select("id, period_name, fiscal_year, fiscal_month, start_date, end_date")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("id", periodId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Invalid accounting period for entity");
  return data;
}

async function loadForecastAccounts({ organizationId, entityId }) {
  let query = supabaseAdmin
    .from("chart_of_accounts")
    .select("id, account_code, account_name, account_category, account_type, normal_balance")
    .eq("organization_id", organizationId);

  if (entityId) {
    query = query.eq("entity_id", entityId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const accounts = data || [];
  return {
    cogs: accounts.filter(account => classifyStatementAccount(account) === "cogs"),
    expense: accounts.filter(account => classifyStatementAccount(account) === "expense"),
  };
}

async function latestPostingDate({ organizationId, entityId, accountIds }) {
  if (!accountIds.length) return null;

  let query = supabaseAdmin
    .from("general_ledger")
    .select("posting_date")
    .eq("organization_id", organizationId)
    .in("account_id", accountIds)
    .not("posting_date", "is", null);

  if (entityId) {
    query = query.eq("entity_id", entityId);
  }

  const { data, error } = await query
    .order("posting_date", { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0]?.posting_date || null;
}

async function loadCostEntries({
  organizationId,
  entityId,
  accountIds,
  startDate,
  endDate,
}) {
  const rows = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabaseAdmin
      .from("general_ledger")
      .select("id, debit, credit, posting_date")
      .eq("organization_id", organizationId)
      .in("account_id", accountIds)
      .gte("posting_date", startDate)
      .lte("posting_date", endDate);

    if (entityId) {
      query = query.eq("entity_id", entityId);
    }

    const { data, error } = await query
      .order("posting_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

function unavailableCostForecast({ classification, status, reason, accountCount }) {
  return {
    classification,
    ready: false,
    status,
    reason,
    account_count: accountCount,
    observation_start_date: null,
    observation_end_date: null,
    observation_days: 0,
    observed_total: 0,
    average_daily: null,
    projected_30_day: null,
  };
}

async function buildCostRunRate({
  organizationId,
  entityId,
  classification,
  accounts,
  optional = false,
}) {
  const accountIds = accounts.map(account => account.id).filter(Boolean);

  if (!accountIds.length) {
    if (optional) {
      return {
        classification,
        ready: true,
        status: "not_applicable",
        reason: "No accounts classified for this P&L line",
        account_count: 0,
        observation_start_date: null,
        observation_end_date: null,
        observation_days: 0,
        observed_total: 0,
        average_daily: 0,
        projected_30_day: 0,
      };
    }

    return unavailableCostForecast({
      classification,
      status: "no_accounts",
      reason: "No accounts classified for this P&L line",
      accountCount: 0,
    });
  }

  const latestDate = await latestPostingDate({
    organizationId,
    entityId,
    accountIds,
  });

  if (!latestDate) {
    return unavailableCostForecast({
      classification,
      status: "no_history",
      reason: "No posted ledger history for this P&L line",
      accountCount: accountIds.length,
    });
  }

  const startDate = addDays(latestDate, -(FORECAST_DAYS - 1));
  const entries = await loadCostEntries({
    organizationId,
    entityId,
    accountIds,
    startDate,
    endDate: latestDate,
  });

  if (!entries.length) {
    return unavailableCostForecast({
      classification,
      status: "no_history",
      reason: "No posted ledger history for this P&L line",
      accountCount: accountIds.length,
    });
  }

  const firstObservedDate = entries[0].posting_date;
  const observationDays = inclusiveCalendarDays(firstObservedDate, latestDate);
  const observedTotal = entries.reduce(
    (sum, row) =>
      sum + Number(row.debit || 0) - Number(row.credit || 0),
    0
  );

  if (observedTotal < 0) {
    return {
      classification,
      ready: false,
      status: "negative_net_cost",
      reason: "Recent net cost is negative; likely reversals or credits require review before extrapolation",
      account_count: accountIds.length,
      observation_start_date: firstObservedDate,
      observation_end_date: latestDate,
      observation_days: observationDays,
      observed_total: roundMoney(observedTotal),
      average_daily: null,
      projected_30_day: null,
    };
  }

  if (observationDays < MIN_OBSERVATION_DAYS) {
    return {
      classification,
      ready: false,
      status: "insufficient_history",
      reason: `At least ${MIN_OBSERVATION_DAYS} calendar days of observed history are required`,
      account_count: accountIds.length,
      observation_start_date: firstObservedDate,
      observation_end_date: latestDate,
      observation_days: observationDays,
      observed_total: roundMoney(observedTotal),
      average_daily: null,
      projected_30_day: null,
    };
  }

  const averageDaily = observedTotal / observationDays;

  return {
    classification,
    ready: true,
    status: "ready",
    reason: null,
    account_count: accountIds.length,
    observation_start_date: firstObservedDate,
    observation_end_date: latestDate,
    observation_days: observationDays,
    observed_total: roundMoney(observedTotal),
    average_daily: roundMoney(averageDaily),
    projected_30_day: roundMoney(averageDaily * FORECAST_DAYS),
  };
}

function periodName(period) {
  if (!period) return "Next 30 Days";
  if (period.period_name) return period.period_name;
  if (period.fiscal_year && period.fiscal_month) {
    return `${period.fiscal_year}-${String(period.fiscal_month).padStart(2, "0")}`;
  }
  return "Selected Period";
}

function forecastValue(value, ready, fallback) {
  return ready
    ? { amount: roundMoney(value) }
    : { value: fallback || "Insufficient run-rate history" };
}

export default async function buildProfitAndLossForecast({
  organization_id,
  entity_id = null,
  period_id = null,
} = {}) {
  try {
    if (!organization_id) {
      throw new Error("organization_id required");
    }

    const [entity, period, accounts, revenueForecast] = await Promise.all([
      loadEntity({ organizationId: organization_id, entityId: entity_id }),
      loadProjectionPeriod({
        organizationId: organization_id,
        entityId: entity_id,
        periodId: period_id,
      }),
      loadForecastAccounts({
        organizationId: organization_id,
        entityId: entity_id,
      }),
      buildRevenueForecast({
        organization_id,
        entity_id,
      }),
    ]);

    if (!revenueForecast?.success) {
      throw new Error(revenueForecast?.error || "Revenue forecast failed");
    }

    const [cogsForecast, expenseForecast, organizationCurrency] = await Promise.all([
      buildCostRunRate({
        organizationId: organization_id,
        entityId: entity_id,
        classification: "cogs",
        accounts: accounts.cogs,
        optional: true,
      }),
      buildCostRunRate({
        organizationId: organization_id,
        entityId: entity_id,
        classification: "expense",
        accounts: accounts.expense,
      }),
      entity_id ? Promise.resolve(null) : loadOrganizationCurrency(organization_id),
    ]);

    const projectionDays = period
      ? inclusiveCalendarDays(period.start_date, period.end_date)
      : FORECAST_DAYS;
    const revenueReady = revenueForecast.forecast_ready !== false;
    const grossProfitReady = revenueReady && cogsForecast.ready;
    const operatingProfitReady = grossProfitReady && expenseForecast.ready;

    const projectedRevenue =
      Number(revenueForecast.average_daily_revenue || 0) * projectionDays;
    const projectedCogs = cogsForecast.ready
      ? Number(cogsForecast.average_daily || 0) * projectionDays
      : null;
    const projectedExpenses = expenseForecast.ready
      ? Number(expenseForecast.average_daily || 0) * projectionDays
      : null;
    const projectedGrossProfit = grossProfitReady
      ? projectedRevenue - projectedCogs
      : null;
    const projectedOperatingProfit = operatingProfitReady
      ? projectedGrossProfit - projectedExpenses
      : null;
    const currencyCode = entity?.currency || organizationCurrency || null;

    const result = {
      success: true,
      forecast_ready: operatingProfitReady,
      organization_id,
      entity_id,
      period_id,
      currency_code: currencyCode,
      projection_days: projectionDays,
      average_daily_revenue: roundMoney(revenueForecast.average_daily_revenue),
      projected_30_day_revenue: roundMoney(revenueForecast.projected_30_day_revenue),
      average_daily_cogs: cogsForecast.average_daily,
      projected_30_day_cogs: cogsForecast.projected_30_day,
      average_daily_expenses: expenseForecast.average_daily,
      projected_30_day_expenses: expenseForecast.projected_30_day,
      projected_period_revenue: roundMoney(projectedRevenue),
      projected_period_cogs: roundMoney(projectedCogs),
      projected_period_expenses: roundMoney(projectedExpenses),
      projected_period_gross_profit: roundMoney(projectedGrossProfit),
      projected_period_operating_profit: roundMoney(projectedOperatingProfit),
      gross_margin_percent: grossProfitReady
        ? percentage(projectedGrossProfit, projectedRevenue)
        : null,
      operating_margin_percent: operatingProfitReady
        ? percentage(projectedOperatingProfit, projectedRevenue)
        : null,
      revenue: revenueForecast,
      cogs: cogsForecast,
      expenses: expenseForecast,
      generated_at: new Date().toISOString(),
    };

    result.document = {
      title: "Profit & Loss Forecast",
      entity: entity
        ? {
            id: entity.id,
            name: entity.display_name || entity.legal_name || "Legal Entity",
          }
        : {
            id: null,
            name: "All Entities",
          },
      period: {
        id: period?.id || null,
        name: periodName(period),
        start_date: period?.start_date || null,
        end_date: period?.end_date || null,
      },
      currency: {
        code: currencyCode,
      },
      sections: [
        {
          title: "Projected P&L",
          rows: [
            {
              label: "Revenue",
              ...forecastValue(projectedRevenue, revenueReady, revenueForecast.forecast_reason),
            },
            {
              label: "Cost of Goods / Direct Costs",
              ...forecastValue(projectedCogs, cogsForecast.ready, cogsForecast.reason),
            },
            {
              label: "Gross Profit",
              ...forecastValue(projectedGrossProfit, grossProfitReady),
            },
            {
              label: "Operating Expenses",
              ...forecastValue(projectedExpenses, expenseForecast.ready, expenseForecast.reason),
            },
            {
              label: "Operating Profit",
              ...forecastValue(projectedOperatingProfit, operatingProfitReady),
            },
          ],
        },
        {
          title: "Margins",
          rows: [
            {
              label: "Gross Margin",
              value: result.gross_margin_percent === null
                ? "Unavailable"
                : `${result.gross_margin_percent.toFixed(2)}%`,
            },
            {
              label: "Operating Margin",
              value: result.operating_margin_percent === null
                ? "Unavailable"
                : `${result.operating_margin_percent.toFixed(2)}%`,
            },
          ],
        },
        {
          title: "Run-rate Quality",
          rows: [
            {
              label: "Revenue history",
              value: revenueForecast.forecast_ready === false
                ? revenueForecast.forecast_reason || "Insufficient history"
                : `${revenueForecast.observation_days || "-"} calendar days`,
            },
            {
              label: "COGS / direct cost history",
              value: cogsForecast.ready
                ? `${cogsForecast.observation_days} calendar days`
                : cogsForecast.reason,
            },
            {
              label: "Operating expense history",
              value: expenseForecast.ready
                ? `${expenseForecast.observation_days} calendar days`
                : expenseForecast.reason,
            },
            {
              label: "Projection horizon",
              value: `${projectionDays} calendar days`,
            },
          ],
        },
      ],
      generated_at: result.generated_at,
    };

    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
