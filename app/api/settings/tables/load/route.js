import { NextResponse } from "next/server";

import loadOperationalSettings from "@/lib/settings/loadOperationalSettings";
import defaultTableSettings from "@/lib/settings/defaultTableSettings";
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

    const settings = await loadOperationalSettings({
      organizationId: access.organizationId,
      domain: "TABLES",
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      settings: {
        ...defaultTableSettings,
        ...(settings || {}),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load table settings",
      },
      { status: 500 }
    );
  }
}
