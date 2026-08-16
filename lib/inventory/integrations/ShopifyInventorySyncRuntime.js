import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { createInventoryMovement } from "@/lib/inventory/movements/createInventoryMovement";
import { signedInventoryQuantity } from "@/lib/inventory/movements/inventoryMovementSemantics";

const EVENT_TYPE = "SHOPIFY_INVENTORY_LEVEL_OBSERVED";
const MODE_OBSERVE_ONLY = "OBSERVE_ONLY";
const MODE_SHOPIFY_TO_AVANTIQO = "SHOPIFY_TO_AVANTIQO";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function markProcessed(event, result) {
  const payload = object(event.payload);
  const update = await supabaseAdmin
    .from("system_events")
    .update({
      processed: true,
      processing: false,
      processed_at: new Date().toISOString(),
      last_error: null,
      payload: {
        ...payload,
        inventory_sync: {
          ...object(payload.inventory_sync),
          result,
          completed_at: new Date().toISOString(),
        },
      },
    })
    .eq("id", event.id)
    .eq("organization_id", event.organization_id)
    .eq("type", EVENT_TYPE);
  if (update.error) throw update.error;
}

async function markFailed(event, error) {
  const update = await supabaseAdmin
    .from("system_events")
    .update({
      processing: false,
      processing_started_at: null,
      last_error: error?.message || "SHOPIFY_INVENTORY_SYNC_FAILED",
      last_failed_at: new Date().toISOString(),
    })
    .eq("id", event.id)
    .eq("organization_id", event.organization_id)
    .eq("type", EVENT_TYPE);
  if (update.error) throw update.error;
}

async function loadConnectionAndStore(organizationId, connectionId) {
  const [connectionResult, storeResult] = await Promise.all([
    supabaseAdmin
      .from("organization_channel_connections")
      .select("id,status")
      .eq("organization_id", organizationId)
      .eq("id", connectionId)
      .eq("provider", "shopify")
      .maybeSingle(),
    supabaseAdmin
      .from("organization_channel_assets")
      .select("id,connection_id,entity_id")
      .eq("organization_id", organizationId)
      .eq("connection_id", connectionId)
      .eq("channel_provider", "shopify")
      .eq("asset_type", "shopify_store")
      .maybeSingle(),
  ]);

  if (connectionResult.error) throw connectionResult.error;
  if (storeResult.error) throw storeResult.error;
  if (!connectionResult.data || String(connectionResult.data.status || "").toUpperCase() !== "ACTIVE") {
    throw new Error("SHOPIFY_CONNECTION_NOT_ACTIVE");
  }
  if (!storeResult.data?.entity_id) {
    throw new Error("SHOPIFY_STORE_ENTITY_MAPPING_REQUIRED");
  }

  return { connection: connectionResult.data, store: storeResult.data };
}

