import { supabase } from "@/lib/shared/supabase/client";

export async function loadPredictiveInsights(
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

  // ===== KITCHEN =====
  const {
    data: kitchen,
  } = await supabase
    .from(
      "kitchen_ticket_items"
    )
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

  const avgOrder =
    paid.length > 0
      ? Math.floor(
          revenue /
            paid.length
        )
      : 0;

  const pending =
    (kitchen || []).filter(
      (k) =>
        k.status === "PENDING"
    ).length;

  const preparing =
    (kitchen || []).filter(
      (k) =>
        k.status === "PREPARING"
    ).length;

  // ===== PREDICTIVE ENGINE =====
  let nextHourRevenue =
    revenue;

  nextHourRevenue +=
    active.length *
    avgOrder;

  let risk =
    "LOW";

  if (
    pending >= 10
  ) {

    risk = "HIGH";

  } else if (
    pending >= 5
  ) {

    risk = "MEDIUM";
  }

  let recommendation =
    "Operations stable";

  if (
    risk === "HIGH"
  ) {

    recommendation =
      "Reduce kitchen load immediately";
  }

  if (
    active.length >= 20
  ) {

    recommendation =
      "Prepare for rush hour";
  }

  return {

    revenue,

    nextHourRevenue,

    avgOrder,

    activeOrders:
      active.length,

    pending,

    preparing,

    risk,

    recommendation,
  };
}
