import { getLiveTableState } from "@/lib/restaurant/services/getLiveTableState";

export async function execute({
  organizationId,
  payload = {},
}) {
  return getLiveTableState({
    organizationId,
    tableId: payload.tableId || payload.table_id || null,
    tableNumber: payload.tableNumber || payload.table_number || null,
  });
}
