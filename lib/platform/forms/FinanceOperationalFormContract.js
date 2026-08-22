const FORMS = Object.freeze({
  "customer-statement-generate": [
    {
      name: "party_id",
      label: "Customer",
      type: "lookup",
      lookup: "customers",
      required: true,
      width: "full",
    },
    {
      name: "statement_date",
      label: "Statement Date",
      type: "date",
      required: true,
    },
    {
      name: "period_start",
      label: "Period Start",
      type: "date",
      required: true,
    },
    {
      name: "period_end",
      label: "Period End",
      type: "date",
      required: true,
    },
    {
      name: "currency_code",
      label: "Currency",
      type: "lookup",
      lookup: "currencies",
      required: true,
    },
  ],
  "bank-reconciliation-run": [
    {
      name: "bank_account_id",
      label: "Bank Account",
      type: "lookup",
      lookup: "bank_accounts",
      required: true,
      width: "full",
    },
    {
      name: "statement_end_date",
      label: "Statement End Date",
      type: "date",
      required: true,
    },
    {
      name: "statement_balance",
      label: "Statement Balance",
      type: "number",
      required: true,
      step: "any",
    },
    {
      name: "ledger_balance",
      label: "Ledger Balance",
      type: "number",
      required: true,
      step: "any",
    },
  ],
});

export function getFinanceOperationalFormContract(formId) {
  const schema = FORMS[String(formId || "").trim().toLowerCase()];
  return schema ? schema.map(field => ({ ...field })) : null;
}
