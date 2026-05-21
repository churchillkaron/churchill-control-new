import { supabase } from "@/lib/shared/supabase/client";

export async function loadOwnerAIStatus(
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

  const paidOrders =
    (orders || []).filter(
      (o) =>
        o.status === "PAID"
    );

  const activeOrders =
    (orders || []).filter(
      (o) =>
        o.status === "ACTIVE"
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

  const avgOrder =
    paidOrders.length > 0
      ? Math.floor(
          revenue /
            paidOrders.length
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

  // ===== AI SCORE =====
  let aiScore = 100;

  aiScore -=
    pending * 2;

  aiScore -=
    preparing;

  if (
    activeOrders.length > 25
  ) {

    aiScore -= 10;
  }

  if (
    aiScore < 0
  ) {

    aiScore = 0;
  }

  return {

    aiScore,

    revenue,

    avgOrder,

    activeOrders:
      activeOrders.length,

    paidOrders:
      paidOrders.length,

    activeTables,

    pending,

    preparing,

    ready,
  };
}
