import { getFinanceWorkspaceContract } from "@/lib/finance/workspaces/FinanceWorkspaceContracts";
import { applyFinanceConfigurationContractConvergence } from "@/lib/finance/workspaces/FinanceConfigurationContractConvergence";
import { resolveFinanceOperationalAction } from "@/lib/finance/ui/FinancePrimaryActionPolicy";
import { applyFinanceCapabilityPresentation } from "@/lib/finance/ui/FinanceCapabilityPresentation";
import {
  FINANCE_POSTING_EVENT_OPTIONS,
  FINANCE_POSTING_SOURCE_OPTIONS,
} from "@/lib/finance/general-ledger/FinancePostingRuleVocabulary";

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
    "Forecast revenue, direct costs, operating expenses and operating profit from posted ledger run-rates, test explicit business scenarios against period budgets, preserve approved scenario versions, measure approved forecast accuracy across legal entities, govern management exceptions, deliver escalation accountability, and provide organization-wide governance oversight.";

  item.runtime = {
    ...(item.runtime || {}),
    forecastApi: "/api/finance/forecast",
    scenarioApi: "/api/finance/forecast/scenarios",
    scenarioBudgetApi: "/api/finance/budgeting/scenarios",
    versionsApi: "/api/finance/forecast/versions",
    accuracyApi: "/api/finance/forecast/accuracy",
    accuracyHistoryApi: "/api/finance/forecast/accuracy/history",
    accuracyPortfolioApi: "/api/finance/forecast/accuracy/portfolio",
    accuracyExceptionsApi: "/api/finance/forecast/accuracy/exceptions",
    accuracyExceptionOversightApi:
      "/api/finance/forecast/accuracy/exceptions/oversight",
    governanceDashboardApi: "/api/finance/forecast/governance/dashboard",
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
  const governanceDashboardAction = {
    id: "forecast_governance_dashboard",
    type: "workflow",
    label: "Governance Dashboard",
    title: "Forecast Governance Management Dashboard",
    engine: "finance_forecast_governance_dashboard",
    api: "/api/finance/forecast/governance/dashboard",
    method: "GET",
    historyLimit: 12,
  };
  const exceptionsAction = {
    id: "forecast_exceptions",
    type: "workflow",
    label: "Forecast Exceptions",
    title: "Forecast Management Exceptions",
    engine: "finance_forecast_exceptions",
    api: "/api/finance/forecast/accuracy/exceptions",
    method: "GET",
    historyLimit: 12,
  };
  const oversightAction = {
    id: "forecast_exception_oversight",
    type: "workflow",
    label: "Exception Oversight",
    title: "Forecast Exception Oversight",
    engine: "finance_forecast_exception_oversight",
    api: "/api/finance/forecast/accuracy/exceptions/oversight",
    method: "GET",
    historyLimit: 12,
  };
  const performanceAction = {
    id: "forecast_performance",
    type: "workflow",
    label: "Forecast Performance",
    title: "Forecast Performance",
    engine: "finance_forecast_performance",
    api: "/api/finance/forecast/accuracy/history",
    method: "GET",
    historyLimit: 12,
  };
  const portfolioAction = {
    id: "forecast_portfolio",
    type: "workflow",
    label: "Forecast Portfolio",
    title: "Forecast Portfolio",
    engine: "finance_forecast_portfolio",
    api: "/api/finance/forecast/accuracy/portfolio",
    method: "GET",
    historyLimit: 12,
  };
  const accuracyAction = {
    id: "forecast_accuracy",
    type: "report",
    label: "Forecast Accuracy",
    title: "Approved Forecast Accuracy",
    api: "/api/finance/forecast/accuracy",
    method: "GET",
  };
  const accuracyHistoryAction = {
    id: "forecast_accuracy_history",
    type: "report",
    label: "Forecast Accuracy History",
    title: "Approved Forecast Accuracy History",
    api: "/api/finance/forecast/accuracy/history",
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
    governanceDashboardAction,
    scenarioBudgetAction,
    scenarioAction,
    versionsAction,
    exceptionsAction,
    oversightAction,
    performanceAction,
    portfolioAction,
    accuracyAction,
    accuracyHistoryAction,
    forecastAction,
    ...actions.filter(action =>
      action?.id !== governanceDashboardAction.id &&
      action?.id !== scenarioBudgetAction.id &&
      action?.id !== scenarioAction.id &&
      action?.id !== versionsAction.id &&
      action?.id !== exceptionsAction.id &&
      action?.id !== oversightAction.id &&
      action?.id !== performanceAction.id &&
      action?.id !== portfolioAction.id &&
      action?.id !== accuracyAction.id &&
      action?.id !== accuracyHistoryAction.id &&
      action?.id !== forecastAction.id &&
      action?.api !== governanceDashboardAction.api &&
      action?.api !== scenarioBudgetAction.api &&
      action?.api !== scenarioAction.api &&
      action?.api !== versionsAction.api &&
      action?.api !== exceptionsAction.api &&
      action?.api !== oversightAction.api &&
      action?.api !== performanceAction.api &&
      action?.api !== portfolioAction.api &&
      action?.api !== accuracyAction.api &&
      action?.api !== accuracyHistoryAction.api &&
      action?.api !== forecastAction.api &&
      action?.capability !== "buildRevenueForecast"
    ),
  ];
}

