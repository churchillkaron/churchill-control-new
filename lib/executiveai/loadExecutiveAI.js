import { supabase } from "@/lib/shared/supabase/client";

export async function loadExecutiveAI(
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

  const activeTables =
    (tables || []).filter(
      (t) =>
        t.status === "ACTIVE"
    ).length;

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

  const ready =
    (kitchen || []).filter(
      (k) =>
        k.status === "READY"
    ).length;

  // ===== AI HEALTH =====
  let aiHealth = 100;

  aiHealth -=
    pending * 2;

  aiHealth -=
    preparing;

  if (
    active.length > 30
  ) {

    aiHealth -= 10;
  }

  if (
    aiHealth < 0
  ) {

    aiHealth = 0;
  }

  return {

    aiHealth,

    revenue,

    avgOrder,

    activeOrders:
      active.length,

    paidOrders:
      paid.length,

    activeTables,

    pending,

    preparing,

    ready,
  };
}
