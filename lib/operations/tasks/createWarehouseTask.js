import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { normalizeInventoryMovementType } from "@/lib/inventory/movements/inventoryMovementSemantics";

const EXECUTABLE_WAREHOUSE_TASKS = new Set([
  "PUTAWAY",
  "TRANSFER_OUT",
  "TRANSFER_IN",
]);

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function assertWarehouseTaskScope({
  organizationId,
  entityId,
  warehouseId,
  locationId,
  itemId,
}) {
  const [entityResult, warehouseResult, itemResult] = await Promise.all([
    supabaseAdmin
      .from("legal_entities")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("id", entityId)
      .maybeSingle(),
    supabaseAdmin
      .from("inventory_warehouses")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("id", warehouseId)
      .maybeSingle(),
    itemId
      ? supabaseAdmin
          .from("inventory_items")
          .select("id, entity_id")
          .eq("organization_id", organizationId)
          .eq("id", itemId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (entityResult.error) throw entityResult.error;
  if (!entityResult.data) {
    throw new Error("entity_id does not belong to organization");
  }

  if (warehouseResult.error) throw warehouseResult.error;
  if (!warehouseResult.data) {
    throw new Error("warehouse_id does not belong to organization");
  }

  if (itemResult.error) throw itemResult.error;
  if (itemId && !itemResult.data) {
    throw new Error("item_id does not belong to organization");
  }
  if (
    itemResult.data?.entity_id &&
    itemResult.data.entity_id !== entityId
  ) {
    throw new Error("item_id does not belong to entity");
  }

  if (!locationId) return;

  const locationResult = await supabaseAdmin
    .from("inventory_locations")
    .select("id, warehouse_id")
    .eq("id", locationId)
    .maybeSingle();

  if (locationResult.error) throw locationResult.error;
  if (!locationResult.data) {
    throw new Error("location_id was not found");
  }
  if (locationResult.data.warehouse_id !== warehouseId) {
    throw new Error("location_id belongs to a different warehouse");
  }
}

export async function createWarehouseTask({
  organization_id,
  entity_id,
  warehouse_id,
  location_id = null,
  task_type,
  source_document,
  source_document_id,
  item_id = null,
  quantity = 0,
  status = "OPEN",
  created_by = null,
}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!entity_id) throw new Error("entity_id required");
  if (!warehouse_id) throw new Error("warehouse_id required");

  const normalizedTaskType = normalizeInventoryMovementType(task_type);
  if (!normalizedTaskType) throw new Error("task_type required");
  if (!EXECUTABLE_WAREHOUSE_TASKS.has(normalizedTaskType)) {
    throw new Error(
      `Unsupported warehouse task type: ${normalizedTaskType}`,
    );
  }

  if (!item_id) {
    throw new Error(`${normalizedTaskType} requires item_id`);
  }
  if (numeric(quantity) <= 0) {
    throw new Error(`${normalizedTaskType} quantity must be greater than zero`);
  }

  await assertWarehouseTaskScope({
    organizationId: organization_id,
    entityId: entity_id,
    warehouseId: warehouse_id,
    locationId: location_id,
    itemId: item_id,
  });

  const { data, error } = await supabaseAdmin
    .from("warehouse_tasks")
    .insert({
      organization_id,
      entity_id,
      warehouse_id,
      location_id,
      task_type: normalizedTaskType,
      source_document,
      source_document_id,
      item_id,
      quantity,
      status: normalizeInventoryMovementType(status) || "OPEN",
      created_by,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
