import { schema } from "./schema";

export function validate({ context, payload = {} }) {
  if (!context?.organization_id) {
    throw new Error("organization_id required");
  }

  if (!payload.tableId && !payload.table_id && !payload.tableNumber && !payload.table_number) {
    throw new Error("tableId or tableNumber required");
  }

  return {
    schema,
    payload,
  };
}
