import { supabase } from "@/lib/supabase";

export async function calculateRecipeCost({
  tenantId,
  recipeId,
  itemId,
  ingredients,
  portions,
}) {
  let totalCost = 0;

  const breakdown = [];

  for (const ingredient of ingredients || []) {
    const { data: valuation } =
      await supabase
        .from(
          "inventory_valuation_snapshots"
        )
        .select("*")
        .eq("tenant_id", tenantId)
        .eq(
          "item_id",
          ingredient.itemId
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
        ingredient.quantity || 0
      );

    totalCost += ingredientCost;

    breakdown.push({
      ingredientId:
        ingredient.itemId,
      quantity:
        ingredient.quantity,
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
        tenant_id: tenantId,
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
