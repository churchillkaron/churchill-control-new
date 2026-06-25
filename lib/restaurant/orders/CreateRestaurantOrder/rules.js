export async function applyRules({
  payload = {},
}) {
  return {
    sessionId:
      payload.sessionId ||
      payload.session_id,

    tableId:
      payload.tableId ||
      payload.table_id ||
      null,

    tableNumber:
      payload.tableNumber ||
      payload.table_number ||
      null,

    customerId:
      payload.customerId ||
      payload.customer_id ||
      null,

    customerName:
      payload.customerName ||
      payload.customer_name ||
      null,

    staffId:
      payload.staffId ||
      payload.staff_id ||
      null,

    staffName:
      payload.staffName ||
      payload.staff_name ||
      null,

    items: [],
  };
}
