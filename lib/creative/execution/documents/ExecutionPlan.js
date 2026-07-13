export const EXECUTION_PLAN_STATUS = {
  DRAFT: "DRAFT",
  PLANNED: "PLANNED",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
};

export const EXECUTION_STEP_STATUS = {
  WAITING: "WAITING",
  READY: "READY",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED",
};

export function createExecutionPlan(data = {}) {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),

    organization_id:
      data.organization_id,

    creative_project_id:
      data.creative_project_id ?? null,

    production_graph_id:
      data.production_graph_id ?? null,

    status:
      EXECUTION_PLAN_STATUS.DRAFT,

    execution_mode:
      data.execution_mode ?? "draft",

    estimated_cost:
      Number(data.estimated_cost ?? 0),

    estimated_minutes:
      Number(data.estimated_minutes ?? 0),

    estimated_tokens:
      Number(data.estimated_tokens ?? 0),

    steps:
      [],

    created_at: now,

    updated_at: now,
  };
}

export function createExecutionStep(data = {}) {
  return {

    id:
      crypto.randomUUID(),

    node_id:
      data.node_id,

    service:
      data.service,

    capability:
      data.capability,

    service_code:
      data.service_code ??
      data.service ??
      null,

    priority:
      data.priority ?? 100,

    depends_on:
      data.depends_on ?? [],

    status:
      EXECUTION_STEP_STATUS.WAITING,

    estimated_cost:
      Number(data.estimated_cost ?? 0),

    estimated_seconds:
      Number(data.estimated_seconds ?? 0),

    metadata:
      data.metadata ?? {},

  };
}
