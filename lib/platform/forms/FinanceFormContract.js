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
    ? fields.map(field => ({
        ...field,
        columns: Array.isArray(field?.columns)
          ? field.columns.map(column => ({ ...column }))
          : field?.columns,
      }))
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

  return after
    ? insertAfter(fields, after, value)
    : [...fields, value];
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

function normalizeLegalEntity() {
  return [
    {
      name: "legal_name",
      label: "Registered Legal Name",
      type: "text",
      required: true,
      width: "full",
    },
    {
      name: "display_name",
      label: "Trading / Display Name",
      type: "text",
    },
    {
      name: "code",
      label: "Entity Code",
      type: "text",
      required: true,
      placeholder: "Example: CHURCHILL-TH",
    },
    {
      name: "registration_number",
      label: "Company Registration Number",
      type: "text",
    },
    {
      name: "tax_id",
      label: "Tax Registration Number",
      type: "text",
    },
    {
      name: "country",
      label: "Country Code",
      type: "text",
      required: true,
      placeholder: "Two-letter code, for example TH",
    },
    {
      name: "currency",
      label: "Functional Currency",
      type: "lookup",
      lookup: "currencies",
      required: true,
    },
    {
      name: "timezone",
      label: "Timezone",
      type: "text",
      required: true,
      placeholder: "Example: Asia/Bangkok",
    },
    {
      name: "locale",
      label: "Locale",
      type: "select",
      required: true,
      options: [
        { value: "en-GB", label: "English (United Kingdom)" },
        { value: "en-US", label: "English (United States)" },
        { value: "th-TH", label: "Thai (Thailand)" },
      ],
    },
    {
      name: "parent_entity_id",
      label: "Parent Legal Entity",
      type: "lookup",
      lookup: "legal_entities",
    },
    {
      name: "address",
      label: "Registered Address",
      type: "textarea",
      rows: 4,
      width: "full",
    },
    {
      name: "email",
      label: "Finance Contact Email",
      type: "email",
    },
    {
      name: "phone",
      label: "Finance Contact Phone",
      type: "text",
    },
    {
      name: "is_holding_company",
      label: "Holding Company",
      type: "boolean",
      defaultValue: false,
    },
    {
      name: "is_default_accounting_entity",
      label: "Default Accounting Entity",
      type: "boolean",
      defaultValue: false,
    },
    {
      name: "is_active",
      label: "Active",
      type: "boolean",
      defaultValue: true,
    },
  ];
}

function invoiceLineColumns({ payable = false } = {}) {
  return [
    {
      name: "item_id",
      label: "Item / Service",
      type: "lookup",
      lookup: "items",
    },
    {
      name: "description",
      label: "Description",
      type: "text",
      required: true,
    },
    {
      name: "quantity",
      label: "Quantity",
      type: "number",
      required: true,
      min: 0.000001,
      step: "any",
    },
    {
      name: "unit_price",
      label: "Unit Price",
      type: "number",
      required: true,
      min: 0,
      step: "any",
    },
    {
      name: "discount_amount",
      label: "Discount",
      type: "number",
      min: 0,
      step: "any",
    },
    {
      name: "tax_code_id",
      label: "VAT / Tax",
      type: "lookup",
      lookup: "tax_codes",
    },
    {
      name: "tax_amount",
      label: "VAT / Tax amount",
      type: "number",
      min: 0,
      step: "any",
      readOnly: true,
    },
    {
      name: payable ? "expense_account_id" : "revenue_account_id",
      label: payable ? "Expense Account" : "Revenue Account",
      type: "lookup",
      lookup: payable ? "expense_accounts" : "revenue_accounts",
      advanced: true,
    },
    {
      name: "cost_center_id",
      label: "Cost Centre",
      type: "lookup",
      lookup: "cost_centers",
      advanced: true,
    },
    {
      name: "department_id",
      label: "Department",
      type: "lookup",
      lookup: "departments",
      advanced: true,
    },
    {
      name: "project_id",
      label: "Project",
      type: "lookup",
      lookup: "projects",
      advanced: true,
    },
    {
      name: "line_total",
      label: "Line Total",
      type: "calculated-money",
      readOnly: true,
    },
  ];
}

