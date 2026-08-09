import { NextResponse } from "next/server";

import loadOperationalSettings from "@/lib/settings/loadOperationalSettings";
import saveOperationalSettings from "@/lib/settings/saveOperationalSettings";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

async function resolveAccess(request, body = {}) {
  const organizationId =
    body?.organizationId || body?.organization_id || null;

  return requireOrganizationAccess({
    organizationId,
    request,
  });
}

function accessFailure(access) {
  return NextResponse.json(
    {
      success: false,
      error: access.error,
    },
    { status: access.status }
  );
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await resolveAccess(request, body);

    if (!access.success) {
      return accessFailure(access);
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

export async function PUT(request) {
  try {
    const body = await request.json();
    const access = await resolveAccess(request, body);

    if (!access.success) {
      return accessFailure(access);
    }

    const result = await saveOperationalSettings({
      organizationId: access.organizationId,
      domain: body?.domain,
      settings: body?.settings || {},
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      settings: result,
    });
  } catch (error) {
    console.error("SAVE_SETTINGS_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to save settings",
      },
      { status: 500 }
    );
  }
}
