import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import generatePurchaseRecommendation from "@/lib/procurement/recommendations/capabilities/generatePurchaseRecommendation";

export default async function analyzeReplenishmentNeeds({
  organizationId,
  organization_id,
  days = 7,
}) {
  try {

    const resolvedOrganizationId =
      organizationId || organization_id;

    if (!resolvedOrganizationId) {
      throw new Error("organization_id required");
    }

    const {
      data: inventory_items,
      error,
    } = await supabaseAdmin
      .from("inventory_items")
      .select("*")
      .eq(
        "organization_id",
        resolvedOrganizationId
      )
      .order("name", {
        ascending: true,
      });

    if (error) {
      throw error;
    }

    const recommendations = [];

    for (const item of inventory_items || []) {

      const recommendation =
        await generatePurchaseRecommendation({
          item_id: item.id,
          days,
        });

      if (
        recommendation.success &&
        Number(
          recommendation.recommended_purchase || 0
        ) > 0
      ) {
        recommendations.push(recommendation);
      }
    }

    return {
      success: true,
      recommendations,
      count: recommendations.length,
    };

  } catch (error) {

    return {
      success: false,
      error: error.message,
    };

  }
}
