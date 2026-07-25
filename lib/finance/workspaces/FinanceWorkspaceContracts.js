const entityWorkspace = (tables, search, actions = []) => ({
  scope: "entity",
  tables,
  search,
  actions,
});

const organizationWorkspace = (tables, search, actions = []) => ({
  scope: "organization",
  tables,
  search,
  actions,
});

export const FINANCE_WORKSPACE_CONTRACTS = Object.freeze({
  opening_balances: entityWorkspace(
    ["opening_balances"],
    ["reference", "posting_date", "status", "description"]
  ),
  recurring_journals: entityWorkspace(
    ["recurring_journals"],
    ["name", "reference", "frequency", "next_run_date", "status"]
  ),
  collections: entityWorkspace(
    ["collection_cases", "accounts_receivable"],
    ["customer_name", "invoice_number", "due_date", "status"]
  ),
  customer_statements: entityWorkspace(
    ["customer_statements", "accounts_receivable"],
    ["customer_name", "statement_date", "invoice_number", "status"]
  ),
  revenue_recognition: entityWorkspace(
    ["revenue_recognition_schedules", "revenue_recognition"],
    ["contract_reference", "customer_name", "recognition_date", "status"]
  ),
  vendor_statements: entityWorkspace(
    ["vendor_statements", "accounts_payable"],
    ["vendor_name", "invoice_number", "due_date", "status"]
  ),
  cash_management: entityWorkspace(
    ["cash_positions", "cash_flow_snapshots", "bank_ledger"],
    ["bank_account_name", "transaction_type", "currency_code", "created_at"],
    [
      {
        id: "refresh_liquidity",
        type: "runtime",
        label: "Refresh Liquidity",
        endpoint: "/api/finance/treasury/liquidity",
        method: "POST",
      },
    ]
  ),
  bank_statements: entityWorkspace(
    ["bank_statements"],
    ["statement_number", "bank_account_name", "statement_date", "status"]
  ),
  bank_reconciliation: entityWorkspace(
    ["bank_reconciliations", "bank_reconciliation_sessions"],
    ["bank_account_name", "statement_date", "status"],
    [
      {
        id: "run_reconciliation",
        type: "runtime",
        label: "Start Reconciliation",
        endpoint: "/api/finance/reconciliation",
        method: "PUT",
      },
    ]
  ),
  fx_revaluation: entityWorkspace(
    ["fx_revaluation_runs", "finance_fx_revaluations"],
    ["revaluation_date", "currency_code", "status"],
    [
      {
        id: "run_fx_revaluation",
        type: "runtime",
        label: "Run FX Revaluation",
        endpoint: "/api/finance/fx-revaluation/run",
        method: "POST",
      },
    ]
  ),
  vat_returns: entityWorkspace(
    ["vat_returns", "finance_vat_returns"],
    ["period_name", "return_reference", "status", "submitted_at"]
  ),
  depreciation: entityWorkspace(
    ["depreciation_runs", "asset_depreciation_runs"],
    ["period_name", "run_date", "status"],
    [
      {
        id: "run_depreciation",
        type: "runtime",
        label: "Run Depreciation",
        endpoint: "/api/finance/depreciation/run",
        method: "POST",
      },
    ]
  ),
  statutory_filings: entityWorkspace(
    ["statutory_filings", "finance_statutory_filings"],
    ["filing_type", "period_name", "due_date", "status"]
  ),
  report_builder: organizationWorkspace(
    ["finance_report_templates", "report_templates"],
    ["name", "report_type", "status", "updated_at"]
  ),
  scheduled_reports: organizationWorkspace(
    ["finance_scheduled_reports", "scheduled_reports"],
    ["name", "frequency", "next_run_at", "status"]
  ),
  organization_profile: organizationWorkspace(
    ["finance_organization_profiles"],
    ["legal_name", "accounting_standard", "functional_currency", "updated_at"]
  ),
  accounting_settings: organizationWorkspace(
    ["finance_accounting_settings", "accounting_settings"],
    ["setting_key", "name", "status", "updated_at"]
  ),
  number_sequences: organizationWorkspace(
    ["document_number_sequences"],
    ["document_type", "prefix", "year", "month"]
  ),
  posting_rules: organizationWorkspace(
    ["finance_posting_mappings", "posting_rules"],
    ["event_type", "source_module", "effective_from", "status"]
  ),
  approval_workflows: organizationWorkspace(
    ["finance_approval_workflows", "approval_workflows"],
    ["name", "document_type", "effective_from", "status"]
  ),
  government_connections: organizationWorkspace(
    ["finance_government_connections", "government_connections"],
    ["authority_name", "connection_type", "status", "updated_at"]
  ),
  banking_integrations: organizationWorkspace(
    ["finance_banking_integrations", "banking_integrations"],
    ["provider_name", "connection_type", "status", "updated_at"]
  ),
  exchange_rates: organizationWorkspace(
    ["exchange_rates", "finance_exchange_rates"],
    ["base_currency", "quote_currency", "effective_date", "source"]
  ),
  e_invoicing: organizationWorkspace(
    ["finance_e_invoicing_settings", "e_invoicing_settings"],
    ["network", "document_type", "status", "updated_at"]
  ),
  document_templates: organizationWorkspace(
    ["document_templates", "finance_document_templates"],
    ["name", "document_type", "status", "updated_at"]
  ),
});

export function getFinanceWorkspaceContract(capabilityId) {
  return FINANCE_WORKSPACE_CONTRACTS[capabilityId] || null;
}
