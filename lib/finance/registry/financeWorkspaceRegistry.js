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
    approvedComparisonApi:
      "/api/finance/budgeting/comparison?forecastSource=approved&scenarioKind=SCENARIOS_VS_BUDGET",
    scenarioComparisonApi: "/api/finance/budgeting/scenarios",
  };

  const actions = Array.isArray(item.actions) ? item.actions : [];
  const comparisonAction = {
    id: "budget_actual_forecast",
    type: "report",
    label: "Budget vs Actual vs Live Forecast",
    title: "Budget vs Actual vs Live Forecast",
    api: "/api/finance/budgeting/comparison",
    method: "GET",
  };
  const approvedComparisonAction = {
    id: "budget_actual_approved_forecast",
    type: "report",
    label: "Budget vs Actual vs Approved Forecast",
    title: "Budget vs Actual vs Approved Forecast",
    api: "/api/finance/budgeting/comparison?forecastSource=approved&scenarioKind=SCENARIOS_VS_BUDGET",
    method: "GET",
  };

  item.actions = [
    comparisonAction,
    approvedComparisonAction,
    ...actions.filter(action =>
      action?.id !== comparisonAction.id &&
      action?.id !== approvedComparisonAction.id &&
      action?.api !== comparisonAction.api &&
      action?.api !== approvedComparisonAction.api
    ),
  ];
}

function convergeForecastingWorkspace(item) {
  if (!item) return;

  item.description =
    "Forecast revenue, direct costs, operating expenses and operating profit from posted ledger run-rates, test explicit business scenarios against period budgets, preserve approved scenario versions, and measure approved forecast accuracy against ledger actuals.";

  item.runtime = {
    ...(item.runtime || {}),
    forecastApi: "/api/finance/forecast",
    scenarioApi: "/api/finance/forecast/scenarios",
    scenarioBudgetApi: "/api/finance/budgeting/scenarios",
    versionsApi: "/api/finance/forecast/versions",
    accuracyApi: "/api/finance/forecast/accuracy",
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
    persistApi: "/api/finance/forecast/versions",
    scenarioKind: "SCENARIOS_VS_BUDGET",
  };
  const scenarioAction = {
    id: "forecast_scenarios",
    type: "workflow",
    label: "Forecast Scenarios",
    title: "Forecast Scenarios",
    engine: "finance_forecast_scenarios",
    api: "/api/finance/forecast/scenarios",
    method: "POST",
    persistApi: "/api/finance/forecast/versions",
    scenarioKind: "SCENARIOS",
  };
  const versionsAction = {
    id: "forecast_versions",
    type: "workflow",
    label: "Forecast Versions",
    title: "Forecast Versions",
    engine: "finance_forecast_versions",
    api: "/api/finance/forecast/versions",
    method: "GET",
  };
  const accuracyAction = {
    id: "forecast_accuracy",
    type: "report",
    label: "Forecast Accuracy",
    title: "Approved Forecast Accuracy",
    api: "/api/finance/forecast/accuracy",
    method: "GET",
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
    versionsAction,
    accuracyAction,
    forecastAction,
    ...actions.filter(action =>
      action?.id !== scenarioBudgetAction.id &&
      action?.id !== scenarioAction.id &&
      action?.id !== versionsAction.id &&
      action?.id !== accuracyAction.id &&
      action?.id !== forecastAction.id &&
      action?.api !== scenarioBudgetAction.api &&
      action?.api !== scenarioAction.api &&
      action?.api !== versionsAction.api &&
      action?.api !== accuracyAction.api &&
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
