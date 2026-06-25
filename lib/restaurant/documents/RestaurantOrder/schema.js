export const RestaurantOrderSchema = {
  id: "string",
  organizationId: "string",

  sessionId: "string|null",
  tableId: "string|null",
  tableNumber: "string|number|null",

  customerId: "string|null",
  customerName: "string|null",

  status: "string",

  staffId: "string|null",
  staffName: "string|null",

  items: "array",

  subtotal: "number",
  serviceCharge: "number",
  vat: "number",
  discount: "number",
  total: "number",

  paymentStatus: "string|null",
  productionStatus: "string|null",

  createdAt: "datetime",
  updatedAt: "datetime",
};
