import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import generatePurchaseRecommendation from "@/lib/procurement/recommendations/capabilities/generatePurchaseRecommendation";

export default async function analyzeReplenishmentNeeds({
  tenant_id,
  days = 7,
}) {

  try {

    const {
      data: ingredients,
      error,
    } = await supabaseAdmin
      .from("ingredients")
      .select("*")
      .eq("tenant_id", tenant_id)
      .order("name", {
        ascending: true,
      });

    if (error) {
      throw error;
    }

    const recommendations = [];

    for (const ingredient of ingredients || []) {

      const recommendation =
        await generatePurchaseRecommendation({
          ingredient_id: ingredient.id,
          days,
        });

      if (
        recommendation.success &&
        Number(
          recommendation.recommended_purchase || 0
        ) > 0
      ) {

        recommendations.push(
          recommendation
        );
      }
    }

    return {

      success: true,

      recommendations,

      count:
        recommendations.length,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
