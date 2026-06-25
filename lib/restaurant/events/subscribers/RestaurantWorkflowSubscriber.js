import { RestaurantEvents } from "../contracts/RestaurantEvents";

import {
  execute as createKitchenTicket,
} from "@/lib/restaurant/kitchen/CreateKitchenTicket/execute";

import {
  execute as createPayment,
} from "@/lib/restaurant/payments/CreatePayment/execute";

export async function handleRestaurantEvent({
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

    case RestaurantEvents.ORDER_PAID:

      return await createPayment({
        context,
        payload,
      });

    default:

      return null;

  }

}
