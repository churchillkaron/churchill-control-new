import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import generatePurchaseRecommendation from "@/lib/inventory/procurement/recommendations/capabilities/generatePurchaseRecommendation";

export default async function analyzeReplenishmentNeeds({
  organizationId,
  organization_id,
  entityId = null,
  entity_id = null,
  days = 7,
}) {
  try {

    const resolvedOrganizationId =
      organizationId || organization_id;

    const resolvedEntityId =
      entityId || entity_id || null;

    if (!resolvedOrganizationId) {
      throw new Error("organization_id required");
    }

    if (!resolvedEntityId) {
      throw new Error("entity_id required");
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
      .eq(
        "entity_id",
        resolvedEntityId
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
          organizationId: resolvedOrganizationId,
          entityId: resolvedEntityId,
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
