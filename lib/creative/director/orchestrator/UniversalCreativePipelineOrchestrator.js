import { CreativeMissionRuntime } from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import { CreativeBriefRuntime } from "@/lib/creative/brief/runtime/CreativeBriefRuntime";
import { ResearchRuntime } from "@/lib/creative/research/runtime/ResearchRuntime";
import { CreativeStrategyRuntime } from "@/lib/creative/strategy/runtime/CreativeStrategyRuntime";
import { CreativeConceptRuntime } from "@/lib/creative/concepts/runtime/CreativeConceptRuntime";
import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { CreativeMasterPlanRuntime } from "@/lib/creative/director/runtime/CreativeMasterPlanRuntime";
import { ProductionGraphRuntime } from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";
import { ExecutionRuntime } from "@/lib/creative/execution/runtime/ExecutionRuntime";
import { AssetReuseEngine } from "@/lib/creative/assets/reuse/AssetReuseEngine";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeStateEngine, PIPELINE_STAGES } from "@/lib/creative/state/CreativeStateEngine";

const UNIVERSAL_WORKFLOWS = new Set([
  "STILL",
  "DOCUMENT",
  "INTERACTIVE",
  "SOFTWARE",
  "AUDIO",
  "CAMPAIGN_SYSTEM",
]);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function resolveMissionId(input = {}) {
  return input.creative_mission_id || input.mission_id || null;
}

