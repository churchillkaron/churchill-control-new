import { supabase } from "@/lib/shared/supabase/client";

export async function loadAIInsights(
  tenant_id
) {

  if (!tenant_id) {
    return [];
  }

  const insights = [];

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

  // ===== REVENUE =====
  const paid =
    (orders || []).filter(
      (o) =>
        o.status === "PAID"
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

  if (revenue < 5000) {

    insights.push({

      type:
        "REVENUE",

      level:
        "WARNING",

      message:
        "Revenue below target today",
    });
  }

  // ===== KITCHEN =====
  const pending =
    (kitchen || []).filter(
      (k) =>
        k.status === "PENDING"
    ).length;

  if (pending >= 10) {

    insights.push({

      type:
        "KITCHEN",

      level:
        "HIGH",

      message:
        "Kitchen queue overloaded",
    });
  }

  // ===== TABLES =====
  const activeTables =
    (tables || []).filter(
      (t) =>
        t.status === "ACTIVE"
    ).length;

  if (activeTables >= 10) {

    insights.push({

      type:
        "FLOOR",

      level:
        "GOOD",

      message:
        "High floor occupancy",
    });
  }

  return insights;
}
