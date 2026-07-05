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

  return {
    id: crypto.randomUUID(),

    organization_id:
      data.organization_id,

    creative_project_id:
      data.creative_project_id ?? null,

    creative_brief_id:
      data.creative_brief_id ?? null,

    creative_strategy_id:
      data.creative_strategy_id ?? null,

    storyboard_id:
      data.storyboard_id ?? null,

    status:
      data.status ?? PRODUCTION_GRAPH_STATUS.DRAFT,

    title:
      data.title ?? "Production Graph",

    description:
      data.description ?? "",

    nodes:
      data.nodes ?? [],

    edges:
      data.edges ?? [],

    cost_plan: {
      currency:
        data.cost_plan?.currency ?? "USD",
      estimated_cost:
        Number(data.cost_plan?.estimated_cost ?? 0),
      approved_cost:
        Number(data.cost_plan?.approved_cost ?? 0),
      reuse_savings:
        Number(data.cost_plan?.reuse_savings ?? 0),
      estimated_render_minutes:
        Number(data.cost_plan?.estimated_render_minutes ?? 0),
      approval_required:
        data.cost_plan?.approval_required ?? true,
      approved:
        data.cost_plan?.approved ?? false,
    },

    production_plan: {
      quality_profile:
        data.production_plan?.quality_profile ?? "balanced",
      draft_first:
        data.production_plan?.draft_first ?? true,
      reuse_assets:
        data.production_plan?.reuse_assets ?? true,
      provider_strategy:
        data.production_plan?.provider_strategy ?? "cost_optimized",
      render_modes:
        data.production_plan?.render_modes ?? ["draft", "review", "production"],
    },

    metadata:
      data.metadata ?? {},

    created_by:
      data.created_by ?? null,

    created_at: now,

    updated_at: now,
  };
}

export function createProductionNode(data = {}) {
  return {
    id:
      data.id ?? crypto.randomUUID(),

    type:
      data.type,

    title:
      data.title ?? "",

    description:
      data.description ?? "",

    duration_seconds:
      Number(data.duration_seconds ?? 0),

    intent:
      data.intent ?? {},

    requirements:
      data.requirements ?? {},

    assets:
      data.assets ?? [],

    generation:
      data.generation ?? {
        required: false,
        service: null,
        provider: null,
        estimated_cost: 0,
        estimated_seconds: 0,
        status: "NOT_REQUIRED",
      },

    quality:
      data.quality ?? {
        score: 0,
        issues: [],
        approved: false,
      },

    metadata:
      data.metadata ?? {},
  };
}

export function createProductionEdge(data = {}) {
  return {
    id:
      data.id ?? crypto.randomUUID(),

    from:
      data.from,

    to:
      data.to,

    type:
      data.type ?? PRODUCTION_EDGE_TYPES.DEPENDS_ON,

    metadata:
      data.metadata ?? {},
  };
}
