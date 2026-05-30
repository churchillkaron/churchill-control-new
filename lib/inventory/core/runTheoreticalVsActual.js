import { supabase } from "@/lib/supabase";

export async function runTheoreticalVsActual({
  tenantId,
  sessionId,
  itemId,
  actualQuantity,
}) {
  const ledger =
    await supabase
      .from(
        "inventory_stock_ledger"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId)
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
