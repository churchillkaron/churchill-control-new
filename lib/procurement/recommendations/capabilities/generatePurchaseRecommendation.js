import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import generateConsumptionForecast from "@/lib/procurement/replenishment/capabilities/generateConsumptionForecast";

export default async function generatePurchaseRecommendation({
  organizationId,
  organization_id,
  entityId = null,
  entity_id = null,
  item_id,
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
      data: item,
      error: ingredientError,
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

        organizationId:
          resolvedOrganizationId,

        entityId:
          resolvedEntityId,

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

      item_id:
        item.id,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
