export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  CreativeDirectorRuntime,
} from "@/lib/creative/director/runtime/CreativeDirectorRuntime";

import {
  CreativeProductionHandoffRuntime,
} from "@/lib/creative/production/runtime/CreativeProductionHandoffRuntime";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(req) {
  try {
    const body = await req.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organization_id,
    });

    if (!access.success) {
      return NextResponse.json(access, {
        status: access.status,
      });
    }

    const result = await CreativeDirectorRuntime.execute(body);
    let autonomous_handoff = null;

    if (
      result?.success !== false &&
      result?.production &&
      body.creative_project_id
    ) {
      autonomous_handoff =
        await CreativeProductionHandoffRuntime.activate({
          organization_id: body.organization_id,
          creative_project_id: body.creative_project_id,
          approved_by:
            body.approved_by ||
            body.approvedBy ||
            access.user?.id ||
            access.user_id ||
            null,
          approval_source:
            body.approval_source ||
            "AUTHENTICATED_RUN_FILM_PRODUCTION",
          production: result.production,
        });
    }

    return NextResponse.json({
      success: true,
      ...result,
      autonomous_handoff,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code || null,
      details: error.details || null,
    }, {
      status: 500,
    });
  }
}
