import * as Repository from "../repositories/ProductionRepository";
import { ProductionQueueRuntime } from "@/lib/creative/production/queue/runtime/ProductionQueueRuntime";

export const ProductionRuntime = {
  async list(input = {}) {
    return Repository.list(input);
  },

  async get(id) {
    return Repository.get(id);
  },

  async create(document = {}) {
    return Repository.create(document);
  },

  async update(id, values = {}) {
    return Repository.update(id, values);
  },

  async archive(id) {
    return Repository.update(id, {
      archived_at: new Date().toISOString(),
    });
  },

  async resolve(input = {}, permissions = []) {
    const items = await this.list(input);
    const current = items[0] || null;
    return {
      current,
      items,
      commands: ["create", "update", "archive", "runProduction"],
      status: current?.status || "ready",
      permissions,
    };
  },

  async runProduction({ organization_id, creative_project_id }) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const before = await ProductionQueueRuntime.build({
      organization_id,
      creative_project_id,
    });

    if (!before.total) {
      throw new Error("No production tasks exist for this creative project");
    }

    const dispatch = await ProductionQueueRuntime.dispatchAll({
      organization_id,
      creative_project_id,
    });

    const after = await ProductionQueueRuntime.build({
      organization_id,
      creative_project_id,
    });

    return {
      success: after.failed.length === 0,
      dispatched: dispatch.total,
      queue: after,
      assets_created: after.completed.filter((task) => task.output?.asset_id).length,
    };
  },
};
