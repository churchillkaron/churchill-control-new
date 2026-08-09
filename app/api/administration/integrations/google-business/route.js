export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  discoverAndRegisterGoogleBusinessLocations,
  getGoogleBusinessAccess,
} from "@/lib/commercial/reputation/googleBusinessProfile";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const PROVIDER = "google";
const ASSET_TYPE = "google_business_location";
const RETRY_DELAY_MS = 15 * 60 * 1000;
const INTEGRATION_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
]);

function nextRetryAt() {
  return new Date(Date.now() + RETRY_DELAY_MS).toISOString();
}

function isQuotaError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.status === 429 ||
    message.includes("quota exceeded") ||
    message.includes("rate limit") ||
    message.includes("resource_exhausted")
  );
}

function canManageIntegrations(context) {
  const roles = [
    context?.role,
    context?.access?.role,
    context?.membership?.role,
    context?.staff?.role,
  ]
    .map((value) => String(value || "").trim().toUpperCase())
    .filter(Boolean);

  return roles.some((role) => INTEGRATION_ROLES.has(role));
}

async function resolveContext(request, body = {}) {
  return requireOrganizationAccess({
    organizationId:
      body.organizationId ||
      body.organization_id ||
      new URL(request.url).searchParams.get("organizationId") ||
      new URL(request.url).searchParams.get("organization_id"),
    request,
  });
}

async function integrationSnapshot(organizationId) {
  const [connectionResult, assetsResult, entitiesResult] = await Promise.all([
    supabaseAdmin
      .from("organization_channel_connections")
      .select("id,organization_id,provider,channel_type,status,metadata,authorized_by_party_id,authorized_at,created_at,updated_at")
      .eq("organization_id", organizationId)
      .eq("provider", PROVIDER)
      .maybeSingle(),
    supabaseAdmin
      .from("organization_channel_assets")
      .select("id,organization_id,connection_id,channel_provider,asset_type,external_id,name,entity_id,selected_by_party_id,selected_at,metadata,created_at,updated_at")
      .eq("organization_id", organizationId)
      .eq("channel_provider", PROVIDER)
      .eq("asset_type", ASSET_TYPE)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("legal_entities")
      .select("id,organization_id,code,legal_name,display_name,is_default_accounting_entity,is_active")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("is_default_accounting_entity", { ascending: false })
      .order("display_name", { ascending: true }),
  ]);

  if (connectionResult.error) throw connectionResult.error;
  if (assetsResult.error) throw assetsResult.error;
  if (entitiesResult.error) throw entitiesResult.error;

  return {
    connection: connectionResult.data || null,
    locations: assetsResult.data || [],
    entities: entitiesResult.data || [],
  };
}

function forbidden() {
  return NextResponse.json(
    {
      success: false,
      error: "Owner, administrator, or manager access is required to manage Google Business Profile",
    },
    { status: 403 }
  );
}

