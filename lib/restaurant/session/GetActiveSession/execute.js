import { getActiveTableSession } from "@/lib/restaurant/services/getActiveTableSession";

export async function execute({ context, payload = {} }) {
  return getActiveTableSession({
    organizationId: context.organization_id,
    tableId: payload.tableId || payload.table_id || null,
    tableNumber: payload.tableNumber || payload.table_number || null,
  });
}
