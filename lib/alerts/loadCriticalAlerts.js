import { supabase } from "@/lib/shared/supabase/client";

export async function loadCriticalAlerts(
  tenant_id
) {

  if (!tenant_id) {
    return [];
  }

  const alerts = [];

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

  // ===== ALERTS =====
  if (pending >= 10) {

    alerts.push({

      level:
        "CRITICAL",

      title:
        "Kitchen Overload",

      message:
        "Pending tickets above safe limit",
    });
  }

  if (preparing >= 15) {

    alerts.push({

      level:
        "WARNING",

      title:
        "Kitchen Delay",

      message:
        "Preparing queue building up",
    });
  }

  if (
    activeOrders >= 25
  ) {

    alerts.push({

      level:
        "WARNING",

      title:
        "Order Pressure",

      message:
        "High active order volume",
    });
  }

  if (
    activeTables >= 15
  ) {

    alerts.push({

      level:
        "GOOD",

      title:
        "Floor Full",

      message:
        "High table occupancy",
    });
  }

  return alerts;
}