export async function GET(request) {
  try {
    const context = await resolveContext(request);
    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error },
        { status: context.status || 403 }
      );
    }
    if (!canManageIntegrations(context)) return forbidden();

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      ...(await integrationSnapshot(context.organizationId)),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load Google Business integration" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const context = await resolveContext(request, body);
    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error },
        { status: context.status || 403 }
      );
    }
    if (!canManageIntegrations(context)) return forbidden();

    const action = String(body.action || "").trim().toLowerCase();

    if (action === "map-location") {
      const assetId = String(body.assetId || body.asset_id || "").trim();
      const entityId = String(body.entityId || body.entity_id || "").trim();
      if (!assetId || !entityId) {
        return NextResponse.json(
          { success: false, error: "assetId and entityId are required" },
          { status: 400 }
        );
      }

      const { data: entity, error: entityError } = await supabaseAdmin
        .from("legal_entities")
        .select("id")
        .eq("id", entityId)
        .eq("organization_id", context.organizationId)
        .eq("is_active", true)
        .maybeSingle();
      if (entityError) throw entityError;
      if (!entity) {
        return NextResponse.json(
          { success: false, error: "Entity is not available for this organization" },
          { status: 400 }
        );
      }

      const { data: asset, error: assetError } = await supabaseAdmin
        .from("organization_channel_assets")
        .select("*")
        .eq("id", assetId)
        .eq("organization_id", context.organizationId)
        .eq("channel_provider", PROVIDER)
        .eq("asset_type", ASSET_TYPE)
        .maybeSingle();
      if (assetError) throw assetError;
      if (!asset) {
        return NextResponse.json(
          { success: false, error: "Google Business location was not found" },
          { status: 404 }
        );
      }

      const now = new Date().toISOString();
      const partyId = context.staff?.party_id || null;
      const { error: updateError } = await supabaseAdmin
        .from("organization_channel_assets")
        .update({
          entity_id: entityId,
          selected_by_party_id: partyId,
          selected_at: now,
          metadata: {
            ...(asset.metadata || {}),
            entity_id: entityId,
          },
          updated_at: now,
        })
        .eq("id", asset.id)
        .eq("organization_id", context.organizationId);
      if (updateError) throw updateError;

      return NextResponse.json({
        success: true,
        organizationId: context.organizationId,
        ...(await integrationSnapshot(context.organizationId)),
      });
    }

    if (action === "discover") {
      const { connection, accessToken } = await getGoogleBusinessAccess({
        organizationId: context.organizationId,
      });

      const retryAt = connection?.metadata?.location_discovery_retry_at || null;
      if (retryAt && new Date(retryAt).getTime() > Date.now() && body.force !== true) {
        return NextResponse.json(
          {
            success: false,
            code: "GOOGLE_DISCOVERY_COOLDOWN",
            error: "Google location discovery is cooling down after a quota limit. Try again after the displayed retry time.",
            retryAt,
          },
          { status: 429 }
        );
      }

      try {
        await discoverAndRegisterGoogleBusinessLocations({
          organizationId: context.organizationId,
          connection,
          accessToken,
        });
      } catch (error) {
        const now = new Date().toISOString();
        const quota = isQuotaError(error);
        const retryAfter = quota ? nextRetryAt() : null;
        const { error: stateError } = await supabaseAdmin
          .from("organization_channel_connections")
          .update({
            metadata: {
              ...(connection.metadata || {}),
              location_discovery_status: quota ? "RATE_LIMITED" : "PENDING",
              location_discovery_error: String(error?.message || "Location discovery failed").slice(0, 500),
              location_discovery_attempted_at: now,
              location_discovery_retry_at: retryAfter,
            },
            updated_at: now,
          })
          .eq("id", connection.id)
          .eq("organization_id", context.organizationId);
        if (stateError) throw stateError;

        return NextResponse.json(
          {
            success: false,
            code: quota ? "GOOGLE_QUOTA_LIMIT" : "GOOGLE_DISCOVERY_PENDING",
            error: error?.message || "Google location discovery failed",
            retryAt: retryAfter,
            ...(await integrationSnapshot(context.organizationId)),
          },
          { status: quota ? 429 : 502 }
        );
      }

      const snapshot = await integrationSnapshot(context.organizationId);
      if (snapshot.locations.length === 1 && snapshot.entities.length === 1 && !snapshot.locations[0].entity_id) {
        const now = new Date().toISOString();
        const partyId = context.staff?.party_id || null;
        const location = snapshot.locations[0];
        const entity = snapshot.entities[0];
        const { error: autoMapError } = await supabaseAdmin
          .from("organization_channel_assets")
          .update({
            entity_id: entity.id,
            selected_by_party_id: partyId,
            selected_at: now,
            metadata: { ...(location.metadata || {}), entity_id: entity.id },
            updated_at: now,
          })
          .eq("id", location.id)
          .eq("organization_id", context.organizationId);
        if (autoMapError) throw autoMapError;
      }

      return NextResponse.json({
        success: true,
        organizationId: context.organizationId,
        ...(await integrationSnapshot(context.organizationId)),
      });
    }

    return NextResponse.json(
      { success: false, error: "Unsupported integration action" },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Google Business integration action failed" },
      { status: 500 }
    );
  }
}
