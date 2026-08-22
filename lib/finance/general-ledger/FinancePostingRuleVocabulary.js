export const FINANCE_POSTING_EVENT_OPTIONS = Object.freeze([
  { value: "INVENTORY_MOVEMENT", label: "Inventory Movement" },
  { value: "INVENTORY_RECEIPT", label: "Inventory Receipt" },
  { value: "INVENTORY_ADJUSTMENT", label: "Inventory Adjustment" },
  { value: "INVENTORY_CONSUMPTION", label: "Inventory Consumption" },
  { value: "INVENTORY_TRANSFER", label: "Inventory Transfer" },
  { value: "INVENTORY_WASTE", label: "Inventory Waste" },
  { value: "INVENTORY_COUNT", label: "Inventory Count" },
  { value: "INVENTORY_VALUATION", label: "Inventory Valuation" },
  { value: "COGS_TRIGGERED", label: "Cost of Goods Sold" },
  { value: "INVOICE_CREATED", label: "Invoice Created" },
  { value: "CUSTOMER_INVOICE_CREATED", label: "Customer Invoice Created" },
  { value: "VENDOR_INVOICE_CREATED", label: "Vendor Invoice Created" },
  { value: "PAYMENT_RECEIVED", label: "Payment Received" },
  { value: "CUSTOMER_PAYMENT_RECEIVED", label: "Customer Payment Received" },
  { value: "POS_SALE_RECOGNIZED", label: "POS Sale Recognised" },
  { value: "POS_CASH_PAYMENT_RECEIVED", label: "POS Cash Payment" },
  { value: "POS_CARD_PAYMENT_RECEIVED", label: "POS Card Payment" },
  { value: "POS_QR_PAYMENT_RECEIVED", label: "POS QR Payment" },
  { value: "POS_TRANSFER_PAYMENT_RECEIVED", label: "POS Transfer Payment" },
  { value: "VENDOR_PAYMENT_POSTED", label: "Vendor Payment Posted" },
  { value: "INVOICE_SETTLEMENT", label: "Invoice Settlement" },
  { value: "PAYROLL_LEDGER", label: "Payroll Ledger" },
  { value: "PAYROLL_NET", label: "Payroll Net Pay" },
  { value: "PAYROLL_TAX", label: "Payroll Tax" },
  { value: "PAYROLL_SOCIAL_SECURITY", label: "Payroll Social Security" },
  { value: "PAYROLL_DEDUCTION", label: "Payroll Deduction" },
  { value: "PAYROLL_SETTLEMENT", label: "Payroll Settlement" },
  { value: "PAYROLL_TAX_SETTLEMENT", label: "Payroll Tax Settlement" },
  { value: "PAYROLL_SOCIAL_SECURITY_SETTLEMENT", label: "Payroll Social Security Settlement" },
  { value: "PAYROLL_DEDUCTION_SETTLEMENT", label: "Payroll Deduction Settlement" },
  { value: "DEPRECIATION_POSTED", label: "Fixed Asset Depreciation" },
  { value: "VAT_CLOSE", label: "VAT Close" },
  { value: "TAX_FILING_POSTED", label: "Tax Filing Posted" },
  { value: "YEAR_END_CLOSE", label: "Year-End Close" },
  { value: "INTERCOMPANY_CREATED", label: "Intercompany Transaction" },
  { value: "INTERCOMPANY_ELIMINATION", label: "Intercompany Elimination" },
  { value: "REVERSAL_ENTRY", label: "Journal Reversal" },
  { value: "SERVICE_USAGE_BILLED", label: "Service Usage Billed" },
  { value: "AUTO_JOURNAL", label: "Automatic Journal" },
]);

export const FINANCE_POSTING_SOURCE_OPTIONS = Object.freeze([
  { value: "ACCOUNTS_RECEIVABLE", label: "Accounts Receivable" },
  { value: "ACCOUNTS_PAYABLE", label: "Accounts Payable" },
  { value: "BANKING", label: "Banking" },
  { value: "GENERAL_LEDGER", label: "General Ledger" },
  { value: "FIXED_ASSETS", label: "Fixed Assets" },
  { value: "INVENTORY", label: "Inventory" },
  { value: "PAYROLL", label: "Payroll" },
  { value: "TAX", label: "Tax" },
  { value: "INTERCOMPANY", label: "Intercompany" },
  { value: "PERIOD_CLOSE", label: "Period Close" },
  { value: "POS", label: "Point of Sale" },
  { value: "SERVICE", label: "Services" },
  { value: "FINANCE", label: "Finance" },
]);

export const FINANCE_POSTING_EVENT_TYPES = Object.freeze(
  FINANCE_POSTING_EVENT_OPTIONS.map(option => option.value)
);

export const FINANCE_POSTING_SOURCE_MODULES = Object.freeze(
  FINANCE_POSTING_SOURCE_OPTIONS.map(option => option.value)
);

export function isFinancePostingEventType(value) {
  return FINANCE_POSTING_EVENT_TYPES.includes(String(value || "").trim().toUpperCase());
}

export function isFinancePostingSourceModule(value) {
  return FINANCE_POSTING_SOURCE_MODULES.includes(String(value || "").trim().toUpperCase());
}
