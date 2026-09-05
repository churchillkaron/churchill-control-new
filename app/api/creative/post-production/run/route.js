export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  CreativeGovernedVideoMasteringRuntime,
} from "@/lib/creative/post-production/runtime/CreativeGovernedVideoMasteringRuntime";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organization_id,
    });

    if (!access.success) {
      return NextResponse.json(access, {
        status: access.status,
      });
    }

    const result = await CreativeGovernedVideoMasteringRuntime.run({
      organization_id: body.organization_id,
      creative_project_id: body.creative_project_id,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error?.message || String(error),
    }, {
      status: 500,
    });
  }
}
