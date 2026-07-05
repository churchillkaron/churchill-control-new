import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
} from "../documents/CreativeAssetNode";

import * as Repository from "../repositories/CreativeAssetGraphRepository";

export const CreativeAssetGraphRuntime = {
  async list(input = {}) {
    return Repository.listByProject(input);
  },

  async create(input = {}) {
    const node = createCreativeAssetNode(input);
    return Repository.create(node);
  },

  async createFromProductionTask({
    task,
    output = {},
  }) {
    return this.create({
      organization_id: task.organization_id,
      creative_project_id: task.creative_project_id,
      production_task_id: task.id,
      type: output.type || "IMAGE",
      status: CREATIVE_ASSET_NODE_STATUS.GENERATED,
      name: output.name || task.title || "Generated Asset",
      description: output.description || task.description || "",
      url: output.url || null,
      storage_path: output.storage_path || null,
      lineage: {
        source: "production_task",
        provider_id: task.provider_id,
        capability: task.capability,
        generation_version: 1,
      },
      cost: {
        currency: task.cost?.currency || "USD",
        estimated: Number(task.cost?.estimated || 0),
        actual: Number(task.cost?.actual || 0),
        saved_by_reuse: 0,
      },
      metadata: {
        task_type: task.type,
        task_output: output,
      },
    });
  },

  async findReusable(input = {}) {
    return Repository.findReusable(input);
  },

  async approveForReuse(id, approvedBy = null) {
    return Repository.update(id, {
      status: CREATIVE_ASSET_NODE_STATUS.APPROVED,
      reuse: {
        approved_for_reuse: true,
        reusable: true,
      },
      review: {
        ai_reviewed: true,
        human_reviewed: true,
        approved: true,
        approved_by: approvedBy,
      },
    });
  },
};
