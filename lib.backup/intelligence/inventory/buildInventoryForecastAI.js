import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import buildDemandPredictionAI from "@/lib/intelligence/demand/buildDemandPredictionAI";

export default async function buildInventoryForecastAI({
  tenant_id,
}) {

  try {

    const demand =
      await buildDemandPredictionAI({
        tenant_id,
      });

    const {
      data: inventory,
      error,
    } = await supabaseAdmin
      .from("inventory_items")
      .select(`
        id,
        name,
        quantity,
        minimum_quantity,
        unit
      `)
      .eq(
        "tenant_id",
        tenant_id
      )
      .limit(2000);

    if (error) {
      throw error;
    }

    const peakRevenue =
      Number(
        demand?.peak_day
          ?.revenue || 0
      );

    const forecast = [];

    for (const item of inventory || []) {

      const quantity =
        Number(
          item.quantity || 0
        );

      const minimum =
        Number(
          item.minimum_quantity || 0
        );

      let projectedUsage =
        peakRevenue > 300000
          ? quantity * 0.35
          : quantity * 0.15;

      projectedUsage =
        Number(
          projectedUsage.toFixed(2)
        );

      const projectedRemaining =
        Number(
          (
            quantity -
            projectedUsage
          ).toFixed(2)
        );

      let risk =
        "LOW";

      if (
        projectedRemaining <=
        minimum
      ) {

        risk =
          "RESTOCK_REQUIRED";
      }

      if (
        projectedRemaining <=
        minimum * 0.5
      ) {

        risk =
          "CRITICAL";
      }

      forecast.push({

        item:
          item.name,

        current_quantity:
          quantity,

        projected_usage:
          projectedUsage,

        projected_remaining:
          projectedRemaining,

        minimum_quantity:
          minimum,

        risk,

        unit:
          item.unit,
      });
    }

    return {

      success: true,

      peak_revenue:
        peakRevenue,

      forecast:
        forecast.sort(
          (a, b) => {

            const priority = {
              CRITICAL: 0,
              RESTOCK_REQUIRED: 1,
              LOW: 2,
            };

            return (
              priority[a.risk] -
              priority[b.risk]
            );
          }
        ),

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
