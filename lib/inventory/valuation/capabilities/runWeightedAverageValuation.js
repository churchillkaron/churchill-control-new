import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function runWeightedAverageValuation({
  organizationId,
  organization_id,
  entityId = null,
  entity_id = null,
  itemId,
  item_id,
}) {
  const resolvedOrganizationId =
    organizationId || organization_id;

  const resolvedEntityId =
    entityId || entity_id || null;

  const resolvedItemId =
    itemId || item_id;

  if (!resolvedOrganizationId) {
    throw new Error("organizationId required");
  }

  if (!resolvedItemId) {
    throw new Error("itemId required");
  }

  const { data: layers, error } =
    await supabaseAdmin
      .from("inventory_cost_layers")
      .select("*")
      .eq("organization_id", resolvedOrganizationId)
      .eq("item_id", resolvedItemId);

  if (error) {
    throw error;
  }

  let quantityOnHand = 0;
  let inventoryValue = 0;

  for (const layer of layers || []) {
    const remaining =
      Number(layer.quantity_remaining || 0);

    const unitCost =
      Number(layer.unit_cost || 0);

    quantityOnHand += remaining;
    inventoryValue += remaining * unitCost;
  }

  const averageUnitCost =
    quantityOnHand > 0
      ? inventoryValue / quantityOnHand
      : 0;

  const { data: snapshot, error: snapshotError } =
    await supabaseAdmin
      .from("inventory_valuation_snapshots")
      .insert({
        organization_id: resolvedOrganizationId,
        entity_id: resolvedEntityId,
        item_id: resolvedItemId,
        quantity_on_hand: quantityOnHand,
        inventory_value: inventoryValue,
        average_unit_cost: averageUnitCost,
        snapshot_date: new Date().toISOString(),
      })
      .select()
      .single();

  if (snapshotError) {
    throw snapshotError;
  }

  return snapshot;
}
