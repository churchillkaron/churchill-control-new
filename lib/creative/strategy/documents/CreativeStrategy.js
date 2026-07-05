export const CREATIVE_STRATEGY_STATUS = {
  DRAFT: "DRAFT",
  REVIEW: "REVIEW",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
};

export function createCreativeStrategy(data = {}) {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),

    organization_id:
      data.organization_id,

    creative_project_id:
      data.creative_project_id ?? null,

    creative_brief_id:
      data.creative_brief_id ?? null,

    status:
      data.status ?? CREATIVE_STRATEGY_STATUS.DRAFT,

    title:
      data.title ?? "",

    objective:
      data.objective ?? "",

    audience_insight:
      data.audience_insight ?? "",

    creative_angle:
      data.creative_angle ?? "",

    core_message:
      data.core_message ?? "",

    story_direction:
      data.story_direction ?? "",

    visual_direction: {
      style:
        data.visual_direction?.style ?? "cinematic",
      mood:
        data.visual_direction?.mood ?? "premium",
      lighting:
        data.visual_direction?.lighting ?? "natural",
      color_palette:
        data.visual_direction?.color_palette ?? [],
      camera_language:
        data.visual_direction?.camera_language ?? [],
    },

    production_direction: {
      target_duration:
        Number(
          data.production_direction?.target_duration ??
          data.duration_seconds ??
          30
        ),
      format_versions:
        data.production_direction?.format_versions ??
        ["9:16", "1:1", "16:9"],
      quality_profile:
        data.production_direction?.quality_profile ??
        "balanced",
      draft_first:
        data.production_direction?.draft_first ?? true,
      reuse_assets:
        data.production_direction?.reuse_assets ?? true,
    },

    cost_plan: {
      currency:
        data.cost_plan?.currency ?? "USD",
      max_cost:
        Number(data.cost_plan?.max_cost ?? 0),
      estimated_cost:
        Number(data.cost_plan?.estimated_cost ?? 0),
      reuse_savings:
        Number(data.cost_plan?.reuse_savings ?? 0),
      approved:
        data.cost_plan?.approved ?? false,
    },

    risks:
      data.risks ?? [],

    recommendations:
      data.recommendations ?? [],

    metadata:
      data.metadata ?? {},

    created_by:
      data.created_by ?? null,

    created_at: now,

    updated_at: now,
  };
}
