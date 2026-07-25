const FINANCE_FORM_IDS = new Set([
  "bank-account",
  "budget",
  "chart-of-account",
  "consolidation-run",
  "cost-center",
  "currency",
  "customer",
  "customer-invoice",
  "customer-payment",
  "finance-permission",
  "fiscal-period",
  "fixed-asset",
  "intercompany",
  "intercompany-reconciliation",
  "intercompany-settlement",
  "journal-entry",
  "journal-reversal",
  "legal-entity",
  "payment-term",
  "tax-code",
  "vendor-bill",
  "vendor-master",
  "vendor-payment",
]);

function cloneFields(fields) {
  return Array.isArray(fields)
    ? fields.map(field => ({ ...field }))
    : [];
}

function insertAfter(fields, fieldName, value) {
  const index = fields.findIndex(
    field => field?.name === fieldName
  );

  if (index < 0) {
    return [...fields, value];
  }

  return [
    ...fields.slice(0, index + 1),
    value,
    ...fields.slice(index + 1),
  ];
}

function normalizeCostCenter(fields) {
  return fields.filter(field => {
    if (field?.name !== "currency_code") {
      return true;
    }

    return !(
      field.defaultValue ||
      field.default
    );
  });
}

function normalizeLegalEntity(fields) {
  const withoutDuplicateCurrency = fields.filter(
    (field, index, list) =>
      field?.name !== "currency" ||
      list.findIndex(
        candidate => candidate?.name === "currency"
      ) === index
  );

  const existingCurrency = withoutDuplicateCurrency.find(
    field => field?.name === "currency"
  );

  if (existingCurrency) {
    existingCurrency.label =
      existingCurrency.label ||
      "Currency";
    existingCurrency.type = "lookup";
    existingCurrency.lookup = "currencies";
    existingCurrency.required = true;
    delete existingCurrency.default;
    delete existingCurrency.defaultValue;
    return withoutDuplicateCurrency;
  }

  return insertAfter(
    withoutDuplicateCurrency,
    "country",
    {
      name: "currency",
      label: "Currency",
      type: "lookup",
      lookup: "currencies",
      required: true,
    }
  );
}

function rejectFixedBusinessDefaults(formId, fields) {
  return fields.map(field => {
    if (
      !FINANCE_FORM_IDS.has(formId) ||
      ![
        "country",
        "currency",
        "currency_code",
        "tax_code",
        "tax_rate",
      ].includes(field?.name)
    ) {
      return field;
    }

    const normalized = { ...field };
    delete normalized.default;
    delete normalized.defaultValue;
    return normalized;
  });
}

export function enforceFinanceFormContract(
  formId,
  fields
) {
  const normalizedFormId = String(formId || "")
    .trim()
    .toLowerCase();

  let result = cloneFields(fields);

  if (normalizedFormId === "cost-center") {
    result = normalizeCostCenter(result);
  }

  if (normalizedFormId === "legal-entity") {
    result = normalizeLegalEntity(result);
  }

  return rejectFixedBusinessDefaults(
    normalizedFormId,
    result
  );
}
