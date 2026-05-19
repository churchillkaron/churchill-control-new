import { supabase } from "@/lib/shared/supabase/client";

export async function loadFinanceOverview(
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

  const paidOrders =
    (orders || []).filter(
      (o) =>
        o.status === "PAID"
    );

  const revenue =
    paidOrders.reduce(
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

  const serviceCharge =
    revenue * 0.05;

  const foh =
    serviceCharge * 0.5;

  const bar =
    serviceCharge * 0.3;

  const kitchen =
    serviceCharge * 0.2;

  const averageOrder =
    paidOrders.length > 0
      ? Math.floor(
          revenue /
            paidOrders.length
        )
      : 0;

  return {

    revenue,

    serviceCharge,

    foh,

    bar,

    kitchen,

    averageOrder,

    paidOrders:
      paidOrders.length,
  };
}
