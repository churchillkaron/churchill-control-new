import { CreativeMissionRuntime } from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import { CreativeBriefRuntime } from "@/lib/creative/brief/runtime/CreativeBriefRuntime";
import { ResearchRuntime } from "@/lib/creative/research/runtime/ResearchRuntime";
import { CreativeStrategyRuntime } from "@/lib/creative/strategy/runtime/CreativeStrategyRuntime";
import { CreativeConceptRuntime } from "@/lib/creative/concepts/runtime/CreativeConceptRuntime";
import { StoryboardRuntime } from "@/lib/creative/storyboard/runtime/StoryboardRuntime";
import { SceneRuntime } from "@/lib/creative/scenes/runtime/SceneRuntime";
import { ShotRuntime } from "@/lib/creative/shots/runtime/ShotRuntime";
import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { CreativeMasterPlanRuntime } from "@/lib/creative/director/runtime/CreativeMasterPlanRuntime";
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

async function resolveContext({
  organization_id,
  creative_mission_id,
  creative_project_id,
  brief,
}) {
  const [mission, project, storedBriefs, assets] = await Promise.all([
    creative_mission_id
      ? CreativeMissionRuntime.get(creative_mission_id)
      : null,
    CreativeProjectRuntime.get(creative_project_id),
    CreativeBriefRuntime.list({
      organization_id,
      creative_mission_id,
      creative_project_id,
    }),
    CreativeAssetsRuntime.list({
      organization_id,
      creative_mission_id,
      creative_project_id,
    }),
  ]);

  if (!project || project.organization_id !== organization_id) {
    throw new Error("Creative project not found");
  }
  if (mission && mission.organization_id !== organization_id) {
    throw new Error("Creative mission not found");
  }

  return {
    mission: mission || {},
    project,
    brief: brief?.id ? brief : storedBriefs[0] || brief || {},
    assets,
  };
}

