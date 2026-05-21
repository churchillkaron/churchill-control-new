import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import generateConsumptionForecast from "@/lib/procurement/forecasting/generateConsumptionForecast";

export default async function generatePurchaseRecommendation({
  ingredient_id,
  days = 7,
}) {

  try {

    const {
      data: ingredient,
      error: ingredientError,
    } = await supabaseAdmin
      .from("ingredients")
      .select("*")
      .eq(
        "id",
        ingredient_id
      )
      .single();

    if (ingredientError) {
      throw ingredientError;
    }

    const forecast =
      await generateConsumptionForecast({

        ingredient_name:
          ingredient.name,

        days: 30,
      });

    const currentStock =
      Number(
        ingredient.quantity || 0
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
        ingredient.name,

      current_stock:
        currentStock,

      avg_daily_consumption:
        avgDaily,

      recommended_purchase:
        Number(
          recommendedQuantity.toFixed(2)
        ),

      unit:
        ingredient.unit,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
