export const FINANCE_DOCUMENT_REGISTRY = [
  {
    id: "journal_entry",
    name: "Journal Entry",
    domain: "finance",
    context: "journals",
    route: "/finance/journals",
    requiredContext: [
      "organization_id",
      "entity_id",
      "period_id",
      "currency",
    ],
    lifecycle: [
      "draft",
      "reviewed",
      "posted",
      "reversed",
    ],
  },
  {
    id: "customer_invoice",
    name: "Customer Invoice",
    domain: "finance",
    context: "accounts-receivable",
    route: "/finance/ar/invoices",
    requiredContext: [
      "organization_id",
      "entity_id",
      "period_id",
      "currency",
    ],
    lifecycle: [
      "draft",
      "issued",
      "partially_paid",
      "paid",
      "voided",
    ],
  },
  {
    id: "customer_payment",
    name: "Customer Payment",
    domain: "finance",
    context: "accounts-receivable",
    route: "/finance/ar/payments",
    requiredContext: [
      "organization_id",
      "entity_id",
      "period_id",
      "currency",
    ],
    lifecycle: [
      "received",
      "allocated",
      "posted",
      "reversed",
    ],
  },
  {
    id: "vendor_invoice",
    name: "Vendor Invoice",
    domain: "finance",
    context: "accounts-payable",
    route: "/finance/ap",
    requiredContext: [
      "organization_id",
      "entity_id",
      "period_id",
      "currency",
    ],
    lifecycle: [
      "received",
      "matched",
      "approved",
      "paid",
      "voided",
    ],
  },
  {
    id: "vendor_payment",
    name: "Vendor Payment",
    domain: "finance",
    context: "accounts-payable",
    route: "/finance/ap/payments",
    requiredContext: [
      "organization_id",
      "entity_id",
      "period_id",
      "currency",
    ],
    lifecycle: [
      "queued",
      "approved",
      "paid",
      "posted",
      "reversed",
    ],
  },
  {
    id: "bank_transaction",
    name: "Bank Transaction",
    domain: "finance",
    context: "treasury",
    route: "/finance/bank-accounts",
    requiredContext: [
      "organization_id",
      "entity_id",
      "period_id",
      "currency",
    ],
    lifecycle: [
      "imported",
      "classified",
      "reconciled",
      "posted",
    ],
  },
  {
    id: "fixed_asset",
    name: "Fixed Asset",
    domain: "finance",
    context: "fixed-assets",
    route: "/finance/fixed-assets",
    requiredContext: [
      "organization_id",
      "entity_id",
      "period_id",
      "currency",
    ],
    lifecycle: [
      "created",
      "active",
      "depreciating",
      "disposed",
    ],
  },
  {
    id: "budget",
    name: "Budget",
    domain: "finance",
    context: "budgeting",
    route: "/finance/budgeting",
    requiredContext: [
      "organization_id",
      "entity_id",
      "period_id",
      "currency",
    ],
    lifecycle: [
      "draft",
      "approved",
      "active",
      "closed",
    ],
  },
  {
    id: "tax_filing",
    name: "Tax Filing",
    domain: "finance",
    context: "tax",
    route: "/finance/tax",
    requiredContext: [
      "organization_id",
      "entity_id",
      "period_id",
      "country",
      "currency",
    ],
    lifecycle: [
      "prepared",
      "reviewed",
      "submitted",
      "accepted",
    ],
  },
];

export function listFinanceDocuments() {
  return FINANCE_DOCUMENT_REGISTRY;
}

export function getFinanceDocument(documentId) {
  return FINANCE_DOCUMENT_REGISTRY.find(
    item => item.id === documentId
  ) || null;
}
