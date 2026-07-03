export const FINANCE_CAPABILITY_REGISTRY = [

  {
    id: "accounts_receivable",
    name: "Accounts Receivable",
    workspace: "ar",
    documents: [
      "customer_invoice",
      "customer_payment",
    ],
  },

  {
    id: "accounts_payable",
    name: "Accounts Payable",
    workspace: "ap",
    documents: [
      "vendor_invoice",
      "vendor_payment",
    ],
  },

  {
    id: "general_ledger",
    name: "General Ledger",
    workspace: "ledger",
    documents: [
      "journal_entry",
    ],
  },

  {
    id: "treasury",
    name: "Treasury",
    workspace: "treasury",
    documents: [
      "bank_transaction",
      "vendor_payment",
      "customer_payment",
    ],
  },

  {
    id: "fixed_assets",
    name: "Fixed Assets",
    workspace: "fixed-assets",
    documents: [
      "fixed_asset",
      "journal_entry",
    ],
  },

  {
    id: "budgeting",
    name: "Budgeting",
    workspace: "budgeting",
    documents: [
      "budget",
    ],
  },

  {
    id: "tax",
    name: "Tax",
    workspace: "tax",
    documents: [
      "tax_filing",
      "journal_entry",
    ],
  },

  {
    id: "reconciliation",
    name: "Reconciliation",
    workspace: "reconciliation",
    documents: [
      "bank_transaction",
      "journal_entry",
    ],
  },

  {
    id: "period_close",
    name: "Period Close",
    workspace: "close",
    documents: [
      "journal_entry",
    ],
  },

  {
    id: "financial_reporting",
    name: "Financial Reporting",
    workspace: "reports",
    documents: [
      "journal_entry",
      "budget",
    ],
  },

];

export function listFinanceCapabilities() {
  return FINANCE_CAPABILITY_REGISTRY;
}

export function getFinanceCapability(id) {
  return FINANCE_CAPABILITY_REGISTRY.find(
    capability => capability.id === id
  ) || null;
}
