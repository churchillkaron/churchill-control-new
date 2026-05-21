import { supabase } from "@/lib/shared/supabase/client";

export async function loadSystemHealth(
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

  // ===== HEALTH SCORE =====
  let score = 100;

  score -=
    kitchenPending * 2;

  score -=
    kitchenPreparing;

  if (
    activeOrders > 20
  ) {

    score -= 10;
  }

  if (
    score < 0
  ) {

    score = 0;
  }

  let status =
    "OPTIMAL";

  if (
    score < 80
  ) {

    status =
      "WARNING";
  }

  if (
    score < 50
  ) {

    status =
      "CRITICAL";
  }

  return {

    score,

    status,

    activeOrders,

    paidOrders,

    activeTables,

    kitchenPending,

    kitchenPreparing,

    kitchenReady,
  };
}
