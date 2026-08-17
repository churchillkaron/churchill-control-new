export const CREATIVE_STRATEGY_STATUS = {
  DRAFT: "DRAFT",
  REVIEW: "REVIEW",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
};

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export function createCreativeStrategy(data = {}) {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),

    organization_id:
      data.organization_id,

    campaign_id:
      data.campaign_id ?? null,

    creative_mission_id:
      data.creative_mission_id ?? null,

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
        data.visual_direction?.style ?? null,
      mood:
        data.visual_direction?.mood ?? null,
      lighting:
        data.visual_direction?.lighting ?? null,
      color_palette:
        list(data.visual_direction?.color_palette),
      camera_language:
        list(data.visual_direction?.camera_language),
      ...data.visual_direction,
    },

    production_direction: {
      target_duration:
        positiveNumber(
          data.production_direction?.target_duration ??
          data.duration_seconds
        ),
      format_versions:
        list(data.production_direction?.format_versions),
      quality_profile:
        data.production_direction?.quality_profile ?? null,
      draft_first:
        data.production_direction?.draft_first ?? true,
      reuse_assets:
        data.production_direction?.reuse_assets ?? true,
      ...data.production_direction,
    },

    cost_plan: {
      currency:
        data.cost_plan?.currency ?? null,
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
