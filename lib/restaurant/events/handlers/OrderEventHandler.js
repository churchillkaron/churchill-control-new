import { RestaurantEvents } from "../contracts/RestaurantEvents";

import {
  execute as createKitchenTicket,
} from "@/lib/restaurant/kitchen/CreateKitchenTicket/execute";

export async function handleOrderEvent({
  event,
  context,
  payload,
}) {

  switch (event) {

    case RestaurantEvents.ORDER_SENT_TO_KITCHEN:

      return await createKitchenTicket({
        context,
        payload,
      });

    default:

      return null;

  }

}
