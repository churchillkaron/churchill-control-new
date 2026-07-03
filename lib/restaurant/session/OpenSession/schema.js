export const schema = {
  domain: "restaurant",
  capability: "session",
  action: "OpenSession",
  required: [
    "organization_id"
  ],
  oneOf: [
    "tableId",
    "table_id",
    "tableNumber",
    "table_number"
  ],
  payload: {
    tableId: "string|null",
    table_id: "string|null",
    tableNumber: "string|number|null",
    table_number: "string|number|null",
    customerId: "string|null",
    customerName: "string|null",
    customerEmail: "string|null",
    customerPhone: "string|null",
    guestCount: "number",
    guest_count: "number",
  },
};
