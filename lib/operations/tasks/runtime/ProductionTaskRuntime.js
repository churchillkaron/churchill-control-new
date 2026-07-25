import {
  createProductionTask,
  PRODUCTION_TASK_STATUS,
} from "../documents/ProductionTask";

import * as Repository
from "../repositories/ProductionTaskRepository";

import {
  runAIService,
} from "@/lib/platform/service-runtime/ai";

import {
  resolveCreativeService,
} from "@/lib/creative/services/CreativeServiceResolver";

import {
  CreativeAssetGraphRuntime,
} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";

function providerOutput(result = {}) {
  return result?.output || result || {};
}

function outputUrl(result = {}) {
  const output = providerOutput(result);
  const nested = output?.output || output;

  return (
    nested?.url ||
    nested?.file_url ||
    nested?.image_url ||
    nested?.video_url ||
    nested?.audio_url ||
    nested?.images?.[0]?.url ||
    nested?.files?.[0]?.url ||
    null
  );
}

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
      error: error?.message || String(error),
      timing: {
        completed_at: new Date().toISOString(),
      },
    });
  },

  async complete(id, output = {}) {
    const task = await Repository.getById(id);
    if (!task) throw new Error("Production task not found");

    const existingAssetNodeId =
      task.output?.asset_node_id ||
      output.asset_node_id ||
      null;
    let assetNode = existingAssetNodeId
      ? { id: existingAssetNodeId }
      : null;

    if (!assetNode && outputUrl(output)) {
      assetNode = await CreativeAssetGraphRuntime.createFromProductionTask({
        task,
        output,
      });
    }

    return Repository.update(id, {
      status: PRODUCTION_TASK_STATUS.COMPLETED,
      output: {
        ...(task.output || {}),
        ...output,
        asset_node_id: assetNode?.id || null,
      },
      timing: {
        ...(task.timing || {}),
        completed_at: new Date().toISOString(),
      },
      error: null,
    });
  },

  async markCompleted(id, output = {}) {
    return this.complete(id, output);
  },

  async dispatch(id) {
    const task = await Repository.getById(id);
    if (!task) throw new Error("Production task not found");

    if (task.status === PRODUCTION_TASK_STATUS.COMPLETED) {
      return task;
    }

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
      const result = await runAIService.execute({
        organization_id: task.organization_id,
        service_id: resolveCreativeService(task),
        provider_id: task.provider_id || null,
        input: task.input,
        metadata: {
          task_id: task.id,
          creative_project_id: task.creative_project_id,
          production_graph_id: task.production_graph_id,
          scene_id: task.scene_id,
          shot_id: task.shot_id,
          operation: task.type,
        },
        provider_policy:
          task.input?.provider_policy ||
          task.metadata?.provider_policy ||
          {},
      });

      if (result?.pending) {
        return Repository.update(id, {
          status: PRODUCTION_TASK_STATUS.RUNNING,
          provider_id: result.provider || task.provider_id || null,
          output: {
            ...(task.output || {}),
            provider_submission: result,
            provider_job_id: result.provider_job_id || null,
            settlement: result.settlement || "RESERVED",
          },
        });
      }

      return this.complete(id, {
        provider_submission: result,
        provider: result.provider || null,
        model: result.model || null,
        pricing: result.pricing || null,
        usage: result.usage || null,
        billing: result.billing || null,
        settlement: result.settlement || "CHARGED",
        output: providerOutput(result),
      });
    } catch (error) {
      return this.fail(id, error);
    }
  },
};
