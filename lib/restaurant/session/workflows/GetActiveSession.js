import { getActiveTableSession } from "@/lib/restaurant/services/getActiveTableSession";

export async function execute({
  organizationId,
  payload = {},
}) {
  return getActiveTableSession({
    organizationId,
    tableId: payload.tableId || payload.table_id || null,
    tableNumber: payload.tableNumber || payload.table_number || null,
  });
}
