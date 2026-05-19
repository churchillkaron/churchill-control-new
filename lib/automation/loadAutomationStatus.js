import { supabase } from "@/lib/shared/supabase/client";

export async function loadAutomationStatus(
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

  const activeTables =
    (tables || []).filter(
      (t) =>
        t.status === "ACTIVE"
    ).length;

  // ===== AUTOMATION SCORE =====
  let automationScore = 100;

  automationScore -=
    kitchenPending * 2;

  automationScore -=
    kitchenPreparing;

  if (
    activeOrders >= 20
  ) {

    automationScore -= 10;
  }

  if (
    automationScore < 0
  ) {

    automationScore = 0;
  }

  return {

    activeOrders,

    paidOrders,

    kitchenPending,

    kitchenPreparing,

    activeTables,

    automationScore,
  };
}
