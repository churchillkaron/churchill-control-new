import {
  CreativeEditReviewRuntime,
} from "@/lib/creative/review/runtime/CreativeEditReviewRuntime";
import {
  CreativePostProductionRuntime,
} from "@/lib/creative/post-production/runtime/CreativePostProductionRuntime";

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
    });

    return {
      ...result,
      contract: CONTRACT,
      edit_review: editReview,
      mastering_started: true,
    };
  },
});

export const CREATIVE_GOVERNED_VIDEO_MASTERING_CONTRACT = CONTRACT;
