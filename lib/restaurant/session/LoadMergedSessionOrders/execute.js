import { loadMergedTableOrders } from "@/lib/restaurant/services/loadMergedTableOrders";

export async function execute({
  organizationId,
  payload = {},
}) {
  return loadMergedTableOrders({
    organizationId,
    tableId: payload.tableId || payload.table_id || null,
    tableNumber: payload.tableNumber || payload.table_number || null,
  });
}
