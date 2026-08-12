import {
  CreativeStudioLearningRuntime,
} from "@/lib/creative/learning/runtime/CreativeStudioLearningRuntime";

function text(value) {
  return String(value ?? "").trim();
}

export const LearningEngine = {
  id: "learning",

  async execute(context = {}) {
    const organizationId = text(
      context.organization_id || context.organizationId,
    );
    const projectId = text(
      context.creative_project_id ||
      context.projectId ||
      context.project?.id,
    );
    const brandId = text(
      context.brand_id || context.brandId || context.project?.brand_id,
    );
    const campaignId = text(
      context.campaign_id || context.campaignId || context.project?.campaign_id,
    );

    if (!organizationId || !projectId) {
      return {
        ...context,
        learning: {
          contract: "CREATIVE_STUDIO_LEARNING_V1",
          status: "CONTEXT_REQUIRED",
          provider_execution: false,
          quality_floor_immutable: true,
        },
      };
    }

    const learning = await CreativeStudioLearningRuntime.resolve({
      organization_id: organizationId,
      creative_project_id: projectId,
      brand_id: brandId || null,
      campaign_id: campaignId || null,
      limit: 100,
    });

    return {
      ...context,
      learning,
    };
  },
};