async function materializeDirection({
  organization_id,
  creative_mission_id,
  creative_project_id,
  mission,
  project,
  brief,
  assets,
}) {
  const master = await CreativeMasterPlanRuntime.create({
    organization_id,
    mission,
    project,
    brief,
    assets,
  });
  const plan = master.plan;

  let research = (await ResearchRuntime.list({
    organization_id,
    creative_project_id,
  }))[0] || null;
  if (!research) {
    research = await ResearchRuntime.runResearch(
      {
        ...project,
        id: creative_project_id,
        organization_id,
        creative_mission_id,
      },
      brief,
      {
        run: async () => ({
          summary: plan.concept?.narrative || plan.concept?.message || "",
          audience: plan.concept?.target_audience || brief.target_audience || {},
          recommendations: [
            plan.concept?.hook,
            plan.concept?.message,
          ].filter(Boolean),
          reasoning: {
            model: master.model || "",
            provider: master.provider || "",
            fallback: master.fallback === true,
          },
          metadata: {
            master_plan: plan,
            usage_id: master.usage?.id || null,
          },
        }),
      },
    );
  }

  let strategy = (await CreativeStrategyRuntime.list({
    organization_id,
    creative_project_id,
  }))[0] || null;
  if (!strategy) {
    strategy = await CreativeStrategyRuntime.create({
      organization_id,
      creative_mission_id,
      creative_project_id,
      creative_brief_id: brief.id || null,
      title: plan.concept?.title || project.name,
      objective: project.objective || brief.creative_objective || "",
      audience_insight: plan.concept?.target_audience || {},
      creative_angle: plan.concept?.hook || "",
      core_message: plan.concept?.message || "",
      story_direction: plan.concept?.narrative || "",
      visual_direction: {
        style: plan.concept?.visual_style || "cinematic",
        mood: plan.concept?.emotion || "premium",
        lighting: "Selected per scene",
        color_palette: [],
        camera_language: [plan.concept?.camera_style].filter(Boolean),
      },
      production_direction: {
        target_duration: Number(brief.duration_seconds || project.target_duration || 30),
        format_versions: project.metadata?.format_versions || ["9:16", "1:1", "16:9"],
        quality_profile: project.quality_profile || "premium",
        draft_first: true,
        reuse_assets: true,
      },
      recommendations: research.recommendations || [],
      metadata: {
        master_plan_provider: master.provider,
        master_plan_model: master.model,
        master_plan_fallback: master.fallback,
      },
    });
  }

  let concept = (await CreativeConceptRuntime.list({
    organization_id,
    creative_mission_id,
    creative_project_id,
  }))[0] || null;
  if (!concept) {
    concept = await CreativeConceptRuntime.create({
      organization_id,
      creative_mission_id,
      creative_project_id,
      creative_strategy_id: strategy.id,
      status: "planned",
      ...(plan.concept || {}),
      metadata: {
        master_plan_quality: plan.quality || {},
      },
    });
  }

  let storyboard = (await StoryboardRuntime.list({
    organization_id,
    creative_project_id,
  }))[0] || null;
  if (!storyboard) {
    storyboard = await StoryboardRuntime.create({
      organization_id,
      creative_mission_id,
      creative_project_id,
      creative_strategy_id: strategy.id,
      creative_concept_id: concept.id,
      title: plan.concept?.title || project.name,
      synopsis: plan.concept?.narrative || plan.concept?.message || "",
      total_duration: Number(brief.duration_seconds || project.target_duration || 30),
      metadata: {
        master_plan_quality: plan.quality || {},
      },
    });
  }

  let scenes = await SceneRuntime.list({
    organization_id,
    creative_project_id,
  });
  if (!scenes.length) {
    scenes = [];
    for (const [index, scenePlan] of (plan.scenes || []).entries()) {
      const scene = await SceneRuntime.create({
        organization_id,
        creative_project_id,
        storyboard_id: storyboard.id,
        scene_number: index + 1,
        title: scenePlan.title || `Scene ${index + 1}`,
        objective: scenePlan.objective || "",
        emotion: scenePlan.emotion || "",
        duration_seconds: Number(scenePlan.duration_seconds || 5),
        location: scenePlan.location || {},
        actors: scenePlan.actors || [],
        products: scenePlan.products || [],
        brand_rules: scenePlan.brand_rules || [],
        visual_style: scenePlan.visual_style || {},
        camera_style: scenePlan.camera_style || {},
        audio_style: scenePlan.audio_style || {},
        metadata: {
          master_plan_index: index,
          minimum_quality: plan.quality?.minimum_scene_score || 88,
        },
      });
      scenes.push(scene);
    }
  }

  let shots = await ShotRuntime.list({
    organization_id,
    creative_project_id,
  });
  if (!shots.length) {
    shots = [];
    for (const [sceneIndex, scene] of scenes.entries()) {
      const scenePlan = plan.scenes?.[sceneIndex] || {};
      const shotPlans = Array.isArray(scenePlan.shots) && scenePlan.shots.length
        ? scenePlan.shots
        : [{
            title: `${scene.title} primary shot`,
            purpose: scene.objective,
            duration_seconds: scene.duration_seconds,
            generation: {
              required: true,
              service: "ai.video.generate",
              capability: "ai.video.generate",
            },
          }];

      for (const [shotIndex, shotPlan] of shotPlans.entries()) {
        const shot = await ShotRuntime.create({
          organization_id,
          creative_project_id,
          scene_id: scene.id,
          storyboard_id: storyboard.id,
          scene_number: scene.scene_number,
          shot_number: shotIndex + 1,
          title: shotPlan.title || `${scene.title} shot ${shotIndex + 1}`,
          purpose: shotPlan.purpose || scene.objective || "",
          duration_seconds: Number(shotPlan.duration_seconds || scene.duration_seconds || 5),
          medium: shotPlan.medium || null,
          camera: shotPlan.camera || {},
          lighting: shotPlan.lighting || {},
          actors: shotPlan.actors || scene.actors || [],
          products: shotPlan.products || scene.products || [],
          location: shotPlan.location || scene.location || {},
          dialogue: shotPlan.dialogue || [],
          narration: shotPlan.narration || {},
          music: shotPlan.music || {},
          sound_effects: shotPlan.sound_effects || [],
          subtitles: shotPlan.subtitles || [],
          assets: shotPlan.assets || [],
          generation: shotPlan.generation || {
            required: true,
            service: "ai.video.generate",
            capability: "ai.video.generate",
          },
          metadata: {
            must_avoid: shotPlan.must_avoid || [],
            minimum_quality: plan.quality?.minimum_scene_score || 88,
          },
        });
        shots.push(shot);
      }
    }
  }

  return {
    master,
    research,
    strategy,
    concept,
    storyboard,
    scenes,
    shots,
  };
}

export async function buildCreativePipeline(input = {}) {
  const { organization_id } = input;
  const creative_mission_id = resolveMissionId(input);
  const creative_project_id = resolveProjectId(input);

  if (!organization_id) throw new Error("organization_id required");
  if (!creative_mission_id) throw new Error("creative_mission_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");

  const stateInput = {
    organization_id,
    creative_mission_id,
    creative_project_id,
  };

  let state = await CreativeStateEngine.get(stateInput);
  if (!state) state = await CreativeStateEngine.init(stateInput);

  await CreativeStateEngine.set(stateInput, PIPELINE_STAGES.UNDERSTANDING);
  const context = await resolveContext({
    organization_id,
    creative_mission_id,
    creative_project_id,
    brief: input.brief,
  });

  await CreativeStateEngine.set(stateInput, PIPELINE_STAGES.RESEARCHING);
  const direction = await materializeDirection({
    organization_id,
    creative_mission_id,
    creative_project_id,
    ...context,
  });

  await CreativeStateEngine.set(stateInput, PIPELINE_STAGES.PLANNING_PRODUCTION);
  const graph = await ProductionGraphRuntime.plan({
    organization_id,
    creative_mission_id,
    creative_project_id,
    storyboard: direction.storyboard,
    scenes: direction.scenes,
    shots: direction.shots,
    creative_plan: direction.master.plan,
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
    master_plan: direction.master,
    research: direction.research,
    strategy: direction.strategy,
    concept: direction.concept,
    storyboard: direction.storyboard,
    scenes: direction.scenes,
    shots: direction.shots,
    graph,
    optimizedGraph,
    execution,
    tasks,
  };
}
