import { supabase } from "@/lib/shared/supabase/client";

export async function loadInfinity(
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

  // ===== INFINITY SCORE =====
  let infinity = 100;

  infinity -=
    pending * 2;

  infinity -=
    preparing;

  if (
    active.length > 30
  ) {

    infinity -= 10;
  }

  if (
    activeTables > 15
  ) {

    infinity -= 5;
  }

  if (
    infinity < 0
  ) {

    infinity = 0;
  }

  let state =
    "INFINITE";

  if (
    infinity < 40
  ) {

    state =
      "CRITICAL";

  } else if (
    infinity < 70
  ) {

    state =
      "WARNING";
  }

  return {

    infinity,

    state,

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
