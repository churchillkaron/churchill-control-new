import { supabase }
from "@/lib/shared/supabase/client";

export async function loadActiveOrders(
  tenantId
) {

  const {
    data: orders,
    error,
  } = await supabase

    .from("orders")

    .select("*")

    .eq(
      "tenant_id",
      tenantId
    )

    .in(
      "status",
      [
        "OPEN",
        "ACTIVE",
        "READY_FOR_PAYMENT",
        "PARTIAL",
      ]
    )

    .order(
      "created_at",
      {
        ascending: false,
      }
    );

  if (error) {

    console.error(error);

    return [];
  }

  const orderIds =
    (orders || []).map(
      (o) => o.id
    );

  const {
    data: kitchenItems,
  } = await supabase

    .from(
      "kitchen_ticket_items"
    )

    .select("*")

    .in(
      "order_id",
      orderIds
    );

  return (
    orders || []
  ).map((order) => {

    const items =
      (kitchenItems || [])
        .filter(
          (item) =>
            item.order_id ===
            order.id
        );

    const allServed =
      items.length > 0 &&
      items.every(
        (item) =>
          item.status ===
          "SERVED"
      );

    const allReady =
      items.length > 0 &&
      items.every(
        (item) =>
          item.status === "READY" ||
          item.status === "SERVED"
      );

    return {

      ...order,

      kitchenItems:
        items,

      canServe:
        allReady &&
        !allServed,

      canPay:
        allServed,
    };
  });
}
