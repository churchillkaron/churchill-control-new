export function validate({
  context,
  payload = {},
}) {
  if (!context?.organizationId) {
    throw new Error("organizationId required");
  }

  if (!payload.sessionId && !payload.session_id) {
    throw new Error("sessionId required");
  }

  if (!payload.tableId && !payload.table_id && !payload.tableNumber && !payload.table_number) {
    throw new Error("tableId or tableNumber required");
  }

  return true;
}
