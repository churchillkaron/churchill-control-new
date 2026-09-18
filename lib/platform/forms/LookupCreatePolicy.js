const MASTER_CREATE = Object.freeze({
  chart_of_accounts: { label: "Account", route: "/finance/chart-of-accounts" },
  budget_categories: { label: "Account", route: "/finance/chart-of-accounts" },
  revenue_accounts: { label: "Revenue Account", route: "/finance/chart-of-accounts" },
  expense_accounts: { label: "Expense Account", route: "/finance/chart-of-accounts" },
  liability_accounts: { label: "Liability Account", route: "/finance/chart-of-accounts" },
  bank_gl_accounts: { label: "Bank GL Account", route: "/finance/chart-of-accounts" },
  bank_accounts: { label: "Bank Account", route: "/finance/bank-accounts" },
  tax_codes: { label: "Tax Code", route: "/finance/tax-codes" },
  legal_entities: { label: "Legal Entity", route: "/finance/legal-entities" },
  currencies: { label: "Currency", route: "/finance/currencies" },
  payment_terms: { label: "Payment Term", route: "/finance/payment-terms" },
  vendors: { label: "Vendor", route: "/finance/vendors" },
  fiscal_periods: { label: "Fiscal Period", route: "/finance/fiscal-periods" },
  customer_invoices: { label: "Customer Invoice", route: "/finance/customer-invoices" },
  open_customer_invoices: { label: "Customer Invoice", route: "/finance/customer-invoices" },
  customers: { label: "Customer", route: "/finance/customers" },
  intercompany_accounts: { label: "Intercompany Account", route: "/finance/chart-of-accounts" },
  accounts_payable: { label: "Vendor Bill", route: "/finance/vendor-bills" },
  bank_statements: { label: "Bank Statement", route: "/finance/bank-statements" },
  journals: { label: "Journal", route: "/finance/journals" },
  finance_report_templates: { label: "Report Template", route: "/finance/report-builder" },
  finance_dimensions: { label: "Dimension", route: "/finance/dimensions" },
  finance_dimension_values: { label: "Dimension Value", route: "/finance/dimensions" },
  employees: { label: "Employee", route: "/workforce/employees" },
  finance_assignees: { label: "Staff Member", route: "/workforce/employees" },
});

const INLINE_CREATE = Object.freeze({
  items: { label: "Item / Service" },
  cost_centers: { label: "Cost Centre" },
  departments: { label: "Department" },
  projects: { label: "Project" },
});

export function getLookupCreatePolicy(lookup, organizationId) {
  const key = String(lookup || "").trim();
  if (!key) return null;
  if (INLINE_CREATE[key]) return { ...INLINE_CREATE[key], mode: "inline" };
  const master = MASTER_CREATE[key];
  if (!master || !organizationId) return null;
  return {
    ...master,
    mode: "master",
    href: `/workspace/${organizationId}${master.route}?create=1`,
  };
}

export const FINANCE_CREATABLE_LOOKUPS = Object.freeze([
  ...Object.keys(INLINE_CREATE),
  ...Object.keys(MASTER_CREATE),
]);
