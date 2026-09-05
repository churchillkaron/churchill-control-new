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
import {
  CreativeDeliveryAudioQualityRuntime,
} from "@/lib/creative/quality/runtime/CreativeDeliveryAudioQualityRuntime";
import {
  CreativeDeliveryMasterConformanceRuntime,
} from "@/lib/creative/quality/runtime/CreativeDeliveryMasterConformanceRuntime";

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

    const [deliveryAudio, deliveryMaster] = mastering?.render?.id
      ? await Promise.all([
          CreativeDeliveryAudioQualityRuntime.inspect({
            organization_id: organizationId,
            render_asset_node_id: mastering.render.id,
          }),
          CreativeDeliveryMasterConformanceRuntime.inspect({
            organization_id: organizationId,
            render_asset_node_id: mastering.render.id,
          }),
        ])
      : [null, null];

    const canRunMastering = Boolean(
      mastering?.can_run_mastering &&
      editReview?.ready_for_master,
    );
    const audioApprovalReady = Boolean(
      !deliveryAudio?.required || deliveryAudio?.passed === true,
    );
    const deliveryMasterReady = Boolean(
      !deliveryMaster?.required || deliveryMaster?.passed === true,
    );
    const canApproveFinalRender = Boolean(
      mastering?.can_approve_final_render &&
      audioApprovalReady &&
      deliveryMasterReady,
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
        delivery_audio: deliveryAudio,
        delivery_master: deliveryMaster,
        can_run_mastering: canRunMastering,
        can_approve_final_render: canApproveFinalRender,
        mastering_blocker: canRunMastering
          ? null
          : editReview?.ready_for_master
            ? "PRODUCTION_NOT_SETTLED"
            : "EDIT_REVIEW_NOT_APPROVED",
        final_approval_blocker: canApproveFinalRender
          ? null
          : deliveryMaster?.required && !deliveryMasterReady
            ? deliveryMaster.blocker || "DELIVERY_MASTER_CONFORMANCE_REQUIRED"
            : deliveryAudio?.required && !audioApprovalReady
              ? deliveryAudio.blocker || "DELIVERY_AUDIO_QC_REQUIRED"
              : mastering?.can_approve_final_render
                ? null
                : "MASTER_NOT_READY_FOR_APPROVAL",
      },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || String(error) },
      { status: 500 },
    );
  }
}
