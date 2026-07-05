import {
  CreativeStateEngine,
  PIPELINE_STAGES,
} from "@/lib/creative/state/CreativeStateEngine";

import {
  ProductionQueueRuntime,
} from "@/lib/creative/production/queue/runtime/ProductionQueueRuntime";

import {
  CreativeJobRuntime,
} from "@/lib/creative/jobs/runtime/CreativeJobRuntime";

import {
  getCreativeProvider,
} from "@/lib/creative/providers/ProviderFactory";

import {
  CreativeProviderExecutor,
} from "@/lib/creative/providers/runtime/CreativeProviderExecutor";

function stateInput(input = {}) {
  return {
    organization_id: input.organization_id,
    creative_mission_id:
      input.creative_mission_id ||
      input.mission_id ||
      input.creative_project_id,
    creative_project_id:
      input.creative_project_id ||
      input.project_id ||
      input.creative_mission_id ||
      input.mission_id,
  };
}

export const CreativeOrchestrationWorker = {
  async runMission(input = {}) {
    const ref = stateInput(input);

    const state =
      await CreativeStateEngine.get(ref);

    if (state?.execution_lock) {
      return {
        success: false,
        skipped: true,
        reason: "Mission is locked by active execution.",
      };
    }

    await CreativeStateEngine.acquireExecutionLock(ref);

    try {
      await CreativeStateEngine.set(
        ref,
        PIPELINE_STAGES.PRODUCING
      );

      const queue =
        await ProductionQueueRuntime.dispatchAll({
          organization_id: input.organization_id,
          creative_mission_id: ref.creative_mission_id,
          creative_project_id: ref.creative_project_id,
        });

      const polled =
        await CreativeJobRuntime.poll(
          getCreativeProvider,
          {
            organization_id: input.organization_id,
            creative_mission_id: ref.creative_mission_id,
            creative_project_id: ref.creative_project_id,
          },
        );

      const assets =
        await CreativeProviderExecutor.processAll({
          organization_id: input.organization_id,
          creative_mission_id: ref.creative_mission_id,
          creative_project_id: ref.creative_project_id,
        });

      await CreativeStateEngine.set(
        ref,
        PIPELINE_STAGES.REVIEWING
      );

      return {
        success: true,
        queue,
        jobs_polled: polled.length,
        assets_created: assets.filter(Boolean).length,
      };
    } finally {
      await CreativeStateEngine.releaseExecutionLock(ref);
    }
  },

  async runProject(input = {}) {
    return this.runMission(input);
  },
};
