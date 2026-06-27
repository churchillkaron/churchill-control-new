import { supabase } from "@/lib/supabase";

export async function runVarianceAnalysis({
  tenantId,
  ingredientId,
  varianceQuantity,
  varianceValue,
}) {
  let risk = "low";

  if (
    Math.abs(
      Number(varianceValue || 0)
    ) > 1000
  ) {
    risk = "medium";
  }

  if (
    Math.abs(
      Number(varianceValue || 0)
    ) > 5000
  ) {
    risk = "high";
  }

  const type =
    varianceQuantity > 0
      ? "OVERAGE"
      : "SHORTAGE";

  const { data, error } =
    await supabase
      .from(
        "inventory_variance_analysis"
      )
      .insert({
        tenant_id: tenantId,
        ingredient_id: ingredientId,
        variance_type: type,
        variance_quantity:
          varianceQuantity,
        variance_value:
          varianceValue,
        risk_level: risk,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
