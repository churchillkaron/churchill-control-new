const ACCOUNT_TYPES = [
  { value: "ASSET", label: "Asset" },
  { value: "LIABILITY", label: "Liability" },
  { value: "EQUITY", label: "Equity" },
  { value: "REVENUE", label: "Revenue" },
  { value: "EXPENSE", label: "Expense" },
];

const ACCOUNT_CATEGORIES = [
  { value: "CASH", label: "Cash and Cash Equivalents" },
  { value: "CURRENT_ASSET", label: "Current Asset" },
  { value: "NON_CURRENT_ASSET", label: "Non-current Asset" },
  { value: "CURRENT_LIABILITY", label: "Current Liability" },
  { value: "NON_CURRENT_LIABILITY", label: "Non-current Liability" },
  { value: "EQUITY", label: "Equity" },
  { value: "REVENUE", label: "Revenue" },
  { value: "COST_OF_SALES", label: "Cost of Sales" },
  { value: "OPERATING_EXPENSE", label: "Operating Expense" },
  { value: "OTHER_INCOME", label: "Other Income" },
  { value: "OTHER_EXPENSE", label: "Other Expense" },
];

const NORMAL_BALANCES = [
  { value: "DEBIT", label: "Debit" },
  { value: "CREDIT", label: "Credit" },
];

const CHART_OF_ACCOUNTS_FIELDS = Object.freeze([
  {
    name: "account_code",
    label: "Account Code",
    type: "text",
    required: true,
    width: "1/2",
  },
  {
    name: "account_name",
    label: "Account Name",
    type: "text",
    required: true,
    width: "1/2",
  },
  {
    name: "account_type",
    label: "Account Type",
    type: "select",
    options: ACCOUNT_TYPES,
    required: true,
    width: "1/2",
  },
  {
    name: "account_category",
    label: "Reporting Category",
    type: "select",
    options: ACCOUNT_CATEGORIES,
    required: true,
    width: "1/2",
  },
  {
    name: "parent_account_id",
    label: "Parent Account",
    type: "lookup",
    lookup: "chart_of_accounts",
    width: "full",
  },
  {
    name: "normal_balance",
    label: "Normal Balance",
    type: "select",
    options: NORMAL_BALANCES,
    required: true,
    width: "1/2",
  },
  {
    name: "currency_code",
    label: "Account Currency",
    type: "currency",
    required: true,
    width: "1/2",
  },
  {
    name: "is_active",
    label: "Active Account",
    type: "boolean",
    default: true,
    width: "1/2",
  },
]);

export function enforceFinanceChartOfAccountsFormContract(formId, fields) {
  const normalizedFormId = String(formId || "").trim().toLowerCase();
  if (normalizedFormId !== "chart-of-account") {
    return Array.isArray(fields) ? fields : [];
  }

  return CHART_OF_ACCOUNTS_FIELDS.map(field => ({
    ...field,
    options: Array.isArray(field.options)
      ? field.options.map(option => ({ ...option }))
      : field.options,
  }));
}
