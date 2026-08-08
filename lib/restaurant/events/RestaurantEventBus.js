import {
  appendRestaurantEvent,
} from "./outbox/RestaurantOutbox";

import {
  handleOrderEvent,
} from "./handlers/OrderEventHandler";

import {
  handleKitchenEvent,
} from "./handlers/KitchenEventHandler";

export async function publishRestaurantEvent({
  event,
  context,
  payload,
}) {

  await appendRestaurantEvent({
    event,
    context,
    payload,
  });

  await handleOrderEvent({
    event,
    context,
    payload,
  });

  await handleKitchenEvent({
    event,
    context,
    payload,
  });

  return {
    published: true,
    event,
    timestamp:
      new Date().toISOString(),
  };

}
