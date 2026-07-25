const FINANCE_ACTIONS = {
  createcustomerinvoice: { engine: "create", form: "customer-invoice", title: "Create Customer Invoice" },
  postcustomerpayment: { engine: "create", form: "customer-payment", endpoint: "/api/finance/customer-payments/create", title: "Create Customer Payment" },
  createvendorinvoice: { engine: "create", form: "vendor-bill", endpoint: "/api/finance/vendor-invoices/create", title: "Create Vendor Bill" },
  processvendorpaymentcommand: { engine: "create", form: "vendor-payment", endpoint: "/api/finance/accounts-payable/pay", title: "Create Vendor Payment" },
  requestjournalreversalcommand: { engine: "create", form: "journal-reversal", endpoint: "/api/finance/journals/request-reversal", title: "Request Journal Reversal" },
  runintercompanyreconciliationcommand: { engine: "create", form: "intercompany-reconciliation", endpoint: "/api/finance/intercompany/reconcile", title: "Reconcile Intercompany Transaction" },
  settleintercompanytransactioncommand: { engine: "create", form: "intercompany-settlement", endpoint: "/api/finance/intercompany/settle", title: "Settle Intercompany Transaction" },
  runconsolidation: { engine: "create", form: "consolidation-run", endpoint: "/api/finance/consolidation", title: "Run Consolidation" },
  vendorstatement: { type: "report", title: "Vendor Statement" },
  viewpurchaseorders: { href: ({ organizationId }) => `/workspace/${organizationId}/finance/purchase-orders` },
  viewgoodsreceipts: { href: ({ organizationId }) => `/workspace/${organizationId}/finance/goods-receipts` },
};

const FINANCE_CAPABILITIES = {
  "finance.customer_statement.view": { type: "report", title: "Customer Statement" },
  "bank_account.transactions": { href: ({ organizationId }) => `/workspace/${organizationId}/finance/ledger` },
  "bank_account.payments": { href: ({ organizationId }) => `/workspace/${organizationId}/finance/payments` },
  "bank_account.reconciliation": { href: ({ organizationId }) => `/workspace/${organizationId}/finance/bank-reconciliation` },
  "bank_account.statement": { type: "report", title: "Bank Statement" },
};

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function resolveFinanceActionPresentation(action) {
  if (!action) return action;
  const presentation = FINANCE_ACTIONS[normalize(action.action)] || FINANCE_CAPABILITIES[action.capability];
  return presentation ? { ...action, ...presentation, presentationResolved: true } : action;
}
