function cloneFields(fields) {
  return Array.isArray(fields)
    ? fields.map(field => ({
        ...field,
        columns: Array.isArray(field?.columns)
          ? field.columns.map(column => ({ ...column }))
          : field?.columns,
      }))
    : [];
}

function upsertField(fields, value, after = null) {
  const index = fields.findIndex(field => field?.name === value.name);

  if (index >= 0) {
    return fields.map((field, fieldIndex) =>
      fieldIndex === index
        ? { ...field, ...value }
        : field
    );
  }

  if (!after) {
    return [value, ...fields];
  }

  const afterIndex = fields.findIndex(field => field?.name === after);
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
  const withoutInlineCustomer = fields.filter(
    field => field?.name !== "customer"
  );

  return upsertField(withoutInlineCustomer, {
    name: "customer_id",
    label: "Customer",
    type: "lookup",
    lookup: "customers",
    required: true,
    width: "full",
  });
}

function normalizeVendorBill(fields) {
  const withoutFreeTextVendor = fields.filter(
    field => field?.name !== "vendor"
  );

  return upsertField(withoutFreeTextVendor, {
    name: "vendor_party_id",
    label: "Vendor",
    type: "lookup",
    lookup: "vendors",
    required: true,
    width: "full",
  });
}

function normalizeCostCenter(fields) {
  let result = fields.filter(
    field => !["currency_code", "department"].includes(field?.name)
  );

  result = upsertField(result, {
    name: "name",
    label: "Cost Centre",
    type: "text",
    required: true,
  });
  result = upsertField(result, {
    name: "code",
    label: "Code",
    type: "text",
    required: true,
  }, "name");
  result = upsertField(result, {
    name: "type",
    label: "Type",
    type: "text",
  }, "code");
  result = upsertField(result, {
    name: "manager",
    label: "Manager",
    type: "text",
  }, "type");

  return result;
}

function normalizeFiscalPeriod(fields) {
  return fields.map(field =>
    field?.name === "period_name"
      ? {
          ...field,
          name: "name",
          label: "Period Name",
          required: true,
        }
      : field
  );
}

export function enforceFinanceWriteTargetFormContract(formId, fields) {
  const normalizedFormId = String(formId || "")
    .trim()
    .toLowerCase();
  const cloned = cloneFields(fields);

  if (normalizedFormId === "customer-payment") {
    return normalizeCustomerReceipt(cloned);
  }

  if (normalizedFormId === "vendor-bill") {
    return normalizeVendorBill(cloned);
  }

  if (normalizedFormId === "cost-center") {
    return normalizeCostCenter(cloned);
  }

  if (normalizedFormId === "fiscal-period") {
    return normalizeFiscalPeriod(cloned);
  }

  return cloned;
}
