import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { calculateBudgetVariance } from "./calculateBudgetVariance";
import buildForecastScenarios from "./buildForecastScenarios";
import {
  classifyStatementAccount,
} from "@/lib/finance/reporting/reports/loadLedgerAccountBalances";

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function roundMoney(value) {
  if (value === null || value === undefined) return null;
  return Number(Number(value).toFixed(2));
}

function percentage(delta, base) {
  if (delta === null || delta === undefined) return null;
  const denominator = Number(base || 0);
  if (!Number.isFinite(denominator) || denominator === 0) return null;
  return Number(((Number(delta) / denominator) * 100).toFixed(2));
}

function margin(value, revenue) {
  if (value === null || value === undefined) return null;
  const denominator = Number(revenue || 0);
  if (!Number.isFinite(denominator) || denominator === 0) return null;
  return Number(((Number(value) / denominator) * 100).toFixed(2));
}

function accountKeys(accounts, fields) {
  return new Set(
    accounts
      .flatMap(account => fields.map(field => normalize(account?.[field])))
      .filter(Boolean)
  );
}

function selectBudgetRows(varianceRows, accounts, classification) {
  const classAccounts = accounts.filter(
    account => classifyStatementAccount(account) === classification
  );
  const broadKeys = accountKeys(
    classAccounts,
    ["account_category", "account_type"]
  );
  const detailedKeys = accountKeys(
    classAccounts,
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

  const semanticRows = varianceRows.filter(row =>
    classifyStatementAccount({
      account_category: row.category,
    }) === classification
  );

  if (semanticRows.length) {
    return {
      rows: semanticRows,
      mapping: "budget category classification",
    };
  }

  const detailedRows = varianceRows.filter(row =>
    detailedKeys.has(normalize(row.category))
  );

  return {
    rows: detailedRows,
    mapping: detailedRows.length ? "account name/code" : null,
  };
}

function sumBudget(selection) {
  if (!selection.rows.length) return null;
  return roundMoney(
    selection.rows.reduce(
      (sum, row) => sum + Number(row.budget || 0),
      0
    )
  );
}

function buildBudgetTarget({
  varianceRows,
  accounts,
  baseForecast,
}) {
  const revenueSelection = selectBudgetRows(
    varianceRows,
    accounts,
    "revenue"
  );
  const cogsSelection = selectBudgetRows(
    varianceRows,
    accounts,
    "cogs"
  );
  const expenseSelection = selectBudgetRows(
    varianceRows,
    accounts,
    "expense"
  );

  const revenue = sumBudget(revenueSelection);
  const cogs = cogsSelection.rows.length
    ? sumBudget(cogsSelection)
    : baseForecast?.cogs?.status === "not_applicable"
      ? 0
      : null;
  const operatingExpenses = sumBudget(expenseSelection);
  const grossProfit = revenue !== null && cogs !== null
    ? roundMoney(revenue - cogs)
    : null;
  const operatingProfit =
    grossProfit !== null && operatingExpenses !== null
      ? roundMoney(grossProfit - operatingExpenses)
      : null;

  return {
    revenue,
    cogs,
    operating_expenses: operatingExpenses,
    gross_profit: grossProfit,
    operating_profit: operatingProfit,
    gross_margin_percent: margin(grossProfit, revenue),
    operating_margin_percent: margin(operatingProfit, revenue),
    mapping: {
      revenue: revenueSelection.mapping,
      cogs:
        cogsSelection.rows.length
          ? cogsSelection.mapping
          : baseForecast?.cogs?.status === "not_applicable"
            ? "not applicable"
            : null,
      operating_expenses: expenseSelection.mapping,
    },
    mapped_budget_rows: {
      revenue: revenueSelection.rows.map(row => row.category),
      cogs: cogsSelection.rows.map(row => row.category),
      operating_expenses: expenseSelection.rows.map(row => row.category),
    },
  };
}

function difference(value, budget) {
  if (
    value === null ||
    value === undefined ||
    budget === null ||
    budget === undefined
  ) {
    return null;
  }

  return roundMoney(Number(value) - Number(budget));
}

function marginImpact(value, budgetValue) {
  if (
    value === null ||
    value === undefined ||
    budgetValue === null ||
    budgetValue === undefined
  ) {
    return null;
  }

  return Number((Number(value) - Number(budgetValue)).toFixed(2));
}

function scenarioAgainstBudget(scenario, budget) {
  const revenueVariance = difference(scenario.revenue, budget.revenue);
  const cogsVariance = difference(scenario.cogs, budget.cogs);
  const expenseVariance = difference(
    scenario.operating_expenses,
    budget.operating_expenses
  );
  const grossProfitVariance = difference(
    scenario.gross_profit,
    budget.gross_profit
  );
  const operatingProfitVariance = difference(
    scenario.operating_profit,
    budget.operating_profit
  );

  return {
    ...scenario,
    budget_variance: {
      revenue: revenueVariance,
      revenue_percent: percentage(revenueVariance, budget.revenue),
      cogs: cogsVariance,
      cogs_percent: percentage(cogsVariance, budget.cogs),
      operating_expenses: expenseVariance,
      operating_expenses_percent: percentage(
        expenseVariance,
        budget.operating_expenses
      ),
      gross_profit: grossProfitVariance,
      gross_profit_percent: percentage(
        grossProfitVariance,
        budget.gross_profit
      ),
      operating_profit: operatingProfitVariance,
      operating_profit_percent: percentage(
        operatingProfitVariance,
        budget.operating_profit
      ),
      gross_margin_points: marginImpact(
        scenario.gross_margin_percent,
        budget.gross_margin_percent
      ),
      operating_margin_points: marginImpact(
        scenario.operating_margin_percent,
        budget.operating_margin_percent
      ),
    },
  };
}

function formatPercent(value) {
  return value === null || value === undefined
    ? "Unavailable"
    : `${Number(value).toFixed(2)}%`;
}

function formatPoints(value) {
  return value === null || value === undefined
    ? "Unavailable"
    : `${Number(value).toFixed(2)} pts`;
}

function moneyRow(label, value, fallback = "No mapped budget") {
  return value === null || value === undefined
    ? { label, value: fallback }
    : { label, amount: value };
}

function budgetSection(budget, varianceRows) {
  if (!varianceRows.length) {
    return {
      title: "Budget P&L Target",
      rows: [
        {
          label: "Budget status",
          value: "No budget rows configured for the selected accounting period",
        },
      ],
    };
  }

  return {
    title: "Budget P&L Target",
    rows: [
      moneyRow("Revenue Budget", budget.revenue),
      moneyRow("COGS / Direct Cost Budget", budget.cogs),
      moneyRow("Gross Profit Budget", budget.gross_profit),
      moneyRow("Operating Expense Budget", budget.operating_expenses),
      moneyRow("Operating Profit Budget", budget.operating_profit),
      {
        label: "Gross Margin Budget",
        value: formatPercent(budget.gross_margin_percent),
      },
      {
        label: "Operating Margin Budget",
        value: formatPercent(budget.operating_margin_percent),
      },
    ],
  };
}

function scenarioSection(scenario) {
  const variance = scenario.budget_variance;

  return {
    title: `${scenario.label} vs Budget`,
    rows: [
      moneyRow("Forecast Revenue", scenario.revenue, "Unavailable from base run-rate"),
      moneyRow("Revenue vs Budget", variance.revenue),
      {
        label: "Revenue vs Budget %",
        value: formatPercent(variance.revenue_percent),
      },
      moneyRow("Forecast COGS / Direct Costs", scenario.cogs, "Unavailable from base run-rate"),
      moneyRow("COGS vs Budget", variance.cogs),
      {
        label: "COGS vs Budget %",
        value: formatPercent(variance.cogs_percent),
      },
      moneyRow("Forecast Operating Expenses", scenario.operating_expenses, "Unavailable from base run-rate"),
      moneyRow("Operating Expenses vs Budget", variance.operating_expenses),
      {
        label: "Operating Expenses vs Budget %",
        value: formatPercent(variance.operating_expenses_percent),
      },
      moneyRow("Forecast Gross Profit", scenario.gross_profit, "Unavailable from base run-rate"),
      moneyRow("Gross Profit vs Budget", variance.gross_profit),
      {
        label: "Gross Margin Impact",
        value: formatPoints(variance.gross_margin_points),
      },
      moneyRow("Forecast Operating Profit", scenario.operating_profit, "Unavailable from base run-rate"),
      moneyRow("Operating Profit vs Budget", variance.operating_profit),
      {
        label: "Operating Margin Impact",
        value: formatPoints(variance.operating_margin_points),
      },
    ],
  };
}

function assumptionsSection(scenarios) {
  const conservative = scenarios.find(row => row.id === "conservative");
  const growth = scenarios.find(row => row.id === "growth");

  return {
    title: "Explicit Scenario Assumptions",
    rows: [
      {
        label: "Base",
        value: "0% adjustment to the guarded ledger run-rate",
      },
      {
        label: "Conservative",
        value: conservative
          ? `Revenue ${conservative.assumptions.revenue_change_percent.toFixed(2)}%, COGS ${conservative.assumptions.cogs_change_percent.toFixed(2)}%, Expenses ${conservative.assumptions.expense_change_percent.toFixed(2)}%`
          : "Unavailable",
      },
      {
        label: "Growth",
        value: growth
          ? `Revenue ${growth.assumptions.revenue_change_percent.toFixed(2)}%, COGS ${growth.assumptions.cogs_change_percent.toFixed(2)}%, Expenses ${growth.assumptions.expense_change_percent.toFixed(2)}%`
          : "Unavailable",
      },
      {
        label: "Cost variance convention",
        value: "Positive COGS or expense variance means forecast cost is above budget",
      },
    ],
  };
}

export default async function buildBudgetForecastScenarioAnalysis({
  organizationId,
  entityId,
  periodId,
  assumptions,
} = {}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) throw new Error("entityId required");
  if (!periodId) throw new Error("periodId required");

  const [varianceRows, scenarioResult, accountResult] = await Promise.all([
    calculateBudgetVariance({
      organizationId,
      entityId,
      periodId,
    }),
    buildForecastScenarios({
      organization_id: organizationId,
      entity_id: entityId,
      period_id: periodId,
      assumptions,
    }),
    supabaseAdmin
      .from("chart_of_accounts")
      .select("id, account_code, account_name, account_category, account_type, normal_balance")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId),
  ]);

  if (!scenarioResult?.success) {
    throw new Error(scenarioResult?.error || "Forecast scenarios failed");
  }
  if (accountResult.error) throw accountResult.error;

  const budget = buildBudgetTarget({
    varianceRows,
    accounts: accountResult.data || [],
    baseForecast: scenarioResult.base_forecast,
  });
  const scenarios = scenarioResult.scenarios.map(scenario =>
    scenarioAgainstBudget(scenario, budget)
  );
  const generatedAt = new Date().toISOString();

  const document = {
    title: "Forecast Scenarios vs Budget",
    entity: scenarioResult.document?.entity || null,
    period: scenarioResult.document?.period || null,
    currency: scenarioResult.document?.currency || {
      code: scenarioResult.currency_code || null,
    },
    sections: [
      budgetSection(budget, varianceRows),
      ...scenarios.map(scenarioSection),
      assumptionsSection(scenarios),
      {
        title: "Analysis Quality",
        rows: [
          {
            label: "Budget rows",
            value: `${varianceRows.length}`,
          },
          {
            label: "Budget completeness",
            value:
              budget.operating_profit === null
                ? "Incomplete P&L budget mapping"
                : "Complete P&L budget target",
          },
          {
            label: "Base forecast readiness",
            value: scenarioResult.base_forecast?.forecast_ready
              ? "Ready"
              : "Insufficient history for complete operating-profit forecasting",
          },
          {
            label: "Method",
            value: "Selected-period budget targets compared with explicit scenarios derived from the canonical guarded P&L run-rate",
          },
        ],
      },
    ],
    generated_at: generatedAt,
  };

  return {
    success: true,
    budget_available: varianceRows.length > 0,
    budget_complete: budget.operating_profit !== null,
    forecast_ready: scenarioResult.forecast_ready,
    organization_id: organizationId,
    entity_id: entityId,
    period_id: periodId,
    currency_code: scenarioResult.currency_code || null,
    budget,
    scenarios,
    variance: varianceRows,
    base_forecast: scenarioResult.base_forecast,
    document,
    generated_at: generatedAt,
  };
}
