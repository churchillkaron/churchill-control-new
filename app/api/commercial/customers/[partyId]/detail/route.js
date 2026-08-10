export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { getCustomerDetail } from "@/lib/commercial/customers/CustomerDetailService";

function errorResponse(error, status = 500) {
  return NextResponse.json(
    {
      success: false,
      error,
    },
    { status }
  );
}

export async function GET(request, { params }) {
  try {
    const { partyId } = await params;
    const { searchParams } = new URL(request.url);

    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status || 403);
    }

    const entityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id");

    const entity = await resolveEntity({
      organizationId: access.organizationId,
      entityId,
    });

    if (!entity) {
      return errorResponse("Legal entity not found in organisation", 404);
    }

    const detail = await getCustomerDetail({
      organizationId: access.organizationId,
      entityId: entity.id,
      partyId,
      asOfDate:
        searchParams.get("asOfDate") ||
        searchParams.get("as_of_date") ||
        undefined,
    });

    return NextResponse.json({
      success: true,
      organization_id: access.organizationId,
      entity_id: entity.id,
      party_id: partyId,
      row: detail,
      customer: detail,
    });
  } catch (error) {
    const message = error?.message || "Unable to load customer detail";
    const status =
      error?.status ||
      (/required|must be a UUID|active customer/i.test(message)
        ? 400
        : /not found/i.test(message)
          ? 404
          : 500);

    return errorResponse(message, status);
  }
}
