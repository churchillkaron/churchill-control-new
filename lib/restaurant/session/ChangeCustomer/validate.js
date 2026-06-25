import { schema } from "./schema";

export function validate({
  context,
  payload = {},
}) {
  if (!context?.organizationId) {
    throw new Error("organizationId required");
  }

  if (
    !payload.sessionId &&
    !payload.session_id &&
    !payload.tableId &&
    !payload.table_id &&
    !payload.tableNumber &&
    !payload.table_number
  ) {
    throw new Error(
      "sessionId, tableId, or tableNumber required"
    );
  }

  return {
    schema,
    payload,
  };
}
