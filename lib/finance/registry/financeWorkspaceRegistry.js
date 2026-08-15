function getFinanceWorkspaceItem(registry, itemId) {
  const finance = registry?.workspaces?.finance;
  const groups = Array.isArray(finance?.groups) ? finance.groups : [];

  for (const group of groups) {
    const items = Array.isArray(group?.items) ? group.items : [];
    const item = items.find(candidate => candidate?.id === itemId);
    if (item) return item;
  }

  return null;
}

function convergeBudgetingWorkspace(item) {
  if (!item) return;

  item.ui = {
    ...(item.ui || {}),
    rowsKey: "budgets",
    search: ["category", "currency_code", "year", "month"],
    name: row => row?.category || "Budget",
    subtitle: row => [
      row?.year && row?.month
        ? `${row.year}-${String(row.month).padStart(2, "0")}`
        : "-",
      `${row?.currency_code || ""} ${Number(row?.amount || 0).toFixed(2)}`.trim(),
    ],
  };

  item.runtime = {
    ...(item.runtime || {}),
    comparisonApi: "/api/finance/budgeting/comparison",
    scenarioComparisonApi: "/api/finance/budgeting/scenarios",
  };

  const actions = Array.isArray(item.actions) ? item.actions : [];
  const comparisonAction = {
    id: "budget_actual_forecast",
    type: "report",
    label: "Budget vs Actual vs Forecast",
    title: "Budget vs Actual vs Forecast",
    api: "/api/finance/budgeting/comparison",
    method: "GET",
  };

  item.actions = [
    comparisonAction,
    ...actions.filter(action =>
      action?.id !== comparisonAction.id &&
      action?.api !== comparisonAction.api
    ),
  ];
}

function convergeForecastingWorkspace(item) {
  if (!item) return;

  item.description =
    "Forecast revenue, direct costs, operating expenses and operating profit from posted ledger run-rates, then test explicit business scenarios against period budgets.";

  item.runtime = {
    ...(item.runtime || {}),
    forecastApi: "/api/finance/forecast",
    scenarioApi: "/api/finance/forecast/scenarios",
    scenarioBudgetApi: "/api/finance/budgeting/scenarios",
  };

  const actions = Array.isArray(item.actions) ? item.actions : [];
  const scenarioBudgetAction = {
    id: "forecast_scenarios_vs_budget",
    type: "workflow",
    label: "Scenarios vs Budget",
    title: "Forecast Scenarios vs Budget",
    engine: "finance_forecast_scenarios",
    api: "/api/finance/budgeting/scenarios",
    method: "POST",
  };
  const scenarioAction = {
    id: "forecast_scenarios",
    type: "workflow",
    label: "Forecast Scenarios",
    title: "Forecast Scenarios",
    engine: "finance_forecast_scenarios",
    api: "/api/finance/forecast/scenarios",
    method: "POST",
  };
  const forecastAction = {
    id: "profit_loss_forecast",
    type: "report",
    label: "P&L Forecast",
    title: "Profit & Loss Forecast",
    api: "/api/finance/forecast",
    method: "POST",
  };

  item.actions = [
    scenarioBudgetAction,
    scenarioAction,
    forecastAction,
    ...actions.filter(action =>
      action?.id !== scenarioBudgetAction.id &&
      action?.id !== scenarioAction.id &&
      action?.id !== forecastAction.id &&
      action?.api !== scenarioBudgetAction.api &&
      action?.api !== scenarioAction.api &&
      action?.api !== forecastAction.api &&
      action?.capability !== "buildRevenueForecast"
    ),
  ];
}

export function applyFinanceWorkspaceRegistry(registry) {
  convergeBudgetingWorkspace(
    getFinanceWorkspaceItem(registry, "budgeting")
  );
  convergeForecastingWorkspace(
    getFinanceWorkspaceItem(registry, "forecasting")
  );

  return registry;
}
