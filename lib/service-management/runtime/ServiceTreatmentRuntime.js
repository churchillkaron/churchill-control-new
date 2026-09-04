import { signedInventoryQuantity } from "@/lib/inventory/movements/inventoryMovementSemantics";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MAX_FINDINGS = 100;
const MAX_APPLICATIONS = 50;
const MOVEMENT_PAGE_SIZE = 1000;
const MAX_MOVEMENT_ROWS = 50000;
const ACTIVITY_TYPES = new Set([
  "none",
  "sighted",
  "captured",
  "evidence",
  "droppings",
  "damage",
  "nesting",
  "tracks",
  "live_activity",
  "dead_activity",
  "device_activity",
  "other",
]);

function text(value, max = 500) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, max) : null;
}

function normalized(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function boundedNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER, nullable = true } = {}) {
  if (value === null || value === undefined || value === "") return nullable ? null : min;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return nullable ? null : min;
  return number;
}

function stringList(value, max = 20) {
  const input = Array.isArray(value)
    ? value
    : String(value ?? "").split(",");
  return [...new Set(input.map((entry) => text(entry, 100)).filter(Boolean))].slice(0, max);
}

function positionKey(itemId, warehouseId, locationId) {
  return `${itemId}:${warehouseId || "-"}:${locationId || "-"}`;
}

function unitLabel(uom) {
  return text(uom?.abbreviation, 50) || text(uom?.name, 80) || null;
}

