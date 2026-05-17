import { supabase } from "@/lib/shared/supabase/client";

export async function loadKitchenOrders(
  tenantId
) {

  const {
    data,
    error,
  } = await supabase
    .from("orders")
    .select(`
      *,
      order_items (
        id,
        item_name,
        quantity,
        price
      )
    `)
    .eq(
      "tenant_id",
      tenantId
    )
    .in(
      "kitchen_status",
      [
        "PENDING",
        "PREPARING",
        "READY",
      ]
    )
    .order(
      "created_at",
      {
        ascending: true,
      }
    );

  if (error) {

    console.error(
      "LOAD KITCHEN ORDERS ERROR",
      error
    );

    return [];
  }

  return data.map(
    (order) => {

      const createdAt =
        new Date(
          order.created_at
        ).getTime();

      const duration =
        Math.floor(
          (
            Date.now() -
            createdAt
          ) / 60000
        );

      // ===== URGENCY =====
      let urgency =
        "NORMAL";

      if (
        duration >= 30
      ) {

        urgency =
          "CRITICAL";

      } else if (
        duration >= 15
      ) {

        urgency =
          "WARNING";
      }

      // ===== TOTAL ITEMS =====
      const totalItems =
        order.order_items?.reduce(
          (
            sum,
            item
          ) =>
            sum +
            Number(
              item.quantity || 0
            ),
          0
        ) || 0;

      // ===== REVENUE =====
      const revenue =
        order.order_items?.reduce(
          (
            sum,
            item
          ) =>
            sum +
            (
              Number(
                item.price || 0
              ) *
              Number(
                item.quantity || 0
              )
            ),
          0
        ) || 0;

      return {
        ...order,

        duration,

        urgency,

        totalItems,

        revenue,
      };
    }
  );
}
