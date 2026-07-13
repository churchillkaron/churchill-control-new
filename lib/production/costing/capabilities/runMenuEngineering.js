import { supabase } from "@/lib/supabase";

export async function runMenuEngineering({
  organizationId,
  organization_id,
  entityId = null,
  entity_id = null,
  recipeId,
  popularityScore,
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

  const { data: latest } =
    await supabase
      .from(
        "recipe_cost_snapshots"
      )
      .select("*")
      .eq("organization_id", resolvedOrganizationId)
      .eq("entity_id", resolvedEntityId)
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
        organization_id: resolvedOrganizationId,
        entity_id: resolvedEntityId,
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
