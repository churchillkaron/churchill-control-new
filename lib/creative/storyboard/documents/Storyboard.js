export const STORYBOARD_STATUS = {
  DRAFT: "DRAFT",
  APPROVED: "APPROVED",
  IN_PRODUCTION: "IN_PRODUCTION",
  COMPLETED: "COMPLETED",
};

export function createStoryboard(data = {}) {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),

    organization_id:
      data.organization_id,

    creative_project_id:
      data.creative_project_id ?? null,

    creative_strategy_id:
      data.creative_strategy_id ?? null,

    status:
      data.status ??
      STORYBOARD_STATUS.DRAFT,

    title:
      data.title ?? "",

    synopsis:
      data.synopsis ?? "",

    total_duration:
      Number(
        data.total_duration ?? 30
      ),

    estimated_cost:
      Number(
        data.estimated_cost ?? 0
      ),

    estimated_render_minutes:
      Number(
        data.estimated_render_minutes ?? 0
      ),

    scenes:
      [],

    metadata:
      data.metadata ?? {},

    created_at: now,

    updated_at: now,
  };
}
