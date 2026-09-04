export const FINANCE_PRIMARY_ACTION_POLICY = Object.freeze({
  chart_of_accounts: { mode: "create" },
  general_ledger: { mode: "none" },
  journals: { mode: "create" },
  trial_balance: { mode: "none" },
  fiscal_periods: {
    mode: "create",
    create: {
      enabled: true,
      type: "document",
      engine: "create",
      id: "fiscal_period",
      form: "fiscal-period",
      api: "/api/finance/periods/open",
      label: "+ Fiscal Period",
      title: "New Fiscal Period",
      submitLabel: "Create Period",
    },
  },
  dimensions: {
    mode: "create",
    create: {
      enabled: true,
      type: "document",
      engine: "create",
      id: "finance_dimension",
      form: "finance-dimension",
      api: "/api/finance/dimensions/upsert",
      endpoint: "/api/finance/dimensions/upsert",
      label: "+ Custom Dimension",
      title: "New Custom Dimension",
      submitLabel: "Create Custom Dimension",
    },
  },
  opening_balances: { mode: "create" },
  recurring_journals: { mode: "create" },

  customers: { mode: "create" },
  customer_invoices: { mode: "create" },
  accounts_receivable: { mode: "none" },
  customer_payments: {
    mode: "create",
    create: {
      enabled: true,
      type: "document",
      engine: "create",
      id: "customer_payment",
      form: "customer-payment",
      api: "/api/finance/customer-payments/create",
      label: "+ Customer Receipt",
      title: "Receive Customer Payment",
      submitLabel: "Post Receipt",
    },
  },
  collections: { mode: "none" },
  customer_statements: {
    mode: "action",
    action: {
      id: "generate_statement",
      type: "workflow",
      label: "Generate Statement",
      title: "Generate Customer Statement",
      capability: "customer_statements",
      action: "generate_statement",
      form: "customer-statement-generate",
      endpoint: "/api/finance/customer-statements/generate",
      method: "POST",
    },
  },
  revenue_recognition: { mode: "create" },

  vendors: { mode: "create" },
  purchase_orders: { mode: "none" },
  goods_receipts: { mode: "none" },
  vendor_bills: { mode: "create" },
  invoice_matching: { mode: "none" },
  accounts_payable: { mode: "create" },
  vendor_payments: {
    mode: "create",
    create: {
      enabled: true,
      type: "document",
      engine: "create",
      id: "vendor_payment",
      form: "vendor-payment",
      api: "/api/finance/accounts-payable/pay",
      label: "+ Vendor Payment",
      title: "Pay Vendor",
      submitLabel: "Post Payment",
    },
  },
  vendor_statements: { mode: "none" },

  bank_accounts: { mode: "create" },
  cash_management: { mode: "none" },
  bank_statements: {
    mode: "create",
    create: {
      enabled: true,
      type: "document",
      engine: "create",
      id: "bank_statement_import",
      api: "/api/finance/bank-statements/import",
      endpoint: "/api/finance/bank-statements/import",
      label: "+ Import Statement",
      title: "Import Bank Statement",
      submitLabel: "Import Statement",
    },
  },
  cash_flow: { mode: "none" },
  bank_reconciliation: {
    mode: "action",
    action: {
      id: "run_reconciliation",
      type: "runtime",
      label: "Start Reconciliation",
      title: "Start Bank Reconciliation",
      endpoint: "/api/finance/reconciliation/run",
      method: "POST",
    },
  },
  payments: { mode: "none" },
  fx_revaluation: { mode: "none" },

  tax: { mode: "none" },
  vat_returns: { mode: "none" },
  tax_codes: { mode: "create" },
  fixed_assets: { mode: "create" },
  depreciation: {
    mode: "action",
    action: {
      id: "run_depreciation",
      type: "runtime",
      label: "Run Depreciation",
      title: "Run Depreciation",
      endpoint: "/api/finance/depreciation/run",
      method: "POST",
    },
  },
  audit_trail: { mode: "none" },
  period_close: {
    mode: "action",
    action: {
      id: "run_period_close",
      type: "runtime",
      label: "Run Month-End Close",
      title: "Run Month-End Close",
      endpoint: "/api/finance/month-end/close-period",
      method: "POST",
    },
  },
  year_end: {
    mode: "action",
    action: {
      id: "run_year_end",
      type: "runtime",
      label: "Run Year End",
      title: "Close Fiscal Year",
      endpoint: "/api/finance/year-end/close-fiscal-year",
      method: "POST",
    },
  },
  statutory_filings: { mode: "create" },

  legal_entities: { mode: "create" },
  cost_centers: {
    mode: "create",
    create: {
      enabled: true,
      type: "document",
      engine: "create",
      id: "cost_center",
      form: "cost-center",
      api: "/api/finance/cost-centers/create",
      endpoint: "/api/finance/cost-centers/create",
      label: "+ Cost Centre",
      title: "New Cost Centre",
      submitLabel: "Create Cost Centre",
    },
  },
  currencies: { mode: "create" },
  intercompany: { mode: "create" },
  payment_terms: { mode: "create" },
  consolidation: {
    mode: "action",
    action: {
      id: "run_consolidation",
      type: "runtime",
      label: "Run Consolidation",
      title: "Run Consolidation",
      endpoint: "/api/finance/consolidation",
      method: "POST",
    },
  },

  budgeting: { mode: "create" },
  forecasting: {
    mode: "action",
    action: {
      id: "run_forecast",
      type: "runtime",
      label: "Run Forecast",
      title: "Run Forecast",
      endpoint: "/api/finance/forecast",
      method: "POST",
    },
  },
  finance_kpis: { mode: "none" },
  executive_dashboard: { mode: "none" },
  financial_health: { mode: "none" },
  ai_insights: { mode: "none" },

  financial_statements: {
    mode: "action",
    action: {
      id: "generate_statements",
      type: "reports",
      label: "Generate Statements",
      title: "Generate Financial Statements",
    },
  },
  management_reports: {
    mode: "action",
    action: {
      id: "generate_management_report",
      type: "reports",
      label: "Generate Report",
      title: "Generate Management Report",
    },
  },
  finance_analytics: {
    mode: "action",
    action: {
      id: "open_finance_reports",
      type: "reports",
      label: "Open Reports",
      title: "Open Finance Reports",
    },
  },
  report_builder: { mode: "create" },
  scheduled_reports: { mode: "create" },

  organization_profile: { mode: "create" },
  accounting_settings: { mode: "create" },
  number_sequences: { mode: "create" },
  posting_rules: { mode: "create" },
  approval_workflows: { mode: "create" },
  government_connections: { mode: "create" },
  banking_integrations: { mode: "create" },
  exchange_rates: { mode: "create" },
  e_invoicing: { mode: "create" },
  document_templates: { mode: "create" },
  finance_permissions: { mode: "create" },
});

export function getFinancePrimaryActionPolicy(workspaceId) {
  return FINANCE_PRIMARY_ACTION_POLICY[workspaceId] || null;
}

export function resolveFinanceOperationalAction(workspaceId) {
  const policy = getFinancePrimaryActionPolicy(workspaceId);

  if (!policy || policy.mode !== "action") {
    return null;
  }

  return {
    enabled: true,
    ...policy.action,
  };
}
