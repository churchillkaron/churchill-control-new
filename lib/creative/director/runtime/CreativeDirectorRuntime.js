import {
  buildCreativePipeline,
} from "../orchestrator/CreativePipelineOrchestrator";

import {
  CreativeIntelligenceRuntime,
} from "@/lib/creative/intelligence/runtime/CreativeIntelligenceRuntime";

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
    const creativePlan =
      await CreativeIntelligenceRuntime.createCreativePlan({
        organization:
          input.organization || {},
        brand:
          input.brand || {},
        industry:
          input.industry || null,
        objective:
          input.objective ||
          input.business_goal ||
          "",
        assets:
          input.assets || [],
        requestedOutputs:
          input.requestedOutputs || [],
      });

    return buildCreativePipeline({
      ...input,
      creativePlan,
    });
  },

  async execute(input = {}) {
    const stateRef = stateInput(input);
    const state =
      await CreativeStateEngine.get(stateRef);

    if (
      state?.stage ===
      PIPELINE_STAGES.COMPLETED
    ) {
      return {
        success: true,
        skipped: true,
        reason: "Mission pipeline already completed.",
      };
    }

    const locked =
      await CreativeStateEngine.acquireExecutionLock(stateRef);

    if (!locked) {
      return {
        success: false,
        reason: "Mission pipeline already running.",
      };
    }

    try {
      const pipeline =
        await buildCreativePipeline(input);

      await CreativeStateEngine.set(
        stateRef,
        PIPELINE_STAGES.PRODUCING,
      );

      const production =
        await ProductionRuntime.runProduction({
          organization_id: input.organization_id,
          creative_mission_id: stateRef.creative_mission_id,
          creative_project_id: stateRef.creative_project_id,
        });

      return {
        success: production.success !== false,
        status: production.status,
        pipeline,
        production,
      };
    } finally {
      await CreativeStateEngine.releaseExecutionLock(stateRef);
    }
  },
};
