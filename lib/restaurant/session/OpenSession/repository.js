import { openTableSession } from "@/lib/restaurant/services/openTableSession";

export async function repository({ context, payload }) {
  return openTableSession({
    organizationId: context.organization_id,
    tableId: payload.tableId || payload.table_id,
    tableNumber: payload.tableNumber || payload.table_number,
    customerId: payload.customerId || payload.customer_id || null,
    customerName: payload.customerName || payload.customer_name || null,
    customerEmail: payload.customerEmail || payload.customer_email || null,
    customerPhone: payload.customerPhone || payload.customer_phone || null,
    guestCount: payload.guestCount || payload.guest_count || 0,
  });
}
