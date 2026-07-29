const TYPE_OPTIONS = [
  ["FUNDING", "Funding"],
  ["LOAN", "Loan"],
  ["EXPENSE_RECHARGE", "Expense Recharge"],
  ["SERVICE_CHARGE", "Service Charge"],
  ["ASSET_TRANSFER", "Asset Transfer"],
  ["CASH_TRANSFER", "Cash Transfer"],
  ["DIVIDEND", "Dividend"],
  ["MANAGEMENT_FEE", "Management Fee"],
  ["OTHER", "Other"],
].map(([value, label]) => ({ value, label }));

const SIDE_OPTIONS = [
  { value: "DEBIT", label: "Debit intercompany account" },
  { value: "CREDIT", label: "Credit intercompany account" },
];

export const INTERCOMPANY_CREATE_FIELDS = Object.freeze([
  { name: "from_legal_entity_id", label: "Source Legal Entity", type: "lookup", lookup: "legal_entities", required: true },
  { name: "to_legal_entity_id", label: "Destination Legal Entity", type: "lookup", lookup: "legal_entities", required: true },
  { name: "transaction_type", label: "Transaction Type", type: "select", options: TYPE_OPTIONS, required: true },
  { name: "reference_number", label: "Reference Number", type: "text", required: true },
  { name: "transaction_date", label: "Transaction Date", type: "date", required: true },
  { name: "posting_date", label: "Posting Date", type: "date", required: true },
  { name: "due_date", label: "Due Date", type: "date" },
  { name: "transaction_currency", label: "Transaction Currency", type: "currency", lookup: "currencies", required: true },
  { name: "amount", label: "Transaction Amount", type: "number", min: 0.000001, step: "0.01", required: true },
  { name: "description", label: "Description", type: "textarea", rows: 3, width: "full", required: true },
  { name: "from_exchange_rate", label: "Transaction Currency to Source Functional Currency", type: "number", min: 0.0000000001, step: "0.0000000001", placeholder: "Leave blank to use configured effective rate" },
  { name: "to_exchange_rate", label: "Transaction Currency to Destination Functional Currency", type: "number", min: 0.0000000001, step: "0.0000000001", placeholder: "Leave blank to use configured effective rate" },
  { name: "from_intercompany_account_id", label: "Source Intercompany Account", type: "lookup", lookup: "intercompany_accounts", required: true },
  { name: "from_offset_account_id", label: "Source Offset Account", type: "lookup", lookup: "intercompany_accounts", required: true },
  { name: "from_intercompany_side", label: "Source Intercompany Posting", type: "select", options: SIDE_OPTIONS, required: true },
  { name: "to_intercompany_account_id", label: "Destination Intercompany Account", type: "lookup", lookup: "intercompany_accounts", required: true },
  { name: "to_offset_account_id", label: "Destination Offset Account", type: "lookup", lookup: "intercompany_accounts", required: true },
  { name: "to_intercompany_side", label: "Destination Intercompany Posting", type: "select", options: SIDE_OPTIONS, required: true },
]);

export const INTERCOMPANY_RECONCILIATION_FIELDS = Object.freeze([
  { name: "transaction_id", label: "Intercompany Transaction", type: "hidden", required: true },
  { name: "reconciliation_date", label: "Reconciliation Date", type: "date", required: true },
  { name: "notes", label: "Reconciliation Notes", type: "textarea", rows: 3, width: "full" },
]);

export const INTERCOMPANY_SETTLEMENT_FIELDS = Object.freeze([
  { name: "transaction_id", label: "Intercompany Transaction", type: "hidden", required: true },
  { name: "settlement_date", label: "Settlement Date", type: "date", required: true },
  { name: "settlement_amount", label: "Settlement Amount", type: "number", min: 0.000001, step: "0.01", required: true },
  { name: "from_settlement_account_id", label: "Source Settlement / Bank GL Account", type: "lookup", lookup: "intercompany_accounts", required: true },
  { name: "to_settlement_account_id", label: "Destination Settlement / Bank GL Account", type: "lookup", lookup: "intercompany_accounts", required: true },
  { name: "from_exchange_rate", label: "Settlement Currency to Source Functional Currency", type: "number", min: 0.0000000001, step: "0.0000000001", placeholder: "Leave blank to use configured effective rate" },
  { name: "to_exchange_rate", label: "Settlement Currency to Destination Functional Currency", type: "number", min: 0.0000000001, step: "0.0000000001", placeholder: "Leave blank to use configured effective rate" },
  { name: "reference_number", label: "Settlement Reference", type: "text" },
  { name: "notes", label: "Settlement Notes", type: "textarea", rows: 3, width: "full" },
]);

export function getIntercompanyFormContract(formId) {
  const normalized = String(formId || "").trim().toLowerCase();
  if (normalized === "intercompany") return [...INTERCOMPANY_CREATE_FIELDS];
  if (normalized === "intercompany-reconciliation") {
    return [...INTERCOMPANY_RECONCILIATION_FIELDS];
  }
  if (normalized === "intercompany-settlement") {
    return [...INTERCOMPANY_SETTLEMENT_FIELDS];
  }
  return null;
}
