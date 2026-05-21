import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import buildInventoryForecastAI from "@/lib/intelligence/inventory/buildInventoryForecastAI";

export default async function buildAutonomousProcurementEngine({
  tenant_id,
}) {

  try {

    const inventory =
      await buildInventoryForecastAI({
        tenant_id,
      });

    const recommendations = [];

    for (const item of inventory?.forecast || []) {

      if (
        item.risk !==
        "LOW"
      ) {

        const suggestedQuantity =
          Math.max(
            item.minimum_quantity * 2,
            item.projected_usage * 1.5
          );

        recommendations.push({

          item:
            item.item,

          risk:
            item.risk,

          suggested_order_quantity:
            Number(
              suggestedQuantity.toFixed(2)
            ),

          current_quantity:
            item.current_quantity,

          projected_remaining:
            item.projected_remaining,

          unit:
            item.unit,

          priority:
            item.risk ===
            "CRITICAL"
              ? "HIGH"
              : "MEDIUM",
        });
      }
    }

    const purchaseOrders = [];

    for (const recommendation of recommendations) {

      const {
        data,
        error,
      } = await supabaseAdmin
        .from("purchase_orders")
        .insert([
          {

            tenant_id,

            supplier_name:
              "AUTO_ASSIGNED",

            status:
              "AUTO_GENERATED",

            item_name:
              recommendation.item,

            quantity:
              recommendation.suggested_order_quantity,

            priority:
              recommendation.priority,

            created_at:
              new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (!error && data) {

        purchaseOrders.push(
          data
        );
      }
    }

    return {

      success: true,

      generated_orders:
        purchaseOrders.length,

      recommendations,

      purchase_orders:
        purchaseOrders,

      generated_at:
        new Date().toISOString(),
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
