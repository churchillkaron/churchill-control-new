import { supabase } from "@/lib/shared/supabase/client";

export async function loadServiceLevel(
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

  // ===== PERFORMANCE =====
  let performance =
    100;

  performance -=
    pending * 2;

  performance -=
    preparing;

  if (
    performance < 0
  ) {

    performance = 0;
  }

  // ===== SERVICE LEVEL =====
  let servicePercent =
    5;

  if (
    performance >= 90
  ) {

    servicePercent = 7;

  } else if (
    performance >= 75
  ) {

    servicePercent = 6;
  }

  const serviceCharge =
    revenue *
    (
      servicePercent /
      100
    );

  return {

    revenue,

    performance,

    servicePercent,

    serviceCharge,

    pending,

    preparing,
  };
}
