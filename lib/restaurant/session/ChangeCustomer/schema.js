export const schema = {
  domain: "restaurant",
  capability: "session",
  action: "ChangeCustomer",
  required: [
    "organization_id"
  ],
  oneOf: [
    "sessionId",
    "tableId",
    "tableNumber"
  ],
  payload: {
    sessionId: "string|null",
    tableId: "string|null",
    tableNumber: "string|number|null",
    partyId: "string|null",
    customerName: "string|null",
    customerEmail: "string|null",
    customerPhone: "string|null",
  },
};
