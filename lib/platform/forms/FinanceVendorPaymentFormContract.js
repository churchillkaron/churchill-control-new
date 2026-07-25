function upsertField(fields, value, after = null) {
  const index = fields.findIndex(
    field => field?.name === value.name
  );

  if (index >= 0) {
    return fields.map((field, fieldIndex) =>
      fieldIndex === index
        ? { ...field, ...value }
        : field
    );
  }

  if (!after) {
    return [...fields, value];
  }

  const afterIndex = fields.findIndex(
    field => field?.name === after
  );

  if (afterIndex < 0) {
    return [...fields, value];
  }

  return [
    ...fields.slice(0, afterIndex + 1),
    value,
    ...fields.slice(afterIndex + 1),
  ];
}

function normalizeVendorPayment(fields) {
  let result = fields
    .filter(field => ![
      "vendor",
      "paid_by",
    ].includes(field?.name))
    .map(field => ({
      ...field,
      columns: Array.isArray(field?.columns)
        ? field.columns.map(column => ({ ...column }))
        : field?.columns,
    }));

  result = upsertField(result, {
    name: "accounts_payable_id",
    label: "Approved Accounts Payable Entry",
    type: "lookup",
    lookup: "accounts_payable",
    required: true,
  });

  result = upsertField(result, {
    name: "amount",
    label: "Payment Amount",
    type: "number",
    required: true,
    min: 0.000001,
    step: "any",
  }, "accounts_payable_id");

  result = upsertField(result, {
    name: "paid_at",
    label: "Payment Date and Time",
    type: "datetime-local",
    required: true,
  }, "amount");

  result = upsertField(result, {
    name: "payment_method",
    label: "Payment Method",
    type: "text",
    required: true,
  }, "paid_at");

  result = upsertField(result, {
    name: "bank_account_id",
    label: "Bank Account",
    type: "lookup",
    lookup: "bank_accounts",
    required: true,
  }, "payment_method");

  result = upsertField(result, {
    name: "currency_code",
    label: "Currency",
    type: "lookup",
    lookup: "currencies",
    required: true,
  }, "bank_account_id");

  result = upsertField(result, {
    name: "exchange_rate",
    label: "Exchange Rate",
    type: "number",
    required: true,
    min: 0.00000001,
    step: "any",
  }, "currency_code");

  result = upsertField(result, {
    name: "reference_number",
    label: "Reference Number",
    type: "text",
  }, "exchange_rate");

  return result;
}

export function enforceFinanceVendorPaymentFormContract(
  formId,
  fields
) {
  const normalizedFormId = String(formId || "")
    .trim()
    .toLowerCase();

  if (normalizedFormId !== "vendor-payment") {
    return fields;
  }

  return normalizeVendorPayment(
    Array.isArray(fields) ? fields : []
  );
}
