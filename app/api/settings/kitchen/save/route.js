import { NextResponse } from "next/server";

import saveOperationalSettings from "@/lib/settings/saveOperationalSettings";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId =
      body?.organizationId || body?.organization_id || null;

    const access = await requireOrganizationAccess({
      organizationId,
      request,
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

    const result = await saveOperationalSettings({
      organizationId: access.organizationId,
      domain: "FULFILLMENT",
      settings: body?.settings || {},
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      settings: result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to save kitchen settings",
      },
      { status: 500 }
    );
  }
}
