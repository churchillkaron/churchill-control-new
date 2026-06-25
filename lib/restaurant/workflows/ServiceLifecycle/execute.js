import {
  execute as openSession,
} from "@/lib/restaurant/session/OpenSession/execute";

import {
  execute as createOrder,
} from "@/lib/restaurant/orders/CreateRestaurantOrder/execute";

import {
  execute as addItem,
} from "@/lib/restaurant/orders/AddItem/execute";

import {
  execute as createKitchenTicket,
} from "@/lib/restaurant/kitchen/CreateKitchenTicket/execute";

import {
  execute as startPreparation,
} from "@/lib/restaurant/kitchen/StartPreparation/execute";

import {
  execute as markReady,
} from "@/lib/restaurant/kitchen/MarkReady/execute";

import {
  execute as createPayment,
} from "@/lib/restaurant/payments/CreatePayment/execute";

import {
  execute as completePayment,
} from "@/lib/restaurant/payments/CompletePayment/execute";

import {
  execute as closeSession,
} from "@/lib/restaurant/session/CloseSession/execute";

export async function execute({
  context,
  payload = {},
}) {

  const session =
    await openSession({
      context,
      payload,
    });

  const order =
    await createOrder({
      context,
      payload: {
        ...payload,
        sessionId: session.id,
      },
    });

  for (const item of (payload.items || [])) {
    await addItem({
      context,
      payload: {
        orderId: order.id,
        ...item,
      },
    });
  }

  const kitchen =
    await createKitchenTicket({
      context,
      payload: {
        orderId: order.id,
        sessionId: session.id,
        tableId:
          session.table_id || session.tableId,
        tableNumber:
          session.table_number || session.tableNumber,
        items:
          payload.items || [],
      },
    });

  await startPreparation({
    load: async () => kitchen,
  });

  await markReady({
    load: async () => kitchen,
  });

  const payment =
    await createPayment({
      context,
      payload: {
        orderId: order.id,
        sessionId: session.id,
        amount:
          payload.amount || 0,
        method:
          payload.method || "CASH",
      },
    });

  await completePayment({
    payment,
    reference:
      payload.reference || null,
  });

  await closeSession({
    context,
    payload: {
      sessionId: session.id,
    },
  });

  return {
    session,
    order,
    kitchen,
    payment,
    completed: true,
  };
}
