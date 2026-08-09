import { NextResponse } from "next/server";

import saveOperationalSettings from "@/lib/settings/saveOperationalSettings";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";

export async function POST(request) {
  try {
    const body = await request.json();

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

    const {
      organizationId,
      organization_id,
      settings: nestedSettings,
      ...flatSettings
    } = body || {};

    const settings = nestedSettings || flatSettings;

    const result = await saveOperationalSettings({
      organizationId: context.organizationId,
      domain: "PAYROLL",
      settings,
    });

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      settings: result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to save payroll settings",
      },
      { status: 500 }
    );
  }
}
