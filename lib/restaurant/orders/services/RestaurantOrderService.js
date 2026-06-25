import {
  loadRestaurantOrder,
  saveRestaurantOrder,
} from "@/lib/restaurant/repositories/orders/RestaurantOrderRepository";

import {
  fromRepository,
} from "@/lib/restaurant/orders/mappers/RestaurantOrderMapper";

export async function executeRestaurantOrderOperation({
  organizationId,
  orderId,
  operation,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!orderId) {
    throw new Error("orderId required");
  }

  if (typeof operation !== "function") {
    throw new Error("operation callback required");
  }

  const record =
    await loadRestaurantOrder({
      organizationId,
      orderId,
    });

  const aggregate =
    fromRepository({
      organizationId,
      order: record,
    });

  await operation(aggregate);

  return await saveRestaurantOrder({
    aggregate,
  });
}
