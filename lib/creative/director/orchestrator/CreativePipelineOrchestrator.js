import {
  ResearchRuntime,
} from "@/lib/creative/research/runtime/ResearchRuntime";

import {
  CreativeStrategyRuntime,
} from "@/lib/creative/strategy/runtime/CreativeStrategyRuntime";

import {
  StoryboardRuntime,
} from "@/lib/creative/storyboard/runtime/StoryboardRuntime";

import {
  SceneRuntime,
} from "@/lib/creative/scenes/runtime/SceneRuntime";

import {
  ShotRuntime,
} from "@/lib/creative/shots/runtime/ShotRuntime";

import {
  ProductionGraphRuntime,
} from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";

import {
  ExecutionRuntime,
} from "@/lib/creative/execution/runtime/ExecutionRuntime";

import {
  AssetReuseEngine,
} from "@/lib/creative/assets/reuse/AssetReuseEngine";

import {
  CreativeStateEngine,
  PIPELINE_STAGES,
} from "@/lib/creative/state/CreativeStateEngine";

function resolveMissionId(input = {}) {
  return (
    input.creative_mission_id ||
    input.mission_id ||
    input.creative_project_id
  );
}

function resolveProjectId(input = {}) {
  return (
    input.creative_project_id ||
    input.project_id ||
    input.creative_mission_id ||
    input.mission_id
  );
}

export async function buildCreativePipeline(input = {}) {
  const {
    organization_id,
    brief,
    creativePlan,
  } = input;

  const creative_mission_id = resolveMissionId(input);
  const creative_project_id = resolveProjectId(input);

  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!creative_mission_id && !creative_project_id) {
    throw new Error("creative_mission_id or creative_project_id required");
  }

  const stateInput = {
    organization_id,
    creative_mission_id,
    creative_project_id,
  };

  let state = await CreativeStateEngine.get(stateInput);

  if (!state) {
    state = await CreativeStateEngine.init(stateInput);
  }

  await CreativeStateEngine.set(
    stateInput,
    PIPELINE_STAGES.UNDERSTANDING
  );

  await CreativeStateEngine.set(
    stateInput,
    PIPELINE_STAGES.RESEARCHING
  );

  const research =
    await ResearchRuntime.runResearch(
      {
        id: creative_project_id,
        creative_mission_id,
      },
      {
        brief,
        creativePlan,
      },
      {
        run: async () => ({
          summary: "",
        }),
      },
    );

  await CreativeStateEngine.set(
    stateInput,
    PIPELINE_STAGES.BUILDING_STRATEGY
  );

  const strategy =
    await CreativeStrategyRuntime.create({
      organization_id,
      creative_mission_id,
      creative_project_id,
      research_id: research.id,
    });

  await CreativeStateEngine.set(
    stateInput,
    PIPELINE_STAGES.BUILDING_CONCEPT
  );

  const concept = {
    id: `concept_${creative_mission_id || creative_project_id}`,
    organization_id,
    creative_mission_id,
    creative_project_id,
    creative_strategy_id: strategy.id,
    status: "planned",
    source: "mission_lifecycle",
  };

  await CreativeStateEngine.set(
    stateInput,
    PIPELINE_STAGES.BUILDING_STORYBOARD
  );

  const storyboard =
    await StoryboardRuntime.create({
      organization_id,
      creative_mission_id,
      creative_project_id,
      creative_strategy_id: strategy.id,
      creative_concept_id: concept.id,
      creative_plan: creativePlan || null,
    });

  const scenes =
    await SceneRuntime.list({
      organization_id,
      creative_mission_id,
      creative_project_id,
    });

  const shots =
    await ShotRuntime.list({
      organization_id,
      creative_mission_id,
      creative_project_id,
    });

  await CreativeStateEngine.set(
    stateInput,
    PIPELINE_STAGES.PLANNING_PRODUCTION
  );

  const graph =
    await ProductionGraphRuntime.plan({
      organization_id,
      creative_mission_id,
      creative_project_id,
      storyboard,
      scenes,
      shots,
      creative_plan: creativePlan || null,
    });

  const optimizedGraph =
    await AssetReuseEngine.optimizeGraph({
      organization_id,
      graph,
    });

  await CreativeStateEngine.set(
    stateInput,
    PIPELINE_STAGES.READY_FOR_EXECUTION
  );

  const executionPlan =
    await ExecutionRuntime.plan({
      organization_id,
      creative_mission_id,
      creative_project_id,
      production_graph: optimizedGraph,
    });

  const execution =
    await ExecutionRuntime.create(
      executionPlan,
    );

  await CreativeStateEngine.set(
    stateInput,
    PIPELINE_STAGES.EXECUTING
  );

  return {
    mission_id: creative_mission_id,
    creative_mission_id,
    creative_project_id,
    research,
    strategy,
    concept,
    storyboard,
    graph,
    optimizedGraph,
    execution,
  };
}
