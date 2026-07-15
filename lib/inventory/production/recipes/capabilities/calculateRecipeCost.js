import { supabase } from "@/lib/supabase";

export async function calculateRecipeCost({
  organizationId,
  organization_id,
  entityId = null,
  entity_id = null,
  recipeId,
  laborCost = 0,
  overheadCost = 0,
  sellingPrice = 0,
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

  const { data: items } =
    await supabase
      .from("recipe_items")
      .select(`
        *,
        inventory_ledger (
          weighted_average_cost
        )
      `)
      .eq("organization_id", resolvedOrganizationId)
      .eq("entity_id", resolvedEntityId)
      .eq("recipe_id", recipeId);

  let ingredientCost = 0;

  for (const item of items || []) {
    const averageCost =
      Number(
        item
          ?.inventory_ledger
          ?.weighted_average_cost ||
          0
      );

    ingredientCost +=
      Number(item.quantity || 0) *
      averageCost;
  }

  const totalCost =
    ingredientCost +
    Number(laborCost || 0) +
    Number(overheadCost || 0);

  const margin =
    Number(sellingPrice || 0) -
    totalCost;

  const marginPercent =
    sellingPrice > 0
      ? (
          margin /
          Number(sellingPrice)
        ) * 100
      : 0;

  const { data, error } =
    await supabase
      .from(
        "recipe_cost_snapshots"
      )
      .insert({
        organization_id: resolvedOrganizationId,
        entity_id: resolvedEntityId,
        recipe_id: recipeId,
        total_ingredient_cost:
          ingredientCost,
        labor_cost: laborCost,
        overhead_cost:
          overheadCost,
        total_cost: totalCost,
        selling_price:
          sellingPrice,
        gross_margin: margin,
        gross_margin_percent:
          marginPercent,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
