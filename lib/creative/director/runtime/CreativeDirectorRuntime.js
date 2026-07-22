import {
  buildCreativePipeline,
} from "../orchestrator/CreativePipelineOrchestrator";

import {
  CreativeShotDirectorRuntime,
} from "./CreativeShotDirectorRuntime";

import {
  enforceCreativeStoryboardPlan,
} from "@/lib/creative/storyboard/runtime/CreativeStoryboardPlanContract";

import {
  convergeCreativeIntegerDurations,
} from "@/lib/creative/storyboard/runtime/CreativeIntegerDurationContract";

import {
  CreativeConceptRuntime,
} from "@/lib/creative/concepts/runtime/CreativeConceptRuntime";

import {
  ProductionRuntime,
} from "@/lib/creative/production/runtime/ProductionRuntime";

import {
  CreativeStateEngine,
  PIPELINE_STAGES,
} from "@/lib/creative/state/CreativeStateEngine";

function stateInput(input = {}) {
  const missionId =
    input.creative_mission_id ||
    input.mission_id ||
    null;
  const projectId =
    input.creative_project_id ||
    input.project_id ||
    null;

  if (!input.organization_id) {
    throw new Error("organization_id required");
  }
  if (!missionId) {
    throw new Error("creative_mission_id required");
  }
  if (!projectId) {
    throw new Error("creative_project_id required");
  }

  return {
    organization_id: input.organization_id,
    creative_mission_id: missionId,
    creative_project_id: projectId,
  };
}

function targetDuration(input = {}) {
  return Number(
    input.durationSeconds ||
    input.duration_seconds ||
    input.brief?.duration_seconds ||
    input.brief?.target_duration ||
    input.project?.target_duration ||
    30,
  );
}

async function persistSelectedConcept({
  input,
  pipeline,
  creativePlan,
}) {
  const scope = stateInput(input);
  const selected = creativePlan.selected_concept || {};
  const existing = await CreativeConceptRuntime.list({
    organization_id: scope.organization_id,
    creative_project_id: scope.creative_project_id,
  });
  const payload = {
    organization_id: scope.organization_id,
    creative_mission_id: scope.creative_mission_id,
    creative_project_id: scope.creative_project_id,
    creative_strategy_id: pipeline.strategy?.id || null,
    title:
      selected.title ||
      creativePlan.title ||
      "Director Selected Concept",
    status: "approved",
    hook: selected.hook || selected.rationale || "",
    message:
      selected.message ||
      creativePlan.brand_promise ||
      creativePlan.story_thesis ||
      "",
    emotion:
      selected.emotion ||
      creativePlan.emotional_arc?.join(" -> ") ||
      "",
    visual_style:
      selected.visual_style ||
      creativePlan.visual_motif ||
      "",
    narrative:
      selected.narrative ||
      creativePlan.logline ||
      creativePlan.story_thesis ||
      "",
    camera_style:
      selected.camera_style ||
      "motivated original commercial cinematography",
    music_style:
      selected.music_style ||
      creativePlan.sound_motif ||
      "",
    voice_style: selected.voice_style || "",
    call_to_action: selected.call_to_action || "",
    target_audience:
      selected.target_audience ||
      creativePlan.target_audience ||
      {},
    revision_reason: existing[0]
      ? "Director regenerated selected concept"
      : "Director persisted selected concept",
    metadata: {
      ...(existing[0]?.metadata || {}),
      source: "creative_director_runtime",
      director_version:
        creativePlan.production_version ||
        "world-class-shot-director-v1",
      selection_rationale: selected.rationale || "",
      source_concepts: creativePlan.concepts || [],
      creative_thesis: creativePlan.story_thesis || "",
      production_bible_version:
        pipeline.storyboard?.version_number || 1,
      storyboard_contract:
        pipeline.storyboard_contract || null,
    },
  };

  if (existing[0]) {
    return CreativeConceptRuntime.update(
      existing[0].id,
      payload,
      scope,
    );
  }

  return CreativeConceptRuntime.create(payload);
}

export const CreativeDirectorRuntime = {
  async build(input = {}) {
    const scope = stateInput(input);
    const objective =
      input.objective ||
      input.business_goal ||
      input.brief?.objective ||
      input.brief?.business_goal ||
      "";
    const duration = targetDuration(input);

    const rawPlan = await CreativeShotDirectorRuntime.direct({
      organization_id: scope.organization_id,
      organization: input.organization || {},
      brand: input.brand || {},
      industry: input.industry || null,
      objective,
      brief: input.brief || {},
      assets: input.assets || [],
      requestedOutputs: input.requestedOutputs || [],
      durationSeconds: duration,
      platform: input.platform || "multi-channel",
      budgetMode: input.budgetMode || "quality-first",
    });

    const storyboardContract = enforceCreativeStoryboardPlan({
      creativePlan: rawPlan,
      targetDuration: duration,
      brief: input.brief || {},
      assets: input.assets || [],
    });

    const creativePlan = convergeCreativeIntegerDurations({
      creativePlan: storyboardContract.creativePlan,
      targetDuration: duration,
    });

    const pipeline = await buildCreativePipeline({
      ...input,
      ...scope,
      objective,
      creativePlan,
    });
    const concept = await persistSelectedConcept({
      input: {
        ...input,
        ...scope,
      },
      pipeline: {
        ...pipeline,
        storyboard_contract: storyboardContract.report,
      },
      creativePlan,
    });

    return {
      ...pipeline,
      concept,
      storyboard_contract: {
        ...storyboardContract.report,
        target_duration_seconds: Math.round(duration),
        total_duration_seconds:
          creativePlan.scenes.reduce(
            (total, scene) =>
              total + Number(scene.duration_seconds || 0),
            0,
          ),
        integer_duration_contract: true,
      },
      plan_only: true,
      production_dispatched: false,
      lineage: {
        strategy_version: pipeline.strategy?.version_number || 1,
        concept_version: concept.version_number || 1,
        storyboard_version: pipeline.storyboard?.version_number || 1,
        production_graph_version: pipeline.graph?.version_number || 1,
      },
    };
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
        organization_id: stateRef.organization_id,
        creative_mission_id: stateRef.creative_mission_id,
        creative_project_id: stateRef.creative_project_id,
        max_cycles: input.max_cycles || 1,
      });

      await CreativeStateEngine.set(
        stateRef,
        production.complete
          ? PIPELINE_STAGES.REVIEWING
          : PIPELINE_STAGES.PRODUCING,
      );

      return {
        success:
          Boolean(pipeline) &&
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
