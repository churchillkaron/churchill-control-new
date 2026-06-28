import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import generateTrialBalance from "@/lib/finance/reporting/reports/generateTrialBalance";

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

    const result = await generateTrialBalance({
      organization_id: access.organizationId,
      entity_id: entityId,
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
    });

    return NextResponse.json(result);
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
