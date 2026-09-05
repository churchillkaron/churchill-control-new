export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativePublishingInspectionRuntimeV3,
} from "@/lib/creative/release/runtime/CreativePublishingInspectionRuntimeV3";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const creativeProjectId =
      body.creative_project_id || body.creativeProjectId;

    if (!organizationId || !creativeProjectId) {
      return Response.json(
        {
          success: false,
          error: "organization_id and creative_project_id required",
        },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission: "creative.release.publish",
    });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const publishing = await CreativePublishingInspectionRuntimeV3.inspect({
      organization_id: organizationId,
      creative_project_id: creativeProjectId,
    });

    return Response.json({
      success: true,
      publishing,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || String(error),
      },
      { status: 500 },
    );
  }
}
