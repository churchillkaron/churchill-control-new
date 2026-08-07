import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { runWeightedAverageValuation } from "@/lib/inventory/valuation/capabilities/runWeightedAverageValuation";
import {
  signedInventoryQuantity,
} from "@/lib/inventory/movements/inventoryMovementSemantics";

function sameNullable(left, right) {
  return (left || null) === (right || null);
}

function movementBalance(movements = []) {
  return movements.reduce(
    (balance, movement) => {
      const signedQty =
        signedInventoryQuantity(
          movement.type,
          movement.quantity
        );

      if (signedQty === 0) {
        return balance;
      }

      const totalCost =
        Number(
          movement.total_cost ||
          0
        );

      balance.quantity +=
        signedQty;

      balance.value +=
        signedQty > 0
          ? totalCost
          : -Math.abs(
              totalCost
            );

      return balance;
    },
    { quantity: 0, value: 0 }
  );
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
  const resolvedOrganizationId = organizationId || organization_id;
  const resolvedEntityId = entityId || entity_id || null;
  const resolvedItemId = itemId || item_id;
  const resolvedWarehouseId = warehouseId || warehouse_id || null;
  const resolvedLocationId = locationId || location_id || null;

  if (!resolvedOrganizationId) throw new Error("organizationId required");
  if (!resolvedEntityId) throw new Error("entityId required");
  if (!resolvedItemId) throw new Error("itemId required");

  const { data: movements, error: movementError } = await supabaseAdmin
    .from("inventory_movements")
    .select("*")
    .eq("organization_id", resolvedOrganizationId)
    .eq("entity_id", resolvedEntityId)
    .eq("item_id", resolvedItemId)
    .order("movement_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (movementError) throw movementError;

  const globalBalance = movementBalance(movements || []);
  const positionMovements = (movements || []).filter(
    (movement) =>
      sameNullable(movement.warehouse_id, resolvedWarehouseId) &&
      sameNullable(movement.location_id, resolvedLocationId)
  );
  const positionBalance = movementBalance(positionMovements);
  const averageUnitCost =
    globalBalance.quantity > 0
      ? globalBalance.value / globalBalance.quantity
      : 0;

  let previousQuery = supabaseAdmin
    .from("inventory_ledger")
    .select("new_quantity, quantity")
    .eq("organization_id", resolvedOrganizationId)
    .eq("entity_id", resolvedEntityId)
    .eq("item_id", resolvedItemId)
    .order("created_at", { ascending: false })
    .limit(1);

  previousQuery = resolvedWarehouseId
    ? previousQuery.eq("warehouse_id", resolvedWarehouseId)
    : previousQuery.is("warehouse_id", null);
  previousQuery = resolvedLocationId
    ? previousQuery.eq("location_id", resolvedLocationId)
    : previousQuery.is("location_id", null);

  const previousResult = await previousQuery.maybeSingle();
  if (previousResult.error && previousResult.error.code !== "PGRST116") {
    throw previousResult.error;
  }

  const previousQuantity = Number(
    previousResult.data?.new_quantity ?? previousResult.data?.quantity ?? 0
  );

  const { data: ledger, error: ledgerError } = await supabaseAdmin
    .from("inventory_ledger")
    .insert({
      organization_id: resolvedOrganizationId,
      entity_id: resolvedEntityId,
      document_id: documentId,
      movement_id: movementId,
      item_id: resolvedItemId,
      warehouse_id: resolvedWarehouseId,
      location_id: resolvedLocationId,
      movement_type: "LEDGER_RECALCULATION",
      quantity: positionBalance.quantity,
      previous_quantity: previousQuantity,
      new_quantity: positionBalance.quantity,
      reference_type: "INVENTORY_MOVEMENT",
      reference_id: movementId,
      unit_cost: averageUnitCost,
      total_cost: positionBalance.value,
      movement_date: new Date().toISOString(),
    })
    .select()
    .single();

  if (ledgerError) throw ledgerError;

  const valuation = await runWeightedAverageValuation({
    organizationId: resolvedOrganizationId,
    entityId: resolvedEntityId,
    itemId: resolvedItemId,
  });

  return {
    success: true,
    ledger,
    valuation,
    quantity_on_hand: globalBalance.quantity,
    position_quantity_on_hand: positionBalance.quantity,
    inventory_value: globalBalance.value,
    position_inventory_value: positionBalance.value,
    average_unit_cost: averageUnitCost,
  };
}
