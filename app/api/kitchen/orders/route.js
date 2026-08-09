import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getWorkCenterOrders } from "@/lib/work-centers/getWorkCenterOrders";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId =
      body.organizationId || body.organization_id || null;

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
          data: [],
        },
        { status: access.status }
      );
    }

    const result = await getWorkCenterOrders({
      organizationId: access.organizationId,
      workCenterId: body.workCenterId || null,
    });

    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load kitchen orders",
        data: [],
      },
      { status: 500 }
    );
  }
}
