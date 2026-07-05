export const CREATIVE_BRIEF_STATUS = {
  DRAFT: "DRAFT",
  APPROVED: "APPROVED",
  IN_PRODUCTION: "IN_PRODUCTION",
  COMPLETED: "COMPLETED",
};

export function createCreativeBrief(data = {}) {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),

    organization_id: data.organization_id,

    creative_project_id:
      data.creative_project_id ?? null,

    status:
      CREATIVE_BRIEF_STATUS.DRAFT,

    title:
      data.title ?? "",

    business_goal:
      data.business_goal ?? "",

    campaign_goal:
      data.campaign_goal ?? "",

    target_audience:
      data.target_audience ?? {},

    offer:
      data.offer ?? {},

    products:
      data.products ?? [],

    markets:
      data.markets ?? [],

    languages:
      data.languages ?? ["en"],

    channels:
      data.channels ?? [],

    duration_seconds:
      Number(data.duration_seconds ?? 30),

    tone:
      data.tone ?? "professional",

    emotion:
      data.emotion ?? "trust",

    call_to_action:
      data.call_to_action ?? "",

    budget: {
      currency: "USD",
      max_cost: 0,
      estimated_cost: 0,
      approved: false,
    },

    production: {
      quality: "balanced",
      reuse_assets: true,
      draft_first: true,
    },

    metadata:
      data.metadata ?? {},

    created_by:
      data.created_by ?? null,

    created_at: now,

    updated_at: now,
  };
}
