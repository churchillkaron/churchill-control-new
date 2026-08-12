export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { ChannelAssetRuntime } from "@/lib/platform/channels/runtime/ChannelAssetRuntime";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

function key() {
  const value = String(process.env.TRIPADVISOR_API_KEY || "").trim();
  if (!value) throw new Error("Tripadvisor Terra access is not configured by Avantiqo");
  return value;
}

function safeLocation(row) {
  if (!row || typeof row !== "object") return null;
  const id = String(row.id || row.location_id || row.locationId || "").trim();
  if (!id) return null;
  const translatedName = Array.isArray(row.names)
    ? row.names.find((item) => item?.primary)?.value || row.names[0]?.value
    : null;
  const name = String(row.name || translatedName || `Tripadvisor ${id}`).trim();
  const address = String(
    row.address ||
      row.address_string ||
      row.address?.formatted ||
      row.addresses?.[0]?.value ||
      "",
  ).trim();
  return { id, name, address };
}

async function terra(path) {
  const response = await fetch(`https://terra.tripadvisor.com${path}`, {
    headers: {
      Accept: "application/json",
      "X-API-Key": key(),
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.detail || payload?.title || "Tripadvisor Terra request failed");
  }
  return payload;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId") || url.searchParams.get("organization_id");
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error || "Organization access denied" }, { status: access.status || 403 });
    }
    const query = String(url.searchParams.get("q") || "").trim();
    if (!query) return NextResponse.json({ success: true, rows: [] });

    const payload = await terra(`/api/locations/search?query=${encodeURIComponent(query)}&size=10`);
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
    return NextResponse.json({ success: false, error: error?.message || "Tripadvisor search failed" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body?.organizationId || body?.organization_id;
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error || "Organization access denied" }, { status: access.status || 403 });
    }
    const locationId = String(body?.locationId || body?.location_id || "").trim();
    if (!/^\d+$/.test(locationId)) {
      return NextResponse.json({ success: false, error: "Select a valid Tripadvisor business location" }, { status: 400 });
    }

    const payload = await terra(`/api/locations/${encodeURIComponent(locationId)}`);
    const location = safeLocation(payload?.data || payload?.location || payload);
    if (!location) throw new Error("Tripadvisor business location could not be verified");

    const connection = await ChannelConnectionRuntime.connect({
      organization_id: access.organizationId,
      provider: "tripadvisor",
      channel_type: "reputation",
      credentials_reference: null,
      metadata: {
        location_id: location.id,
        account_name: location.name,
        address: location.address || null,
        connection_model: "AVANTIQO_TERRA_PARTNER_LOCATION_MAPPING",
        connected_at: new Date().toISOString(),
      },
    });
    await ChannelAssetRuntime.register({
      organization_id: access.organizationId,
      connection_id: connection.id,
      provider: "tripadvisor",
      asset_type: "tripadvisor_location",
      external_id: location.id,
      name: location.name,
      metadata: { address: location.address || null },
    });

    return NextResponse.json({ success: true, connection, location });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Tripadvisor connection failed" }, { status: 500 });
  }
}
