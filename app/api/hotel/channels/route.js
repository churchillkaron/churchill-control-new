import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { HOTEL_CHANNEL_PROVIDERS, getHotelChannelProvider } from "@/lib/hotel/channels/HotelChannelProviderRegistry";

export const dynamic = "force-dynamic";

function clean(value) {
  return String(value ?? "").trim();
}

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

async function authorize(request, organizationId) {
  if (!organizationId) return { success: false, error: "organizationId required", status: 400 };
  return requireOrganizationAccess({ organizationId, request });
}

export async function GET(request) {
  try {
    const organizationId = clean(request.nextUrl.searchParams.get("organizationId") || request.nextUrl.searchParams.get("organization_id"));
    const propertyId = clean(request.nextUrl.searchParams.get("propertyId") || request.nextUrl.searchParams.get("property_id"));
    const access = await authorize(request, organizationId);
    if (!access.success) return errorResponse(access.error, access.status);

    let query = supabaseAdmin
      .from("hotel_channel_connections")
      .select("id,organization_id,property_id,provider,display_name,external_property_id,status,capabilities,settings,last_sync_at,last_success_at,last_error,created_at,updated_at")
      .eq("organization_id", access.organizationId)
      .order("display_name", { ascending: true });
    if (propertyId) query = query.eq("property_id", propertyId);

    const { data, error } = await query;
    if (error) throw error;

    const byProvider = new Map((data || []).map((row) => [row.provider, row]));
    return NextResponse.json({
      success: true,
      providers: HOTEL_CHANNEL_PROVIDERS.map((provider) => ({
        ...provider,
        connection: byProvider.get(provider.id) || null,
      })),
    });
  } catch (error) {
    console.error("HOTEL_CHANNEL_LIST_ERROR", error);
    return errorResponse(error?.message || "Unable to load hotel channels");
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const propertyId = clean(body.propertyId || body.property_id);
    const providerId = clean(body.provider).toLowerCase();
    const externalPropertyId = clean(body.externalPropertyId || body.external_property_id) || null;
    const access = await authorize(request, organizationId);
    if (!access.success) return errorResponse(access.error, access.status);
    if (!propertyId) return errorResponse("propertyId required", 400);

    const provider = getHotelChannelProvider(providerId);
    if (!provider) return errorResponse("Unsupported hotel channel provider", 400);

    const { data: property, error: propertyError } = await supabaseAdmin
      .from("hotel_properties")
      .select("id")
      .eq("organization_id", access.organizationId)
      .eq("id", propertyId)
      .maybeSingle();
    if (propertyError) throw propertyError;
    if (!property) return errorResponse("Property not found for this organization", 404);

    const requestedStatus = clean(body.status).toUpperCase();
    const safeStatus = requestedStatus === "DISCONNECTED" ? "DISCONNECTED" : "PENDING_SETUP";
    const payload = {
      organization_id: access.organizationId,
      property_id: propertyId,
      provider: provider.id,
      display_name: provider.name,
      external_property_id: externalPropertyId,
      status: safeStatus,
      capabilities: Object.fromEntries(provider.supports.map((capability) => [capability.toLowerCase(), true])),
      settings: typeof body.settings === "object" && body.settings ? body.settings : {},
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("hotel_channel_connections")
      .upsert(payload, { onConflict: "organization_id,property_id,provider" })
      .select("id,property_id,provider,display_name,external_property_id,status,capabilities,settings,last_sync_at,last_success_at,last_error,updated_at")
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, connection: data, onboarding: provider.onboarding });
  } catch (error) {
    console.error("HOTEL_CHANNEL_SAVE_ERROR", error);
    return errorResponse(error?.message || "Unable to save hotel channel");
  }
}
