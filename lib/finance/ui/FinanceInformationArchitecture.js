const REPORT_CAPABILITIES = new Set([
  "cash_flow",
  "budgeting",
  "forecasting",
  "finance_kpis",
  "executive_dashboard",
  "financial_health",
  "ai_insights",
  "financial_statements",
  "management_reports",
  "finance_analytics",
  "report_builder",
  "scheduled_reports",
]);

const CONFIGURE_CAPABILITIES = new Set([
  "fiscal_periods",
  "dimensions",
  "tax_codes",
  "legal_entities",
  "cost_centers",
  "currencies",
  "payment_terms",
  "organization_profile",
  "accounting_settings",
  "number_sequences",
  "posting_rules",
  "approval_workflows",
  "government_connections",
  "banking_integrations",
  "exchange_rates",
  "e_invoicing",
  "document_templates",
  "finance_permissions",
]);

const DEDICATED_CAPABILITIES = new Set([
  "period_close",
  "year_end",
]);

const REPORT_PATH_PREFIXES = [
  "/finance/reporting",
  "/finance/statements",
  "/finance/reports",
  "/finance/management-reports",
  "/finance/report-builder",
  "/finance/scheduled-reports",
  "/finance/forecast",
  "/finance/forecasting",
  "/finance/budget",
  "/finance/budgeting",
  "/finance/health",
  "/finance/financial-health",
  "/finance/insights",
  "/finance/finance-insights",
  "/finance/kpis",
  "/finance/executive-dashboard",
  "/finance/cash-flow",
];

const CONFIGURE_PATH_PREFIXES = [
  "/finance/configure",
  "/finance/work-programs",
  "/finance/organization-profile",
  "/finance/accounting-settings",
  "/finance/number-sequences",
  "/finance/posting-rules",
  "/finance/approval-workflows",
  "/finance/government-connections",
  "/finance/banking-integrations",
  "/finance/e-invoicing",
  "/finance/document-templates",
  "/finance/permissions",
  "/finance/fiscal-periods",
  "/finance/dimensions",
  "/finance/legal-entities",
  "/finance/cost-centers",
  "/finance/currencies",
  "/finance/exchange-rates",
  "/finance/payment-terms",
  "/finance/tax-codes",
  "/finance/tax-settings",
  "/finance/vat-settings",
];

export function resolveFinanceCapabilitySection(capabilityId) {
  const id = String(capabilityId || "").trim();
  if (DEDICATED_CAPABILITIES.has(id)) return "dedicated";
  if (REPORT_CAPABILITIES.has(id)) return "reports";
  if (CONFIGURE_CAPABILITIES.has(id)) return "configure";
  return "books";
}

export function resolveFinanceNavigationSection(pathname) {
  const marker = String(pathname || "").split("/finance")[1] || "";
  const financePath = `/finance${marker}`;

  if (financePath === "/finance" || financePath === "/finance/") return "overview";
  if (financePath.startsWith("/finance/review")) return "review";
  if (financePath.startsWith("/finance/work") || financePath.startsWith("/finance/accounting-firm")) return "work";
  if (
    financePath.startsWith("/finance/close") ||
    financePath.startsWith("/finance/period-close") ||
    financePath.startsWith("/finance/year-end")
  ) return "close";
  if (REPORT_PATH_PREFIXES.some((prefix) => financePath.startsWith(prefix))) return "reports";
  if (CONFIGURE_PATH_PREFIXES.some((prefix) => financePath.startsWith(prefix))) return "configure";
  return "books";
}

export function getFinanceInformationArchitectureCoverage() {
  return {
    reports: [...REPORT_CAPABILITIES],
    configure: [...CONFIGURE_CAPABILITIES],
    dedicated: [...DEDICATED_CAPABILITIES],
  };
}
