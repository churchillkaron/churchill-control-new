import {
  execute as markReady,
} from "@/lib/restaurant/kitchen/MarkReady/execute";

import {
  execute as completeKitchen,
} from "@/lib/restaurant/kitchen/Complete/execute";

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
