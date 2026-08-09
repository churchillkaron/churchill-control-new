export async function applyRules({
  payload = {},
}) {
  const customerName =
    payload.customerName ||
    payload.customer_name ||
    null;

  const partyId =
    payload.partyId ||
    payload.party_id ||
    null;

  if (!partyId && !customerName) {
    throw new Error(
      "partyId or customerName required"
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

    partyId,
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
