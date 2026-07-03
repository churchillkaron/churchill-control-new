export const FORM_REGISTRY = {
  "customer-master": [
    { name: "customer_name", label: "Customer Name", required: true },
    { name: "customer_email", label: "Email", type: "email" },
    { name: "customer_phone", label: "Phone" },
  ],

  "vendor-master": [
    { name: "vendor_name", label: "Vendor Name", required: true },
    { name: "vendor_email", label: "Email", type: "email" },
    { name: "vendor_phone", label: "Phone" },
    { name: "tax_id", label: "Tax ID" },
  ],

  "bank-account": [
    { name: "bank_name", label: "Bank", required: true },
    { name: "account_name", label: "Account Name", required: true },
    { name: "account_number", label: "Account Number" },
    { name: "currency_code", label: "Currency", defaultValue: "THB" },
  ],

  "cost-center": [
    { name: "name", label: "Cost Center", required: true },
    { name: "code", label: "Code", required: true },
    { name: "department", label: "Department" },
  ],

  "legal-entity": [
    { name: "legal_name", label: "Legal Name", required: true },
    { name: "code", label: "Code", required: true },
    { name: "registration_number", label: "Registration" },
    { name: "tax_id", label: "Tax ID" },
    { name: "country", label: "Country", defaultValue: "Thailand" },
    { name: "currency", label: "Currency", defaultValue: "THB" },
  ],
};

export const FORM_ALIASES = {
  customers: "customer-master",
  customer: "customer-master",
  vendors: "vendor-master",
  vendor: "vendor-master",
  "bank-accounts": "bank-account",
  bank_accounts: "bank-account",
  "cost-centers": "cost-center",
  cost_centers: "cost-center",
  "legal-entities": "legal-entity",
  legal_entities: "legal-entity",
};

export function normalizeFormId(formId) {
  const raw =
    String(formId || "")
      .replace(/_/g, "-")
      .toLowerCase();

  return FORM_ALIASES[raw] || raw;
}

export function getForm(formId) {
  return FORM_REGISTRY[normalizeFormId(formId)] || [];
}
