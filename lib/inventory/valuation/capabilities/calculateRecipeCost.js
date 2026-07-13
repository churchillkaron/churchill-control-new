import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function calculateRecipeCost({
  organizationId,
  organization_id,
  entityId = null,
  entity_id = null,
  recipeId,
  itemId,
  inventory_items,
  portions,
}) {
  const resolvedOrganizationId =
    organizationId || organization_id;

  const resolvedEntityId =
    entityId || entity_id || null;

  if (!resolvedOrganizationId) {
    throw new Error("organizationId required");
  }

  if (!resolvedEntityId) {
    throw new Error("entityId required");
  }

  let totalCost = 0;

  const breakdown = [];

  for (const item of inventory_items || []) {
    const { data: valuation } =
      await supabase
        .from(
          "inventory_valuation_snapshots"
        )
        .select("*")
        .eq("organization_id", resolvedOrganizationId)
        .eq("entity_id", resolvedEntityId)
        .eq(
          "item_id",
          item.itemId
        )
        .order(
          "snapshot_date",
          {
            ascending: false,
          }
        )
        .limit(1)
        .single();

    const averageCost =
      Number(
        valuation?.average_cost || 0
      );

    const ingredientCost =
      averageCost *
      Number(
        item.quantity || 0
      );

    totalCost += ingredientCost;

    breakdown.push({
      itemId:
        item.itemId,
      quantity:
        item.quantity,
      averageCost,
      ingredientCost,
    });
  }

  const portionCost =
    portions > 0
      ? totalCost / portions
      : totalCost;

  const { data, error } =
    await supabase
      .from(
        "recipe_cost_snapshots"
      )
      .insert({
        organization_id: resolvedOrganizationId,
        entity_id: resolvedEntityId,
        recipe_id: recipeId,
        item_id: itemId,
        total_recipe_cost:
          totalCost,
        portion_cost:
          portionCost,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return {
    snapshot: data,
    breakdown,
  };
}
