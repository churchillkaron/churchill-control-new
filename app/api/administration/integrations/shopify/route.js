export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { reactivateBlockedShopifyEvents } from "@/lib/commercial/commerce/ShopifyEventProjectionRuntime";

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

async function snapshot(organizationId) {
  const [connectionResult, storeResult, entitiesResult, eventResult] = await Promise.all([
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
      .limit(100),
  ]);

  if (connectionResult.error) throw connectionResult.error;
  if (storeResult.error) throw storeResult.error;
  if (entitiesResult.error) throw entitiesResult.error;
  if (eventResult.error) throw eventResult.error;

  const events = (eventResult.data || []).filter(
    (row) => row?.payload?.provider_event === true && row?.payload?.provider_id === "shopify",
  );

  return {
    connection: connectionResult.data || null,
    store: storeResult.data || null,
    entities: entitiesResult.data || [],
    projection: {
      pending: events.filter((row) => row.status === "PENDING").length,
      processed: events.filter((row) => row.status === "PROCESSED").length,
      blocked: events.filter((row) => row.status === "BLOCKED_CONFIGURATION").length,
      failed: events.filter((row) => row.status === "ERROR").length,
      latest: events[0] || null,
    },
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
    if (action !== "map-store") {
      return NextResponse.json(
        { success: false, error: "Unsupported Shopify integration action" },
        { status: 400 },
      );
    }

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
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to update Shopify integration" },
      { status: 500 },
    );
  }
}
