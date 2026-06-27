import { createRestaurantOrderDocument } from "@/lib/restaurant/documents/RestaurantOrder";
import { transitionRestaurantOrder } from "@/lib/restaurant/documents/RestaurantOrder";
import { createRestaurantOrderRecord } from "@/lib/restaurant/repositories/orders/RestaurantOrderRepository";

export async function repository({
  context,
  payload,
}) {
  const draft =
    createRestaurantOrderDocument({
      organizationId: context.organizationId,
      sessionId: payload.sessionId,
      tableId: payload.tableId,
      tableNumber: payload.tableNumber,
      customerId: payload.customerId,
      customerName: payload.customerName,
      staffId: payload.staffId,
      staffName: payload.staffName,
      items: payload.items || [],
    });

  const openDocument =
    transitionRestaurantOrder({
      document: draft,
      nextStatus: "OPEN",
    });

  return createRestaurantOrderRecord({
    document: openDocument,
  });
}
