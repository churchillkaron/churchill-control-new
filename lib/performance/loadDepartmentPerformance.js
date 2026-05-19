import { supabase } from "@/lib/shared/supabase/client";

export async function loadDepartmentPerformance(
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

  const totalOrders =
    (orders || []).filter(
      (o) =>
        o.status === "PAID"
    ).length;

  // ===== FOH SCORE =====
  let foh = 100;

  if (
    totalOrders < 10
  ) {

    foh -= 20;
  }

  // ===== BAR SCORE =====
  const barPending =
    (kitchen || []).filter(
      (k) =>
        k.station === "BAR" &&
        k.status === "PENDING"
    ).length;

  let bar = 100;

  bar -=
    barPending * 5;

  // ===== KITCHEN SCORE =====
  const kitchenPending =
    (kitchen || []).filter(
      (k) =>
        k.station !== "BAR" &&
        k.status === "PENDING"
    ).length;

  let kitchenScore =
    100;

  kitchenScore -=
    kitchenPending * 3;

  if (foh < 0) {
    foh = 0;
  }

  if (bar < 0) {
    bar = 0;
  }

  if (
    kitchenScore < 0
  ) {

    kitchenScore = 0;
  }

  return {

    revenue,

    totalOrders,

    foh,

    bar,

    kitchen:
      kitchenScore,
  };
}
