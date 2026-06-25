import { schema } from "./schema";

export function validate({
  organizationId,
  payload = {},
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!payload.tableId && !payload.tableNumber) {
    throw new Error(
      "tableId or tableNumber required"
    );
  }

  return {
    schema,
    payload,
  };
}
