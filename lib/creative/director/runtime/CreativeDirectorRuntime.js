import {
  buildCreativePipeline,
} from "../orchestrator/CreativePipelineOrchestrator";

import {
  CreativeShotDirectorRuntime,
} from "./CreativeShotDirectorRuntime";

import {
  ProductionRuntime,
} from "@/lib/creative/production/runtime/ProductionRuntime";

import {
  CreativeStateEngine,
  PIPELINE_STAGES,
} from "@/lib/creative/state/CreativeStateEngine";

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

export const CreativeDirectorRuntime = {
  async build(input = {}) {
    const objective =
      input.objective ||
      input.business_goal ||
      input.brief?.objective ||
      input.brief?.business_goal ||
      "";

    const creativePlan = await CreativeShotDirectorRuntime.direct({
      organization_id: input.organization_id,
      organization: input.organization || {},
      brand: input.brand || {},
      industry: input.industry || null,
      objective,
      brief: input.brief || {},
      assets: input.assets || [],
      requestedOutputs: input.requestedOutputs || [],
      durationSeconds:
        input.durationSeconds ||
        input.duration_seconds ||
        input.brief?.duration_seconds ||
        30,
      platform: input.platform || "multi-channel",
      budgetMode: input.budgetMode || "quality-first",
    });

    return buildCreativePipeline({
      ...input,
      objective,
      creativePlan,
    });
  },

  async execute(input = {}) {
    const stateRef = stateInput(input);
    const state = await CreativeStateEngine.get(stateRef);

    if (state?.stage === PIPELINE_STAGES.COMPLETED) {
      return {
        success: true,
        skipped: true,
        reason: "Mission pipeline already completed.",
      };
    }

    const locked = await CreativeStateEngine.acquireExecutionLock(
      stateRef,
    );

    if (!locked) {
      return {
        success: false,
        reason: "Mission pipeline already running.",
      };
    }

    try {
      const pipeline = await this.build(input);

      await CreativeStateEngine.set(
        stateRef,
        PIPELINE_STAGES.PRODUCING,
      );

      const production = await ProductionRuntime.runProduction({
        organization_id: input.organization_id,
        creative_mission_id: stateRef.creative_mission_id,
        creative_project_id: stateRef.creative_project_id,
      });

      await CreativeStateEngine.set(
        stateRef,
        production.complete
          ? PIPELINE_STAGES.REVIEWING
          : PIPELINE_STAGES.PRODUCING,
      );

      return {
        success:
          pipeline &&
          production.failed === 0 &&
          production.blocked === 0,
        pipeline,
        production,
      };
    } finally {
      await CreativeStateEngine.releaseExecutionLock(stateRef);
    }
  },
};
