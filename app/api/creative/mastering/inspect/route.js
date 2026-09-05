export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeMasteringInspectionRuntime,
} from "@/lib/creative/post-production/runtime/CreativeMasteringInspectionRuntime";

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
      requiredPermission: "creative.quality.evaluate",
    });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const mastering = await CreativeMasteringInspectionRuntime.inspect({
      organization_id: organizationId,
      creative_project_id: creativeProjectId,
    });

    return Response.json({ success: true, mastering });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || String(error) },
      { status: 500 },
    );
  }
}
