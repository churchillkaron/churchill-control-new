import {
  execute as openSession,
} from "@/lib/restaurant/session/OpenSession/execute";

import {
  execute as createOrder,
} from "@/lib/restaurant/orders/CreateRestaurantOrder/execute";

import {
  execute as addItem,
} from "@/lib/restaurant/orders/AddItem/execute";

export async function execute({

  context,

  order,

  items = [],

}) {

  if (!context?.organizationId) {
    throw new Error(
      "organizationId is required."
    );
  }

  let workingOrder = {
    ...order,
  };

  if (!workingOrder.sessionId) {

    const session =
      await openSession({

        context,

        payload: {

          tableId:
            workingOrder.tableId,

          tableNumber:
            workingOrder.tableNumber,

          customerId:
            workingOrder.customerId,

          customerName:
            workingOrder.customerName,

          customerEmail:
            workingOrder.customerEmail,

          customerPhone:
            workingOrder.customerPhone,

          guestCount:
            workingOrder.guestCount || 0,

        },

      });

    workingOrder.sessionId =
      session.id;

  }

  const created =
    await createOrder({

      context,

      payload:
        workingOrder,

    });

  let current = created;

  for (const item of items) {

    current =
      await addItem({

        context,

        payload: {

          orderId:
            created.id,

          ...item,

        },

      });

  }

  return current;

}
