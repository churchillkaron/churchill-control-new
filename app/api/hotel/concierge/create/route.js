import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  HotelConciergeRequestError,
  createHotelConciergeRequest,
} from "@/lib/hotel/server/createHotelConciergeRequest";

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

    if (!organizationId) return errorResponse("organizationId required", 400);

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) return errorResponse(access.error, access.status);

    const conciergeRequest = await createHotelConciergeRequest({
      supabase: supabaseAdmin,
      organizationId: access.organizationId,
      propertyId: body.propertyId || body.property_id,
      guestId: body.guestId || body.guest_id,
      requestType: body.requestType || body.request_type,
      details: body.details,
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      request: conciergeRequest,
    });
  } catch (error) {
    console.error("HOTEL_CONCIERGE_CREATE_ERROR", error);
    return errorResponse(
      error?.message || "Concierge request creation failed",
      error instanceof HotelConciergeRequestError ? error.status : 500
    );
  }
}
