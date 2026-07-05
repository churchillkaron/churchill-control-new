export const AI_DIRECTOR_DECISION_STATUS = {
  DRAFT: "DRAFT",
  REVIEW: "REVIEW",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  EXECUTED: "EXECUTED",
};

export const AI_DIRECTOR_DECISION_TYPES = {
  STRATEGY: "STRATEGY",
  STORYBOARD: "STORYBOARD",
  PRODUCTION_GRAPH: "PRODUCTION_GRAPH",
  EXECUTION_PLAN: "EXECUTION_PLAN",
  COST_OPTIMIZATION: "COST_OPTIMIZATION",
  QUALITY_REVIEW: "QUALITY_REVIEW",
};

export function createAIDirectorDecision(data = {}) {
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

    production_graph_id:
      data.production_graph_id ?? null,

    execution_plan_id:
      data.execution_plan_id ?? null,

    type:
      data.type ?? AI_DIRECTOR_DECISION_TYPES.STRATEGY,

    status:
      data.status ?? AI_DIRECTOR_DECISION_STATUS.DRAFT,

    title:
      data.title ?? "",

    summary:
      data.summary ?? "",

    reasoning:
      data.reasoning ?? [],

    recommendations:
      data.recommendations ?? [],

    risks:
      data.risks ?? [],

    cost_impact: {
      currency:
        data.cost_impact?.currency ?? "USD",
      estimated_cost:
        Number(data.cost_impact?.estimated_cost ?? 0),
      estimated_savings:
        Number(data.cost_impact?.estimated_savings ?? 0),
      requires_approval:
        data.cost_impact?.requires_approval ?? false,
    },

    proposed_changes:
      data.proposed_changes ?? [],

    approved_by:
      data.approved_by ?? null,

    executed_at:
      data.executed_at ?? null,

    metadata:
      data.metadata ?? {},

    created_by:
      data.created_by ?? null,

    created_at: now,

    updated_at: now,
  };
}
