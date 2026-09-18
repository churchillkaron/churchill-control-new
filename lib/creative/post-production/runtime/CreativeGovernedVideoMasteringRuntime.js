import {
  CreativeEditReviewRuntime,
} from "@/lib/creative/review/runtime/CreativeEditReviewRuntime";
import {
  CreativePostProductionRuntime,
} from "@/lib/creative/post-production/runtime/CreativePostProductionRuntime";
import {
  CreativeTemporal4KDeliveryTaskRuntime,
} from "@/lib/creative/upscale/runtime/CreativeTemporal4KDeliveryTaskRuntime";
import {
  CreativeTemporal4KReviewTaskRuntime,
} from "@/lib/creative/upscale/runtime/CreativeTemporal4KReviewTaskRuntime";

const CONTRACT = "CREATIVE_GOVERNED_VIDEO_MASTERING_V1";

export const CreativeGovernedVideoMasteringRuntime = Object.freeze({
  contract: CONTRACT,

  async run({ organization_id, creative_project_id } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const editReview = await CreativeEditReviewRuntime.gate({
      organization_id,
      creative_project_id,
    });

    if (editReview.ready !== true) {
      return {
        success: false,
        passed: false,
        status: "AWAITING_EDIT_REVIEW",
        contract: CONTRACT,
        timeline: editReview.timeline || null,
        edit_review: editReview,
        mastering_started: false,
        render_started: false,
      };
    }

    const result = await CreativePostProductionRuntime.run({
      organization_id,
      creative_project_id,
      approved_timeline_asset_node_id: editReview.timeline.id,
    });

    if (!result?.render || !["READY_FOR_APPROVAL", "REVIEW_REQUIRED"].includes(result.status)) {
      return {
        ...result,
        contract: CONTRACT,
        edit_review: editReview,
        mastering_started: true,
        approved_timeline_asset_node_id: editReview.timeline.id,
        picture_lock_preserved: true,
        semantic_recomposition_forbidden: true,
      };
    }

    const delivery = await CreativeTemporal4KDeliveryTaskRuntime.ensure({
      organization_id,
      creative_project_id,
      source_render: result.render,
    });
    const deliveryReviews = await CreativeTemporal4KReviewTaskRuntime.ensure({
      organization_id,
      creative_project_id,
    });

    if (delivery.status !== "READY_4K") {
      return {
        ...result,
        success: false,
        passed: false,
        status: delivery.status,
        contract: CONTRACT,
        edit_review: editReview,
        mastering_started: true,
        approved_timeline_asset_node_id: editReview.timeline.id,
        picture_lock_preserved: true,
        semantic_recomposition_forbidden: true,
        pre_4k_master_render: result.render,
        temporal_4k_delivery: delivery,
        temporal_4k_reviews: deliveryReviews,
        final_4k_verified: false,
      };
    }

    return {
      ...result,
      render: delivery.delivery_render,
      contract: CONTRACT,
      edit_review: editReview,
      mastering_started: true,
      approved_timeline_asset_node_id: editReview.timeline.id,
      picture_lock_preserved: true,
      semantic_recomposition_forbidden: true,
      pre_4k_master_render: result.render,
      temporal_4k_delivery: delivery,
      temporal_4k_reviews: deliveryReviews,
      final_4k_verified: true,
    };
  },
});

export const CREATIVE_GOVERNED_VIDEO_MASTERING_CONTRACT = CONTRACT;