function normalizeInvoice(fields, { payable = false } = {}) {
  let result = fields;

  result = upsertField(
    result,
    {
      name: payable ? "vendor" : "customer",
      label: payable ? "Vendor" : "Customer",
      type: payable ? "vendor" : "customer",
      required: true,
      width: "full",
    }
  );
  result = upsertField(
    result,
    {
      name: "currency_code",
      label: "Currency",
      type: "lookup",
      lookup: "currencies",
      required: true,
    },
    "due_date"
  );
  if (payable) {
    result = upsertField(
      result,
      {
        name: "exchange_rate",
        label: "Exchange Rate",
        type: "number",
        required: true,
        min: 0.00000001,
        step: "any",
      },
      "currency_code"
    );
  } else {
    result = result.filter((field) => field?.name !== "exchange_rate");
  }
  result = upsertField(
    result,
    {
      name: "lines",
      label: payable ? "Vendor Bill Lines" : "Invoice Lines",
      type: "table",
      required: true,
      width: "full",
      columns: invoiceLineColumns({ payable }),
    }
  );

  return result;
}

function normalizeJournal(fields) {
  let result = fields;

  result = upsertField(
    result,
    {
      name: "currency_code",
      label: "Currency",
      type: "lookup",
      lookup: "currencies",
      required: true,
    }
  );
  result = upsertField(
    result,
    {
      name: "exchange_rate",
      label: "Exchange Rate",
      type: "number",
      required: true,
      min: 0.00000001,
      step: "any",
    },
    "currency_code"
  );
  result = upsertField(
    result,
    {
      name: "lines",
      label: "Debit and Credit Lines",
      type: "table",
      required: true,
      width: "full",
      columns: [
        {
          name: "account_id",
          label: "Account",
          type: "lookup",
          lookup: "chart_of_accounts",
          required: true,
        },
        {
          name: "description",
          label: "Description",
          type: "text",
        },
        {
          name: "debit",
          label: "Debit",
          type: "number",
          min: 0,
          step: "any",
        },
        {
          name: "credit",
          label: "Credit",
          type: "number",
          min: 0,
          step: "any",
        },
        {
          name: "cost_center_id",
          label: "Cost Centre",
          type: "lookup",
          lookup: "cost_centers",
        },
        {
          name: "department_id",
          label: "Department",
          type: "lookup",
          lookup: "departments",
        },
        {
          name: "project_id",
          label: "Project",
          type: "lookup",
          lookup: "projects",
        },
      ],
    }
  );

  return result;
}

function normalizeCustomerPayment(fields) {
  let result = fields;

  result = upsertField(result, {
    name: "customer_invoice_id",
    label: "Open Customer Invoice",
    type: "lookup",
    lookup: "open_customer_invoices",
    required: true,
  });
  result = upsertField(result, {
    name: "currency_code",
    label: "Currency",
    type: "lookup",
    lookup: "currencies",
    required: true,
  }, "payment_date");
  result = upsertField(result, {
    name: "exchange_rate",
    label: "Exchange Rate",
    type: "number",
    required: true,
    min: 0.00000001,
    step: "any",
  }, "currency_code");
  result = upsertField(result, {
    name: "bank_account_id",
    label: "Deposit Bank Account",
    type: "lookup",
    lookup: "bank_accounts",
    required: true,
  }, "exchange_rate");

  return result;
}

function normalizeVendorPayment(fields) {
  let result = fields;

  result = upsertField(result, {
    name: "accounts_payable_id",
    label: "Open Accounts Payable Entry",
    type: "lookup",
    lookup: "accounts_payable",
    required: true,
  });
  result = upsertField(result, {
    name: "paid_at",
    label: "Payment Date",
    type: "datetime-local",
    required: true,
  }, "accounts_payable_id");
  result = upsertField(result, {
    name: "currency_code",
    label: "Currency",
    type: "lookup",
    lookup: "currencies",
    required: true,
  }, "paid_at");
  result = upsertField(result, {
    name: "exchange_rate",
    label: "Exchange Rate",
    type: "number",
    required: true,
    min: 0.00000001,
    step: "any",
  }, "currency_code");
  result = upsertField(result, {
    name: "bank_account_id",
    label: "Bank Account",
    type: "lookup",
    lookup: "bank_accounts",
    required: true,
  }, "payment_method");
  result = upsertField(result, {
    name: "reference_number",
    label: "Reference Number",
    type: "text",
  });

  return result;
}



