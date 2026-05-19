import { supabase } from "@/lib/shared/supabase/client";

export async function loadOwnerSummary(
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

  // ===== ORDERS =====
  const {
    data: orders,
  } = await supabase
    .from("orders")
    .select("*")
    .eq(
      "tenant_id",
      tenant_id
    )
    .gte(
      "created_at",
      today.toISOString()
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

  const service =
    Math.floor(
      revenue * 0.05
    );

  const kitchenReady =
    (kitchen || []).filter(
      (k) =>
        k.status === "READY"
    ).length;

  const kitchenPending =
    (kitchen || []).filter(
      (k) =>
        k.status === "PENDING"
    ).length;

  return {

    revenue,

    activeOrders:
      active.length,

    paidOrders:
      paid.length,

    activeTables:
      (tables || []).filter(
        (t) =>
          t.status === "ACTIVE"
      ).length,

    closedTables:
      (tables || []).filter(
        (t) =>
          t.status === "CLOSED"
      ).length,

    kitchenReady,

    kitchenPending,

    averageOrder:
      avgOrder,

    service,
  };
}
