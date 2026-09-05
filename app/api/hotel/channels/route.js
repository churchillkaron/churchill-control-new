import { NextResponse } from "next/server";

import { buildHotelChannelReadiness } from "@/lib/hotel/channels/HotelChannelReadiness";
import { HOTEL_CHANNEL_PROVIDERS, getHotelChannelProvider } from "@/lib/hotel/channels/HotelChannelProviderRegistry";
import { getHotelChannelTransport, isHotelChannelLiveTransportImplemented } from "@/lib/hotel/channels/HotelChannelTransportRegistry";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

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

function sanitizeConnection(row) {
  if (!row) return null;
  const { credential_secret_ref: credentialSecretRef, ...safe } = row;
  return { ...safe, credential_configured: Boolean(clean(credentialSecretRef)) };
}

function firstByConnection(rows, timestampField) {
  const sorted = [...(rows || [])].sort((a, b) => String(b?.[timestampField] || "").localeCompare(String(a?.[timestampField] || "")));
  const result = new Map();
  for (const row of sorted) if (row?.connection_id && !result.has(row.connection_id)) result.set(row.connection_id, row);
  return result;
}

async function loadEvidence(organizationId, connections) {
  const connectionIds = (connections || []).map((connection) => connection.id).filter(Boolean);
  if (!connectionIds.length) return { mappingCounts: new Map(), transmissions: new Map(), reservations: new Map(), reconciliations: new Map() };

  const [mappingsResult, transmissionsResult, reservationsResult, reconciliationsResult] = await Promise.all([
    supabaseAdmin.from("hotel_channel_mappings").select("connection_id").eq("organization_id", organizationId).eq("active", true).in("connection_id", connectionIds),
    supabaseAdmin.from("hotel_channel_transmissions").select("id,connection_id,provider,status,transmission_type,item_count,date_from,date_to,provider_message_id,provider_ack_code,error_code,error_message,sent_at,acknowledged_at,failed_at,created_at").eq("organization_id", organizationId).in("connection_id", connectionIds).order("created_at", { ascending: false }).limit(500),
    supabaseAdmin.from("hotel_channel_reservation_events").select("id,connection_id,provider,external_reservation_id,event_type,status,booking_id,error_code,error_message,received_at,processed_at,reconciled_at").eq("organization_id", organizationId).in("connection_id", connectionIds).order("received_at", { ascending: false }).limit(500),
    supabaseAdmin.from("hotel_channel_reservation_reconciliations").select("id,connection_id,reservation_event_id,booking_id,status,comparison,reconciled_at").eq("organization_id", organizationId).in("connection_id", connectionIds).order("reconciled_at", { ascending: false }).limit(500),
  ]);

  for (const result of [mappingsResult, transmissionsResult, reservationsResult, reconciliationsResult]) if (result.error) throw result.error;

  const mappingCounts = new Map();
  for (const row of mappingsResult.data || []) mappingCounts.set(row.connection_id, (mappingCounts.get(row.connection_id) || 0) + 1);
  return {
    mappingCounts,
    transmissions: firstByConnection(transmissionsResult.data, "created_at"),
    reservations: firstByConnection(reservationsResult.data, "received_at"),
    reconciliations: firstByConnection(reconciliationsResult.data, "reconciled_at"),
  };
}

