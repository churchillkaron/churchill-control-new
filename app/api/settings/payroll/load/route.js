import { NextResponse } from "next/server";

import loadOperationalSettings from "@/lib/settings/loadOperationalSettings";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";

export async function POST(request) {
  try {
    let body = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const context = await resolveAuthenticatedStaffContext({
      request,
      organizationId:
        body?.organizationId || body?.organization_id || null,
    });

    if (!context.success) {
      return NextResponse.json(
        {
          success: false,
          error: context.error,
          code: context.code,
          availableOrganizationIds:
            context.availableOrganizationIds || [],
        },
        { status: context.status || 403 }
      );
    }

    const settings = await loadOperationalSettings({
      organizationId: context.organizationId,
      domain: "PAYROLL",
    });

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      settings: settings || {},
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load payroll settings",
      },
      { status: 500 }
    );
  }
}
