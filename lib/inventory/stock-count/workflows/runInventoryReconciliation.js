import { supabase } from "@/lib/supabase";

export async function runInventoryReconciliation({
  tenantId,
  ingredientId,
  actualQuantity,
}) {
  const { data: ledger } =
    await supabase
      .from(
        "inventory_ledger"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("ingredient_id", ingredientId)
      .single();

  if (!ledger) {
    throw new Error(
      "Stock ledger not found"
    );
  }

  const theoretical =
    Number(
      ledger.quantity_on_hand ||
        0
    );

  const variance =
    Number(actualQuantity || 0) -
    theoretical;

  const varianceValue =
    variance *
    Number(
      ledger.weighted_average_cost ||
        0
    );

  const { data, error } =
    await supabase
      .from(
        "inventory_reconciliation_variances"
      )
      .insert({
        tenant_id: tenantId,
        ingredient_id: ingredientId,
        theoretical_quantity:
          theoretical,
        actual_quantity:
          actualQuantity,
        variance_quantity:
          variance,
        variance_value:
          varianceValue,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
