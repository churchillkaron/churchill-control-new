export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeMasteringInspectionRuntime,
} from "@/lib/creative/post-production/runtime/CreativeMasteringInspectionRuntime";
import {
  CreativeEditReviewRuntime,
} from "@/lib/creative/review/runtime/CreativeEditReviewRuntime";

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

    const [mastering, editReview] = await Promise.all([
      CreativeMasteringInspectionRuntime.inspect({
        organization_id: organizationId,
        creative_project_id: creativeProjectId,
      }),
      CreativeEditReviewRuntime.inspect({
        organization_id: organizationId,
        creative_project_id: creativeProjectId,
      }),
    ]);

    const canRunMastering = Boolean(
      mastering?.can_run_mastering &&
      editReview?.ready_for_master,
    );

    return Response.json({
      success: true,
      mastering: {
        ...mastering,
        edit_review: {
          timeline_asset_node_id: editReview?.timeline?.id || null,
          approved: editReview?.approved === true,
          ready_for_master: editReview?.ready_for_master === true,
          open_comment_count: editReview?.open_comment_count || 0,
          resolved_comment_count: editReview?.resolved_comment_count || 0,
          missing_requirement_count: editReview?.missing_requirement_count || 0,
          approval_record_id: editReview?.edit_approval?.id || null,
        },
        can_run_mastering: canRunMastering,
        mastering_blocker: canRunMastering
          ? null
          : editReview?.ready_for_master
            ? "PRODUCTION_NOT_SETTLED"
            : "EDIT_REVIEW_NOT_APPROVED",
      },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || String(error) },
      { status: 500 },
    );
  }
}
