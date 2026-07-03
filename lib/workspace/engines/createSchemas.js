export const CREATE_SCHEMAS = {

  customers: [
    { name: "customer_name", label: "Customer Name" },
    { name: "customer_email", label: "Email", type: "email" },
    { name: "customer_phone", label: "Phone" },
  ],

  vendors: [
    { name: "vendor_name", label: "Vendor Name" },
    { name: "vendor_email", label: "Email", type: "email" },
    { name: "vendor_phone", label: "Phone" },
    { name: "tax_id", label: "Tax ID" },
  ],

  "bank-accounts": [
    { name: "bank_name", label: "Bank" },
    { name: "account_name", label: "Account Name" },
    { name: "account_number", label: "Account Number" },
    { name: "currency_code", label: "Currency" },
  ],

  "cost-centers": [
    { name: "name", label: "Cost Center" },
    { name: "code", label: "Code" },
    { name: "department", label: "Department" },
  ],

  "legal-entities": [
    { name: "name", label: "Legal Name" },
    { name: "registration_number", label: "Registration" },
    { name: "tax_number", label: "Tax Number" },
    { name: "country", label: "Country" },
  ],

};
