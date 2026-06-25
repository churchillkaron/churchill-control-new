import {
  getPendingRestaurantEvents,
  removeRestaurantEvent,
} from "../outbox/RestaurantOutbox";

import {
  publishRestaurantEvent,
} from "../RestaurantEventBus";

export async function dispatchRestaurantEvents() {

  const events =
    await getPendingRestaurantEvents();

  for (const event of events) {

    await publishRestaurantEvent({
      event: event.event,
      context: event.context,
      payload: event.payload,
    });

    await removeRestaurantEvent(
      event.id
    );

  }

}
