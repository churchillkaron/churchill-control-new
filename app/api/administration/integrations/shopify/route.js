export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  reactivateBlockedShopifyEvents,
  reactivateShopifyOrderEvents,
} from "@/lib/commercial/commerce/ShopifyEventProjectionRuntime";

const MANAGER_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
]);

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

function healthFrom({ connection, store, projection }) {
  if (!connection) {
    return {
      state: "DISCONNECTED",
      label: "Not connected",
      detail: "Connect a Shopify store to start synchronization.",
    };
  }

  if (String(connection.status || "").toUpperCase() !== "ACTIVE") {
    return {
      state: "DISCONNECTED",
      label: "Disconnected",
      detail: "Reconnect Shopify to resume synchronization.",
    };
  }

  if (!store?.entity_id) {
    return {
      state: "ACTION_REQUIRED",
      label: "Legal entity required",
      detail: "Choose which legal entity owns this Shopify store before orders are projected.",
    };
  }

  if (projection.failed > 0) {
    return {
      state: "ATTENTION",
      label: "Needs attention",
      detail: `${projection.failed} Shopify event${projection.failed === 1 ? "" : "s"} failed projection.`,
    };
  }

  const reconciliation = object(object(connection.metadata).shopify_reconciliation);
  if (reconciliation.status === "ERROR") {
    return {
      state: "ATTENTION",
      label: "Recovery sync needs attention",
      detail: reconciliation.last_error || "Shopify recovery synchronization reported an error.",
    };
  }

  if (projection.pending > 0 || projection.blocked > 0) {
    return {
      state: "SYNCING",
      label: "Synchronizing",
      detail: `${projection.pending + projection.blocked} event${projection.pending + projection.blocked === 1 ? "" : "s"} waiting for projection.`,
    };
  }

  return {
    state: "READY",
    label: "Ready",
    detail: "Shopify webhooks, recovery sync and Commercial projection are operational.",
  };
}

