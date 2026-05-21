import { supabase } from "@/lib/shared/supabase/client";

export async function loadRestaurantAnalytics(
  tenant_id
) {

  if (!tenant_id) {
    return null;
  }

  // ===== ORDERS =====
  const {
    data: orders,
  } = await supabase
    .from("orders")
    .select("*")
    .eq(
      "tenant_id",
      tenant_id
    );

  const paid =
    (orders || []).filter(
      (o) =>
        o.status === "PAID"
    );

  const active =
    (orders || []).filter(
      (o) =>
        o.status === "ACTIVE"
    );

  const revenue =
    paid.reduce(
      (
        sum,
        order
      ) =>
        sum +
        Number(
          order.total_amount || 0
        ),
      0
    );

  const activeRevenue =
    active.reduce(
      (
        sum,
        order
      ) =>
        sum +
        Number(
          order.total_amount || 0
        ),
      0
    );

  const averageOrder =
    paid.length > 0
      ? Math.floor(
          revenue /
            paid.length
        )
      : 0;

  // ===== HOURLY =====
  const hourly = {};

  for (const order of paid) {

    const hour =
      new Date(
        order.created_at
      ).getHours();

    if (
      !hourly[hour]
    ) {

      hourly[hour] = 0;
    }

    hourly[hour] +=
      Number(
        order.total_amount || 0
      );
  }

  return {

    revenue,

    activeRevenue,

    averageOrder,

    paidOrders:
      paid.length,

    activeOrders:
      active.length,

    hourly,
  };
}
