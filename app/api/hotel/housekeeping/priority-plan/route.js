import { NextResponse } from "next/server";

import { getHotelHousekeepingPriorityPlan } from "@/lib/hotel/server/getHotelHousekeepingPriorityPlan";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { assertHotelOperationalAccess } from "@/lib/hotel/server/HotelOperationalAccessPolicy";

export const dynamic = "force-dynamic";

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(request) {
  try {
    const organizationId = String(
      request.nextUrl.searchParams.get("organizationId") ||
        request.nextUrl.searchParams.get("organization_id") ||
        "",
    ).trim();
    const propertyId = String(
      request.nextUrl.searchParams.get("propertyId") ||
        request.nextUrl.searchParams.get("property_id") ||
        "",
    ).trim();

    if (!organizationId) return errorResponse("organizationId required", 400);

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return errorResponse(access.error, access.status);
    assertHotelOperationalAccess({ access, area: "HOUSEKEEPING" });

    const plan = await getHotelHousekeepingPriorityPlan({
      organizationId: access.organizationId,
      propertyId: propertyId || null,
    });

    return NextResponse.json({ success: true, ...plan });
  } catch (error) {
    console.error("HOTEL_HOUSEKEEPING_PRIORITY_PLAN_ERROR", error);
    return errorResponse(error?.message || "Housekeeping priority plan failed");
  }
}
