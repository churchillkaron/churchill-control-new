import { NextResponse } from "next/server";

import { getHotelArrivalReadinessOwnership } from "@/lib/hotel/server/getHotelArrivalReadinessOwnership";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export const dynamic = "force-dynamic";

function fail(error, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(request) {
  try {
    const organizationId = String(request.nextUrl.searchParams.get("organizationId") || request.nextUrl.searchParams.get("organization_id") || "").trim();
    const propertyId = String(request.nextUrl.searchParams.get("propertyId") || request.nextUrl.searchParams.get("property_id") || "").trim();
    if (!organizationId) return fail("organizationId required");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return fail(access.error, access.status);

    const ownership = await getHotelArrivalReadinessOwnership({
      organizationId: access.organizationId,
      propertyId: propertyId || null,
    });

    return NextResponse.json({ success: true, ...ownership });
  } catch (error) {
    console.error("HOTEL_ARRIVAL_READINESS_OWNERSHIP_ERROR", error);
    return fail(error?.message || "Unable to derive Hotel arrival readiness ownership", 500);
  }
}