function convergeCustomerPaymentsWorkspace(item) {
  if (!item) return;

  const prepaymentAction = {
    id: "manage_customer_prepayments",
    type: "workflow",
    label: "Manage Customer Prepayments",
    title: "Manage Customer Prepayments",
    engine: "finance_customer_prepayment_management",
    api: "/api/finance/customer-payments/prepayments",
    method: "POST",
  };

  const actions = Array.isArray(item.actions) ? item.actions : [];
  const currentTopMenu = Array.isArray(item.topMenu)
    ? item.topMenu
    : Array.isArray(item.ui?.topMenu)
      ? item.ui.topMenu
      : [];

  item.actions = [
    prepaymentAction,
    ...actions.filter(action => action?.id !== prepaymentAction.id),
  ];
  item.topMenu = [
    prepaymentAction,
    ...currentTopMenu.filter(action => action?.id !== prepaymentAction.id),
  ];
  item.ui = {
    ...(item.ui || {}),
    topMenu: item.topMenu,
  };
}

function convergeAccountingSettingsWorkspace(item) {
  if (!item) return;

  const customerDepositAction = {
    id: "customer_deposit_liability",
    type: "workflow",
    label: "Customer Deposit Accounting",
    title: "Customer Deposit Accounting",
    engine: "finance_customer_deposit_liability",
    api: "/api/finance/accounting-settings/customer-deposit-liability",
    method: "POST",
  };

  const itemActions = Array.isArray(item.actions) ? item.actions : [];
  item.actions = [
    customerDepositAction,
    ...itemActions.filter(action => action?.id !== customerDepositAction.id),
  ];

  const contract = getFinanceWorkspaceContract("accounting_settings");
  if (contract) {
    const contractActions = Array.isArray(contract.actions) ? contract.actions : [];
    contract.actions = [
      customerDepositAction,
      ...contractActions.filter(action => action?.id !== customerDepositAction.id),
    ];
  }
}

function convergePostingRulesWorkspace() {
  const contract = getFinanceWorkspaceContract("posting_rules");
  if (!contract || !Array.isArray(contract.schema)) return;

  contract.schema = contract.schema.map(field => {
    if (field?.name === "event_type") {
      return {
        ...field,
        type: "select",
        label: "Accounting Event",
        options: FINANCE_POSTING_EVENT_OPTIONS,
        required: true,
      };
    }
    if (field?.name === "source_module") {
      return {
        ...field,
        type: "select",
        label: "Source Domain",
        options: FINANCE_POSTING_SOURCE_OPTIONS,
        required: true,
      };
    }
    return field;
  });
}

function convergeClosedOperationalWorkspace(workspaceId, { form = null, readOnly = false } = {}) {
  const contract = getFinanceWorkspaceContract(workspaceId);
  const operationalAction = resolveFinanceOperationalAction(workspaceId);
  if (!contract || !operationalAction) return;

  const action = form
    ? {
        ...operationalAction,
        type: "workflow",
        capability: workspaceId,
        action: operationalAction.id,
        form,
      }
    : operationalAction;

  const contractActions = Array.isArray(contract.actions) ? contract.actions : [];
  contract.actions = [
    action,
    ...contractActions.filter(candidate => candidate?.id !== action.id),
  ];

  if (readOnly) contract.readOnly = true;
}

export function applyFinanceWorkspaceRegistry(registry) {
  applyFinanceConfigurationContractConvergence();
  convergeBudgetingWorkspace(getFinanceWorkspaceItem(registry, "budgeting"));
  convergeForecastingWorkspace(getFinanceWorkspaceItem(registry, "forecasting"));
  convergeCustomerPaymentsWorkspace(getFinanceWorkspaceItem(registry, "customer_payments"));
  convergeAccountingSettingsWorkspace(getFinanceWorkspaceItem(registry, "accounting_settings"));
  convergePostingRulesWorkspace();

  convergeClosedOperationalWorkspace("customer_statements", {
    form: "customer-statement-generate",
    readOnly: true,
  });
  convergeClosedOperationalWorkspace("cash_management", { readOnly: true });
  convergeClosedOperationalWorkspace("bank_reconciliation", {
    form: "bank-reconciliation-run",
    readOnly: true,
  });
  convergeClosedOperationalWorkspace("depreciation", {
    form: "depreciation-run",
    readOnly: true,
  });

  applyFinanceCapabilityPresentation(registry);
  return registry;
}
