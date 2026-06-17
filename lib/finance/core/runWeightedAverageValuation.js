import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runWeightedAverageValuation({
  tenantId,
  itemId,
}) {
  const { data: layers, error } =
    await supabase
      .from("inventory_cost_layers")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId);

  if (error) {
    throw error;
  }

  let totalQty = 0;
  let totalValue = 0;

  for (const layer of layers || []) {
    totalQty += Number(
      layer.quantity_remaining || 0
    );

    totalValue +=
      Number(
        layer.quantity_remaining || 0
      ) *
      Number(
        layer.unit_cost || 0
      );
  }

  const averageCost =
    totalQty > 0
      ? totalValue / totalQty
      : 0;

  const { data, error: insertError } =
    await supabase
      .from(
        "inventory_valuation_snapshots"
      )
      .insert({
        tenant_id: tenantId,
        item_id: itemId,
        valuation_method:
          "WEIGHTED_AVERAGE",
        total_quantity:
          totalQty,
        total_value:
          totalValue,
        average_cost:
          averageCost,
      })
      .select()
      .single();

  if (insertError) {
    throw insertError;
  }

  return data;
}
