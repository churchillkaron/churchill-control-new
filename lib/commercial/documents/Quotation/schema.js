export const QuotationSchema = {
  id: "string",
  organizationId: "string",
  entityId: "string|null",

  quotationNumber: "string|null",

  customerId: "string|null",
  customerName: "string|null",

  status: "string",

  currencyCode: "string",

  items: "array",

  subtotal: "number",
  discount: "number",
  tax: "number",
  total: "number",

  validUntil: "date|null",

  createdBy: "string|null",
  approvedBy: "string|null",

  createdAt: "datetime",
  updatedAt: "datetime",
};
