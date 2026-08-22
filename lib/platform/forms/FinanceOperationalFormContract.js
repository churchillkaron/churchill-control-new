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
  "fiscal-period-status": [
    {
      name: "period_id",
      label: "Fiscal Period",
      type: "hidden",
      required: true,
    },
    {
      name: "status",
      label: "Period Status",
      type: "select",
      options: [
        { value: "open", label: "Open" },
        { value: "soft_closed", label: "Soft Closed" },
        { value: "closed", label: "Closed" },
        { value: "locked", label: "Locked — Final" },
      ],
      required: true,
      width: "full",
    },
  ],
  "revenue-recognition-recognize": [
    {
      name: "recognition_date",
      label: "Recognition Date",
      type: "date",
      required: true,
    },
    {
      name: "recognition_amount",
      label: "Recognition Amount",
      type: "number",
      required: false,
      min: 0.01,
      step: "0.01",
      help: "Leave blank for Straight Line. Enter an amount for Manual recognition.",
    },
  ],
  "vat-return-mark-submitted": [
    {
      name: "submission_reference",
      label: "Government / External Submission Reference",
      type: "text",
      required: true,
      width: "full",
      placeholder: "Reference returned by the tax authority or filing portal",
    },
  ],
  "statutory-filing-mark-submitted": [
    {
      name: "submission_reference",
      label: "Government / External Submission Reference",
      type: "text",
      required: true,
      width: "full",
      placeholder: "Reference returned by the authority or statutory filing portal",
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
      name: "reconciliation_date",
      label: "Reconciliation Date",
      type: "date",
      required: true,
    },
    {
      name: "statement_closing_balance",
      label: "Statement Closing Balance",
      type: "number",
      required: true,
      step: "0.01",
    },
    {
      name: "notes",
      label: "Notes",
      type: "textarea",
      required: false,
      width: "full",
    },
  ],
  "depreciation-run": [
    {
      name: "book_reference",
      label: "Asset Book",
      type: "text",
      required: true,
      defaultValue: "PRIMARY",
      width: "full",
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
      name: "posting_date",
      label: "Posting Date",
      type: "date",
      required: true,
    },
    {
      name: "currency_code",
      label: "Currency",
      type: "lookup",
      lookup: "currencies",
      required: false,
    },
    {
      name: "notes",
      label: "Notes",
      type: "textarea",
      required: false,
      width: "full",
    },
  ],
  "report-template-run": [
    {
      name: "report_template_id",
      label: "Report Template",
      type: "lookup",
      lookup: "finance_report_templates",
      required: true,
      width: "full",
    },
  ],
});

export function getFinanceOperationalFormContract(formId) {
  const schema = FORMS[String(formId || "").trim().toLowerCase()];
  return schema ? schema.map(field => ({ ...field })) : null;
}
