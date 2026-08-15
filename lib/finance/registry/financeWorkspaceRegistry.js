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
    "Forecast revenue, direct costs, operating expenses and operating profit from posted ledger run-rates.";

  item.runtime = {
    ...(item.runtime || {}),
    forecastApi: "/api/finance/forecast",
  };

  const actions = Array.isArray(item.actions) ? item.actions : [];
  const forecastAction = {
    id: "profit_loss_forecast",
    type: "report",
    label: "P&L Forecast",
    title: "Profit & Loss Forecast",
    api: "/api/finance/forecast",
    method: "POST",
  };

  item.actions = [
    forecastAction,
    ...actions.filter(action =>
      action?.id !== forecastAction.id &&
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
