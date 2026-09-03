import financeRuntimeManifest from "@/lib/finance/runtime/financeCapabilityRuntimeManifest.json" with { type: "json" };

const FAMILY_META = Object.freeze({
  ledger: {
    label: "Accounting records",
    layout: "ledger",
    reviewLabel: "Review accounting evidence",
  },
  receivables: {
    label: "Receivables",
    layout: "transaction",
    reviewLabel: "Collect, allocate and clear exceptions",
  },
  payables: {
    label: "Payables",
    layout: "transaction",
    reviewLabel: "Review, match, approve and pay",
  },
  treasury: {
    label: "Treasury",
    layout: "reconciliation",
    reviewLabel: "Review cash and reconciliation exceptions",
  },
  compliance: {
    label: "Tax & compliance",
    layout: "review",
    reviewLabel: "Prepare, evidence, approve and file",
  },
  assets: {
    label: "Fixed assets",
    layout: "asset",
    reviewLabel: "Review asset value and lifecycle",
  },
  enterprise: {
    label: "Entity & consolidation",
    layout: "control",
    reviewLabel: "Control multi-entity accounting",
  },
  planning: {
    label: "Planning & performance",
    layout: "planning",
    reviewLabel: "Compare plan, actual and forecast",
  },
  reporting: {
    label: "Reporting",
    layout: "reporting",
    reviewLabel: "Review and sign off reporting outputs",
  },
  configuration: {
    label: "Finance configuration",
    layout: "configuration",
    reviewLabel: "Maintain governed accounting configuration",
  },
});

const FAMILY_BY_CAPABILITY = Object.freeze({
  chart_of_accounts: "ledger",
  general_ledger: "ledger",
  journals: "ledger",
  trial_balance: "ledger",
  fiscal_periods: "ledger",
  dimensions: "ledger",
  opening_balances: "ledger",
  recurring_journals: "ledger",

  customers: "receivables",
  customer_invoices: "receivables",
  accounts_receivable: "receivables",
  customer_payments: "receivables",
  collections: "receivables",
  customer_statements: "receivables",
  revenue_recognition: "receivables",

  vendors: "payables",
  purchase_orders: "payables",
  goods_receipts: "payables",
  vendor_bills: "payables",
  invoice_matching: "payables",
  accounts_payable: "payables",
  vendor_payments: "payables",
  vendor_statements: "payables",

  bank_accounts: "treasury",
  cash_management: "treasury",
  bank_statements: "treasury",
  cash_flow: "treasury",
  bank_reconciliation: "treasury",
  payments: "treasury",
  fx_revaluation: "treasury",

  tax: "compliance",
  vat_returns: "compliance",
  tax_codes: "configuration",
  fixed_assets: "assets",
  depreciation: "assets",
  audit_trail: "compliance",
  period_close: "compliance",
  year_end: "compliance",
  statutory_filings: "compliance",

  legal_entities: "enterprise",
  cost_centers: "enterprise",
  currencies: "configuration",
  intercompany: "enterprise",
  payment_terms: "configuration",
  consolidation: "enterprise",

  budgeting: "planning",
  forecasting: "planning",
  finance_kpis: "planning",
  executive_dashboard: "planning",
  financial_health: "planning",
  ai_insights: "planning",

  financial_statements: "reporting",
  management_reports: "reporting",
  finance_analytics: "reporting",
  report_builder: "reporting",
  scheduled_reports: "reporting",

  organization_profile: "configuration",
  accounting_settings: "configuration",
  number_sequences: "configuration",
  posting_rules: "configuration",
  approval_workflows: "configuration",
  government_connections: "configuration",
  banking_integrations: "configuration",
  exchange_rates: "configuration",
  e_invoicing: "configuration",
  document_templates: "configuration",
  finance_permissions: "configuration",
});

