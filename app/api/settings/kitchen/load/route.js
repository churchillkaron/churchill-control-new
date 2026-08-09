import { NextResponse } from "next/server";

import loadOperationalSettings from "@/lib/settings/loadOperationalSettings";
import defaultKitchenSettings from "@/lib/settings/defaultKitchenSettings";
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
      domain: "FULFILLMENT",
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      settings: {
        ...defaultKitchenSettings,
        ...(settings || {}),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load kitchen settings",
      },
      { status: 500 }
    );
  }
}
