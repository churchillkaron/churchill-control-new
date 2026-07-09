export const PRODUCTION_STATUS = {
  PLANNED: "PLANNED",
  READY: "READY",
  RUNNING: "RUNNING",
  REVIEW: "REVIEW",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
};

export function createProduction(data = {}) {
  const now = new Date().toISOString();

  return {
    id:
      data.id || crypto.randomUUID(),

    organization_id:
      data.organization_id,

    creative_project_id:
      data.creative_project_id ?? null,

    execution_plan_id:
      data.execution_plan_id ?? null,

    status:
      data.status || PRODUCTION_STATUS.PLANNED,

    progress:
      Number(data.progress ?? 0),

    metadata:
      data.metadata || {},

    created_at:
      data.created_at || now,

    updated_at:
      now,
  };
}
