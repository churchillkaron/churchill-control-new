const ACCOUNT_TYPE_OPTIONS = Object.freeze([
  { value: "ASSET", label: "Asset" },
  { value: "LIABILITY", label: "Liability" },
  { value: "EQUITY", label: "Equity" },
  { value: "REVENUE", label: "Revenue" },
  { value: "EXPENSE", label: "Expense" },
]);

const ACCOUNT_CATEGORY_OPTIONS = Object.freeze([
  { value: "CURRENT_ASSET", label: "Current Assets" },
  { value: "NON_CURRENT_ASSET", label: "Non-current Assets" },
  { value: "CURRENT_LIABILITY", label: "Current Liabilities" },
  { value: "NON_CURRENT_LIABILITY", label: "Non-current Liabilities" },
  { value: "EQUITY", label: "Equity" },
  { value: "REVENUE", label: "Revenue" },
  { value: "OTHER_INCOME", label: "Other Income" },
  { value: "COST_OF_SALES", label: "Cost of Sales" },
  { value: "OPERATING_EXPENSE", label: "Operating Expenses" },
  { value: "OTHER_EXPENSE", label: "Other Expenses" },
]);

const NORMAL_BALANCE_OPTIONS = Object.freeze([
  { value: "DEBIT", label: "Debit" },
  { value: "CREDIT", label: "Credit" },
]);

const CHART_OF_ACCOUNT_FIELDS = Object.freeze([
  {
    name: "account_type",
    label: "Account Type",
    type: "select",
    required: true,
    options: ACCOUNT_TYPE_OPTIONS,
  },
  {
    name: "account_category",
    label: "Account Category",
    type: "select",
    required: true,
    options: ACCOUNT_CATEGORY_OPTIONS,
    description: "Controls where the account appears in financial statements.",
  },
  {
    name: "account_code",
    label: "Account Code",
    type: "text",
    required: true,
    placeholder: "Select a code permitted by the Legal Entity account plan",
  },
  {
    name: "account_name",
    label: "Account Name",
    type: "text",
    required: true,
  },
  {
    name: "parent_account_id",
    label: "Parent Account",
    type: "lookup",
    lookup: "chart_of_accounts",
  },
  {
    name: "normal_balance",
    label: "Normal Balance Override",
    type: "select",
    options: NORMAL_BALANCE_OPTIONS,
    description: "Leave blank to derive Debit or Credit from Account Type.",
  },
  {
    name: "currency_code",
    label: "Account Currency",
    type: "currency",
    lookup: "currencies",
    required: true,
  },
  {
    name: "is_active",
    label: "Active",
    type: "boolean",
    defaultValue: true,
  },
]);

export function getChartOfAccountFormContract(formId) {
  if (String(formId || "").trim().toLowerCase() !== "chart-of-account") {
    return null;
  }

  return CHART_OF_ACCOUNT_FIELDS.map((field) => ({
    ...field,
    options: Array.isArray(field.options)
      ? field.options.map((option) => ({ ...option }))
      : field.options,
  }));
}
