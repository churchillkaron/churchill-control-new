import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

function cleanValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = cleanValue(
      body.organizationId || body.organization_id,
    );
    const propertyId = cleanValue(body.propertyId || body.property_id);
    const guestId = cleanValue(body.guestId || body.guest_id);
    const requestType = cleanValue(body.requestType || body.request_type);

    if (!organizationId) return errorResponse("organizationId required", 400);
    if (!propertyId) return errorResponse("propertyId required", 400);
    if (!guestId) return errorResponse("guestId required", 400);
    if (!requestType) return errorResponse("requestType required", 400);

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) return errorResponse(access.error, access.status);

    const [{ data: property, error: propertyError }, { data: guest, error: guestError }] =
      await Promise.all([
        supabaseAdmin
          .from("hotel_properties")
          .select("id")
          .eq("id", propertyId)
          .eq("organization_id", access.organizationId)
          .maybeSingle(),
        supabaseAdmin
          .from("hotel_guests")
          .select("id")
          .eq("id", guestId)
          .eq("organization_id", access.organizationId)
          .maybeSingle(),
      ]);

    if (propertyError) throw propertyError;
    if (guestError) throw guestError;
    if (!property) return errorResponse("Property not found", 404);
    if (!guest) return errorResponse("Guest not found", 404);

    const status = cleanValue(body.status)?.toUpperCase() || "PENDING";

    const { data: conciergeRequest, error } = await supabaseAdmin
      .from("hotel_concierge_requests")
      .insert({
        organization_id: access.organizationId,
        property_id: propertyId,
        guest_id: guestId,
        request_type: requestType,
        details: cleanValue(body.details),
        status,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      request: conciergeRequest,
    });
  } catch (error) {
    console.error("HOTEL_CONCIERGE_CREATE_ERROR", error);
    return errorResponse(error?.message || "Concierge request creation failed");
  }
}
