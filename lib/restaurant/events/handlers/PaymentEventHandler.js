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


      await AttributionRuntime.record({

        organization_id:
          context.organization_id,

        provider_id:
          "internal",

        event_type:
          "ORDER_PAID",

        source_type:
          "REVENUE",

        source_id:
          payload.orderId ||
          payload.sessionId ||
          null,

        customer_id:
          payload.customer_id ||
          null,

        value:
          payload.amount ||
          0,

        currency:
          payload.currency ||
          "THB",

        metadata:
          payload,

      }).catch(() => null);



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
