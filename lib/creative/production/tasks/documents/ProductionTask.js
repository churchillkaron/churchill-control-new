export const TASK_STATUS = {

  PENDING: "PENDING",

  READY: "READY",

  RUNNING: "RUNNING",

  COMPLETED: "COMPLETED",

  FAILED: "FAILED",

  CANCELLED: "CANCELLED",

};

export function createProductionTask(
  data = {}
) {

  const now =
    new Date().toISOString();

  return {

    id:
      crypto.randomUUID(),

    production_id:
      data.production_id,

    organization_id:
      data.organization_id,

    type:
      data.type,

    title:
      data.title ?? "",

    status:
      TASK_STATUS.PENDING,

    sequence:
      data.sequence ?? 0,

    input:
      data.input ?? {},

    output:
      {},

    metadata:
      {},

    created_at:
      now,

    updated_at:
      now,

  };

}
