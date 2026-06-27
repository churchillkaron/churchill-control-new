import {
  execute as markReady,
} from "@/lib/restaurant/kitchen/workflows/MarkReady";

import {
  execute as completeKitchen,
} from "@/lib/restaurant/kitchen/workflows/CompleteKitchenTicket";

export async function execute({

  context,

  ticketId,

}) {

  if (!context?.organizationId) {
    throw new Error(
      "organizationId is required."
    );
  }


  await markReady({

    context,

    payload: {
      ticketId,
    },

  });

  const completed =
    await completeKitchen({

      context,

      payload: {
        ticketId,
      },

    });

  return completed;

}
