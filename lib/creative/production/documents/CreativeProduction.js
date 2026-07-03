export const PRODUCTION_STATUS = {

  PLANNING: "PLANNING",

  READY: "READY",

  RUNNING: "RUNNING",

  PAUSED: "PAUSED",

  REVIEW: "REVIEW",

  COMPLETED: "COMPLETED",

  FAILED: "FAILED",

};

export function createCreativeProduction(
  data = {}
) {

  const now =
    new Date().toISOString();

  return {

    id:
      crypto.randomUUID(),

    project_id:
      data.project_id,

    deliverable_id:
      data.deliverable_id,

    organization_id:
      data.organization_id,

    status:
      PRODUCTION_STATUS.PLANNING,

    priority:
      data.priority ?? "NORMAL",

    quality:
      data.quality ?? "HIGH",

    render_policy:
      data.render_policy ?? "BALANCED",

    asset_ids:
      data.asset_ids ?? [],

    render_jobs:
      [],

    metadata:
      {},

    created_at:
      now,

    updated_at:
      now,

  };

}
