import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import generateConsumptionForecast from "@/lib/procurement/replenishment/capabilities/generateConsumptionForecast";

export default async function generatePurchaseRecommendation({
  item_id,
  days = 7,
}) {

  try {

    const {
      data: item,
      error: ingredientError,
    } = await supabaseAdmin
      .from("inventory_items")
      .select("*")
      .eq(
        "id",
        item_id
      )
      .single();

    if (ingredientError) {
      throw ingredientError;
    }

    const forecast =
      await generateConsumptionForecast({

        item_name:
          item.name,

        days: 30,
      });

    const currentStock =
      Number(
        item.quantity || 0
      );

    const avgDaily =
      Number(
        forecast.avg_daily_consumption || 0
      );

    const recommendedQuantity =
      Math.max(
        0,
        (
          avgDaily *
          Number(days || 7)
        ) - currentStock
      );

    return {

      success: true,

      ingredient:
        item.name,

      current_stock:
        currentStock,

      avg_daily_consumption:
        avgDaily,

      recommended_purchase:
        Number(
          recommendedQuantity.toFixed(2)
        ),

      unit:
        item.unit,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
