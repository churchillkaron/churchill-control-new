export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { ChannelAssetRuntime } from "@/lib/platform/channels/runtime/ChannelAssetRuntime";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { executeService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { OrganizationServiceRuntime } from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function safeLocation(row) {
  if (!row || typeof row !== "object") return null;
  const id = text(row.id || row.location_id || row.locationId);
  if (!id) return null;

  const translatedName = Array.isArray(row.names)
    ? row.names.find((item) => item?.primary)?.value || row.names[0]?.value
    : null;
  const translatedAddress = Array.isArray(row.addresses)
    ? row.addresses.find((item) => item?.primary)?.value || row.addresses[0]?.value
    : null;

  return {
    id,
    name: text(row.name || translatedName || `Tripadvisor ${id}`),
    address: text(
      row.address_string ||
        row.address?.formatted ||
        translatedAddress ||
        (typeof row.address === "string" ? row.address : ""),
    ),
  };
}

function providerPayload(execution) {
  const providerResult = execution?.output;
  return providerResult?.output || providerResult || {};
}

async function ensureTripadvisorService(organizationId) {
  const existing = await OrganizationServiceRuntime.get({
    organization_id: organizationId,
    service_id: "tripadvisor",
  }).catch(() => null);

  if (existing && text(existing.status).toUpperCase() === "ACTIVE") {
    return existing;
  }

  return OrganizationServiceRuntime.save({
    ...(existing || {}),
    organization_id: organizationId,
    service_category_id: existing?.service_category_id || "reputation",
    service_id: "tripadvisor",
    package_id: existing?.package_id || "growth",
    status: "ACTIVE",
    managed_by: existing?.managed_by || "avantiqo",
    authorization_required: false,
    usage_enabled: true,
    billing_enabled: true,
    billing_mode: existing?.billing_mode || "USAGE",
    pricing_mode: existing?.pricing_mode || "PROVIDER",
    fallback_enabled: false,
    activated_at: existing?.activated_at || new Date().toISOString(),
    metadata: {
      ...(existing?.metadata || {}),
      provider: "tripadvisor",
      connection_model: "AVANTIQO_MANAGED_PARTNER_LOCATION_MAPPING",
      customer_api_key_required: false,
    },
    configuration: existing?.configuration || {},
  });
}

async function runTripadvisor({ organizationId, capability, input }) {
  await ensureTripadvisorService(organizationId);
  const execution = await executeService({
    organization_id: organizationId,
    service_id: "tripadvisor",
    provider_id: "tripadvisor",
    capability,
    input,
    category: "REPUTATION",
    provider_policy: {
      allowed_providers: ["tripadvisor"],
      preferred_providers: ["tripadvisor"],
    },
    metadata: {
      source: "TRIPADVISOR_CUSTOMER_CONNECTION_SETUP",
    },
  });
  return providerPayload(execution);
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId =
      url.searchParams.get("organizationId") ||
      url.searchParams.get("organization_id");
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error || "Organization access denied" },
        { status: access.status || 403 },
      );
    }

    const query = text(url.searchParams.get("q"));
    if (!query) return NextResponse.json({ success: true, rows: [] });

    const payload = await runTripadvisor({
      organizationId: access.organizationId,
      capability: "reputation.tripadvisor.locations.search",
      input: {
        query,
        size: 10,
      },
    });

    const source = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.locations)
        ? payload.locations
        : Array.isArray(payload?.results)
          ? payload.results
          : [];

    return NextResponse.json({
      success: true,
      rows: source.map(safeLocation).filter(Boolean),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Tripadvisor search failed" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body?.organizationId || body?.organization_id;
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error || "Organization access denied" },
        { status: access.status || 403 },
      );
    }

    const locationId = text(body?.locationId || body?.location_id);
    if (!/^\d+$/.test(locationId)) {
      return NextResponse.json(
        { success: false, error: "Select a valid Tripadvisor business location" },
        { status: 400 },
      );
    }

    const payload = await runTripadvisor({
      organizationId: access.organizationId,
      capability: "reputation.tripadvisor.location.read",
      input: {
        location_id: locationId,
      },
    });
    const location = safeLocation(payload?.data || payload?.location || payload);
    if (!location) throw new Error("Tripadvisor business location could not be verified");

    const entityId = text(body?.entityId || body?.entity_id) || null;
    const connection = await ChannelConnectionRuntime.connect({
      organization_id: access.organizationId,
      provider: "tripadvisor",
      channel_type: "reputation",
      credentials_reference: null,
      metadata: {
        location_id: location.id,
        account_name: location.name,
        connection_model: "AVANTIQO_MANAGED_PARTNER_LOCATION_MAPPING",
        connected_at: new Date().toISOString(),
        managed_provider_credential: true,
      },
    });

    await ChannelAssetRuntime.register({
      organization_id: access.organizationId,
      connection_id: connection.id,
      provider: "tripadvisor",
      asset_type: "tripadvisor_location",
      external_id: location.id,
      name: location.name,
      entity_id: entityId,
      selected_at: new Date().toISOString(),
      metadata: {
        mapping_source: "CUSTOMER_SELECTED_TERRA_LOCATION",
      },
    });

    return NextResponse.json({
      success: true,
      connection,
      location,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Tripadvisor connection failed" },
      { status: 500 },
    );
  }
}
