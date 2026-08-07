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
import { CreativeStoryLineageContractRuntime } from "@/lib/creative/director/runtime/CreativeStoryLineageContractRuntime";
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

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function requiredDuration(value, label) {
  const number = finite(value);
  if (number === null || number <= 0) {
    throw new Error(`${label}_DURATION_REQUIRED`);
  }
  return number;
}

function projectCurrency(project = {}, plan = {}) {
  return (
    plan.production?.currency ||
    project.currency ||
    project.metadata?.currency ||
    project.metadata?.business_context?.currency ||
    null
  );
}

function storyLineage(value = {}) {
  return object(value.story_lineage || value.metadata?.story_lineage);
}

function lineageMetadata(value = {}) {
  const lineage = storyLineage(value);
  return {
    story_lineage: lineage,
    research_identity: lineage.research_identity || null,
    business_context_hash: lineage.business_context_hash || null,
    industry_context_hash: lineage.industry_context_hash || null,
    selected_concept_hash: lineage.selected_concept_hash || null,
    concept_council_hash: lineage.concept_council_hash || null,
    story_contract_hash: lineage.story_contract_hash || null,
    master_plan_hash: lineage.master_plan_hash || null,
    approval_plan_hash: lineage.approval_plan_hash || null,
  };
}

function lineageMatches(document = {}, lineage = {}) {
  const metadata = object(document.metadata);
  return Boolean(
    text(lineage.story_contract_hash) &&
    text(lineage.master_plan_hash) &&
    text(metadata.story_contract_hash) === text(lineage.story_contract_hash) &&
    text(metadata.master_plan_hash) === text(lineage.master_plan_hash) &&
    text(metadata.research_identity) === text(lineage.research_identity)
  );
}

function promptlessGeneration(value = {}) {
  const generation = object(value);
  const {
    prompt: ignoredPrompt,
    provider_prompt: ignoredProviderPrompt,
    negative_prompt: ignoredNegativePrompt,
    visual_prompt: ignoredVisualPrompt,
    video_prompt: ignoredVideoPrompt,
    ...structured
  } = generation;
  return structured;
}

function taskTypeFor(step = {}) {
  const capability = text(step.capability || step.service_code).toLowerCase();
  if (!capability) throw new Error("CREATIVE_EXECUTION_CAPABILITY_REQUIRED");
  if (capability.includes("image.upscale")) return "UPSCALE";
  if (capability.includes("image")) return "GENERATE_IMAGE";
  if (capability.includes("video")) return "GENERATE_VIDEO";
  if (capability.includes("voice")) return "GENERATE_VOICE";
  if (capability.includes("music")) return "GENERATE_MUSIC";
  if (capability.includes("sfx")) return "GENERATE_SFX";
  if (capability.includes("audio")) return "GENERATE_AUDIO";
  if (capability.includes("speech.to.text") || capability.includes("subtitle")) {
    return "SUBTITLE";
  }
  if (capability.includes("quality")) return "QUALITY_REVIEW";
  if (capability.includes("render")) return "RENDER_PRODUCTION";
  throw new Error(`CREATIVE_EXECUTION_CAPABILITY_UNSUPPORTED:${capability}`);
}