async function loadLocationMapping({ organizationId, connectionId, shopifyLocationId }) {
  const result = await supabaseAdmin
    .from("organization_channel_assets")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("connection_id", connectionId)
    .eq("channel_provider", "shopify")
    .eq("asset_type", "shopify_location")
    .eq("external_id", shopifyLocationId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("SHOPIFY_LOCATION_MAPPING_REQUIRED");
  return result.data;
}

async function resolveNativeItem({ organizationId, connectionId, shopifyInventoryItemId, entityId }) {
  const result = await supabaseAdmin
    .from("organization_channel_assets")
    .select("id,metadata")
    .eq("organization_id", organizationId)
    .eq("connection_id", connectionId)
    .eq("channel_provider", "shopify")
    .eq("asset_type", "shopify_variant");
  if (result.error) throw result.error;

  const itemIds = [...new Set(
    (result.data || [])
      .filter((row) => text(row?.metadata?.shopify_inventory_item_id) === shopifyInventoryItemId)
      .map((row) => text(row?.metadata?.inventory_item_id))
      .filter(Boolean),
  )];

  if (!itemIds.length) return null;
  if (itemIds.length > 1) throw new Error("SHOPIFY_INVENTORY_ITEM_HAS_AMBIGUOUS_NATIVE_MAPPING");

  const itemResult = await supabaseAdmin
    .from("inventory_items")
    .select("id,organization_id,entity_id,name,code,cost,is_active")
    .eq("organization_id", organizationId)
    .eq("id", itemIds[0])
    .eq("is_active", true)
    .maybeSingle();
  if (itemResult.error) throw itemResult.error;
  if (!itemResult.data) throw new Error("SHOPIFY_NATIVE_INVENTORY_ITEM_NOT_AVAILABLE");
  if (itemResult.data.entity_id && itemResult.data.entity_id !== entityId) {
    throw new Error("SHOPIFY_NATIVE_INVENTORY_ITEM_ENTITY_MISMATCH");
  }
  return itemResult.data;
}

async function validateInventoryPosition({ organizationId, warehouseId, locationId }) {
  const warehouseResult = await supabaseAdmin
    .from("inventory_warehouses")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", warehouseId)
    .maybeSingle();
  if (warehouseResult.error) throw warehouseResult.error;
  if (!warehouseResult.data) throw new Error("SHOPIFY_INVENTORY_WAREHOUSE_NOT_AVAILABLE");

  const locationResult = await supabaseAdmin
    .from("inventory_locations")
    .select("id,warehouse_id")
    .eq("id", locationId)
    .eq("warehouse_id", warehouseId)
    .maybeSingle();
  if (locationResult.error) throw locationResult.error;
  if (!locationResult.data) throw new Error("SHOPIFY_INVENTORY_LOCATION_NOT_AVAILABLE");
}

async function currentPosition({ organizationId, entityId, itemId, warehouseId, locationId }) {
  const result = await supabaseAdmin
    .from("inventory_movements")
    .select("type,quantity")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("item_id", itemId)
    .eq("warehouse_id", warehouseId)
    .eq("location_id", locationId);
  if (result.error) throw result.error;

  return (result.data || []).reduce(
    (sum, row) => sum + signedInventoryQuantity(row.type, row.quantity),
    0,
  );
}

async function processEvent(event) {
  const payload = object(event.payload);
  const organizationId = text(event.organization_id || payload.organization_id);
  const connectionId = text(payload.connection_id);
  const shopifyInventoryItemId = text(payload.shopify_inventory_item_id);
  const shopifyLocationId = text(payload.shopify_location_id);
  const observedRaw = payload.observed_available;

  if (!organizationId || !connectionId || !shopifyInventoryItemId || !shopifyLocationId) {
    throw new Error("SHOPIFY_INVENTORY_OBSERVATION_SCOPE_REQUIRED");
  }

  const { store } = await loadConnectionAndStore(organizationId, connectionId);
  const locationAsset = await loadLocationMapping({
    organizationId,
    connectionId,
    shopifyLocationId,
  });
  const metadata = object(locationAsset.metadata);
  const mode = text(metadata.inventory_sync_mode).toUpperCase() || MODE_OBSERVE_ONLY;

  if (mode !== MODE_SHOPIFY_TO_AVANTIQO) {
    await markProcessed(event, {
      status: "OBSERVED_ONLY",
      mode: MODE_OBSERVE_ONLY,
      observed_available: observedRaw ?? null,
    });
    return { success: true, event_id: event.id, status: "OBSERVED_ONLY" };
  }

  if (observedRaw == null || !Number.isFinite(Number(observedRaw))) {
    await markProcessed(event, {
      status: "NO_AVAILABLE_QUANTITY",
      mode,
      observed_available: null,
    });
    return { success: true, event_id: event.id, status: "NO_AVAILABLE_QUANTITY" };
  }

  const warehouseId = text(metadata.inventory_warehouse_id);
  const locationId = text(metadata.inventory_location_id);
  if (!warehouseId || !locationId) throw new Error("SHOPIFY_INVENTORY_LOCATION_MAPPING_REQUIRED");
  await validateInventoryPosition({ organizationId, warehouseId, locationId });

  const item = await resolveNativeItem({
    organizationId,
    connectionId,
    shopifyInventoryItemId,
    entityId: store.entity_id,
  });
  if (!item) {
    await markProcessed(event, {
      status: "UNMAPPED_ITEM",
      mode,
      observed_available: Number(observedRaw),
    });
    return { success: true, event_id: event.id, status: "UNMAPPED_ITEM" };
  }

  const duplicateResult = await supabaseAdmin
    .from("inventory_movements")
    .select("id,document_id")
    .eq("organization_id", organizationId)
    .eq("entity_id", store.entity_id)
    .eq("source_module", "shopify_inventory_sync")
    .eq("source_document_id", event.id)
    .maybeSingle();
  if (duplicateResult.error) throw duplicateResult.error;
  if (duplicateResult.data) {
    await markProcessed(event, {
      status: "ALREADY_APPLIED",
      movement_id: duplicateResult.data.id,
      document_id: duplicateResult.data.document_id,
    });
    return { success: true, event_id: event.id, status: "ALREADY_APPLIED" };
  }

  const before = await currentPosition({
    organizationId,
    entityId: store.entity_id,
    itemId: item.id,
    warehouseId,
    locationId,
  });
  const observed = Number(observedRaw);
  const delta = observed - before;

  if (Math.abs(delta) < 0.000001) {
    await markProcessed(event, {
      status: "IN_SYNC",
      item_id: item.id,
      warehouse_id: warehouseId,
      location_id: locationId,
      before,
      observed,
      delta: 0,
    });
    return { success: true, event_id: event.id, status: "IN_SYNC" };
  }

  const movement = await createInventoryMovement({
    organizationId,
    entityId: store.entity_id,
    itemId: item.id,
    warehouseId,
    locationId,
    movementType: delta > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
    quantity: Math.abs(delta),
    unitCost: Math.max(0, number(item.cost, 0)),
    referenceType: "SHOPIFY_INVENTORY_LEVEL",
    referenceId: event.id,
    sourceModule: "shopify_inventory_sync",
    sourceDocument: "system_events",
    sourceDocumentId: event.id,
    notes: `Shopify available inventory reconciliation (${shopifyInventoryItemId} @ ${shopifyLocationId})`,
    createdBy: null,
    postToFinance: false,
  });

  await markProcessed(event, {
    status: "APPLIED",
    mode,
    item_id: item.id,
    warehouse_id: warehouseId,
    location_id: locationId,
    before,
    observed,
    delta,
    movement_id: movement?.movement?.id || null,
    document_id: movement?.document?.id || null,
  });

  return {
    success: true,
    event_id: event.id,
    status: "APPLIED",
    delta,
    movement_id: movement?.movement?.id || null,
  };
}

export async function processShopifyInventorySync({ limit = 25 } = {}) {
  const claim = await supabaseAdmin.rpc("claim_shopify_inventory_sync_events", {
    p_limit: Math.max(1, Math.min(Number(limit) || 25, 100)),
    p_stale_after_seconds: 300,
  });
  if (claim.error) throw claim.error;

  const events = Array.isArray(claim.data) ? claim.data : [];
  const results = [];

  for (const event of events) {
    try {
      results.push(await processEvent(event));
    } catch (error) {
      await markFailed(event, error).catch(() => null);
      results.push({
        success: false,
        event_id: event.id,
        error: error?.message || "SHOPIFY_INVENTORY_SYNC_FAILED",
      });
    }
  }

  return {
    success: results.every((row) => row.success),
    checked: events.length,
    applied: results.filter((row) => row.status === "APPLIED").length,
    observed_only: results.filter((row) => row.status === "OBSERVED_ONLY").length,
    unchanged: results.filter((row) => row.status === "IN_SYNC").length,
    unmapped: results.filter((row) => row.status === "UNMAPPED_ITEM").length,
    failed: results.filter((row) => !row.success).length,
    results,
  };
}

export {
  MODE_OBSERVE_ONLY,
  MODE_SHOPIFY_TO_AVANTIQO,
};
