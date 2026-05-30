import { supabase } from "@/lib/supabase";

export async function runInventoryReconciliation({
  tenantId,
  itemId,
  actualQuantity,
}) {
  const { data: ledger } =
    await supabase
      .from(
        "inventory_stock_ledger"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId)
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
        item_id: itemId,
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
