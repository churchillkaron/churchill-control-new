import "@/lib/creative/video/runtime/CreativeVideoProductionDispatchBootstrap";
import "@/lib/creative/quality/runtime/CreativeShotCandidateQualityGateBootstrap";

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

    const input = {
      organization_id,
      creative_project_id,
    };
    const before = await ProductionQueueRuntime.build(input);

    if (!before.total) {
      throw new Error("No production tasks exist for this creative project");
    }

    const dispatch = await ProductionQueueRuntime.dispatchAll(input);
    const after = dispatch.queue || await ProductionQueueRuntime.build(input);
    const finalisation = dispatch.finalisation || dispatch.post_production || null;
    const finalisationPassed = finalisation
      ? finalisation.success !== false && finalisation.passed !== false
      : null;
    const queueSettled =
      after.running.length === 0 &&
      after.ready.length === 0 &&
      after.waiting.length === 0;
    const assetsCreated = after.completed.filter((task) =>
      Boolean(task.output?.asset_node_id || task.output?.asset_id),
    ).length;
    const success =
      after.failed.length === 0 &&
      after.blocked.length === 0 &&
      (!queueSettled || finalisationPassed === true);

    return {
      success,
      complete: queueSettled && finalisationPassed === true,
      status:
        finalisation?.status ||
        (after.running.length ? "PROVIDER_JOBS_RUNNING" :
          after.ready.length || after.waiting.length ? "PRODUCTION_IN_PROGRESS" :
            after.failed.length || after.blocked.length ? "PRODUCTION_BLOCKED" :
              finalisationPassed === false ? "FINALISATION_BLOCKED" :
                "PRODUCTION_SETTLED"),
      dispatched: dispatch.total,
      polled: dispatch.poll_total || 0,
      passes: dispatch.passes || 0,
      queue: after,
      assets_created: assetsCreated,
      finalisation,
      post_production: finalisation,
    };
  },
};