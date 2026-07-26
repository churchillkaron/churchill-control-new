export const PRODUCTION_GRAPH_STATUS = {
  DRAFT: "DRAFT",
  PLANNED: "PLANNED",
  APPROVED: "APPROVED",
  IN_PRODUCTION: "IN_PRODUCTION",
  COMPLETED: "COMPLETED",
};

export const PRODUCTION_NODE_TYPES = {
  SCENE: "SCENE",
  SHOT: "SHOT",
  CAMERA: "CAMERA",
  LIGHTING: "LIGHTING",
  CHARACTER: "CHARACTER",
  PRODUCT: "PRODUCT",
  LOCATION: "LOCATION",
  ASSET: "ASSET",
  VOICE: "VOICE",
  MUSIC: "MUSIC",
  SOUND: "SOUND",
  SUBTITLE: "SUBTITLE",
  TRANSITION: "TRANSITION",
  EFFECT: "EFFECT",
  RENDER: "RENDER",
  PUBLISH: "PUBLISH",
};

export const PRODUCTION_EDGE_TYPES = {
  CONTAINS: "CONTAINS",
  DEPENDS_ON: "DEPENDS_ON",
  USES: "USES",
  GENERATES: "GENERATES",
  FOLLOWS: "FOLLOWS",
  REPLACES: "REPLACES",
};

export function createProductionGraph(data = {}) {
  const now = new Date().toISOString();
  const costPlan = data.cost_plan || {};
  const productionPlan = data.production_plan || {};

  return {
    id: data.id || crypto.randomUUID(),
    organization_id: data.organization_id,
    creative_project_id: data.creative_project_id ?? null,
    creative_brief_id: data.creative_brief_id ?? null,
    creative_strategy_id: data.creative_strategy_id ?? null,
    storyboard_id: data.storyboard_id ?? null,
    status: data.status ?? PRODUCTION_GRAPH_STATUS.DRAFT,
    title: data.title ?? "",
    description: data.description ?? "",
    nodes: data.nodes ?? [],
    edges: data.edges ?? [],
    cost_plan: {
      ...costPlan,
      currency: costPlan.currency ?? null,
      estimated_cost: Number(costPlan.estimated_cost ?? 0),
      approved_cost: Number(costPlan.approved_cost ?? 0),
      reuse_savings: Number(costPlan.reuse_savings ?? 0),
      estimated_render_minutes: Number(costPlan.estimated_render_minutes ?? 0),
      approval_required: costPlan.approval_required ?? null,
      approved: costPlan.approved ?? null,
    },
    production_plan: {
      ...productionPlan,
      quality_profile: productionPlan.quality_profile ?? null,
      draft_first: productionPlan.draft_first ?? null,
      reuse_assets: productionPlan.reuse_assets ?? null,
      provider_strategy: productionPlan.provider_strategy ?? null,
      render_modes: Array.isArray(productionPlan.render_modes)
        ? productionPlan.render_modes
        : [],
    },
    metadata: data.metadata ?? {},
    created_by: data.created_by ?? null,
    created_at: data.created_at || now,
    updated_at: now,
  };
}

export function createProductionNode(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    type: data.type,
    title: data.title ?? "",
    description: data.description ?? "",
    duration_seconds: Number(data.duration_seconds ?? 0),
    intent: data.intent ?? {},
    requirements: data.requirements ?? {},
    assets: data.assets ?? [],
    generation: data.generation ?? {
      required: false,
      service: null,
      capability: null,
      provider: null,
      estimated_cost: 0,
      estimated_seconds: 0,
      status: "NOT_REQUIRED",
    },
    quality: data.quality ?? {
      score: null,
      issues: [],
      approved: false,
    },
    metadata: data.metadata ?? {},
  };
}

export function createProductionEdge(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    from: data.from,
    to: data.to,
    type: data.type ?? PRODUCTION_EDGE_TYPES.DEPENDS_ON,
    metadata: data.metadata ?? {},
  };
}
