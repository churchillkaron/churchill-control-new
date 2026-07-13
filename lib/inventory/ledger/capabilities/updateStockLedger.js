import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { runWeightedAverageValuation } from "@/lib/inventory/valuation/capabilities/runWeightedAverageValuation";

const INBOUND_TYPES = new Set([
  "PURCHASE",
  "GOODS_RECEIPT",
  "PRODUCTION",
  "ADJUSTMENT_IN",
  "TRANSFER_IN",
]);

const OUTBOUND_TYPES = new Set([
  "SALE",
  "CONSUMPTION",
  "WASTE",
  "ADJUSTMENT_OUT",
  "TRANSFER_OUT",
  "BATCH_PRODUCTION",
]);

function signedQuantity(type, quantity) {
  const qty = Number(quantity || 0);

  if (INBOUND_TYPES.has(type)) {
    return qty;
  }

  if (OUTBOUND_TYPES.has(type)) {
    return -qty;
  }

  return qty;
}

export async function updateStockLedger({
  organizationId,
  organization_id,
  entityId = null,
  entity_id = null,
  itemId,
  item_id,
  warehouseId = null,
  warehouse_id = null,
  locationId = null,
  location_id = null,
  documentId = null,
  movementId = null,
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

  if (!resolvedEntityId) {
    throw new Error("entityId required");
  }

  if (!resolvedItemId) {
    throw new Error("itemId required");
  }

  const { data: movements, error: movementError } =
    await supabaseAdmin
      .from("inventory_movements")
      .select("*")
      .eq("organization_id", resolvedOrganizationId)
      .eq("entity_id", resolvedEntityId)
      .eq("item_id", resolvedItemId)
      .order("movement_date", {
        ascending: true,
      });

  if (movementError) {
    throw movementError;
  }

  let quantityOnHand = 0;
  let inventoryValue = 0;

  for (const movement of movements || []) {
    const type = movement.type;
    const qty = Number(movement.quantity || 0);
    const totalCost = Number(movement.total_cost || 0);
    const signedQty = signedQuantity(type, qty);

    quantityOnHand += signedQty;

    if (signedQty >= 0) {
      inventoryValue += totalCost;
    } else {
      inventoryValue -= Math.abs(totalCost);
    }
  }

  const averageUnitCost =
    quantityOnHand > 0
      ? inventoryValue / quantityOnHand
      : 0;

  const { data: item, error: ingredientError } =
    await supabaseAdmin
      .from("inventory_items")
      .select("*")
      .eq("id", resolvedItemId)
      .maybeSingle();

  if (ingredientError) {
    throw ingredientError;
  }

  const previousQuantity =
    Number(item?.quantity || 0);

  await supabaseAdmin
    .from("inventory_items")
    .update({
      quantity: quantityOnHand,
    })
    .eq("id", resolvedItemId);

  const { data: ledger, error: ledgerError } =
    await supabaseAdmin
      .from("inventory_ledger")
      .insert({
        organization_id: resolvedOrganizationId,
        entity_id: resolvedEntityId,
        document_id: documentId,
        movement_id: movementId,
        item_id: resolvedItemId,
        warehouse_id:
          warehouseId || warehouse_id || null,
        location_id:
          locationId || location_id || null,
        movement_type: "LEDGER_RECALCULATION",
        quantity: quantityOnHand,
        previous_quantity: previousQuantity,
        new_quantity: quantityOnHand,
        reference_type: "INVENTORY_MOVEMENT",
        reference_id: movementId,
        unit_cost: averageUnitCost,
        total_cost: inventoryValue,
        movement_date: new Date().toISOString(),
      })
      .select()
      .single();

  if (ledgerError) {
    throw ledgerError;
  }

  const valuation =
    await runWeightedAverageValuation({
      organizationId: resolvedOrganizationId,
      entityId: resolvedEntityId,
      itemId: resolvedItemId,
    });

  return {
    success: true,
    ledger,
    valuation,
    quantity_on_hand: quantityOnHand,
    inventory_value: inventoryValue,
    average_unit_cost: averageUnitCost,
  };
}
