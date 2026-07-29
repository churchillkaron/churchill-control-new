export const FINANCE_ACCOUNTING_POLICY_DEFINITIONS = Object.freeze({
  POSTING_DATE_BASIS: Object.freeze({
    key: "POSTING_DATE_BASIS",
    name: "Posting Date Basis",
    description:
      "Determines which date becomes the posting date for system-generated journals.",
    defaultValue: "TRANSACTION_DATE",
    options: Object.freeze([
      Object.freeze({ value: "TRANSACTION_DATE", label: "Transaction Date" }),
      Object.freeze({ value: "DOCUMENT_DATE", label: "Document Date" }),
      Object.freeze({ value: "EVENT_DATE", label: "Accounting Event Date" }),
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
      Object.freeze({ value: "SOURCE_DOCUMENT", label: "Source Document" }),
      Object.freeze({ value: "EVENT_ID", label: "Accounting Event ID" }),
      Object.freeze({ value: "SOURCE_AND_EVENT", label: "Source Document and Event ID" }),
    ]),
  }),
  COST_CENTER_CODE_MODE: Object.freeze({
    key: "COST_CENTER_CODE_MODE",
    name: "Cost Centre Code Mode",
    description:
      "Controls whether Cost Centre codes are entered by users or generated from the Cost Centre name.",
    defaultValue: "MANUAL",
    options: Object.freeze([
      Object.freeze({ value: "MANUAL", label: "User enters a controlled code" }),
      Object.freeze({ value: "AUTO_FROM_NAME", label: "Generate code from Cost Centre name" }),
    ]),
  }),
  COST_CENTER_DEPARTMENT_MODE: Object.freeze({
    key: "COST_CENTER_DEPARTMENT_MODE",
    name: "Cost Centre Department Usage",
    description:
      "Controls whether Cost Centres must, may, or must not be assigned to Departments.",
    defaultValue: "OPTIONAL",
    options: Object.freeze([
      Object.freeze({ value: "REQUIRED", label: "Department required" }),
      Object.freeze({ value: "OPTIONAL", label: "Department optional" }),
      Object.freeze({ value: "HIDDEN", label: "Do not use Department on Cost Centres" }),
    ]),
  }),
  COST_CENTER_OWNER_MODE: Object.freeze({
    key: "COST_CENTER_OWNER_MODE",
    name: "Cost Centre Responsible Owner Usage",
    description:
      "Controls whether a responsible owner is required, optional, or hidden for Cost Centres.",
    defaultValue: "OPTIONAL",
    options: Object.freeze([
      Object.freeze({ value: "REQUIRED", label: "Responsible Owner required" }),
      Object.freeze({ value: "OPTIONAL", label: "Responsible Owner optional" }),
      Object.freeze({ value: "HIDDEN", label: "Do not use Responsible Owner" }),
    ]),
  }),
  COST_CENTER_TYPE_MODE: Object.freeze({
    key: "COST_CENTER_TYPE_MODE",
    name: "Cost Centre Type Usage",
    description:
      "Controls whether Cost Centre Type is hidden, optional, or required in the master-data form.",
    defaultValue: "HIDDEN",
    options: Object.freeze([
      Object.freeze({ value: "REQUIRED", label: "Cost Centre Type required" }),
      Object.freeze({ value: "OPTIONAL", label: "Cost Centre Type optional" }),
      Object.freeze({ value: "HIDDEN", label: "Use the configured default type" }),
    ]),
  }),
  COST_CENTER_DEFAULT_TYPE: Object.freeze({
    key: "COST_CENTER_DEFAULT_TYPE",
    name: "Default Cost Centre Type",
    description:
      "Sets the Cost Centre Type used when the Type field is hidden or left blank.",
    defaultValue: "OPERATIONAL",
    options: Object.freeze([
      Object.freeze({ value: "OPERATIONAL", label: "Operational" }),
      Object.freeze({ value: "ADMINISTRATIVE", label: "Administrative" }),
      Object.freeze({ value: "SALES", label: "Sales" }),
      Object.freeze({ value: "SERVICE", label: "Service" }),
      Object.freeze({ value: "PROJECT", label: "Project" }),
      Object.freeze({ value: "SHARED_SERVICE", label: "Shared Service" }),
      Object.freeze({ value: "OTHER", label: "Other" }),
    ]),
  }),
  COST_CENTER_HIERARCHY_MODE: Object.freeze({
    key: "COST_CENTER_HIERARCHY_MODE",
    name: "Cost Centre Hierarchy Usage",
    description:
      "Controls whether Parent Cost Centre is disabled, optional, or required.",
    defaultValue: "DISABLED",
    options: Object.freeze([
      Object.freeze({ value: "REQUIRED", label: "Parent Cost Centre required" }),
      Object.freeze({ value: "OPTIONAL", label: "Parent Cost Centre optional" }),
      Object.freeze({ value: "DISABLED", label: "Do not use Cost Centre hierarchy" }),
    ]),
  }),
  COST_CENTER_DESCRIPTION_MODE: Object.freeze({
    key: "COST_CENTER_DESCRIPTION_MODE",
    name: "Cost Centre Description Usage",
    description:
      "Controls whether the optional Cost Centre description field is shown.",
    defaultValue: "ENABLED",
    options: Object.freeze([
      Object.freeze({ value: "ENABLED", label: "Show Description" }),
      Object.freeze({ value: "DISABLED", label: "Hide Description" }),
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
