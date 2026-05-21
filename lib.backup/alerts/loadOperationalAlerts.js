import { supabase } from "@/lib/shared/supabase/client";

export async function loadOperationalAlerts(
  tenant_id
) {

  if (!tenant_id) {
    return [];
  }

  const alerts = [];

  // ===== KITCHEN DELAYS =====
  const {
    data: kitchen,
  } = await supabase
    .from(
      "kitchen_ticket_items"
    )
    .select("*")
    .neq(
      "status",
      "SERVED"
    )
    .neq(
      "status",
      "CANCELLED"
    );

  for (const item of kitchen || []) {

    const minutes =
      Math.floor(
        (
          new Date() -
          new Date(
            item.created_at
          )
        ) /
          1000 /
          60
      );

    if (minutes >= 15) {

      alerts.push({

        type:
          "KITCHEN_DELAY",

        level:
          "HIGH",

        message:
          `${item.item_name} delayed ${minutes} min`,
      });
    }
  }

  // ===== LOW STOCK =====
  const {
    data: inventory,
  } = await supabase
    .from("dishes")
    .select("*");

  for (const item of inventory || []) {

    if (
      Number(
        item.stock_quantity || 0
      ) <= 5
    ) {

      alerts.push({

        type:
          "LOW_STOCK",

        level:
          "MEDIUM",

        message:
          `${item.name} low stock (${item.stock_quantity})`,
      });
    }
  }

  return alerts;
}
