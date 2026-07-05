import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function runFIFOConsumption({
  organizationId,
  organization_id,
  itemId,
  item_id,
  quantityNeeded,
}) {
  const resolvedOrganizationId =
    organizationId || organization_id;

  const resolvedItemId =
    itemId || item_id;

  const {
    data: layers,
    error,
  } = await supabaseAdmin
    .from("inventory_cost_layers")
    .select("*")
    .eq("organization_id", resolvedOrganizationId)
    .eq("item_id", resolvedItemId)
    .gt("quantity_remaining", 0)
    .order("received_at", {
      ascending: true,
    });

  if (error) throw error;

  let remaining =
    Number(quantityNeeded || 0);

  let totalCost = 0;

  const consumedLayers = [];

  for (const layer of layers || []) {

    if (remaining <= 0) break;

    const available =
      Number(layer.quantity_remaining);

    const consume =
      Math.min(
        available,
        remaining
      );

    const cost =
      consume *
      Number(layer.unit_cost);

    remaining -= consume;
    totalCost += cost;

    await supabaseAdmin
      .from("inventory_cost_layers")
      .update({
        quantity_remaining:
          available - consume,
      })
      .eq("id", layer.id);

    consumedLayers.push({
      layerId: layer.id,
      quantity: consume,
      unitCost: layer.unit_cost,
      totalCost: cost,
    });
  }

  if (remaining > 0) {
    throw new Error("INSUFFICIENT_FIFO_STOCK");
  }

  return {
    quantityConsumed:
      Number(quantityNeeded),
    totalCost,
    averageCost:
      totalCost /
      Number(quantityNeeded),
    consumedLayers,
  };
}