export async function GET(request) {
  try {
    const organizationId = clean(request.nextUrl.searchParams.get("organizationId") || request.nextUrl.searchParams.get("organization_id"));
    const propertyId = clean(request.nextUrl.searchParams.get("propertyId") || request.nextUrl.searchParams.get("property_id"));
    const access = await authorize(request, organizationId);
    if (!access.success) return errorResponse(access.error, access.status);

    let query = supabaseAdmin
      .from("hotel_channel_connections")
      .select("id,organization_id,property_id,provider,display_name,external_property_id,status,credential_secret_ref,capabilities,provider_certified,enabled,last_sync_at,last_success_at,last_error,created_at,updated_at")
      .eq("organization_id", access.organizationId)
      .order("display_name", { ascending: true });
    if (propertyId) query = query.eq("property_id", propertyId);

    const { data, error } = await query;
    if (error) throw error;
    const rawConnections = data || [];
    const evidence = propertyId ? await loadEvidence(access.organizationId, rawConnections) : { mappingCounts: new Map(), transmissions: new Map(), reservations: new Map(), reconciliations: new Map() };
    const byProvider = new Map(rawConnections.map((row) => [row.provider, row]));

    return NextResponse.json({
      success: true,
      providers: HOTEL_CHANNEL_PROVIDERS.map((provider) => {
        const rawConnection = byProvider.get(provider.id) || null;
        const connection = sanitizeConnection(rawConnection);
        const transport = getHotelChannelTransport(provider.id);
        const outboundImplemented = Boolean(transport?.implemented && transport?.outboundImplemented && transport?.adapter?.sendAvailability);
        const reservationIngestImplemented = Boolean(transport?.reservationIngestImplemented);
        const transportImplemented = isHotelChannelLiveTransportImplemented(provider.id);
        const mappingCount = connection ? (evidence.mappingCounts.get(connection.id) || 0) : 0;
        const latestTransmission = connection ? (evidence.transmissions.get(connection.id) || null) : null;
        const latestReservationEvent = connection ? (evidence.reservations.get(connection.id) || null) : null;
        const latestReconciliation = connection ? (evidence.reconciliations.get(connection.id) || null) : null;
        return {
          ...provider,
          transport: transport ? {
            implemented: transportImplemented,
            outboundImplemented,
            reservationIngestImplemented,
            inboundAuth: transport.inboundAuth,
            outboundMode: transport.outboundMode,
          } : { implemented: false, outboundImplemented: false, reservationIngestImplemented: false },
          connection,
          evidence: { mappingCount, latestTransmission, latestReservationEvent, latestReconciliation },
          readiness: buildHotelChannelReadiness({ connection, mappingCount, transportImplemented, latestTransmission, latestReservationEvent, latestReconciliation }),
        };
      }),
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
    const access = await authorize(request, organizationId);
    if (!access.success) return errorResponse(access.error, access.status);
    if (!propertyId) return errorResponse("propertyId required", 400);

    const provider = getHotelChannelProvider(providerId);
    if (!provider) return errorResponse("Unsupported hotel channel provider", 400);

    const [{ data: property, error: propertyError }, { data: existing, error: existingError }] = await Promise.all([
      supabaseAdmin.from("hotel_properties").select("id").eq("organization_id", access.organizationId).eq("id", propertyId).maybeSingle(),
      supabaseAdmin.from("hotel_channel_connections").select("id,external_property_id,status").eq("organization_id", access.organizationId).eq("property_id", propertyId).eq("provider", provider.id).maybeSingle(),
    ]);
    if (propertyError) throw propertyError;
    if (existingError) throw existingError;
    if (!property) return errorResponse("Property not found for this organization", 404);

    const requestedStatus = clean(body.status).toUpperCase();
    const requestedExternalPropertyId = clean(body.externalPropertyId || body.external_property_id);
    const payload = {
      organization_id: access.organizationId,
      property_id: propertyId,
      provider: provider.id,
      display_name: provider.name,
      external_property_id: requestedExternalPropertyId || existing?.external_property_id || null,
      status: requestedStatus === "DISCONNECTED" ? "DISCONNECTED" : (existing?.status || "PENDING_SETUP"),
      capabilities: Object.fromEntries(provider.supports.map((capability) => [capability.toLowerCase(), true])),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("hotel_channel_connections")
      .upsert(payload, { onConflict: "organization_id,property_id,provider" })
      .select("id,property_id,provider,display_name,external_property_id,status,credential_secret_ref,capabilities,provider_certified,enabled,last_sync_at,last_success_at,last_error,updated_at")
      .single();
    if (error) throw error;

    return NextResponse.json({
      success: true,
      connection: sanitizeConnection(data),
      onboarding: provider.onboarding,
      governance: "Operator setup cannot self-certify credentials, provider approval, complete transport implementation, OTA acknowledgement, or reservation reconciliation.",
    });
  } catch (error) {
    console.error("HOTEL_CHANNEL_SAVE_ERROR", error);
    return errorResponse(error?.message || "Unable to save hotel channel");
  }
}