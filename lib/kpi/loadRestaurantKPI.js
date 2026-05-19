import { supabase } from "@/lib/shared/supabase/client";

export async function loadRestaurantKPI(
  tenant_id
) {

  if (!tenant_id) {
    return null;
  }

  const today =
    new Date();

  today.setHours(
    0,
    0,
    0,
    0
  );

  const {
    data: orders,
  } = await supabase
    .from("orders")
    .select("*")
    .eq(
      "tenant_id",
      tenant_id
    )
    .eq(
      "status",
      "PAID"
    )
    .gte(
      "paid_at",
      today.toISOString()
    );

  const revenue =
    (orders || []).reduce(
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

  const totalOrders =
    orders?.length || 0;

  const averageOrder =
    totalOrders > 0
      ? Math.floor(
          revenue /
            totalOrders
        )
      : 0;

  const serviceCharge =
    revenue * 0.05;

  return {

    revenue,

    totalOrders,

    averageOrder,

    serviceCharge,
  };
}
