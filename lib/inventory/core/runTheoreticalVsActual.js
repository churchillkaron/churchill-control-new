import { supabase } from "@/lib/supabase";

export async function runTheoreticalVsActual({
  tenantId,
  sessionId,
  ingredientId,
  actualQuantity,
}) {
  const ledger =
    await supabase
      .from(
        "inventory_ledger"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("ingredient_id", ingredientId)
      .single();

  if (!ledger.data) {
    throw new Error(
      "Inventory ledger missing"
    );
  }

  const theoretical =
    Number(
      ledger.data
        .quantity_on_hand || 0
    );

  const averageCost =
    Number(
      ledger.data
        .weighted_average_cost ||
        0
    );

  const variance =
    Number(actualQuantity || 0) -
    theoretical;

  const varianceValue =
    variance * averageCost;

  const { data, error } =
    await supabase
      .from("stock_count_items")
      .insert({
        tenant_id: tenantId,
        session_id: sessionId,
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
