import { RestaurantEvents } from "../contracts/RestaurantEvents";

import {
  execute as createPayment,
} from "@/lib/restaurant/payments/CreatePayment/execute";

export async function handleKitchenEvent({
  event,
  context,
  payload,
}) {

  switch (event) {

    case RestaurantEvents.KITCHEN_COMPLETED:

      return await createPayment({
        context,
        payload,
      });

    default:

      return null;

  }

}
