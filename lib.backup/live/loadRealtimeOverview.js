import { supabase } from "@/lib/shared/supabase/client";

export async function loadRealtimeOverview(
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

  // ===== TABLES =====
  const {
    data: tables,
  } = await supabase
    .from("table_sessions")
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

  const revenue =
    (orders || [])
      .filter(
        (o) =>
          o.status === "PAID"
      )
      .reduce(
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

  const activeOrders =
    (orders || []).filter(
      (o) =>
        o.status === "ACTIVE"
    ).length;

  const paidOrders =
    (orders || []).filter(
      (o) =>
        o.status === "PAID"
    ).length;

  const activeTables =
    (tables || []).filter(
      (t) =>
        t.status === "ACTIVE"
    ).length;

  const kitchenPending =
    (kitchen || []).filter(
      (k) =>
        k.status === "PENDING"
    ).length;

  const kitchenPreparing =
    (kitchen || []).filter(
      (k) =>
        k.status === "PREPARING"
    ).length;

  const kitchenReady =
    (kitchen || []).filter(
      (k) =>
        k.status === "READY"
    ).length;

  return {

    revenue,

    activeOrders,

    paidOrders,

    activeTables,

    kitchenPending,

    kitchenPreparing,

    kitchenReady,
  };
}
