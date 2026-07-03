import { loadMergedTableOrders } from "@/lib/restaurant/services/loadMergedTableOrders";

export async function execute({ context, payload = {} }) {
  return loadMergedTableOrders({
    organizationId: context.organization_id,
    tableId: payload.tableId || payload.table_id || null,
    tableNumber: payload.tableNumber || payload.table_number || null,
  });
}
