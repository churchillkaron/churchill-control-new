import { supabase } from "@/lib/shared/supabase/client";

export async function loadManagerOverview(
  tenant_id
) {

  if (!tenant_id) {
    return null;
  }

  // ===== ACTIVE ORDERS =====
  const {
    data: activeOrders,
  } = await supabase
    .from("orders")
    .select("*")
    .eq(
      "tenant_id",
      tenant_id
    )
    .eq(
      "status",
      "ACTIVE"
    );

  // ===== PAID ORDERS =====
  const {
    data: paidOrders,
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
    );

  // ===== KITCHEN =====
  const {
    data: kitchen,
  } = await supabase
    .from(
      "kitchen_ticket_items"
    )
    .select("*")
    .neq(
      "status",
      "SERVED"
    )
    .neq(
      "status",
      "CANCELLED"
    );

  // ===== REVENUE =====
  const revenue =
    (paidOrders || []).reduce(
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

  // ===== SERVICE =====
  const service =
    revenue * 0.05;

  // ===== ALERTS =====
  let alerts = 0;

  for (const item of kitchen || []) {

    const minutes =
      Math.floor(
        (
          new Date() -
          new Date(
            item.created_at
          )
        ) /
          1000 /
          60
      );

    if (minutes >= 15) {
      alerts += 1;
    }
  }

  return {

    activeOrders:
      activeOrders?.length || 0,

    paidOrders:
      paidOrders?.length || 0,

    kitchenTickets:
      kitchen?.length || 0,

    revenue,

    service,

    alerts,
  };
}
