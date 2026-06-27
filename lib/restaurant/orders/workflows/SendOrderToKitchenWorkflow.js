import {
  execute as sendToKitchen,
} from "@/lib/restaurant/orders/SendToKitchen/execute";

export async function execute({

  context,

  orderId,

}) {

  if (!context?.organizationId) {
    throw new Error(
      "organizationId is required."
    );
  }

  return await sendToKitchen({

    context,

    payload: {
      orderId,
    },

  });

}