const COLUMN_SETS = Object.freeze({
  ledger: [
    { label: "Account / reference", keys: ["account_name", "journal_number", "reference", "account_code", "name", "title"] },
    { label: "Date", keys: ["posting_date", "entry_date", "transaction_date", "created_at", "start_date"], format: "date" },
    { label: "Description", keys: ["description", "memo", "account_type", "category", "period_name"] },
    { label: "Debit", keys: ["debit", "period_debits", "debit_balance"], format: "number", align: "right" },
    { label: "Credit", keys: ["credit", "period_credits", "credit_balance"], format: "number", align: "right" },
    { label: "Status", keys: ["status", "period_status"] },
  ],
  transaction: [
    { label: "Document", keys: ["invoice_number", "payment_number", "purchase_order_number", "receipt_number", "reference_number", "transaction_number", "case_number", "name"] },
    { label: "Customer / vendor", keys: ["customer_name", "vendor_name", "party_name", "counterparty_name", "legal_name"] },
    { label: "Date", keys: ["invoice_date", "payment_date", "order_date", "receipt_date", "created_at"], format: "date" },
    { label: "Due", keys: ["due_date", "promise_date", "next_follow_up_at"], format: "date" },
    { label: "Amount", keys: ["outstanding_amount", "open_balance", "balance", "total_amount", "amount", "grand_total"], format: "money", align: "right" },
    { label: "Status", keys: ["status", "approval_status", "match_status"] },
  ],
  reconciliation: [
    { label: "Account / statement", keys: ["account_name", "bank_account_name", "statement_number", "reference_number", "label", "name"] },
    { label: "Date", keys: ["transaction_date", "statement_end_date", "reconciliation_date", "created_at", "period"], format: "date" },
    { label: "Inflow", keys: ["inflow", "credit", "receipts", "cash_in"], format: "money", align: "right" },
    { label: "Outflow", keys: ["outflow", "debit", "payments", "cash_out"], format: "money", align: "right" },
    { label: "Balance / difference", keys: ["difference", "closing_balance", "current_balance", "balance", "amount"], format: "money", align: "right" },
    { label: "Status", keys: ["status", "reconciliation_status", "match_status"] },
  ],
  review: [
    { label: "Work item", keys: ["filing_type", "name", "title", "event_type", "period", "registration_reference"] },
    { label: "Jurisdiction / scope", keys: ["jurisdiction_code", "authority_name", "entity_name", "account_name", "actor"] },
    { label: "Period / date", keys: ["period_end", "due_date", "filing_due_date", "created_at", "period_start"], format: "date" },
    { label: "Amount", keys: ["tax_payable", "amount", "balance", "difference"], format: "money", align: "right" },
    { label: "Owner / evidence", keys: ["assigned_to", "reviewer", "submission_reference", "source_document"] },
    { label: "Status", keys: ["status", "approval_state", "result"] },
  ],
  asset: [
    { label: "Asset", keys: ["asset_name", "name", "asset_number", "book_reference"] },
    { label: "Category", keys: ["asset_category", "category", "book_reference"] },
    { label: "Acquired / period", keys: ["purchase_date", "period_end", "posting_date", "created_at"], format: "date" },
    { label: "Cost", keys: ["purchase_cost", "cost", "total_amount"], format: "money", align: "right" },
    { label: "Book value", keys: ["current_book_value", "net_book_value", "closing_value", "amount"], format: "money", align: "right" },
    { label: "Status", keys: ["status"] },
  ],
  control: [
    { label: "Entity / control", keys: ["legal_name", "name", "transaction_number", "code"] },
    { label: "From / type", keys: ["from_entity", "type", "entity_type", "source_entity"] },
    { label: "To / scope", keys: ["to_entity", "scope", "target_entity", "country_code"] },
    { label: "Period / effective", keys: ["period", "effective_from", "created_at"], format: "date" },
    { label: "Amount", keys: ["amount", "balance", "share_capital"], format: "money", align: "right" },
    { label: "Status", keys: ["status"] },
  ],
  planning: [
    { label: "Plan / metric", keys: ["name", "title", "metric_name", "category", "scenario_name"] },
    { label: "Period", keys: ["period", "period_name", "year", "month"] },
    { label: "Actual", keys: ["actual", "actual_amount", "actual_value"], format: "money", align: "right" },
    { label: "Budget", keys: ["budget", "budget_amount", "amount"], format: "money", align: "right" },
    { label: "Forecast / value", keys: ["forecast", "forecast_amount", "value", "current_value"], format: "money", align: "right" },
    { label: "Status / variance", keys: ["status", "variance_percent", "trend"] },
  ],
  reporting: [
    { label: "Report / line", keys: ["name", "title", "account_name", "metric_name", "report_type"] },
    { label: "Period", keys: ["period", "period_name", "analytics_date", "updated_at"] },
    { label: "Value", keys: ["value", "amount", "balance", "current_value"], format: "money", align: "right" },
    { label: "Comparison", keys: ["prior_value", "variance", "variance_percent", "change_percent"] },
    { label: "Schedule / type", keys: ["frequency", "delivery_format", "category", "account_code"] },
    { label: "Status", keys: ["status", "report_status"] },
  ],
  configuration: [
    { label: "Configuration", keys: ["name", "legal_name", "document_type", "setting_key", "event_type", "authority_name", "role_name", "code"] },
    { label: "Code / type", keys: ["code", "source_module", "connection_type", "report_type", "role_code", "currency_code"] },
    { label: "Scope", keys: ["entity_name", "country_code", "jurisdiction_code", "approver_role", "functional_currency"] },
    { label: "Effective / updated", keys: ["effective_from", "updated_at", "created_at", "next_run_at"], format: "date" },
    { label: "Value / priority", keys: ["rate", "priority", "next_number", "threshold_amount", "value"] },
    { label: "Status", keys: ["status", "connection_status"] },
  ],
});

