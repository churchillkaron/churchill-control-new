import { randomUUID } from "node:crypto";

import * as Repository from "../repositories/ProductionTaskRepository";

function workerId(kind, taskId) {
  return `creative-production:${kind}:${taskId}:${randomUUID()}`;
}

export const ProductionTaskLeaseRuntime = {
  async claim(taskId, {
    kind = "local",
    lease_seconds = 120,
  } = {}) {
    if (!taskId) throw new Error("PRODUCTION_TASK_ID_REQUIRED");
    const worker_id = workerId(kind, taskId);
    const task = await Repository.claimForExecution(taskId, {
      worker_id,
      lease_seconds,
    });
    return task ? { task, worker_id } : null;
  },

  async release(taskId, worker_id) {
    if (!taskId || !worker_id) return false;
    return Repository.releaseLease(taskId, { worker_id });
  },
};