async function snapshot(organizationId) {
  const [
    connectionResult,
    storeResult,
    entitiesResult,
    eventResult,
    variantsResult,
    itemsResult,
    assetCountsResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("organization_channel_connections")
      .select("id,organization_id,provider,channel_type,status,metadata,authorized_by_party_id,authorized_at,created_at,updated_at")
      .eq("organization_id", organizationId)
      .eq("provider", "shopify")
      .maybeSingle(),
    supabaseAdmin
      .from("organization_channel_assets")
      .select("id,organization_id,connection_id,channel_provider,asset_type,external_id,name,entity_id,selected_by_party_id,selected_at,metadata,created_at,updated_at")
      .eq("organization_id", organizationId)
      .eq("channel_provider", "shopify")
      .eq("asset_type", "shopify_store")
      .maybeSingle(),
    supabaseAdmin
      .from("legal_entities")
      .select("id,organization_id,code,legal_name,display_name,is_default_accounting_entity,is_active")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("is_default_accounting_entity", { ascending: false })
      .order("display_name", { ascending: true }),
    supabaseAdmin
      .from("event_bus")
      .select("id,status,event_type,created_at,processed_at,payload")
      .eq("organization_id", organizationId)
      .like("event_type", "shopify.%")
      .order("created_at", { ascending: false })
      .limit(250),
    supabaseAdmin
      .from("organization_channel_assets")
      .select("id,external_id,name,entity_id,metadata,updated_at")
      .eq("organization_id", organizationId)
      .eq("channel_provider", "shopify")
      .eq("asset_type", "shopify_variant")
      .order("updated_at", { ascending: false })
      .limit(300),
    supabaseAdmin
      .from("inventory_items")
      .select("id,organization_id,entity_id,name,code,type,cost,sale_price,is_active")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(500),
    supabaseAdmin
      .from("organization_channel_assets")
      .select("asset_type")
      .eq("organization_id", organizationId)
      .eq("channel_provider", "shopify")
      .limit(2000),
  ]);

  for (const result of [
    connectionResult,
    storeResult,
    entitiesResult,
    eventResult,
    variantsResult,
    itemsResult,
    assetCountsResult,
  ]) {
    if (result.error) throw result.error;
  }

  const connection = connectionResult.data || null;
  const store = storeResult.data || null;
  const events = (eventResult.data || []).filter(
    (row) => row?.payload?.provider_event === true && row?.payload?.provider_id === "shopify",
  );
  const projection = {
    pending: events.filter((row) => row.status === "PENDING").length,
    processed: events.filter((row) => row.status === "PROCESSED").length,
    blocked: events.filter((row) => row.status === "BLOCKED_CONFIGURATION").length,
    failed: events.filter((row) => row.status === "ERROR").length,
    latest: events[0] || null,
  };

  const variants = (variantsResult.data || []).map((row) => ({
    ...row,
    sku: text(row?.metadata?.sku) || null,
    barcode: text(row?.metadata?.barcode) || null,
    product_id: text(row?.metadata?.product_id) || null,
    shopify_inventory_item_id: text(row?.metadata?.shopify_inventory_item_id) || null,
    inventory_item_id: text(row?.metadata?.inventory_item_id) || null,
    mapped: Boolean(text(row?.metadata?.inventory_item_id)),
  }));

  const assetCounts = (assetCountsResult.data || []).reduce((counts, row) => {
    counts[row.asset_type] = Number(counts[row.asset_type] || 0) + 1;
    return counts;
  }, {});

  const reconciliation = object(object(connection?.metadata).shopify_reconciliation);

  return {
    connection,
    store,
    entities: entitiesResult.data || [],
    projection,
    reconciliation,
    health: healthFrom({ connection, store, projection }),
    variants,
    inventoryItems: (itemsResult.data || []).filter(
      (item) => !store?.entity_id || !item.entity_id || item.entity_id === store.entity_id,
    ),
    mapping: {
      total_variants: variants.length,
      mapped_variants: variants.filter((row) => row.mapped).length,
      unmapped_variants: variants.filter((row) => !row.mapped).length,
    },
    assets: assetCounts,
  };
}

function forbidden() {
  return NextResponse.json(
    {
      success: false,
      error: "Owner, administrator, or manager access is required to manage Shopify",
    },
    { status: 403 },
  );
}

async function mapStore({ context, body }) {
  const assetId = text(body.assetId || body.asset_id);
  const entityId = text(body.entityId || body.entity_id);
  if (!assetId || !entityId) {
    return NextResponse.json(
      { success: false, error: "assetId and entityId are required" },
      { status: 400 },
    );
  }

  const [entityResult, assetResult] = await Promise.all([
    supabaseAdmin
      .from("legal_entities")
      .select("id")
      .eq("organization_id", context.organizationId)
      .eq("id", entityId)
      .eq("is_active", true)
      .maybeSingle(),
    supabaseAdmin
      .from("organization_channel_assets")
      .select("*")
      .eq("organization_id", context.organizationId)
      .eq("id", assetId)
      .eq("channel_provider", "shopify")
      .eq("asset_type", "shopify_store")
      .maybeSingle(),
  ]);

  if (entityResult.error) throw entityResult.error;
  if (assetResult.error) throw assetResult.error;
  if (!entityResult.data) {
    return NextResponse.json(
      { success: false, error: "Entity is not available for this organization" },
      { status: 400 },
    );
  }
  if (!assetResult.data) {
    return NextResponse.json(
      { success: false, error: "Shopify store was not found" },
      { status: 404 },
    );
  }

  const now = new Date().toISOString();
  const partyId = context.staff?.party_id || null;
  const update = await supabaseAdmin
    .from("organization_channel_assets")
    .update({
      entity_id: entityId,
      selected_by_party_id: partyId,
      selected_at: now,
      metadata: {
        ...(assetResult.data.metadata || {}),
        entity_id: entityId,
        projection_ready: true,
      },
      updated_at: now,
    })
    .eq("organization_id", context.organizationId)
    .eq("id", assetId);
  if (update.error) throw update.error;

  await reactivateBlockedShopifyEvents({
    organizationId: context.organizationId,
    connectionId: assetResult.data.connection_id,
  });

  return NextResponse.json({
    success: true,
    organizationId: context.organizationId,
    ...(await snapshot(context.organizationId)),
  });
}

