import { openTableSession } from "@/lib/restaurant/services/openTableSession";

export async function repository({
  organizationId,
  payload,
}) {
  return openTableSession({
    organizationId,
    tableId:
      payload.tableId ||
      payload.table_id,

    tableNumber:
      payload.tableNumber ||
      payload.table_number,

    customerId:
      payload.customerId,

    customerName:
      payload.customerName,

    customerEmail:
      payload.customerEmail,

    customerPhone:
      payload.customerPhone,

    guestCount:
      payload.guestCount || 0,
  });
}