async function materializeProductionTasks({
  organization_id,
  creative_project_id,
  production_graph_id,
  executionPlan,
  project,
  masterPlan,
}) {
  const existing = await ProductionTaskRuntime.list({
    organization_id,
    creative_project_id,
    production_graph_id,
  });
  const existingByNode = new Map(
    existing
      .filter((task) => task.metadata?.execution_node_id)
      .map((task) => [task.metadata.execution_node_id, task]),
  );
  const taskByNode = new Map();
  const created = [];
  const currency = projectCurrency(project, masterPlan);
  const lineage = storyLineage(masterPlan);

  for (const step of executionPlan.steps || []) {
    const prior = existingByNode.get(step.node_id);
    if (prior) {
      taskByNode.set(step.node_id, prior);
      continue;
    }

    const estimatedCost = Number(step.estimated_cost || 0);
    if (estimatedCost > 0 && !currency) {
      throw new Error("CREATIVE_PROJECT_CURRENCY_REQUIRED_FOR_COSTED_TASK");
    }

    const task = await ProductionTaskRuntime.create({
      organization_id,
      creative_project_id,
      production_graph_id,
      scene_id: step.metadata?.scene_id || null,
      shot_id: step.metadata?.node_type === "SHOT" ? step.node_id : null,
      type: taskTypeFor(step),
      status: "WAITING",
      title: step.metadata?.node_title || "",
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
        generation: promptlessGeneration(step.metadata?.generation || {}),
        frame_contract: step.metadata?.frame_contract || {},
        provider_parameters: step.metadata?.provider_parameters || {},
        repair_contract: step.metadata?.repair_contract || {},
      },
      cost: {
        estimated: estimatedCost,
        currency,
        approved: estimatedCost <= 0
          ? true
          : masterPlan.production?.cost_approved === true,
      },
      timing: {
        estimated_seconds: Number(step.estimated_seconds || 0),
      },
      metadata: {
        execution_node_id: step.node_id,
        execution_step_id: step.id,
        master_plan_validation: masterPlan.validation || null,
        workflow_kind: masterPlan.workflow_kind || null,
        provider_prompts_persisted: false,
        ...lineageMetadata({ story_lineage: lineage }),
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

function assertTemporalRuntime(plan = {}) {
  const workflowKind = text(plan.workflow_kind).toUpperCase();
  if (workflowKind !== "TEMPORAL") {
    throw new Error(
      `CREATIVE_WORKFLOW_RUNTIME_NOT_CONNECTED:${workflowKind || "UNKNOWN"}`,
    );
  }
  if (!plan.validation?.passed) {
    throw new Error("CREATIVE_MASTER_PLAN_VALIDATION_REQUIRED");
  }
  if (plan.degraded === true) {
    throw new Error("CREATIVE_DEGRADED_DIRECTION_RELEASE_BLOCKED");
  }
  if (!list(plan.scenes).length) {
    throw new Error("CREATIVE_MASTER_PLAN_SCENES_REQUIRED");
  }
  for (const [sceneIndex, scene] of plan.scenes.entries()) {
    if (!list(scene.shots).length) {
      throw new Error(`CREATIVE_MASTER_PLAN_SCENE_SHOTS_REQUIRED:${sceneIndex + 1}`);
    }
  }
  CreativeStoryLineageContractRuntime.assert(plan);
}

function totalPlanDuration(plan = {}) {
  const duration = list(plan.scenes)
    .reduce((sum, scene) => sum + Number(scene.duration_seconds || 0), 0);
  return requiredDuration(duration, "CREATIVE_MASTER_PLAN");
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
  assertTemporalRuntime(plan);
  const totalDuration = totalPlanDuration(plan);
  const lineage = storyLineage(plan);
  const research = master.research || (await ResearchRuntime.list({
    organization_id,
    creative_project_id,
  })).find((item) =>
    text(item.metadata?.research_identity) === text(lineage.research_identity),
  ) || null;
  if (!research) {
    throw new Error("CREATIVE_AUTHORITATIVE_RESEARCH_NOT_FOUND_FOR_STORY_LINEAGE");
  }

  const strategyRows = await CreativeStrategyRuntime.list({
    organization_id,
    creative_project_id,
  });
  let strategy = strategyRows.find((item) => lineageMatches(item, lineage)) || null;
  if (!strategy) {
    strategy = await CreativeStrategyRuntime.create({
      organization_id,
      creative_mission_id,
      creative_project_id,
      creative_brief_id: brief.id || null,
      title: plan.concept?.title || project.name || "",
      objective: project.objective || brief.creative_objective || "",
      audience_insight: plan.concept?.target_audience || {},
      creative_angle: plan.concept?.hook || "",
      core_message: plan.concept?.message || "",
      story_direction: plan.concept?.narrative || "",
      visual_direction: {
        visual_system: plan.concept?.visual_system || {},
        camera_language: plan.concept?.camera_language || {},
        lighting_system: plan.concept?.lighting_system || {},
        production_design: plan.concept?.production_design || {},
        typography_system: plan.concept?.typography_system || {},
      },
      production_direction: {
        target_duration: totalDuration,
        deliverables: plan.deliverables || [],
        production: plan.production || {},
        quality: plan.quality || {},
      },
      recommendations: research.recommendations || [],
      metadata: {
        master_plan_provider: master.provider,
        master_plan_model: master.model,
        master_plan_fallback: master.fallback,
        master_plan_validation: master.validation,
        agency_decisions: plan.agency_decisions || [],
        asset_manifest: plan.asset_manifest || [],
        ...lineageMetadata(plan),
      },
    });
  }

  const conceptRows = await CreativeConceptRuntime.list({
    organization_id,
    creative_mission_id,
    creative_project_id,
  });
  let concept = conceptRows.find((item) => lineageMatches(item, lineage)) || null;
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
        master_plan_validation: master.validation,
        ...lineageMetadata(plan),
      },
    });
  }

  const storyboardRows = await StoryboardRuntime.list({
    organization_id,
    creative_project_id,
  });
  let storyboard = storyboardRows.find((item) => lineageMatches(item, lineage)) || null;
  if (!storyboard) {
    storyboard = await StoryboardRuntime.create({
      organization_id,
      creative_mission_id,
      creative_project_id,
      creative_strategy_id: strategy.id,
      creative_concept_id: concept.id,
      title: plan.concept?.title || project.name || "",
      synopsis: plan.concept?.narrative || plan.concept?.message || "",
      total_duration: totalDuration,
      metadata: {
        master_plan_quality: plan.quality || {},
        master_plan_validation: master.validation,
        story_architecture: plan.story_architecture || {},
        canonical_story: plan.story || {},
        ...lineageMetadata(plan),
      },
    });
  }

  const allScenes = await SceneRuntime.list({
    organization_id,
    creative_project_id,
  });
  let scenes = allScenes
    .filter((scene) =>
      text(scene.storyboard_id) === text(storyboard.id) &&
      lineageMatches(scene, lineage),
    )
    .sort((left, right) => Number(left.scene_number) - Number(right.scene_number));
  if (scenes.length !== plan.scenes.length) {
    scenes = [];
    for (const [index, scenePlan] of plan.scenes.entries()) {
      const scene = await SceneRuntime.create({
        organization_id,
        creative_project_id,
        storyboard_id: storyboard.id,
        scene_number: index + 1,
        title: scenePlan.title,
        objective: scenePlan.objective,
        emotion: scenePlan.emotion,
        duration_seconds: requiredDuration(
          scenePlan.duration_seconds,
          `CREATIVE_SCENE_${index + 1}`,
        ),
        location: scenePlan.location || {},
        actors: scenePlan.actors || [],
        products: scenePlan.products || [],
        brand_rules: scenePlan.brand_rules || [],
        visual_style: scenePlan.visual_style || {},
        camera_style: scenePlan.camera_style || {},
        audio_style: scenePlan.audio_style || {},
        metadata: {
          master_plan_index: index,
          master_plan_scene_id: scenePlan.id || null,
          minimum_quality: plan.quality?.minimum_scene_score ?? null,
          story_function: scenePlan.story_function || null,
          story_state_before: scenePlan.story_state_before || "",
          state_change: scenePlan.state_change || "",
          story_state_after: scenePlan.story_state_after || "",
          transition_logic: scenePlan.transition_logic || "",
          continuity_from_previous: scenePlan.continuity_from_previous || {},
          continuity_to_next: scenePlan.continuity_to_next || {},
          ...lineageMetadata(plan),
        },
      });
      scenes.push(scene);
    }
  }

  const allShots = await ShotRuntime.list({
    organization_id,
    creative_project_id,
  });
  let shots = allShots
    .filter((shot) =>
      scenes.some((scene) => text(scene.id) === text(shot.scene_id)) &&
      lineageMatches(shot, lineage),
    )
    .sort((left, right) =>
      Number(left.scene_number) - Number(right.scene_number) ||
      Number(left.shot_number) - Number(right.shot_number),
    );
  const plannedShotCount = plan.scenes.reduce(
    (sum, scene) => sum + list(scene.shots).length,
    0,
  );
  if (shots.length !== plannedShotCount) {
    shots = [];
    for (const [sceneIndex, scene] of scenes.entries()) {
      const scenePlan = plan.scenes[sceneIndex];
      const shotPlans = list(scenePlan?.shots);
      if (!shotPlans.length) {
        throw new Error(`CREATIVE_MASTER_PLAN_SCENE_SHOTS_REQUIRED:${sceneIndex + 1}`);
      }

      for (const [shotIndex, shotPlan] of shotPlans.entries()) {
        const subject = text(shotPlan.subject);
        if (!subject) {
          throw new Error(
            `CREATIVE_MASTER_PLAN_SHOT_SUBJECT_REQUIRED:${sceneIndex + 1}:${shotIndex + 1}`,
          );
        }
        const shot = await ShotRuntime.create({
          organization_id,
          creative_project_id,
          scene_id: scene.id,
          storyboard_id: storyboard.id,
          scene_number: scene.scene_number,
          shot_number: shotIndex + 1,
          title: shotPlan.title,
          purpose: shotPlan.purpose,
          subject,
          action: shotPlan.action || "",
          performance: shotPlan.performance || "",
          duration_seconds: requiredDuration(
            shotPlan.duration_seconds,
            `CREATIVE_SHOT_${sceneIndex + 1}_${shotIndex + 1}`,
          ),
          medium: shotPlan.medium || null,
          frame_plan: shotPlan.frame_plan || {},
          opening_frame: shotPlan.opening_frame || {},
          progression_frames: shotPlan.progression_frames || [],
          closing_frame: shotPlan.closing_frame || {},
          camera: shotPlan.camera || {},
          lighting: shotPlan.lighting || {},
          production_design: shotPlan.production_design || {},
          wardrobe: shotPlan.wardrobe || [],
          hair_makeup: shotPlan.hair_makeup || [],
          props: shotPlan.props || [],
          performance_direction: shotPlan.performance_direction || {},
          continuity: shotPlan.continuity || {},
          actors: shotPlan.actors || scene.actors || [],
          products: shotPlan.products || scene.products || [],
          location: shotPlan.location || scene.location || {},
          dialogue: shotPlan.dialogue || [],
          narration: shotPlan.narration || {},
          audio: shotPlan.audio || {},
          music: shotPlan.music || {},
          sound_effects: shotPlan.sound_effects || [],
          sound_design: shotPlan.sound_design || {},
          subtitles: shotPlan.subtitles || [],
          graphics: shotPlan.graphics || {},
          typography: shotPlan.typography || {},
          vfx: shotPlan.vfx || {},
          transition_in: shotPlan.transition_in || "",
          transition_out: shotPlan.transition_out || "",
          must_avoid: shotPlan.must_avoid || [],
          negative_constraints: shotPlan.negative_constraints || [],
          known_failure_modes: shotPlan.known_failure_modes || [],
          repair_instructions: shotPlan.repair_instructions || [],
          assets: shotPlan.assets || [],
          reference_assets: shotPlan.reference_assets || [],
          reference_asset_ids: shotPlan.reference_asset_ids || [],
          primary_source_asset_id: shotPlan.primary_source_asset_id || null,
          identity_requirements: shotPlan.identity_requirements || {},
          product_requirements: shotPlan.product_requirements || {},
          rights_requirements: shotPlan.rights_requirements || {},
          output_spec: shotPlan.output_spec || shotPlan.generation?.output_spec || {},
          provider_parameters: shotPlan.provider_parameters || shotPlan.generation?.provider_parameters || {},
          repair_contract: shotPlan.repair_contract || {},
          reuse_policy: shotPlan.reuse_policy || {},
          generation: promptlessGeneration(shotPlan.generation),
          metadata: {
            subject,
            performance: shotPlan.performance || "",
            must_avoid: shotPlan.must_avoid || [],
            minimum_quality: plan.quality?.minimum_scene_score ?? null,
            reuse_policy: shotPlan.reuse_policy || {},
            master_plan_scene_index: sceneIndex,
            master_plan_shot_index: shotIndex,
            master_plan_scene_id: scenePlan.id || null,
            master_plan_shot_id: shotPlan.id || null,
            provider_prompts_persisted: false,
            ...lineageMetadata(plan),
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
  if (!list(executionPlan.steps).length) {
    throw new Error("CREATIVE_EXECUTION_PLAN_STEPS_REQUIRED");
  }
  const execution = await ExecutionRuntime.create(executionPlan);
  const tasks = await materializeProductionTasks({
    organization_id,
    creative_project_id,
    production_graph_id: optimizedGraph.id,
    executionPlan,
    project: context.project,
    masterPlan: direction.master.plan,
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
