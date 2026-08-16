export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGER_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
]);

const MODES = new Set(["OBSERVE_ONLY", "SHOPIFY_TO_AVANTIQO"]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function canManage(context) {
  return [
    context?.role,
    context?.access?.role,
    context?.membership?.role,
    context?.staff?.role,
  ]
    .map((value) => text(value).toUpperCase())
    .filter(Boolean)
    .some((role) => MANAGER_ROLES.has(role));
}

async function contextFor(request, body = {}) {
  const url = new URL(request.url);
  return requireOrganizationAccess({
    organizationId:
      body.organizationId ||
      body.organization_id ||
      url.searchParams.get("organizationId") ||
      url.searchParams.get("organization_id"),
    request,
  });
}

function forbidden() {
  return NextResponse.json(
    {
      success: false,
      error: "Owner, administrator, or manager access is required to manage Shopify inventory",
    },
    { status: 403 },
  );
}

async function loadSnapshot(organizationId) {
  const [connectionResult, storeResult, locationsResult, warehousesResult, eventsResult] = await Promise.all([
    supabaseAdmin
      .from("organization_channel_connections")
      .select("id,status,metadata")
      .eq("organization_id", organizationId)
      .eq("provider", "shopify")
      .maybeSingle(),
    supabaseAdmin
      .from("organization_channel_assets")
      .select("id,connection_id,entity_id,name,metadata")
      .eq("organization_id", organizationId)
      .eq("channel_provider", "shopify")
      .eq("asset_type", "shopify_store")
      .maybeSingle(),
    supabaseAdmin
      .from("organization_channel_assets")
      .select("id,connection_id,external_id,name,entity_id,metadata,selected_at,updated_at")
      .eq("organization_id", organizationId)
      .eq("channel_provider", "shopify")
      .eq("asset_type", "shopify_location")
      .order("name", { ascending: true }),
    supabaseAdmin
      .from("inventory_warehouses")
      .select("id,organization_id,name,created_at")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true }),
    supabaseAdmin
      .from("system_events")
      .select("id,processed,processing,attempt_count,last_error,last_failed_at,processed_at,created_at,payload")
      .eq("organization_id", organizationId)
      .eq("type", "SHOPIFY_INVENTORY_LEVEL_OBSERVED")
      .order("created_at", { ascending: false })
      .limit(250),
  ]);

  for (const result of [connectionResult, storeResult, locationsResult, warehousesResult, eventsResult]) {
    if (result.error) throw result.error;
  }

  const warehouseIds = (warehousesResult.data || []).map((row) => row.id);
  let inventoryLocations = [];
  if (warehouseIds.length) {
    const inventoryLocationsResult = await supabaseAdmin
      .from("inventory_locations")
      .select("id,warehouse_id,name,created_at")
      .in("warehouse_id", warehouseIds)
      .order("name", { ascending: true });
    if (inventoryLocationsResult.error) throw inventoryLocationsResult.error;
    inventoryLocations = inventoryLocationsResult.data || [];
  }

  const shopifyLocations = (locationsResult.data || []).map((row) => {
    const metadata = object(row.metadata);
    return {
      ...row,
      inventory_warehouse_id: text(metadata.inventory_warehouse_id) || null,
      inventory_location_id: text(metadata.inventory_location_id) || null,
      inventory_sync_mode: text(metadata.inventory_sync_mode).toUpperCase() || "OBSERVE_ONLY",
      mapped: Boolean(text(metadata.inventory_warehouse_id) && text(metadata.inventory_location_id)),
    };
  });

  const events = eventsResult.data || [];
  const failed = events.filter((row) => !row.processed && Number(row.attempt_count || 0) >= 8).length;
  const retrying = events.filter(
    (row) => !row.processed && Number(row.attempt_count || 0) < 8 && Boolean(row.last_error),
  ).length;
  const pending = events.filter(
    (row) => !row.processed && Number(row.attempt_count || 0) < 8 && !row.last_error,
  ).length;
  const applied = events.filter(
    (row) => row.processed && row?.payload?.inventory_sync?.result?.status === "APPLIED",
  ).length;

  return {
    connection: connectionResult.data || null,
    store: storeResult.data || null,
    shopifyLocations,
    warehouses: warehousesResult.data || [],
    inventoryLocations,
    inventorySync: {
      observed: events.length,
      pending,
      retrying,
      failed,
      processed: events.filter((row) => row.processed).length,
      applied,
      enabled_locations: shopifyLocations.filter(
        (row) => row.inventory_sync_mode === "SHOPIFY_TO_AVANTIQO" && row.mapped,
      ).length,
      latest: events[0] || null,
    },
  };
}

