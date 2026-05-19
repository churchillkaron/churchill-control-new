import { supabase } from "@/lib/shared/supabase/client";

export async function loadPaymentControl(
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

  const unpaid =
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

  const unpaidRevenue =
    unpaid.reduce(
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

  const avgPaid =
    paid.length > 0
      ? Math.floor(
          revenue /
            paid.length
        )
      : 0;

  return {

    paidOrders:
      paid.length,

    unpaidOrders:
      unpaid.length,

    revenue,

    unpaidRevenue,

    avgPaid,
  };
}
