import { RestaurantEvents } from "../contracts/RestaurantEvents";

import {
  execute as closeSession,
} from "@/lib/restaurant/session/CloseSession/execute";

export async function handlePaymentEvent({
  event,
  context,
  payload,
}) {

  switch (event) {

    case RestaurantEvents.ORDER_PAID:

      return await closeSession({
        context,
        payload: {
          sessionId:
            payload.sessionId,
        },
      });

    default:

      return null;

  }

}