function inferFamily(capabilityId, kind) {
  if (FAMILY_BY_CAPABILITY[capabilityId]) return FAMILY_BY_CAPABILITY[capabilityId];
  if (kind === "report") return "reporting";
  if (kind === "process") return "compliance";
  return "configuration";
}

function resolveRuntimeReadiness(capability) {
  const capabilityId = String(capability?.id || "").trim();
  const runtimeDefinition = financeRuntimeManifest[capabilityId] || null;
  const declaredStatus = String(capability?.status || "").trim();
  const runtimeBacked = Boolean(runtimeDefinition);

  return {
    runtimeBacked,
    runtimeDefinition,
    declaredStatus,
    effectiveStatus:
      runtimeBacked && declaredStatus.toLowerCase() === "planned"
        ? "active"
        : declaredStatus,
  };
}

export function resolveFinanceCapabilityPresentation(capability, groupId = null) {
  const capabilityId = String(capability?.id || "").trim();
  const runtimeDefinition = financeRuntimeManifest[capabilityId] || {};
  const family = inferFamily(capabilityId, runtimeDefinition.kind || capability?.runtimeKind);
  const familyMeta = FAMILY_META[family] || FAMILY_META.configuration;

  return {
    version: 1,
    family,
    family_label: familyMeta.label,
    layout: familyMeta.layout,
    review_label: familyMeta.reviewLabel,
    group_id: groupId || null,
    runtime_kind: runtimeDefinition.kind || capability?.runtimeKind || "records",
    scope: runtimeDefinition.scope || capability?.contextScope || "entity",
    owner_domain: runtimeDefinition.owner || capability?.ownerDomain || "finance",
    density: "compact",
    detail_mode: "split",
    sticky_header: true,
    review_first: true,
    columns: COLUMN_SETS[familyMeta.layout] || COLUMN_SETS.configuration,
  };
}

export function applyFinanceCapabilityPresentation(registry) {
  const finance = registry?.workspaces?.finance;
  const groups = Array.isArray(finance?.groups) ? finance.groups : [];

  for (const group of groups) {
    for (const item of Array.isArray(group?.items) ? group.items : []) {
      const readiness = resolveRuntimeReadiness(item);
      if (readiness.runtimeBacked && readiness.declaredStatus.toLowerCase() === "planned") {
        item.status = readiness.effectiveStatus;
      }

      const presentation = resolveFinanceCapabilityPresentation(item, group.id);
      item.ui = {
        ...(item.ui || {}),
        financePresentation: presentation,
      };
      item.runtime = {
        ...(item.runtime || {}),
        financePresentation: presentation,
        financeReadiness: {
          runtime_backed: readiness.runtimeBacked,
          declared_status: readiness.declaredStatus || null,
          effective_status: String(item.status || readiness.effectiveStatus || "").trim() || null,
        },
      };
    }
  }

  return registry;
}

export function getFinancePresentationCoverage() {
  const manifestIds = Object.keys(financeRuntimeManifest);
  const coveredIds = manifestIds.filter((id) => Boolean(FAMILY_BY_CAPABILITY[id]));
  return {
    total: manifestIds.length,
    covered: coveredIds.length,
    missing: manifestIds.filter((id) => !FAMILY_BY_CAPABILITY[id]),
  };
}

export const FINANCE_CAPABILITY_FAMILIES = FAMILY_BY_CAPABILITY;