async function emitCurrentObservations({ organizationId, connectionId, shopifyLocationId, mappingVersion }) {
  const levelsResult = await supabaseAdmin
    .from("organization_channel_assets")
    .select("id,external_id,metadata,updated_at")
    .eq("organization_id", organizationId)
    .eq("connection_id", connectionId)
    .eq("channel_provider", "shopify")
    .eq("asset_type", "shopify_inventory_level");
  if (levelsResult.error) throw levelsResult.error;

  let emitted = 0;
  for (const level of levelsResult.data || []) {
    const metadata = object(level.metadata);
    if (text(metadata.location_id) !== shopifyLocationId) continue;
    const shopifyInventoryItemId = text(metadata.inventory_item_id);
    if (!shopifyInventoryItemId) continue;

    const event = await supabaseAdmin.rpc("record_system_event_atomic", {
      p_organization_id: organizationId,
      p_type: "SHOPIFY_INVENTORY_LEVEL_OBSERVED",
      p_payload: {
        organization_id: organizationId,
        provider_event_id: text(metadata.last_projected_event_id) || null,
        connection_id: connectionId,
        inventory_level_asset_id: level.id,
        shopify_inventory_item_id: shopifyInventoryItemId,
        shopify_location_id: shopifyLocationId,
        observed_available: metadata.available == null ? null : Number(metadata.available),
        observed_at: metadata.updated_at || level.updated_at || new Date().toISOString(),
        trigger: "LOCATION_MAPPING_CHANGED",
      },
      p_idempotency_key: `shopify-inventory-mapping:${level.id}:${mappingVersion}`,
    });
    if (event.error) throw event.error;
    if (!event.data?.duplicate) emitted += 1;
  }
  return emitted;
}

