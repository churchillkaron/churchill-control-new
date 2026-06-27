import { supabase } from "@/lib/supabase";

export async function runMenuEngineering({
  tenantId,
  recipeId,
  popularityScore,
}) {
  const { data: latest } =
    await supabase
      .from(
        "recipe_cost_snapshots"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("recipe_id", recipeId)
      .order("created_at", {
        ascending: false,
      })
      .limit(1)
      .single();

  if (!latest) {
    throw new Error(
      "Recipe cost not found"
    );
  }

  const profitability =
    Number(
      latest.gross_margin_percent ||
        0
    );

  let category = "DOG";

  if (
    popularityScore >= 70 &&
    profitability >= 70
  ) {
    category = "STAR";
  } else if (
    popularityScore >= 70
  ) {
    category = "PLOWHORSE";
  } else if (
    profitability >= 70
  ) {
    category = "PUZZLE";
  }

  const { data, error } =
    await supabase
      .from(
        "menu_engineering_scores"
      )
      .insert({
        tenant_id: tenantId,
        recipe_id: recipeId,
        popularity_score:
          popularityScore,
        profitability_score:
          profitability,
        engineering_category:
          category,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
