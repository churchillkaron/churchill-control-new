export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { listFinanceDimensions } from "@/lib/finance/dimensions/FinanceDimensionPolicy";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const entityId =
      searchParams.get("entityId") || searchParams.get("entity_id") || null;
    const result = await listFinanceDimensions({
      organizationId: access.organizationId,
      entityId,
    });

    return NextResponse.json({
      success: true,
      rows: result.dimensions,
      dimensions: result.dimensions,
      dimensionValues: result.values,
      totalDimensions: result.dimensions.length,
      totalValues: result.values.length,
    });
  } catch (error) {
    const message = error?.message || "Dimensions could not be loaded";
    return NextResponse.json(
      { success: false, error: message },
      { status: /required|entity/i.test(message) ? 400 : 500 }
    );
  }
}
