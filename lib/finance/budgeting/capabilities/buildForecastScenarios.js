import buildProfitAndLossForecast from "./buildProfitAndLossForecast";

function roundMoney(value) {
  if (value === null || value === undefined) return null;
  return Number(Number(value).toFixed(2));
}

function percentage(value, base) {
  const denominator = Number(base || 0);
  if (!Number.isFinite(denominator) || denominator === 0) return null;
  return Number(((Number(value || 0) / denominator) * 100).toFixed(2));
}

function normalizePercent(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${fieldName} required`);
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid ${fieldName}`);
  }

  if (numeric < -100) {
    throw new Error(`${fieldName} must be at least -100`);
  }

  return numeric;
}

function normalizeAssumptions(name, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error(`${name} assumptions required`);
  }

  return {
    revenue_change_percent: normalizePercent(
      input.revenue_change_percent,
      `${name}.revenue_change_percent`
    ),
    cogs_change_percent: normalizePercent(
      input.cogs_change_percent,
      `${name}.cogs_change_percent`
    ),
    expense_change_percent: normalizePercent(
      input.expense_change_percent,
      `${name}.expense_change_percent`
    ),
  };
}

function adjust(value, percent) {
  if (value === null || value === undefined) return null;
  return Number(value) * (1 + Number(percent || 0) / 100);
}

function buildScenario({ id, label, baseForecast, assumptions }) {
  const revenueReady = baseForecast?.revenue?.forecast_ready !== false;
  const cogsReady = baseForecast?.cogs?.ready === true;
  const expensesReady = baseForecast?.expenses?.ready === true;

  const revenue = revenueReady
    ? adjust(
        baseForecast.projected_period_revenue,
        assumptions.revenue_change_percent
      )
    : null;
  const cogs = cogsReady
    ? adjust(
        baseForecast.projected_period_cogs,
        assumptions.cogs_change_percent
      )
    : null;
  const expenses = expensesReady
    ? adjust(
        baseForecast.projected_period_expenses,
        assumptions.expense_change_percent
      )
    : null;

  const grossProfit = revenue !== null && cogs !== null
    ? revenue - cogs
    : null;
  const operatingProfit = grossProfit !== null && expenses !== null
    ? grossProfit - expenses
    : null;

  return {
    id,
    label,
    forecast_ready: operatingProfit !== null,
    assumptions,
    revenue: roundMoney(revenue),
    cogs: roundMoney(cogs),
    gross_profit: roundMoney(grossProfit),
    operating_expenses: roundMoney(expenses),
    operating_profit: roundMoney(operatingProfit),
    gross_margin_percent:
      grossProfit === null ? null : percentage(grossProfit, revenue),
    operating_margin_percent:
      operatingProfit === null ? null : percentage(operatingProfit, revenue),
  };
}

function moneyRow(label, value, fallback = "Unavailable from base run-rate") {
  return value === null || value === undefined
    ? { label, value: fallback }
    : { label, amount: value };
}

function percentRow(label, value) {
  return {
    label,
    value:
      value === null || value === undefined
        ? "Unavailable"
        : `${Number(value).toFixed(2)}%`,
  };
}

function scenarioSection(scenario) {
  return {
    title: scenario.label,
    rows: [
      moneyRow("Revenue", scenario.revenue),
      moneyRow("Cost of Goods / Direct Costs", scenario.cogs),
      moneyRow("Gross Profit", scenario.gross_profit),
      moneyRow("Operating Expenses", scenario.operating_expenses),
      moneyRow("Operating Profit", scenario.operating_profit),
      percentRow("Gross Margin", scenario.gross_margin_percent),
      percentRow("Operating Margin", scenario.operating_margin_percent),
    ],
  };
}

function assumptionsSection(conservative, growth) {
  return {
    title: "Explicit Scenario Assumptions",
    rows: [
      {
        label: "Base",
        value: "0% adjustment to the canonical guarded ledger run-rate",
      },
      {
        label: "Conservative — Revenue",
        value: `${conservative.revenue_change_percent.toFixed(2)}%`,
      },
      {
        label: "Conservative — COGS / Direct Costs",
        value: `${conservative.cogs_change_percent.toFixed(2)}%`,
      },
      {
        label: "Conservative — Operating Expenses",
        value: `${conservative.expense_change_percent.toFixed(2)}%`,
      },
      {
        label: "Growth — Revenue",
        value: `${growth.revenue_change_percent.toFixed(2)}%`,
      },
      {
        label: "Growth — COGS / Direct Costs",
        value: `${growth.cogs_change_percent.toFixed(2)}%`,
      },
      {
        label: "Growth — Operating Expenses",
        value: `${growth.expense_change_percent.toFixed(2)}%`,
      },
    ],
  };
}

export default async function buildForecastScenarios({
  organization_id,
  entity_id = null,
  period_id = null,
  assumptions,
} = {}) {
  try {
    if (!organization_id) {
      throw new Error("organization_id required");
    }

    const conservative = normalizeAssumptions(
      "conservative",
      assumptions?.conservative
    );
    const growth = normalizeAssumptions(
      "growth",
      assumptions?.growth
    );

    const baseForecast = await buildProfitAndLossForecast({
      organization_id,
      entity_id,
      period_id,
    });

    if (!baseForecast?.success) {
      throw new Error(baseForecast?.error || "Base forecast failed");
    }

    const baseAssumptions = {
      revenue_change_percent: 0,
      cogs_change_percent: 0,
      expense_change_percent: 0,
    };

    const scenarios = [
      buildScenario({
        id: "base",
        label: "Base",
        baseForecast,
        assumptions: baseAssumptions,
      }),
      buildScenario({
        id: "conservative",
        label: "Conservative",
        baseForecast,
        assumptions: conservative,
      }),
      buildScenario({
        id: "growth",
        label: "Growth",
        baseForecast,
        assumptions: growth,
      }),
    ];

    const generatedAt = new Date().toISOString();
    const document = {
      title: "Forecast Scenarios",
      entity: baseForecast.document?.entity || null,
      period: baseForecast.document?.period || null,
      currency: baseForecast.document?.currency || {
        code: baseForecast.currency_code || null,
      },
      sections: [
        ...scenarios.map(scenarioSection),
        assumptionsSection(conservative, growth),
        {
          title: "Run-rate Quality",
          rows: [
            {
              label: "Base forecast readiness",
              value: baseForecast.forecast_ready
                ? "Ready"
                : "Insufficient history for a complete operating-profit run-rate",
            },
            {
              label: "Projection horizon",
              value: `${baseForecast.projection_days} calendar days`,
            },
            {
              label: "Scenario method",
              value: "Explicit caller assumptions applied to the canonical guarded P&L ledger run-rate",
            },
          ],
        },
      ],
      generated_at: generatedAt,
    };

    return {
      success: true,
      forecast_ready: scenarios.every(scenario => scenario.forecast_ready),
      assumption_source: "explicit_request",
      organization_id,
      entity_id,
      period_id,
      currency_code: baseForecast.currency_code || null,
      projection_days: baseForecast.projection_days,
      scenarios,
      base_forecast: baseForecast,
      document,
      generated_at: generatedAt,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
