import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  getGeneralLedger,
} from "@/lib/finance/getGeneralLedger";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const requestedOrganizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");

    const entityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id");

    if (!entityId) {
      return NextResponse.json(
        {
          success: false,
          error: "entityId required",
        },
        { status: 400 }
      );
    }

    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
    });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        { status: access.status }
      );
    }

    const rows = await getGeneralLedger({
      organizationId: access.organizationId,
      entityId,
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      entityId,
      rows,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
