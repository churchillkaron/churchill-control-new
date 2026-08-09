import { NextResponse } from "next/server";

import loadOperationalSettings from "@/lib/settings/loadOperationalSettings";
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
      domain: body?.domain,
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      settings,
    });
  } catch (error) {
    console.error("LOAD_SETTINGS_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load settings",
      },
      { status: 500 }
    );
  }
}
