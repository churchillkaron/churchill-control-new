import {
  loadRestaurantOrder,
  saveRestaurantOrder,
} from "./RestaurantOrderRepository";

import {
  fromRepository,
} from "@/lib/restaurant/orders/repositories/RestaurantOrderMapper";

export async function loadAggregate({
  organizationId,
  orderId,
}) {
  const record =
    await loadRestaurantOrder({
      organizationId,
      orderId,
    });

  return fromRepository({
    organizationId,
    order: record,
  });
}

export async function saveAggregate({
  aggregate,
}) {
  return await saveRestaurantOrder({
    aggregate,
  });
}
