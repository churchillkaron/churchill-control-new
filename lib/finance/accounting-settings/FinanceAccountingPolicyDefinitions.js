export const FINANCE_ACCOUNTING_POLICY_DEFINITIONS = Object.freeze({
  POSTING_DATE_BASIS: Object.freeze({
    key: "POSTING_DATE_BASIS",
    name: "Posting Date Basis",
    description:
      "Determines which date becomes the posting date for system-generated journals.",
    defaultValue: "TRANSACTION_DATE",
    options: Object.freeze([
      Object.freeze({
        value: "TRANSACTION_DATE",
        label: "Transaction Date",
      }),
      Object.freeze({
        value: "DOCUMENT_DATE",
        label: "Document Date",
      }),
      Object.freeze({
        value: "EVENT_DATE",
        label: "Accounting Event Date",
      }),
    ]),
  }),
  SYSTEM_JOURNAL_TYPE: Object.freeze({
    key: "SYSTEM_JOURNAL_TYPE",
    name: "System Journal Type",
    description:
      "Controls the journal type assigned to automatically generated Finance journals.",
    defaultValue: "SYSTEM",
    options: Object.freeze([
      Object.freeze({ value: "SYSTEM", label: "System Journal" }),
      Object.freeze({ value: "GENERAL", label: "General Journal" }),
      Object.freeze({ value: "ADJUSTING", label: "Adjusting Journal" }),
    ]),
  }),
  JOURNAL_REFERENCE_FORMAT: Object.freeze({
    key: "JOURNAL_REFERENCE_FORMAT",
    name: "Journal Reference Format",
    description:
      "Controls how system-generated journals identify their source document and event.",
    defaultValue: "SOURCE_DOCUMENT",
    options: Object.freeze([
      Object.freeze({
        value: "SOURCE_DOCUMENT",
        label: "Source Document",
      }),
      Object.freeze({ value: "EVENT_ID", label: "Accounting Event ID" }),
      Object.freeze({
        value: "SOURCE_AND_EVENT",
        label: "Source Document and Event ID",
      }),
    ]),
  }),
});

export const FINANCE_ACCOUNTING_POLICY_OPTIONS = Object.freeze(
  Object.values(FINANCE_ACCOUNTING_POLICY_DEFINITIONS).map((definition) =>
    Object.freeze({
      value: definition.key,
      label: definition.name,
      description: definition.description,
    })
  )
);

export const FINANCE_ACCOUNTING_POLICY_VALUE_OPTIONS = Object.freeze(
  Object.fromEntries(
    Object.values(FINANCE_ACCOUNTING_POLICY_DEFINITIONS).map((definition) => [
      definition.key,
      definition.options,
    ])
  )
);

export function normalizeFinanceAccountingPolicyKey(value) {
  return String(value || "").trim().toUpperCase();
}

export function normalizeFinanceAccountingPolicyValue(value) {
  return String(value || "").trim().toUpperCase();
}

export function getFinanceAccountingPolicyDefinition(key) {
  return (
    FINANCE_ACCOUNTING_POLICY_DEFINITIONS[
      normalizeFinanceAccountingPolicyKey(key)
    ] || null
  );
}

export function getFinanceAccountingPolicyOption(key, value) {
  const definition = getFinanceAccountingPolicyDefinition(key);
  const normalizedValue = normalizeFinanceAccountingPolicyValue(value);

  return (
    definition?.options.find((option) => option.value === normalizedValue) ||
    null
  );
}