export async function GET(request) {
  try {
    const context = await contextFor(request);
    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error },
        { status: context.status || 403 },
      );
    }
    if (!canManage(context)) return forbidden();

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      ...(await loadSnapshot(context.organizationId)),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load Shopify inventory settings" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const context = await contextFor(request, body);
    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error },
        { status: context.status || 403 },
      );
    }
    if (!canManage(context)) return forbidden();

    const action = text(body.action).toLowerCase();
    if (action !== "configure-location") {
      return NextResponse.json(
        { success: false, error: "Unsupported Shopify inventory action" },
        { status: 400 },
      );
    }

    const assetId = text(body.assetId || body.asset_id);
    const warehouseId = text(body.warehouseId || body.warehouse_id);
    const locationId = text(body.locationId || body.location_id);
    const requestedMode = text(body.syncMode || body.sync_mode).toUpperCase() || "OBSERVE_ONLY";
    const clear = body.clear === true || (!warehouseId && !locationId);

    if (!assetId) {
      return NextResponse.json({ success: false, error: "assetId is required" }, { status: 400 });
    }
    if (!MODES.has(requestedMode)) {
      return NextResponse.json({ success: false, error: "Unsupported inventory sync mode" }, { status: 400 });
    }
    if (requestedMode === "SHOPIFY_TO_AVANTIQO" && (!warehouseId || !locationId)) {
      return NextResponse.json(
        { success: false, error: "Warehouse and inventory location are required before enabling stock synchronization" },
        { status: 400 },
      );
    }
    if (locationId && !warehouseId) {
      return NextResponse.json(
        { success: false, error: "Choose the warehouse before choosing its inventory location" },
        { status: 400 },
      );
    }

    const [assetResult, storeResult] = await Promise.all([
      supabaseAdmin
        .from("organization_channel_assets")
        .select("*")
        .eq("organization_id", context.organizationId)
        .eq("id", assetId)
        .eq("channel_provider", "shopify")
        .eq("asset_type", "shopify_location")
        .maybeSingle(),
      supabaseAdmin
        .from("organization_channel_assets")
        .select("id,connection_id,entity_id")
        .eq("organization_id", context.organizationId)
        .eq("channel_provider", "shopify")
        .eq("asset_type", "shopify_store")
        .maybeSingle(),
    ]);
    if (assetResult.error) throw assetResult.error;
    if (storeResult.error) throw storeResult.error;
    if (!assetResult.data) {
      return NextResponse.json({ success: false, error: "Shopify location was not found" }, { status: 404 });
    }
    if (!storeResult.data || storeResult.data.connection_id !== assetResult.data.connection_id) {
      return NextResponse.json({ success: false, error: "Shopify store connection is not available" }, { status: 409 });
    }

    if (warehouseId) {
      const warehouseResult = await supabaseAdmin
        .from("inventory_warehouses")
        .select("id")
        .eq("organization_id", context.organizationId)
        .eq("id", warehouseId)
        .maybeSingle();
      if (warehouseResult.error) throw warehouseResult.error;
      if (!warehouseResult.data) {
        return NextResponse.json(
          { success: false, error: "Inventory warehouse is not available for this organization" },
          { status: 400 },
        );
      }
    }

    if (locationId) {
      const locationResult = await supabaseAdmin
        .from("inventory_locations")
        .select("id,warehouse_id")
        .eq("id", locationId)
        .eq("warehouse_id", warehouseId)
        .maybeSingle();
      if (locationResult.error) throw locationResult.error;
      if (!locationResult.data) {
        return NextResponse.json(
          { success: false, error: "Inventory location does not belong to the selected warehouse" },
          { status: 400 },
        );
      }
    }

    if (requestedMode === "SHOPIFY_TO_AVANTIQO" && !storeResult.data.entity_id) {
      return NextResponse.json(
        { success: false, error: "Assign the Shopify store to a legal entity before enabling stock synchronization" },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const partyId = context.staff?.party_id || null;
    const metadata = object(assetResult.data.metadata);
    const mode = clear ? "OBSERVE_ONLY" : requestedMode;
    const update = await supabaseAdmin
      .from("organization_channel_assets")
      .update({
        selected_by_party_id: partyId,
        selected_at: now,
        updated_at: now,
        metadata: {
          ...metadata,
          inventory_warehouse_id: clear ? null : warehouseId || null,
          inventory_location_id: clear ? null : locationId || null,
          inventory_sync_mode: mode,
          inventory_mapping_updated_at: now,
          inventory_mapping_updated_by_party_id: partyId,
        },
      })
      .eq("organization_id", context.organizationId)
      .eq("id", assetId);
    if (update.error) throw update.error;

    let emitted = 0;
    if (mode === "SHOPIFY_TO_AVANTIQO") {
      emitted = await emitCurrentObservations({
        organizationId: context.organizationId,
        connectionId: assetResult.data.connection_id,
        shopifyLocationId: text(assetResult.data.external_id),
        mappingVersion: now,
      });
    }

    return NextResponse.json({
      success: true,
      emittedObservations: emitted,
      organizationId: context.organizationId,
      ...(await loadSnapshot(context.organizationId)),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to update Shopify inventory settings" },
      { status: 500 },
    );
  }
}