function resolveProjectId(input = {}) {
  return input.creative_project_id || input.project_id || null;
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

function taskTypeFor(step = {}) {
  const capability = text(step.capability || step.service_code).toLowerCase();
  const qualityGate = step.metadata?.quality_gate === true;
  if (!capability) throw new Error("CREATIVE_EXECUTION_CAPABILITY_REQUIRED");
  if (qualityGate || /quality|analy[sz]e|validate|audit|test/.test(capability)) {
    return "QUALITY_REVIEW";
  }
  if (capability.includes("image.upscale")) return "UPSCALE";
  if (capability.includes("image")) return "GENERATE_IMAGE";
  if (capability.includes("video")) return "GENERATE_VIDEO";
  if (capability.includes("voice")) return "GENERATE_VOICE";
  if (capability.includes("music")) return "GENERATE_MUSIC";
  if (capability.includes("sfx")) return "GENERATE_SFX";
  if (capability.includes("audio")) return "GENERATE_AUDIO";
  if (capability.includes("translate")) return "TRANSLATE";
  if (capability.includes("speech.to.text") || capability.includes("subtitle")) {
    return "SUBTITLE";
  }
  if (/text|copy|content/.test(capability)) return "GENERATE_TEXT";
  if (/reasoning|structured|document|presentation|web|software|code|build/.test(capability)) {
    return "GENERATE_STRUCTURED_OUTPUT";
  }
  if (capability.includes("render")) return "RENDER_PRODUCTION";
  return "EXECUTE_CAPABILITY";
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

async function materializeAgencyDirection({
  organization_id,
  creative_mission_id,
  creative_project_id,
  mission,
  project,
  brief,
  assets,
  master = null,
}) {
  const resolvedMaster = master || await CreativeMasterPlanRuntime.create({
    organization_id,
    mission,
    project,
    brief,
    assets,
  });
  const plan = resolvedMaster.plan;
  const kind = text(plan.workflow_kind).toUpperCase();

  if (!UNIVERSAL_WORKFLOWS.has(kind)) {
    throw new Error(`CREATIVE_UNIVERSAL_WORKFLOW_REQUIRED:${kind || "UNKNOWN"}`);
  }
  if (!plan.validation?.passed) {
    throw new Error("CREATIVE_MASTER_PLAN_VALIDATION_REQUIRED");
  }
  if (plan.degraded === true) {
    throw new Error("CREATIVE_DEGRADED_DIRECTION_RELEASE_BLOCKED");
  }

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
            model: resolvedMaster.model || "",
            provider: resolvedMaster.provider || "",
            fallback: resolvedMaster.fallback === true,
          },
          metadata: {
            master_plan: plan,
            usage_id: resolvedMaster.usage?.id || null,
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
      title: plan.concept?.title || project.name || "",
      objective: project.objective || brief.creative_objective || "",
      audience_insight: plan.concept?.target_audience || {},
      creative_angle: plan.concept?.hook || "",
      core_message: plan.concept?.message || "",
      story_direction: plan.concept?.narrative || "",
      visual_direction: {
        visual_system: plan.concept?.visual_system || {},
        typography_system: plan.concept?.typography_system || {},
        experience_system: plan.concept?.experience_system || {},
        sound_system: plan.concept?.sound_system || {},
      },
      production_direction: {
        workflow_kind: kind,
        deliverables: plan.deliverables || [],
        production: plan.production || {},
        quality: plan.quality || {},
      },
      recommendations: research.recommendations || [],
      metadata: {
        master_plan_provider: resolvedMaster.provider,
        master_plan_model: resolvedMaster.model,
        master_plan_fallback: resolvedMaster.fallback,
        master_plan_validation: resolvedMaster.validation,
        role_decisions: plan.role_decisions || {},
        asset_manifest: plan.asset_manifest || [],
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
        workflow_kind: kind,
        deliverables: plan.deliverables || [],
        master_plan_quality: plan.quality || {},
        master_plan_validation: resolvedMaster.validation,
      },
    });
  }

  return {
    master: resolvedMaster,
    research,
    strategy,
    concept,
    storyboard: null,
    scenes: [],
    shots: [],
  };
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
  });
  const existingByNode = new Map(
    existing
      .filter((task) => task.metadata?.execution_node_id)
      .map((task) => [task.metadata.execution_node_id, task]),
  );
  const taskByNode = new Map();
  const created = [];
  const currency = projectCurrency(project, masterPlan);

  for (const step of list(executionPlan.steps)) {
    const prior = existingByNode.get(step.node_id);
    if (prior) {
      taskByNode.set(step.node_id, prior);
      continue;
    }

    const estimatedCost = Number(step.estimated_cost || 0);
    if (estimatedCost > 0 && !currency) {
      throw new Error("CREATIVE_PROJECT_CURRENCY_REQUIRED_FOR_COSTED_TASK");
    }
    const generation = object(step.metadata?.generation || step.input?.generation);
    const requirements = object(step.metadata?.requirements || step.input?.requirements);
    const qualityGate = step.metadata?.quality_gate === true;

    const task = await ProductionTaskRuntime.create({
      organization_id,
      creative_project_id,
      production_graph_id,
      type: taskTypeFor(step),
      status: "WAITING",
      title: step.metadata?.node_title || step.input?.title || "",
      description: step.input?.description || step.metadata?.intent?.purpose || "",
      service_id: step.service_code,
      service_code: step.service_code,
      capability: step.capability,
      priority: Number(step.priority || 100),
      depends_on: [],
      input: {
        ...(step.input || {}),
        prompt:
          step.input?.prompt ||
          generation.provider_prompt ||
          step.metadata?.provider_prompt ||
          null,
        provider_prompt:
          generation.provider_prompt ||
          step.metadata?.provider_prompt ||
          null,
        provider_parameters:
          generation.provider_parameters ||
          step.metadata?.provider_parameters ||
          {},
        output_spec:
          generation.output_spec ||
          requirements.output_spec ||
          step.metadata?.output_spec ||
          {},
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
      review: {
        required: qualityGate,
        approved: false,
      },
      metadata: {
        ...(step.metadata || {}),
        execution_node_id: step.node_id,
        execution_step_id: step.id,
        workflow_kind: masterPlan.workflow_kind,
        master_plan_validation: masterPlan.validation,
        quality_gate: qualityGate,
        release_candidate: step.metadata?.release_candidate === true,
      },
    });

    taskByNode.set(step.node_id, task);
    created.push(task);
  }

  for (const step of list(executionPlan.steps)) {
    const task = taskByNode.get(step.node_id);
    if (!task) continue;
    const dependencies = list(step.depends_on)
      .map((nodeId) => taskByNode.get(nodeId)?.id)
      .filter(Boolean);
    if (dependencies.length) {
      const updated = await ProductionTaskRuntime.update(task.id, {
        depends_on: dependencies,
      });
      taskByNode.set(step.node_id, updated);
    }
  }

  return {
    created,
    all: [...taskByNode.values()],
  };
}

export async function buildUniversalCreativePipeline(input = {}) {
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
  const direction = await materializeAgencyDirection({
    organization_id,
    creative_mission_id,
    creative_project_id,
    ...context,
    master: input.master || null,
  });

  await CreativeStateEngine.set(stateInput, PIPELINE_STAGES.PLANNING_PRODUCTION);
  const graph = await ProductionGraphRuntime.plan({
    organization_id,
    creative_mission_id,
    creative_project_id,
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
    workflow_kind: direction.master.plan.workflow_kind,
    master_plan: direction.master,
    research: direction.research,
    strategy: direction.strategy,
    concept: direction.concept,
    storyboard: null,
    scenes: [],
    shots: [],
    graph,
    optimizedGraph,
    execution,
    tasks,
  };
}
