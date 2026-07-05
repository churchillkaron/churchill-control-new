import {
  createProductionTask,
  PRODUCTION_TASK_STATUS,
} from "../documents/ProductionTask";

import * as Repository from "../repositories/ProductionTaskRepository";

import {
  CreativeProviderRuntime,
} from "@/lib/creative/providers/runtime/CreativeProviderRuntime";

export const ProductionTaskRuntime = {
  async list(input = {}) {
    return Repository.listByProject(input);
  },

  async get(id) {
    return Repository.getById(id);
  },

  async create(input = {}) {
    const task = createProductionTask(input);
    return Repository.create(task);
  },

  async update(id, values = {}) {
    return Repository.update(id, values);
  },

  async markReady(id) {
    return Repository.update(id, {
      status: PRODUCTION_TASK_STATUS.READY,
    });
  },

  async fail(id, error) {
    return Repository.update(id, {
      status: PRODUCTION_TASK_STATUS.FAILED,
      error: error?.message || String(error || "Task failed"),
    });
  },

  async complete(id, output = {}) {
    const task = await Repository.getById(id);

    return Repository.update(id, {
      status: PRODUCTION_TASK_STATUS.COMPLETED,
      output: {
        ...(task.output || {}),
        ...output,
      },
      timing: {
        ...(task.timing || {}),
        completed_at: new Date().toISOString(),
      },
    });
  },

  async markCompleted(id, output = {}) {
    return this.complete(id, output);
  },

  async dispatch(id) {
    const task = await Repository.getById(id);

    await Repository.update(id, {
      status: PRODUCTION_TASK_STATUS.RUNNING,
      timing: {
        ...(task.timing || {}),
        started_at:
          task.timing?.started_at ||
          new Date().toISOString(),
      },
    });

    try {
      const result =
        await CreativeProviderRuntime.executeTask({
          task,
          preferredProvider:
            task.provider_id ||
            task.metadata?.provider_id ||
            null,
        });

      return Repository.update(id, {
        status:
          result.status === "COMPLETED"
            ? PRODUCTION_TASK_STATUS.REVIEW
            : PRODUCTION_TASK_STATUS.RUNNING,
        output: {
          ...(task.output || {}),
          provider_job_id:
            result.provider_job_id,
          provider_submission:
            result,
        },
      });
    } catch (error) {
      return this.fail(id, error);
    }
  },
};
