import { ResearchRuntime } from "@/lib/creative/research/runtime/ResearchRuntime";
import { CreativeStrategyRuntime } from "@/lib/creative/strategy/runtime/CreativeStrategyRuntime";
import { StoryboardRuntime } from "@/lib/creative/storyboard/runtime/StoryboardRuntime";
import { SceneRuntime } from "@/lib/creative/scenes/runtime/SceneRuntime";
import { ShotRuntime } from "@/lib/creative/shots/runtime/ShotRuntime";
import { ProductionGraphRuntime } from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";
import { ExecutionRuntime } from "@/lib/creative/execution/runtime/ExecutionRuntime";
import { AssetReuseEngine } from "@/lib/creative/assets/reuse/AssetReuseEngine";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeStateEngine, PIPELINE_STAGES } from "@/lib/creative/state/CreativeStateEngine";

function resolveMissionId(input = {}) {
  return input.creative_mission_id || input.mission_id || null;
}

function resolveProjectId(input = {}) {
  return input.creative_project_id || input.project_id || null;
}

function taskTypeFor(step = {}) {
  const capability = String(step.capability || step.service_code || "").toLowerCase();
  if (capability.includes("image.upscale")) return "UPSCALE";
  if (capability.includes("image")) return "GENERATE_IMAGE";
  if (capability.includes("voice")) return "GENERATE_VOICE";
  if (capability.includes("music")) return "GENERATE_MUSIC";
  if (capability.includes("sfx")) return "GENERATE_SFX";
  if (capability.includes("speech.to.text")) return "SUBTITLE";
  if (capability.includes("quality")) return "QUALITY_REVIEW";
  if (capability.includes("render")) return "RENDER_PRODUCTION";
  return "GENERATE_VIDEO";
}

async function materializeProductionTasks({
  organization_id,
  creative_project_id,
  production_graph_id,
  executionPlan,
}) {
  const existing = await ProductionTaskRuntime.list({
    organization_id,
    creative_project_id,
  });
  const existingByNode = new Map(
    existing
      .filter((task) => task.metadata?.execution_node_id)
      .map((task) => [task.metadata.execution_node_id, task]),
  );
  const taskByNode = new Map();
  const created = [];

  for (const step of executionPlan.steps || []) {
    const prior = existingByNode.get(step.node_id);
    if (prior) {
      taskByNode.set(step.node_id, prior);
      continue;
    }

    const task = await ProductionTaskRuntime.create({
      organization_id,
      creative_project_id,
      production_graph_id,
      scene_id: step.metadata?.scene_id || null,
      shot_id: step.metadata?.node_type === "SHOT" ? step.node_id : null,
      type: taskTypeFor(step),
      status: "WAITING",
      title: step.metadata?.node_title || "Creative production task",
      description: step.metadata?.intent?.purpose || "",
      service_id: step.service_code,
      service_code: step.service_code,
      capability: step.capability,
      priority: Number(step.priority || 100),
      depends_on: [],
      input: {
        intent: step.metadata?.intent || {},
        requirements: step.metadata?.requirements || {},
        source_assets: step.metadata?.source_assets || [],
        generation: step.metadata?.generation || {},
      },
      cost: {
        estimated: Number(step.estimated_cost || 0),
        currency: "USD",
        approved: Number(step.estimated_cost || 0) <= 0,
      },
      timing: {
        estimated_seconds: Number(step.estimated_seconds || 0),
      },
      metadata: {
        execution_node_id: step.node_id,
        execution_step_id: step.id,
      },
    });

    taskByNode.set(step.node_id, task);
    created.push(task);
  }

  for (const step of executionPlan.steps || []) {
    const task = taskByNode.get(step.node_id);
    if (!task) continue;
    const dependencyTaskIds = (step.depends_on || [])
      .map((nodeId) => taskByNode.get(nodeId)?.id)
      .filter(Boolean);
    if (dependencyTaskIds.length) {
      const updated = await ProductionTaskRuntime.update(task.id, {
        depends_on: dependencyTaskIds,
      });
      taskByNode.set(step.node_id, updated);
    }
  }

  return {
    created,
    all: [...taskByNode.values()],
  };
}

export async function buildCreativePipeline(input = {}) {
  const { organization_id, brief, creativePlan } = input;
  const creative_mission_id = resolveMissionId(input);
  const creative_project_id = resolveProjectId(input);

  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");

  const stateInput = {
    organization_id,
    creative_mission_id,
    creative_project_id,
  };

  let state = await CreativeStateEngine.get(stateInput);
  if (!state) state = await CreativeStateEngine.init(stateInput);

  await CreativeStateEngine.set(stateInput, PIPELINE_STAGES.UNDERSTANDING);
  await CreativeStateEngine.set(stateInput, PIPELINE_STAGES.RESEARCHING);

  const research = await ResearchRuntime.runResearch(
    { id: creative_project_id, creative_mission_id },
    { brief, creativePlan },
    { run: async () => ({ summary: "" }) },
  );

  await CreativeStateEngine.set(stateInput, PIPELINE_STAGES.BUILDING_STRATEGY);
  const strategy = await CreativeStrategyRuntime.create({
    organization_id,
    creative_mission_id,
    creative_project_id,
    research_id: research.id,
  });

  await CreativeStateEngine.set(stateInput, PIPELINE_STAGES.BUILDING_CONCEPT);
  const concept = {
    id: `concept_${creative_project_id}`,
    organization_id,
    creative_mission_id,
    creative_project_id,
    creative_strategy_id: strategy.id,
    status: "planned",
    source: "mission_lifecycle",
  };

  await CreativeStateEngine.set(stateInput, PIPELINE_STAGES.BUILDING_STORYBOARD);
  const storyboard = await StoryboardRuntime.create({
    organization_id,
    creative_mission_id,
    creative_project_id,
    creative_strategy_id: strategy.id,
    creative_concept_id: concept.id,
    creative_plan: creativePlan || null,
  });

  const scenes = await SceneRuntime.list({
    organization_id,
    creative_mission_id,
    creative_project_id,
  });
  const shots = await ShotRuntime.list({
    organization_id,
    creative_mission_id,
    creative_project_id,
  });

  if (!scenes.length || !shots.length) {
    throw new Error("Creative pipeline requires persisted scenes and shots before production planning");
  }

  await CreativeStateEngine.set(stateInput, PIPELINE_STAGES.PLANNING_PRODUCTION);
  const graph = await ProductionGraphRuntime.plan({
    organization_id,
    creative_mission_id,
    creative_project_id,
    storyboard,
    scenes,
    shots,
    creative_plan: creativePlan || null,
  });

  const optimizedGraph = await AssetReuseEngine.optimizeGraph({
    organization_id,
    creative_project_id,
    graph,
  });

  await CreativeStateEngine.set(stateInput, PIPELINE_STAGES.READY_FOR_EXECUTION);
  const executionPlan = await ExecutionRuntime.plan({
    organization_id,
    creative_project_id,
    production_graph: optimizedGraph,
  });
  const execution = await ExecutionRuntime.create(executionPlan);
  const tasks = await materializeProductionTasks({
    organization_id,
    creative_project_id,
    production_graph_id: optimizedGraph.id,
    executionPlan,
  });

  await CreativeStateEngine.set(stateInput, PIPELINE_STAGES.EXECUTING);

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
    tasks,
  };
}
