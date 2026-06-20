import { supabase } from "@/lib/supabase";

export async function calculateRecipeCost({
  tenantId,
  recipeId,
  laborCost = 0,
  overheadCost = 0,
  sellingPrice = 0,
}) {
  const { data: items } =
    await supabase
      .from("recipe_items")
      .select(`
        *,
        inventory_ledger (
          weighted_average_cost
        )
      `)
      .eq("tenant_id", tenantId)
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
        tenant_id: tenantId,
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
