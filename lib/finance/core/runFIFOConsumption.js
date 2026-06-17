import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function runFIFOConsumption({
  tenantId,
  itemId,
  quantityNeeded,
}) {
  const { data: layers, error } =
    await supabase
      .from("inventory_cost_layers")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId)
      .gt(
        "quantity_remaining",
        0
      )
      .order("received_at", {
        ascending: true,
      });

  if (error) {
    throw error;
  }

  let remaining =
    Number(quantityNeeded || 0);

  let totalCost = 0;

  const consumedLayers = [];

  for (const layer of layers || []) {
    if (remaining <= 0) {
      break;
    }

    const available =
      Number(
        layer.quantity_remaining || 0
      );

    const consume =
      Math.min(
        available,
        remaining
      );

    const cost =
      consume *
      Number(
        layer.unit_cost || 0
      );

    totalCost += cost;

    remaining -= consume;

    const updatedQty =
      available - consume;

    await supabase
      .from(
        "inventory_cost_layers"
      )
      .update({
        quantity_remaining:
          updatedQty,
      })
      .eq("id", layer.id);

    consumedLayers.push({
      layerId: layer.id,
      consumed: consume,
      unitCost:
        layer.unit_cost,
      cost,
    });
  }

  if (remaining > 0) {
    throw new Error(
      "Insufficient inventory layers"
    );
  }

  return {
    itemId,
    quantityConsumed:
      quantityNeeded,
    totalCost,
    consumedLayers,
    averageCost:
      totalCost /
      Number(quantityNeeded || 1),
  };
}