async function mapVariant({ context, body }) {
  const variantAssetId = text(body.variantAssetId || body.variant_asset_id || body.assetId || body.asset_id);
  const inventoryItemId = text(body.inventoryItemId || body.inventory_item_id);
  const clear = body.clear === true || body.unmap === true || !inventoryItemId;

  if (!variantAssetId) {
    return NextResponse.json(
      { success: false, error: "variantAssetId is required" },
      { status: 400 },
    );
  }

  const variantResult = await supabaseAdmin
    .from("organization_channel_assets")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("id", variantAssetId)
    .eq("channel_provider", "shopify")
    .eq("asset_type", "shopify_variant")
    .maybeSingle();
  if (variantResult.error) throw variantResult.error;
  if (!variantResult.data) {
    return NextResponse.json(
      { success: false, error: "Shopify variant was not found" },
      { status: 404 },
    );
  }

  let inventoryItem = null;
  if (!clear) {
    const itemResult = await supabaseAdmin
      .from("inventory_items")
      .select("id,organization_id,entity_id,name,code,is_active")
      .eq("organization_id", context.organizationId)
      .eq("id", inventoryItemId)
      .eq("is_active", true)
      .maybeSingle();
    if (itemResult.error) throw itemResult.error;
    inventoryItem = itemResult.data || null;
    if (!inventoryItem) {
      return NextResponse.json(
        { success: false, error: "Inventory item is not available for this organization" },
        { status: 400 },
      );
    }

    const storeResult = await supabaseAdmin
      .from("organization_channel_assets")
      .select("entity_id")
      .eq("organization_id", context.organizationId)
      .eq("connection_id", variantResult.data.connection_id)
      .eq("channel_provider", "shopify")
      .eq("asset_type", "shopify_store")
      .maybeSingle();
    if (storeResult.error) throw storeResult.error;
    const storeEntityId = storeResult.data?.entity_id || null;
    if (storeEntityId && inventoryItem.entity_id && inventoryItem.entity_id !== storeEntityId) {
      return NextResponse.json(
        { success: false, error: "Inventory item belongs to a different legal entity" },
        { status: 409 },
      );
    }
  }

  const now = new Date().toISOString();
  const partyId = context.staff?.party_id || null;
  const metadata = object(variantResult.data.metadata);
  const update = await supabaseAdmin
    .from("organization_channel_assets")
    .update({
      selected_by_party_id: partyId,
      selected_at: now,
      metadata: {
        ...metadata,
        inventory_item_id: clear ? null : inventoryItem.id,
        inventory_mapping_status: clear ? "UNMAPPED" : "MAPPED",
        inventory_mapping_updated_at: now,
        inventory_mapping_updated_by_party_id: partyId,
      },
      updated_at: now,
    })
    .eq("organization_id", context.organizationId)
    .eq("id", variantResult.data.id);
  if (update.error) throw update.error;

  await reactivateShopifyOrderEvents({
    organizationId: context.organizationId,
    connectionId: variantResult.data.connection_id,
  });

  return NextResponse.json({
    success: true,
    organizationId: context.organizationId,
    ...(await snapshot(context.organizationId)),
  });
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
      ...(await snapshot(context.organizationId)),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load Shopify integration" },
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
    if (action === "map-store") {
      return mapStore({ context, body });
    }
    if (action === "map-variant" || action === "unmap-variant") {
      return mapVariant({
        context,
        body: {
          ...body,
          clear: action === "unmap-variant" ? true : body.clear,
        },
      });
    }

    return NextResponse.json(
      { success: false, error: "Unsupported Shopify integration action" },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to update Shopify integration" },
      { status: 500 },
    );
  }
}
