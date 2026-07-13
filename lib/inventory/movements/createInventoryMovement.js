import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { financeGateway } from "@/lib/finance/runtime/financeGateway";
import { updateStockLedger } from "@/lib/inventory/ledger/capabilities/updateStockLedger";

const RECEIPT_TYPES = new Set([
  "PURCHASE",
  "GOODS_RECEIPT",
  "PRODUCTION",
  "ADJUSTMENT_IN",
  "TRANSFER_IN",
]);

function getFinanceEventType(movementType) {
  if (movementType === "GOODS_RECEIPT" || movementType === "PURCHASE") {
    return "INVENTORY_RECEIPT";
  }

  if (movementType === "CONSUMPTION" || movementType === "SALE") {
    return "INVENTORY_CONSUMPTION";
  }

  if (movementType === "WASTE") {
    return "INVENTORY_WASTE";
  }

  if (movementType === "ADJUSTMENT_IN" || movementType === "ADJUSTMENT_OUT") {
    return "INVENTORY_ADJUSTMENT";
  }

  if (movementType === "TRANSFER_IN" || movementType === "TRANSFER_OUT") {
    return "INVENTORY_TRANSFER";
  }

  return "INVENTORY_MOVEMENT";
}

export async function createInventoryMovement({
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

  movementType,
  type,
  quantity,
  unitCost = 0,
  referenceType = null,
  referenceId = null,
  sourceModule = "inventory",
  sourceDocument = null,
  sourceDocumentId = null,
  notes = null,
  createdBy = null,
  postToFinance = false,
}) {
  const resolvedOrganizationId =
    organizationId || organization_id;

  const resolvedEntityId =
    entityId || entity_id || null;

  const resolvedItemId =
    itemId || item_id;

  const resolvedWarehouseId =
    warehouseId || warehouse_id || null;

  const resolvedLocationId =
    locationId || location_id || null;

  const resolvedMovementType =
    movementType || type;

  if (!resolvedOrganizationId) {
    throw new Error("organizationId required");
  }

  if (!resolvedEntityId) {
    throw new Error("entityId required");
  }

  if (!resolvedItemId) {
    throw new Error("itemId required");
  }

  if (!resolvedMovementType) {
    throw new Error("movementType required");
  }

  const movementQuantity =
    Math.abs(Number(quantity || 0));

  if (movementQuantity <= 0) {
    throw new Error("quantity must be greater than zero");
  }

  const resolvedUnitCost =
    Number(unitCost || 0);

  const totalCost =
    Number(
      (
        movementQuantity *
        resolvedUnitCost
      ).toFixed(4)
    );

  const now =
    new Date().toISOString();

  const { data: document, error: documentError } =
    await supabaseAdmin
      .from("inventory_documents")
      .insert({
        organization_id: resolvedOrganizationId,
        entity_id: resolvedEntityId,
        document_type: "INVENTORY_MOVEMENT",
        status: "POSTED",
        movement_type: resolvedMovementType,
        item_id: resolvedItemId,

        warehouse_id:
          resolvedWarehouseId,

        location_id:
          resolvedLocationId,

        quantity: movementQuantity,
        unit_cost: resolvedUnitCost,
        total_cost: totalCost,
        source_module: sourceModule,
        source_document: sourceDocument || referenceType,
        source_document_id: sourceDocumentId || referenceId,
        movement_date: now,
        notes,
        created_by: createdBy,
      })
      .select()
      .single();

  if (documentError) {
    throw documentError;
  }

  const { data: movement, error: movementError } =
    await supabaseAdmin
      .from("inventory_movements")
      .insert({
        organization_id: resolvedOrganizationId,
        entity_id: resolvedEntityId,
        document_id: document.id,
        item_id: resolvedItemId,

        warehouse_id:
          resolvedWarehouseId,

        location_id:
          resolvedLocationId,

        quantity: movementQuantity,
        type: resolvedMovementType,
        unit_cost: resolvedUnitCost,
        total_cost: totalCost,
        notes,
        reference_id: referenceId,
        movement_date: now,
        source_module: sourceModule,
        source_document: sourceDocument || referenceType,
        source_document_id: sourceDocumentId || referenceId,
      })
      .select()
      .single();

  if (movementError) {
    throw movementError;
  }

  let costLayer = null;

  if (RECEIPT_TYPES.has(resolvedMovementType)) {
    const { data: layer, error: layerError } =
      await supabaseAdmin
        .from("inventory_cost_layers")
        .insert({
          organization_id: resolvedOrganizationId,
          entity_id: resolvedEntityId,
          document_id: document.id,
          movement_id: movement.id,
          item_id: resolvedItemId,
          quantity_received: movementQuantity,
          quantity_remaining: movementQuantity,
          unit_cost: resolvedUnitCost,
          total_cost: totalCost,
          source_type: sourceDocument || referenceType || resolvedMovementType,
          source_id: sourceDocumentId || referenceId || document.id,
          received_at: now,
        })
        .select()
        .single();

    if (layerError) {
      throw layerError;
    }

    costLayer = layer;
  }

  const ledger =
    await updateStockLedger({
      organizationId: resolvedOrganizationId,
      entityId: resolvedEntityId,
      itemId: resolvedItemId,
      warehouseId: resolvedWarehouseId,
      locationId: resolvedLocationId,
      documentId: document.id,
      movementId: movement.id,
    });

  let accounting = null;

  if (postToFinance && resolvedEntityId && totalCost > 0) {
    accounting =
      await financeGateway({
        type: getFinanceEventType(resolvedMovementType),
        payload: {
          organization_id: resolvedOrganizationId,
          entity_id: resolvedEntityId,
          source_module: sourceModule,
          source_id: document.id,
          source_document: "inventory_documents",
          source_document_id: document.id,
          movement_id: movement.id,
          item_id: resolvedItemId,
          movement_type: resolvedMovementType,
          amount: totalCost,
          entryDate: now.slice(0, 10),
          description: `Inventory ${resolvedMovementType}`,
        },
      });

    await supabaseAdmin
      .from("inventory_documents")
      .update({
        journal_entry_id:
          accounting?.journal?.id || null,
      })
      .eq("id", document.id);
  }

  return {
    success: true,
    document,
    movement,
    costLayer,
    ledger,
    accounting,
  };
}
