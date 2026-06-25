export const schema = {
  domain: "restaurant",
  capability: "session",
  action: "OpenSession",
  required: [
    "organizationId"
  ],
  oneOf: [
    "tableId",
    "tableNumber"
  ],
  payload: {
    tableId: "string|null",
    tableNumber: "string|number|null",
    customerId: "string|null",
    customerName: "string|null",
    customerEmail: "string|null",
    customerPhone: "string|null",
    guestCount: "number",
  },
};
