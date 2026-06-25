export async function applyRules({
  payload = {},
}) {
  const customerName =
    payload.customerName ||
    payload.customer_name ||
    null;

  const customerId =
    payload.customerId ||
    payload.customer_id ||
    null;

  if (!customerId && !customerName) {
    throw new Error(
      "customerId or customerName required"
    );
  }

  return {
    sessionId:
      payload.sessionId ||
      payload.session_id ||
      null,

    tableId:
      payload.tableId ||
      payload.table_id ||
      null,

    tableNumber:
      payload.tableNumber ||
      payload.table_number ||
      null,

    customerId,
    customerName,

    customerEmail:
      payload.customerEmail ||
      payload.customer_email ||
      null,

    customerPhone:
      payload.customerPhone ||
      payload.customer_phone ||
      null,
  };
}
