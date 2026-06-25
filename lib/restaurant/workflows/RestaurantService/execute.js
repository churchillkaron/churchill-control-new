import {
  execute as openSession,
} from "@/lib/restaurant/session/OpenSession/execute";

import {
  execute as createRestaurantOrder,
} from "@/lib/restaurant/orders/CreateRestaurantOrder/execute";

import {
  execute as addItem,
} from "@/lib/restaurant/orders/AddItem/execute";

import {
  execute as createKitchenTicket,
} from "@/lib/restaurant/kitchen/CreateKitchenTicket/execute";

export async function execute({
  context,
  payload = {},
}) {
  const session =
    await openSession({
      context,
      payload: {
        tableId:
          payload.tableId || payload.table_id || null,

        tableNumber:
          payload.tableNumber || payload.table_number || null,

        customerId:
          payload.customerId || payload.customer_id || null,

        customerName:
          payload.customerName || payload.customer_name || null,

        customerPhone:
          payload.customerPhone || payload.customer_phone || null,

        customerEmail:
          payload.customerEmail || payload.customer_email || null,

        guestCount:
          payload.guestCount || payload.guest_count || 0,
      },
    });

  const order =
    await createRestaurantOrder({
      context,
      payload: {
        sessionId:
          session.id,

        tableId:
          session.table_id || session.tableId || null,

        tableNumber:
          session.table_number || session.tableNumber || null,

        customerId:
          session.customer_id || session.customerId || null,

        customerName:
          session.customer_name || session.customerName || null,

        staffId:
          payload.staffId || payload.staff_id || null,

        staffName:
          payload.staffName || payload.staff_name || null,

        items: [],
      },
    });

  const addedItems = [];

  for (const item of payload.items || []) {
    const added =
      await addItem({
        context,
        payload: {
          orderId:
            order.id,

          ...item,
        },
      });

    addedItems.push(added);
  }

  const kitchen =
    await createKitchenTicket({
      context,
      payload: {
        orderId:
          order.id,

        sessionId:
          session.id,

        tableId:
          session.table_id || session.tableId || null,

        tableNumber:
          session.table_number || session.tableNumber || null,

        items:
          payload.items || [],
      },
    });

  return {
    session,
    order,
    addedItems,
    kitchen,
  };
}
