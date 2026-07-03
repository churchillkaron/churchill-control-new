import { getLiveTableState } from "@/lib/restaurant/services/getLiveTableState";

export async function execute({ context, payload = {} }) {
  return getLiveTableState({
    organizationId: context.organization_id,
    tableId: payload.tableId || payload.table_id || null,
    tableNumber: payload.tableNumber || payload.table_number || null,
  });
}
