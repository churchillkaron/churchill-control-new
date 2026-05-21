import { SIGNAL_TYPES } from "@/lib/signals/signalTypes";

import { publishSignal } from "@/lib/signals/publishSignal";

export async function orchestrateSignal({

  signal,

}) {

  console.log(
    "[ORCHESTRATION]",
    signal.type
  );

  switch (signal.type) {

    case SIGNAL_TYPES.ORDER_COMPLETED:

      await publishSignal({

        type:
          SIGNAL_TYPES.INVENTORY_UPDATED,

        tenantId:
          signal.tenantId,

        payload: {

          source:
            "ORDER_COMPLETED",

          orderId:
            signal.payload?.orderId,

        },

      });

      break;

    case SIGNAL_TYPES.LOW_INVENTORY:

      await publishSignal({

        type:
          SIGNAL_TYPES.PROCUREMENT_REQUIRED,

        tenantId:
          signal.tenantId,

        payload: {

          source:
            "LOW_INVENTORY",

          ingredientId:
            signal.payload?.ingredientId,

        },

      });

      break;

    default:

      break;

  }

  return {

    success: true,

    signal,

  };

}
