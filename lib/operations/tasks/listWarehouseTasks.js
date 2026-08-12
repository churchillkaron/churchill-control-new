import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { normalizeInventoryMovementType } from "@/lib/inventory/movements/inventoryMovementSemantics";

const EXECUTABLE_WAREHOUSE_TASKS = new Set([
  "PUTAWAY",
  "TRANSFER_OUT",
  "TRANSFER_IN",
]);

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function assertEntityScope({ organizationId, entityId }) {
  const result = await supabaseAdmin
    .from("legal_entities")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", entityId)
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) {
    fail("Legal entity does not belong to this organization", 403);
  }
}

export async function listWarehouseTasks({
  organization_id,
  entity_id,
  task_type = null,
}) {
  if (!organization_id) fail("organization_id required");
  if (!entity_id) fail("entity_id required");

  await assertEntityScope({
    organizationId: organization_id,
    entityId: entity_id,
  });

  const normalizedTaskType = task_type
    ? normalizeInventoryMovementType(task_type)
    : null;

  if (
    normalizedTaskType &&
    !EXECUTABLE_WAREHOUSE_TASKS.has(normalizedTaskType)
  ) {
    fail(`Unsupported warehouse task type: ${normalizedTaskType}`, 400);
  }

  let query = supabaseAdmin
    .from("warehouse_tasks")
    .select("*")
    .eq("organization_id", organization_id)
    .eq("entity_id", entity_id)
    .order("created_at", { ascending: false });

  if (normalizedTaskType) {
    query = query.eq("task_type", normalizedTaskType);
  }

  const tasksResult = await query;
  if (tasksResult.error) throw tasksResult.error;

  const tasks = tasksResult.data || [];
  if (!tasks.length) return [];

  const itemIds = unique(tasks.map((task) => task.item_id));
  const warehouseIds = unique(tasks.map((task) => task.warehouse_id));
  const locationIds = unique(tasks.map((task) => task.location_id));

  const [itemsResult, warehousesResult] = await Promise.all([
    itemIds.length
      ? supabaseAdmin
          .from("inventory_items")
          .select("id, name")
          .eq("organization_id", organization_id)
          .in("id", itemIds)
      : Promise.resolve({ data: [], error: null }),
    warehouseIds.length
      ? supabaseAdmin
          .from("inventory_warehouses")
          .select("id, name")
          .eq("organization_id", organization_id)
          .in("id", warehouseIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (itemsResult.error) throw itemsResult.error;
  if (warehousesResult.error) throw warehousesResult.error;

  const validWarehouseIds = unique(
    (warehousesResult.data || []).map((warehouse) => warehouse.id),
  );

  const locationsResult =
    locationIds.length && validWarehouseIds.length
      ? await supabaseAdmin
          .from("inventory_locations")
          .select("id, name, warehouse_id")
          .in("id", locationIds)
          .in("warehouse_id", validWarehouseIds)
      : { data: [], error: null };

  if (locationsResult.error) throw locationsResult.error;

  const itemMap = Object.fromEntries(
    (itemsResult.data || []).map((item) => [item.id, item.name]),
  );
  const warehouseMap = Object.fromEntries(
    (warehousesResult.data || []).map((warehouse) => [
      warehouse.id,
      warehouse.name,
    ]),
  );
  const locationMap = Object.fromEntries(
    (locationsResult.data || []).map((location) => [
      location.id,
      location.name,
    ]),
  );

  return tasks.map((task) => ({
    ...task,
    item_name: itemMap[task.item_id] || null,
    warehouse_name: warehouseMap[task.warehouse_id] || null,
    location_name: locationMap[task.location_id] || null,
  }));
}