async function loadCatalogBase({ organizationId, entityId = null, itemIds = null }) {
  let itemQuery = supabaseAdmin
    .from("inventory_items")
    .select("id,organization_id,entity_id,name,code,type,category_id,uom_id,is_active")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (entityId) itemQuery = itemQuery.or(`entity_id.eq.${entityId},entity_id.is.null`);
  if (Array.isArray(itemIds) && itemIds.length) itemQuery = itemQuery.in("id", itemIds);

  const [itemsResult, warehousesResult] = await Promise.all([
    itemQuery,
    supabaseAdmin
      .from("inventory_warehouses")
      .select("id,organization_id,name")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true }),
  ]);

  if (itemsResult.error) throw itemsResult.error;
  if (warehousesResult.error) throw warehousesResult.error;

  const items = itemsResult.data || [];
  const warehouses = warehousesResult.data || [];
  const uomIds = [...new Set(items.map((row) => row.uom_id).filter(Boolean))];
  const categoryIds = [...new Set(items.map((row) => row.category_id).filter(Boolean))];
  const warehouseIds = warehouses.map((row) => row.id).filter(Boolean);

  const [uomsResult, categoriesResult, locationsResult] = await Promise.all([
    uomIds.length
      ? supabaseAdmin.from("inventory_uoms").select("id,organization_id,name,abbreviation").eq("organization_id", organizationId).in("id", uomIds)
      : Promise.resolve({ data: [], error: null }),
    categoryIds.length
      ? supabaseAdmin.from("inventory_categories").select("id,organization_id,name").eq("organization_id", organizationId).in("id", categoryIds)
      : Promise.resolve({ data: [], error: null }),
    warehouseIds.length
      ? supabaseAdmin.from("inventory_locations").select("id,warehouse_id,name").in("warehouse_id", warehouseIds).order("name", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (uomsResult.error) throw uomsResult.error;
  if (categoriesResult.error) throw categoriesResult.error;
  if (locationsResult.error) throw locationsResult.error;

  return {
    items,
    warehouses,
    locations: locationsResult.data || [],
    uomById: new Map((uomsResult.data || []).map((row) => [row.id, row])),
    categoryById: new Map((categoriesResult.data || []).map((row) => [row.id, row])),
  };
}

async function loadMovementBalances({ organizationId, entityId, itemIds }) {
  if (!entityId || !itemIds.length) return new Map();

  const rows = [];
  for (let from = 0; from < MAX_MOVEMENT_ROWS; from += MOVEMENT_PAGE_SIZE) {
    const result = await supabaseAdmin
      .from("inventory_movements")
      .select("item_id,warehouse_id,location_id,type,quantity")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .in("item_id", itemIds)
      .range(from, from + MOVEMENT_PAGE_SIZE - 1);

    if (result.error) throw result.error;
    const page = result.data || [];
    rows.push(...page);
    if (page.length < MOVEMENT_PAGE_SIZE) break;
    if (rows.length >= MAX_MOVEMENT_ROWS) {
      fail("Inventory history is too large to validate service stock safely. Reconcile inventory before completion.", 409);
    }
  }

  const byItem = new Map();
  for (const row of rows) {
    const signed = signedInventoryQuantity(row.type, row.quantity);
    if (!signed) continue;
    const current = byItem.get(row.item_id) || { global: 0, positions: new Map() };
    current.global += signed;
    const key = positionKey(row.item_id, row.warehouse_id, row.location_id);
    const position = current.positions.get(key) || {
      warehouse_id: row.warehouse_id || null,
      location_id: row.location_id || null,
      quantity: 0,
    };
    position.quantity += signed;
    current.positions.set(key, position);
    byItem.set(row.item_id, current);
  }

  return byItem;
}

function resolveStockPosition({ stock, item, warehouseId, locationId, locationById }) {
  let resolvedWarehouse = warehouseId || null;
  let resolvedLocation = locationId || null;

  if (resolvedLocation) {
    const location = locationById.get(resolvedLocation);
    if (!location) fail(`Inventory location does not belong to this organization for ${item.name}.`, 409);
    if (resolvedWarehouse && location.warehouse_id !== resolvedWarehouse) {
      fail(`Inventory location does not belong to the selected warehouse for ${item.name}.`, 409);
    }
    resolvedWarehouse = location.warehouse_id;
  }

  const positive = [...(stock?.positions?.values?.() || [])].filter((row) => Number(row.quantity || 0) > 0);

  if (!resolvedWarehouse && !resolvedLocation) {
    if (positive.length === 1) {
      resolvedWarehouse = positive[0].warehouse_id || null;
      resolvedLocation = positive[0].location_id || null;
    } else if (positive.length > 1) {
      fail(`Choose the stock location for ${item.name}; available stock exists in multiple positions.`, 409);
    }
  } else if (resolvedWarehouse && !resolvedLocation) {
    const warehousePositions = positive.filter((row) => row.warehouse_id === resolvedWarehouse);
    const uniqueLocations = [...new Set(warehousePositions.map((row) => row.location_id || null))];
    if (uniqueLocations.length === 1) {
      resolvedLocation = uniqueLocations[0];
    } else if (uniqueLocations.length > 1) {
      fail(`Choose the exact inventory location for ${item.name}; this warehouse has stock in multiple positions.`, 409);
    }
  }

  return { warehouse_id: resolvedWarehouse, location_id: resolvedLocation };
}

export function normalizeServicePestFindings(findings = []) {
  if (!Array.isArray(findings)) fail("Pest findings must be an array.");
  if (findings.length > MAX_FINDINGS) fail(`A service visit can record at most ${MAX_FINDINGS} pest findings.`);

  return findings.map((finding, index) => {
    const activityType = normalized(finding?.activity_type || finding?.activityType || "sighted");
    if (!ACTIVITY_TYPES.has(activityType)) fail(`Pest finding ${index + 1} has an unsupported activity type.`);
    const pestName = text(finding?.pest_name || finding?.pestName, 120);
    if (activityType !== "none" && !pestName) fail(`Pest finding ${index + 1} requires a pest name.`);

    return {
      finding_id: text(finding?.finding_id || finding?.findingId, 120) || `finding-${index + 1}`,
      pest_name: pestName || "No pest activity",
      activity_type: activityType,
      severity: boundedNumber(finding?.severity, { min: 0, max: 5 }),
      count: boundedNumber(finding?.count, { min: 0, max: 100000 }),
      area: text(finding?.area, 160),
      condition: text(finding?.condition, 240),
      notes: text(finding?.notes, 1000),
    };
  });
}

export async function getServiceTreatmentCatalog({ organizationId, entityId = null }) {
  if (!organizationId) fail("organization_id is required.");
  const base = await loadCatalogBase({ organizationId, entityId });

  return {
    organization_id: organizationId,
    entity_id: entityId || null,
    items: base.items.map((item) => {
      const uom = base.uomById.get(item.uom_id) || null;
      const category = base.categoryById.get(item.category_id) || null;
      return {
        id: item.id,
        entity_id: item.entity_id || null,
        name: item.name,
        code: item.code || null,
        type: item.type || null,
        category: category?.name || null,
        uom_id: item.uom_id || null,
        unit: unitLabel(uom),
      };
    }),
    warehouses: base.warehouses.map((row) => ({ id: row.id, name: row.name })),
    locations: base.locations.map((row) => ({ id: row.id, warehouse_id: row.warehouse_id, name: row.name })),
  };
}

export async function normalizeServiceTreatmentApplications({
  organizationId,
  entityId,
  applications = [],
}) {
  if (!Array.isArray(applications)) fail("Treatment applications must be an array.");
  if (applications.length > MAX_APPLICATIONS) fail(`A service visit can record at most ${MAX_APPLICATIONS} treatment applications.`);
  if (!applications.length) return [];
  if (!organizationId) fail("organization_id is required.");
  if (!entityId) fail("Treatment applications require entity_id on the service occurrence.", 409);

  const itemIds = [...new Set(applications.map((row) => text(row?.item_id || row?.itemId, 120)).filter(Boolean))];
  if (itemIds.length !== applications.length && applications.some((row) => !text(row?.item_id || row?.itemId, 120))) {
    fail("Every treatment application requires a Supply Chain inventory item.", 409);
  }

  const base = await loadCatalogBase({ organizationId, entityId, itemIds });
  const itemById = new Map(base.items.map((row) => [row.id, row]));
  const warehouseById = new Map(base.warehouses.map((row) => [row.id, row]));
  const locationById = new Map(base.locations.map((row) => [row.id, row]));
  const stockByItem = await loadMovementBalances({ organizationId, entityId, itemIds });
  const projectedUsage = new Map();

  return applications.map((application, index) => {
    const applicationId = text(application?.application_id || application?.applicationId, 120);
    if (!applicationId) fail(`Treatment application ${index + 1} requires a stable application id.`, 409);

    const itemId = text(application?.item_id || application?.itemId, 120);
    const item = itemById.get(itemId);
    if (!item) fail(`Treatment application ${index + 1} references an unavailable inventory item.`, 409);
    if (item.entity_id && item.entity_id !== entityId) fail(`${item.name} does not belong to this service entity.`, 409);

    const quantity = boundedNumber(application?.quantity, { min: 0.000001, max: 100000000, nullable: true });
    if (!quantity) fail(`Treatment application ${index + 1} requires a quantity greater than zero.`, 409);

    const requestedWarehouseId = text(application?.warehouse_id || application?.warehouseId, 120);
    const requestedLocationId = text(application?.location_id || application?.locationId, 120);
    if (requestedWarehouseId && !warehouseById.has(requestedWarehouseId)) {
      fail(`Selected warehouse does not belong to this organization for ${item.name}.`, 409);
    }

    const stock = stockByItem.get(itemId) || { global: 0, positions: new Map() };
    const position = resolveStockPosition({
      stock,
      item,
      warehouseId: requestedWarehouseId,
      locationId: requestedLocationId,
      locationById,
    });
    const uom = base.uomById.get(item.uom_id) || null;
    const category = base.categoryById.get(item.category_id) || null;
    const key = positionKey(itemId, position.warehouse_id, position.location_id);
    const positionStock = position.warehouse_id || position.location_id
      ? Number(stock.positions.get(key)?.quantity || 0)
      : Number(stock.global || 0);
    const alreadyProjected = Number(projectedUsage.get(key) || 0);
    const stockBefore = positionStock - alreadyProjected;
    const stockAfter = stockBefore - quantity;
    projectedUsage.set(key, alreadyProjected + quantity);

    return {
      application_id: applicationId,
      item_id: itemId,
      item_code: item.code || null,
      material_name: item.name,
      material_category: category?.name || null,
      quantity,
      unit: unitLabel(uom) || text(application?.unit, 50),
      warehouse_id: position.warehouse_id,
      warehouse_name: position.warehouse_id ? warehouseById.get(position.warehouse_id)?.name || null : null,
      location_id: position.location_id,
      location_name: position.location_id ? locationById.get(position.location_id)?.name || null : null,
      application_method: text(application?.application_method || application?.applicationMethod, 120),
      target_pests: stringList(application?.target_pests || application?.targetPests, 20),
      treatment_area: text(application?.treatment_area || application?.treatmentArea, 200),
      dilution_rate: text(application?.dilution_rate || application?.dilutionRate, 120),
      device: text(application?.device, 120),
      registration_number: text(application?.registration_number || application?.registrationNumber, 120),
      active_ingredients: text(application?.active_ingredients || application?.activeIngredients, 300),
      batch_lot: text(application?.batch_lot || application?.batchLot, 120),
      notes: text(application?.notes, 1000),
      stock_before: stockBefore,
      projected_stock_after: stockAfter,
      stock_shortage: stockAfter < 0,
    };
  });
}

export default Object.freeze({
  getServiceTreatmentCatalog,
  normalizeServicePestFindings,
  normalizeServiceTreatmentApplications,
});
