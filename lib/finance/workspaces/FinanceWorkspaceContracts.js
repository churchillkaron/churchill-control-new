const text = (name, label, required = false, extra = {}) => ({ name, label, type: "text", required, ...extra });
const date = (name, label, required = false, extra = {}) => ({ name, label, type: "date", required, ...extra });
const number = (name, label, required = false, extra = {}) => ({ name, label, type: "number", required, ...extra });
const lookup = (name, label, source, required = false, extra = {}) => ({ name, label, type: "lookup", lookup: source, required, ...extra });
const select = (name, label, options, required = false, extra = {}) => ({ name, label, type: "select", options, required, ...extra });
const textarea = (name, label, required = false, extra = {}) => ({ name, label, type: "textarea", required, width: "full", ...extra });
const currency = (name = "currency_code", label = "Currency", required = true) => ({ name, label, type: "currency", required });
const lines = (columns) => ({ name: "lines", label: "Lines", type: "table", required: true, width: "full", columns });

const entityWorkspace = ({ table, fallbacks = [], search, schema = null, actions = [], readOnly = false }) => ({
  scope: "entity", table, tables: [table, ...fallbacks].filter(Boolean), search, schema, actions, readOnly,
});

const organizationWorkspace = ({ table, fallbacks = [], search, schema = null, actions = [], readOnly = false, singleton = false }) => ({
  scope: "organization", table, tables: [table, ...fallbacks].filter(Boolean), search, schema, actions, readOnly, singleton,
});

const journalLineColumns = [
  { name: "account_id", label: "Account", type: "lookup", lookup: "chart_of_accounts", required: true },
  { name: "description", label: "Description", required: true },
  { name: "debit", label: "Debit", type: "number" },
  { name: "credit", label: "Credit", type: "number" },
  { name: "cost_center_id", label: "Cost Center", type: "lookup", lookup: "cost_centers" },
  { name: "department_id", label: "Department", type: "lookup", lookup: "departments" },
  { name: "project_id", label: "Project", type: "lookup", lookup: "projects" },
];