function normalizeJournalReversal() {
  return [
    { name: "journal_id", label: "Posted Journal", type: "lookup", lookup: "journals", required: true, width: "full" },
    { name: "reversal_date", label: "Reversal Date", type: "date", required: true },
    { name: "reason", label: "Reason for Reversal", type: "textarea", rows: 3, width: "full", required: true },
  ];
}

function normalizeBankAccount(fields) {
  let result = fields;
  result = upsertField(result, { name: "currency_code", label: "Currency", type: "lookup", lookup: "currencies", required: true });
  result = upsertField(result, { name: "finance_account_id", label: "Linked Bank GL Account", type: "lookup", lookup: "bank_gl_accounts", description: "The asset account used for postings to this bank account." }, "currency_code");
  result = upsertField(result, { name: "is_default", label: "Default Bank Account", type: "boolean", defaultValue: false });
  result = upsertField(result, { name: "active", label: "Active", type: "boolean", defaultValue: true });
  return result;
}

function normalizeVendorMaster(fields) {
  let result = fields;
  result = upsertField(result, { name: "legal_name", label: "Registered / Legal Name", type: "text", required: true, width: "full" });
  result = upsertField(result, { name: "display_name", label: "Display Name", type: "text" });
  result = upsertField(result, { name: "email", label: "Accounts Payable Email", type: "email" });
  result = upsertField(result, { name: "address", label: "Billing Address", type: "textarea", rows: 3, width: "full" });
  result = upsertField(result, { name: "payment_terms", label: "Default Payment Terms", type: "lookup", lookup: "payment_terms" });
  result = upsertField(result, { name: "default_expense_account", label: "Default Expense Account", type: "lookup", lookup: "expense_accounts" });
  result = upsertField(result, { name: "default_ap_account", label: "Default Accounts Payable Account", type: "lookup", lookup: "liability_accounts" });
  result = upsertField(result, { name: "risk_level", label: "Risk Level", type: "text", placeholder: "Example: LOW" });
  result = upsertField(result, { name: "notes", label: "Notes", type: "textarea", rows: 3, width: "full" });
  result = upsertField(result, { name: "is_active", label: "Active", type: "boolean", defaultValue: true });
  result = upsertField(result, { name: "is_blocked", label: "Block New Transactions", type: "boolean", defaultValue: false });
  return result;
}

function normalizeTaxCode() {
  return [
    { name: "code", label: "Tax Code", type: "text", required: true },
    { name: "name", label: "Tax Name", type: "text", required: true },
    { name: "tax_type", label: "Tax Type", type: "select", required: true, options: [
      { value: "VAT", label: "VAT" },
      { value: "WITHHOLDING", label: "Withholding Tax" },
      { value: "OTHER", label: "Other" },
    ] },
    { name: "rate", label: "Tax Rate", type: "number", required: true, min: 0, step: "0.0001" },
    { name: "regime", label: "Tax Regime / Jurisdiction", type: "text", required: true, placeholder: "Example: TH" },
    { name: "accounting_standard", label: "Accounting Standard", type: "text", required: true, placeholder: "Example: TFRS or IFRS" },
    { name: "effective_from", label: "Effective From", type: "date" },
    { name: "effective_to", label: "Effective To", type: "date" },
    { name: "is_active", label: "Active", type: "boolean", defaultValue: true },
  ];
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

  if (normalizedFormId === "bank-account") {
    result = normalizeBankAccount(result);
  }

  if (normalizedFormId === "vendor-master") {
    result = normalizeVendorMaster(result);
  }

  if (normalizedFormId === "tax-code") {
    result = normalizeTaxCode();
  }

  if (normalizedFormId === "customer-invoice") {
    result = normalizeInvoice(result);
  }

  if (normalizedFormId === "vendor-bill") {
    result = normalizeInvoice(result, { payable: true });
  }

  if (normalizedFormId === "journal-entry") {
    result = normalizeJournal(result);
  }

  if (normalizedFormId === "journal-reversal") {
    result = normalizeJournalReversal();
  }

  if (normalizedFormId === "customer-payment") {
    result = normalizeCustomerPayment(result);
  }

  if (normalizedFormId === "vendor-payment") {
    result = normalizeVendorPayment(result);
  }

  return rejectFixedBusinessDefaults(
    normalizedFormId,
    result
  );
}
