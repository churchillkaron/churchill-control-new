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

function normalizeCustomerReceipt(fields) {
  let result = fields
    .filter(field => field?.name !== "customer_invoice_id")
    .map(field => ({
      ...field,
      columns: Array.isArray(field?.columns)
        ? field.columns.map(column => ({ ...column }))
        : field?.columns,
    }));

  result = upsertField(result, {
    name: "customer",
    label: "Customer",
    type: "customer",
    required: true,
    width: "full",
  });

  result = upsertField(result, {
    name: "amount",
    label: "Receipt Amount",
    type: "number",
    required: true,
    min: 0.000001,
    step: "any",
  }, "customer");

  result = upsertField(result, {
    name: "payment_date",
    label: "Receipt Date",
    type: "date",
    required: true,
  }, "amount");

  result = upsertField(result, {
    name: "payment_method",
    label: "Payment Method",
    type: "text",
    required: true,
  }, "payment_date");

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

  result = upsertField(result, {
    name: "allocations",
    label: "Invoice Allocations — leave empty to retain the full receipt as unapplied cash",
    type: "table",
    required: false,
    width: "full",
    columns: [
      {
        name: "customer_invoice_id",
        label: "Open Customer Invoice",
        type: "lookup",
        lookup: "customer_invoices",
        required: true,
      },
      {
        name: "amount",
        label: "Allocated Amount",
        type: "number",
        required: true,
        min: 0.000001,
        step: "any",
      },
    ],
  }, "reference_number");

  return result;
}

export function enforceFinanceReceiptFormContract(
  formId,
  fields
) {
  const normalizedFormId = String(formId || "")
    .trim()
    .toLowerCase();

  if (normalizedFormId !== "customer-payment") {
    return fields;
  }

  return normalizeCustomerReceipt(
    Array.isArray(fields) ? fields : []
  );
}