export const FINANCE_WORKSPACE_CONTRACTS = Object.freeze({
  opening_balances: entityWorkspace({
    table: "finance_opening_balance_batches",
    search: ["reference", "posting_date", "status", "description"],
    schema: [text("reference", "Reference", true), date("posting_date", "Posting Date", true), currency(), textarea("description", "Description"), lines(journalLineColumns)],
  }),
  recurring_journals: entityWorkspace({
    table: "finance_recurring_journal_templates",
    search: ["name", "reference", "frequency", "next_run_date", "status"],
    schema: [text("name", "Template Name", true), text("reference", "Reference"), select("frequency", "Frequency", ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"], true), date("next_run_date", "Next Run Date", true), date("end_date", "End Date"), currency(), textarea("description", "Description"), lines(journalLineColumns)],
  }),
  collections: entityWorkspace({
    table: "finance_collection_cases", fallbacks: ["accounts_receivable"],
    search: ["case_reference", "customer_name", "invoice_number", "opened_date", "priority", "status"],
    schema: [lookup("customer_id", "Customer", "customers", true), lookup("customer_invoice_id", "Customer Invoice", "customer_invoices"), text("case_reference", "Case Reference", true), date("opened_date", "Opened Date", true), select("priority", "Priority", ["LOW", "NORMAL", "HIGH", "CRITICAL"], true), date("promised_payment_date", "Promised Payment Date"), textarea("notes", "Notes")],
  }),
  customer_statements: entityWorkspace({ table: "accounts_receivable", search: ["customer_name", "invoice_number", "due_date", "status"], readOnly: true }),
  revenue_recognition: entityWorkspace({
    table: "finance_revenue_recognition_schedules",
    search: ["contract_reference", "source_document_type", "start_date", "end_date", "status"],
    schema: [lookup("customer_id", "Customer", "customers"), select("source_document_type", "Source Document", ["CUSTOMER_INVOICE", "CONTRACT", "SALES_ORDER", "MANUAL"], true), text("source_document_id", "Source Document ID"), text("contract_reference", "Contract Reference"), select("recognition_method", "Recognition Method", ["STRAIGHT_LINE", "MILESTONE", "USAGE", "DELIVERY", "MANUAL"], true), date("start_date", "Start Date", true), date("end_date", "End Date", true), number("total_amount", "Total Amount", true, { min: 0 }), currency(), lookup("revenue_account_id", "Revenue Account", "chart_of_accounts", true), lookup("deferred_revenue_account_id", "Deferred Revenue Account", "chart_of_accounts"), textarea("notes", "Notes")],
  }),
  vendor_statements: entityWorkspace({ table: "accounts_payable", search: ["vendor_name", "invoice_number", "due_date", "status"], readOnly: true }),
  cash_management: entityWorkspace({ table: "bank_ledger", fallbacks: ["cash_flow_snapshots"], search: ["bank_account_name", "reference_number", "transaction_type", "currency_code", "created_at"], readOnly: true }),
  bank_statements: entityWorkspace({
    table: "finance_bank_statement_imports", search: ["statement_number", "statement_start_date", "statement_end_date", "status"],
    schema: [lookup("bank_account_id", "Bank Account", "bank_accounts", true), text("statement_number", "Statement Number", true), date("statement_start_date", "Start Date", true), date("statement_end_date", "End Date", true), number("opening_balance", "Opening Balance", true), number("closing_balance", "Closing Balance", true), currency(), text("source_file_url", "Source File URL"), text("import_reference", "Import Reference")],
  }),
  bank_reconciliation: entityWorkspace({
    table: "finance_bank_reconciliation_runs", search: ["reconciliation_date", "status", "book_closing_balance", "statement_closing_balance"],
    schema: [lookup("bank_account_id", "Bank Account", "bank_accounts", true), lookup("bank_statement_id", "Bank Statement", "bank_statements"), date("reconciliation_date", "Reconciliation Date", true), number("book_closing_balance", "Book Closing Balance"), number("statement_closing_balance", "Statement Closing Balance"), textarea("notes", "Notes")],
  }),
  fx_revaluation: entityWorkspace({
    table: "finance_fx_revaluation_runs", search: ["revaluation_date", "currency_code", "rate_source", "status"],
    schema: [date("revaluation_date", "Revaluation Date", true), currency(), text("rate_source", "Rate Source", true), lookup("unrealized_gain_account_id", "Unrealised Gain Account", "chart_of_accounts", true), lookup("unrealized_loss_account_id", "Unrealised Loss Account", "chart_of_accounts", true), textarea("notes", "Notes")],
  }),
  vat_returns: entityWorkspace({
    table: "finance_vat_returns", search: ["registration_reference", "jurisdiction_code", "period_start", "period_end", "status"],
    schema: [text("registration_reference", "Tax Registration Reference", true), text("jurisdiction_code", "Jurisdiction Code", true), date("period_start", "Period Start", true), date("period_end", "Period End", true), date("filing_due_date", "Filing Due Date"), currency(), textarea("notes", "Notes")],
  }),
  depreciation: entityWorkspace({ table: "finance_depreciation_runs", search: ["book_reference", "period_start", "period_end", "posting_date", "status"], schema: [text("book_reference", "Asset Book", true), date("period_start", "Period Start", true), date("period_end", "Period End", true), date("posting_date", "Posting Date", true), textarea("notes", "Notes")] }),
  statutory_filings: entityWorkspace({
    table: "finance_statutory_filings", search: ["filing_type", "jurisdiction_code", "authority_name", "due_date", "status"],
    schema: [text("filing_type", "Filing Type", true), text("jurisdiction_code", "Jurisdiction Code", true), text("authority_name", "Authority Name"), date("period_start", "Period Start", true), date("period_end", "Period End", true), date("due_date", "Due Date", true), text("submission_reference", "Submission Reference"), textarea("notes", "Notes")],
  }),
  report_builder: organizationWorkspace({ table: "finance_report_templates", search: ["name", "report_type", "status", "updated_at"], schema: [text("name", "Report Name", true), select("report_type", "Report Type", ["FINANCIAL_STATEMENT", "MANAGEMENT", "SUBLEDGER", "TAX", "CUSTOM"], true), textarea("description", "Description"), textarea("definition_json", "Report Definition JSON", true, { placeholder: "{}" })] }),
  scheduled_reports: organizationWorkspace({ table: "finance_scheduled_reports", search: ["name", "frequency", "next_run_at", "status"], schema: [lookup("report_template_id", "Report Template", "finance_report_templates", true), text("name", "Schedule Name", true), select("frequency", "Frequency", ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"], true), { name: "next_run_at", label: "Next Run", type: "datetime-local", required: true }, text("recipient_list", "Recipients", true, { placeholder: "finance@example.com, owner@example.com" }), select("delivery_format", "Delivery Format", ["PDF", "XLSX", "CSV"], true), text("timezone", "Timezone", true)] }),
  organization_profile: organizationWorkspace({ table: "finance_organization_profiles", search: ["legal_name", "country_code", "functional_currency", "accounting_standard"], singleton: true, schema: [text("legal_name", "Legal Name", true), text("country_code", "Country Code", true), currency("functional_currency", "Functional Currency", true), currency("reporting_currency", "Reporting Currency", false), text("accounting_standard", "Accounting Standard", true), number("fiscal_year_start_month", "Fiscal Year Start Month", true, { min: 1, max: 12 }), text("timezone", "Timezone", true)] }),
  accounting_settings: organizationWorkspace({ table: "finance_accounting_settings", search: ["setting_key", "name", "effective_from", "status"], schema: [text("setting_key", "Setting Key", true), text("name", "Setting Name", true), textarea("value_json", "Configuration JSON", true, { placeholder: "{}" }), date("effective_from", "Effective From", true), date("effective_to", "Effective To")] }),
  number_sequences: organizationWorkspace({ table: "finance_number_sequences", search: ["document_type", "prefix", "next_number", "status"], schema: [lookup("entity_id", "Legal Entity", "legal_entities"), text("document_type", "Document Type", true), text("prefix", "Prefix"), text("suffix", "Suffix"), number("next_number", "Next Number", true, { min: 1 }), number("padding", "Padding", true, { min: 1, max: 20 }), select("reset_policy", "Reset Policy", ["NEVER", "YEARLY", "MONTHLY"], true)] }),
  posting_rules: organizationWorkspace({ table: "finance_posting_rules", search: ["name", "event_type", "source_module", "effective_from", "status"], schema: [lookup("entity_id", "Legal Entity", "legal_entities"), text("name", "Rule Name", true), text("event_type", "Accounting Event Type", true), text("source_module", "Source Module", true), lookup("debit_account_id", "Debit Account", "chart_of_accounts", true), lookup("credit_account_id", "Credit Account", "chart_of_accounts", true), date("effective_from", "Effective From", true), date("effective_to", "Effective To"), number("priority", "Priority", true, { min: 1 })] }),
  approval_workflows: organizationWorkspace({ table: "finance_approval_workflows", search: ["name", "document_type", "approver_role", "effective_from", "status"], schema: [lookup("entity_id", "Legal Entity", "legal_entities"), text("name", "Workflow Name", true), text("document_type", "Document Type", true), number("threshold_amount", "Threshold Amount", false, { min: 0 }), currency("currency_code", "Currency", false), text("approver_role", "Approver Role", true), number("required_approvals", "Required Approvals", true, { min: 1 }), date("effective_from", "Effective From", true), date("effective_to", "Effective To")] }),
  government_connections: organizationWorkspace({ table: "finance_government_connections", search: ["authority_name", "jurisdiction_code", "connection_type", "status"], schema: [text("authority_name", "Authority Name", true), text("jurisdiction_code", "Jurisdiction Code", true), text("connection_type", "Connection Type", true), text("credential_reference", "Managed Credential Reference")] }),
  banking_integrations: organizationWorkspace({ table: "finance_banking_integrations", search: ["provider_name", "connection_type", "status", "last_sync_at"], schema: [text("provider_name", "Provider Name", true), text("connection_type", "Connection Type", true), lookup("bank_account_id", "Bank Account", "bank_accounts"), text("credential_reference", "Managed Credential Reference")] }),
  exchange_rates: organizationWorkspace({ table: "finance_exchange_rates", search: ["base_currency", "quote_currency", "effective_date", "rate_type", "source"], schema: [currency("base_currency", "Base Currency", true), currency("quote_currency", "Quote Currency", true), date("effective_date", "Effective Date", true), number("rate", "Rate", true, { min: 0.0000000001, step: "0.0000000001" }), text("source", "Rate Source", true), select("rate_type", "Rate Type", ["SPOT", "CLOSING", "AVERAGE", "HISTORICAL"], true)] }),
  e_invoicing: organizationWorkspace({ table: "finance_e_invoicing_settings", search: ["network", "jurisdiction_code", "document_type", "status"], schema: [text("network", "E-Invoicing Network", true), text("jurisdiction_code", "Jurisdiction Code", true), text("document_type", "Document Type", true), text("sender_identifier", "Sender Identifier", true), text("credential_reference", "Managed Credential Reference")] }),
  document_templates: organizationWorkspace({
    table: "finance_document_templates",
    search: ["name", "document_type", "locale", "version", "status"],
    schema: [
      text("name", "Template Name", true, { placeholder: "Example: Modern Customer Invoice" }),
      select("document_type", "Document Type", ["CUSTOMER_INVOICE", "CUSTOMER_STATEMENT", "VENDOR_STATEMENT", "PAYMENT_RECEIPT", "CREDIT_NOTE", "DEBIT_NOTE", "PURCHASE_ORDER", "REMITTANCE_ADVICE", "FINANCIAL_REPORT"], true),
      select("locale", "Language / Locale", ["en-GB", "en-US", "th-TH"], true, { defaultValue: "en-GB" }),
      number("version", "Version", true, { min: 1, defaultValue: 1 }),
      text("template_source_url", "Template Asset", true, { placeholder: "Managed asset URL or builtin://finance/..." }),
      select("status", "Status", ["DRAFT", "ACTIVE", "ARCHIVED"], true, { defaultValue: "DRAFT" }),
    ],
  }),
});

export function getFinanceWorkspaceContract(capabilityId) {
  return FINANCE_WORKSPACE_CONTRACTS[capabilityId] || null;
}
