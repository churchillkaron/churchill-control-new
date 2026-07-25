export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativePublishCommandRuntime,
} from "@/lib/creative/release/runtime/CreativePublishCommandRuntime";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const readinessReportId =
      body.release_readiness_report_id || body.releaseReadinessReportId;
    const publishTargetId = body.publish_target_id || body.publishTargetId;

    if (!organizationId || !readinessReportId || !publishTargetId) {
      return Response.json(
        {
          success: false,
          error:
            "organization_id, release_readiness_report_id and publish_target_id required",
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

    const result = await CreativePublishCommandRuntime.create({
      organization_id: organizationId,
      release_readiness_report_id: readinessReportId,
      publish_target_id: publishTargetId,
      requested_by: {
        user_id: access.userId,
        staff_account_id: access.staff?.id,
      },
    });

    return Response.json({
      success: true,
      publication_executed: false,
      ...result,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
