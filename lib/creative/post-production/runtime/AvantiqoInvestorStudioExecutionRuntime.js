import { CreativeMissionRuntime } from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import { CreativeDirectorRuntime } from "@/lib/creative/director/runtime/CreativeDirectorRuntime";
import { ProductionQueueRuntime } from "@/lib/creative/production/queue/runtime/ProductionQueueRuntime";
import { getServiceSupabase } from "@/lib/shared/supabase/service";
import {
  resolveInvestorStudioGenerationJobs,
  assertInvestorStudioGenerationReady,
} from "./AvantiqoInvestorStudioGenerationRuntime";
import { AVANTIQO_INVESTOR_STUDIO_GENERATION_PLAN } from "./AvantiqoInvestorStudioGenerationPlan";
import {
  AVANTIQO_INVESTOR_CAPABILITY_VISUAL_CHOREOGRAPHY,
  investorSceneVisualChoreography,
} from "./AvantiqoInvestorCapabilityVisualChoreography";
import {
  enforceInvestorOwnedProjectTasks,
  investorOwnedProviderPolicy,
} from "./AvantiqoInvestorOwnedExecutionPolicy";

const supabase = getServiceSupabase();
const ORGANIZATION_ID = AVANTIQO_INVESTOR_STUDIO_GENERATION_PLAN.organization_id;
const MISSION_CONTRACT = "AVANTIQO_INVESTOR_STUDIO_MISSION_V3";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function timestamp(value) {
  const parsed = Date.parse(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function organizationContext() {
  const { data, error } = await supabase
    .from("organizations")
    .select("id,name,legal_name,industry,country,organization_type,status,organization_status")
    .eq("id", ORGANIZATION_ID)
    .single();
  if (error) throw error;
  if (!data?.id) throw new Error("INVESTOR_STUDIO_ORGANIZATION_REQUIRED");
  return data;
}

function organizationGrounding(organization = {}) {
  const organizationName = text(organization.name || organization.legal_name);
  if (!organizationName) {
    throw new Error("INVESTOR_STUDIO_ORGANIZATION_IDENTITY_REQUIRED");
  }

  const legalName = text(organization.legal_name) || null;
  const industry = text(organization.industry) || null;
  const country = text(organization.country).toUpperCase() || null;
  const organizationType = text(organization.organization_type) || null;

  return {
    organization_name: organizationName,
    organization_legal_name: legalName,
    organization_industry: industry,
    organization_country: country,
    organization_type: organizationType,
    organization_grounding: {
      contract: "CREATIVE_ORGANIZATION_GROUNDING_V1",
      organization_id: ORGANIZATION_ID,
      canonical_name: organizationName,
      legal_name: legalName,
      industry,
      country,
      organization_type: organizationType,
      source: "organizations",
    },
  };
}

function missionMetadata(job, organization = {}) {
  const choreography = investorSceneVisualChoreography(job.scene);
  return {
    contract: MISSION_CONTRACT,
    investor_project_id: AVANTIQO_INVESTOR_STUDIO_GENERATION_PLAN.investor_project_id,
    investor_scene: job.scene,
    fresh_generation_required: true,
    existing_asset_policy: "GROUNDING_REFERENCE_ONLY",
    output_policy: "FRESH_GENERATION_ONLY",
    product_screenshot_allowed: false,
    extracted_screenshot_fragment_allowed: false,
    browser_window_allowed: false,
    reused_finished_media_allowed: false,
    provider_selection_exposed: false,
    owned_only_required: true,
    external_ai_provider_allowed: false,
    external_provider_fallback_allowed: false,
    external_provider_role: "FORBIDDEN",
    reasoning_provider_policy: investorOwnedProviderPolicy("ai.reasoning.execute"),
    research_policy: {
      mode: "INTERNAL_CREATIVE",
      external_research_required: false,
    },
    capability_visual_role: job.capability_visual_role,
    duration_seconds: job.duration_seconds,
    service_requirements: job.service_requirements,
    required_fresh_outputs: job.required_fresh_outputs,
    required_business_objects: job.required_business_objects,
    editorial_only: job.editorial_only,
    visual_choreography_contract:
      AVANTIQO_INVESTOR_CAPABILITY_VISUAL_CHOREOGRAPHY.contract,
    visual_choreography: choreography,
    ...organizationGrounding(organization),
  };
}

function taskCapability(task = {}) {
  return text(task.capability || task.service_code || task.service_id);
}

function validateFreshPlan(job, routed) {
  const plan = routed?.pipeline?.master_plan?.plan || {};
  const scenes = list(plan.scenes);
  const tasks = list(routed?.pipeline?.tasks);
  const serialized = JSON.stringify(plan).toLowerCase();
  const forbidden = [
    "existing_asset",
    "use_existing_or_edit_first",
    "screenshot",
    "browser window",
    "browser_window",
    "dashboard screenshot",
    "screen inside screen",
  ];
  const violations = forbidden.filter((token) => serialized.includes(token));
  const generatedSceneCount = scenes.filter((scene) =>
    text(scene.production_method).toLowerCase() === "generated_scene" ||
    ["ai.video.generate", "ai.image.generate"].includes(text(scene.capability_needed)),
  ).length;

  const taskCapabilities = new Set(tasks.map(taskCapability).filter(Boolean));
  const requiredCapabilities = list(job.service_requirements)
    .map((entry) => text(entry?.capability_id || entry?.requested))
    .filter(Boolean);
  const missingTaskCapabilities = requiredCapabilities.filter(
    (capability) => !taskCapabilities.has(capability),
  );

  if (violations.length) {
    throw new Error(
      `INVESTOR_STUDIO_FRESH_PLAN_VIOLATION:SCENE_${job.scene}:${violations.join(",")}`,
    );
  }
  if (!generatedSceneCount && !tasks.some((task) =>
    ["ai.video.generate", "ai.image.generate"].includes(taskCapability(task)),
  )) {
    throw new Error(`INVESTOR_STUDIO_GENERATION_TASK_REQUIRED:SCENE_${job.scene}`);
  }
  if (missingTaskCapabilities.length) {
    throw new Error(
      `INVESTOR_STUDIO_REQUIRED_CAPABILITY_TASK_MISSING:SCENE_${job.scene}:${missingTaskCapabilities.join(",")}`,
    );
  }

  return {
    scenes: scenes.length,
    generated_scenes: generatedSceneCount,
    tasks: tasks.length,
    required_capabilities: requiredCapabilities,
    task_capabilities: [...taskCapabilities],
    capability_complete: true,
  };
}

function reusableProjectMatches(project = {}, job) {
  return (
    text(project.organization_id) === ORGANIZATION_ID &&
    Number(project.metadata?.investor_scene) === Number(job.scene) &&
    text(project.metadata?.investor_project_id) ===
      text(AVANTIQO_INVESTOR_STUDIO_GENERATION_PLAN.investor_project_id) &&
    project.metadata?.fresh_generation_required === true
  );
}

async function ensureMissionAndProject(job, organization) {
  const title = `Investor Film Scene ${job.scene} - Fresh Studio Generation`;
  const metadata = missionMetadata(job, organization);
  const projects = await CreativeProjectRuntime.list({ organizationId: ORGANIZATION_ID });
  const reusable = list(projects)
    .filter((project) => reusableProjectMatches(project, job))
    .sort(
      (left, right) =>
        timestamp(right.updated_at || right.created_at) -
        timestamp(left.updated_at || left.created_at),
    )[0] || null;

  if (reusable) {
    let mission = reusable.creative_mission_id
      ? await CreativeMissionRuntime.get(reusable.creative_mission_id).catch(() => null)
      : null;

    if (!mission) {
      mission = await CreativeMissionRuntime.create({
        organization_id: ORGANIZATION_ID,
        name: title,
        objective: job.objective,
        metadata,
      });
    }

    const project = await CreativeProjectRuntime.update(reusable.id, {
      creative_mission_id: mission.id,
      name: title,
      objective: job.objective,
      production_type: "VIDEO",
      target_duration: job.duration_seconds,
      metadata: {
        ...(reusable.metadata || {}),
        ...metadata,
      },
    });

    return { mission, project, resumed: true };
  }

  const mission = await CreativeMissionRuntime.create({
    organization_id: ORGANIZATION_ID,
    name: title,
    objective: job.objective,
    metadata,
  });
  const project = await CreativeProjectRuntime.create({
    organization_id: ORGANIZATION_ID,
    creative_mission_id: mission.id,
    name: title,
    objective: job.objective,
    production_type: "VIDEO",
    target_duration: job.duration_seconds,
    metadata,
  });

  return { mission, project, resumed: false };
}

async function prepareContext(job, organization) {
  const context = await ensureMissionAndProject(job, organization);
  return {
    scene: job.scene,
    mission_id: context.mission.id,
    project_id: context.project.id,
    resumed: context.resumed,
    objective: job.objective,
    visual_choreography: investorSceneVisualChoreography(job.scene),
    required_capabilities: list(job.service_requirements).map((entry) =>
      text(entry?.capability_id || entry?.requested),
    ).filter(Boolean),
  };
}

async function directJob(job, organization) {
  const metadata = missionMetadata(job, organization);
  const { mission, project, resumed } = await ensureMissionAndProject(job, organization);
  const choreography = investorSceneVisualChoreography(job.scene);

  const routed = await CreativeDirectorRuntime.execute({
    organization_id: ORGANIZATION_ID,
    creative_mission_id: mission.id,
    creative_project_id: project.id,
    mission_id: mission.id,
    project_id: project.id,
    organization,
    industry: organization.industry || null,
    objective: job.objective,
    assets: [],
    brief: {
      creative_objective: job.objective,
      duration_seconds: job.duration_seconds,
      metadata,
      visual_choreography: choreography,
      constraints: [
        "Fresh generation only",
        "Avantiqo-owned intelligence and media engines only",
        "External AI providers are forbidden for this investor film",
        "No product screenshots",
        "No extracted screenshot fragments",
        "No browser windows",
        "No reused finished campaign assets",
        "No generic AI orb",
        "No repeated laptop operator",
        "No giant explanatory captions",
        "Use actual Avantiqo capabilities as semantic grounding",
        "Every required generation capability must exist as an executable production task",
        ...list(choreography?.beats).map((beat) => `Visual beat: ${beat}`),
      ],
    },
  });

  if (routed?.success === false) {
    throw new Error(
      `INVESTOR_STUDIO_DIRECTOR_FAILED:SCENE_${job.scene}:${text(routed.status || routed.reason)}`,
    );
  }

  const freshPlan = validateFreshPlan(job, routed);
  const ownedTaskEnforcement = await enforceInvestorOwnedProjectTasks({
    organization_id: ORGANIZATION_ID,
    creative_project_id: project.id,
  });

  return {
    scene: job.scene,
    mission_id: mission.id,
    project_id: project.id,
    resumed,
    objective: job.objective,
    visual_choreography: choreography,
    fresh_plan: freshPlan,
    owned_task_enforcement: ownedTaskEnforcement,
    task_count: list(routed?.pipeline?.tasks).length,
    routed,
  };
}

export async function prepareInvestorStudioScenes({ scenes } = {}) {
  const resolution = assertInvestorStudioGenerationReady(
    await resolveInvestorStudioGenerationJobs({ scenes }),
  );
  const organization = await organizationContext();
  const prepared = [];

  for (const job of resolution.jobs) {
    prepared.push(await prepareContext(job, organization));
  }

  return {
    success: true,
    contract: "AVANTIQO_INVESTOR_STUDIO_PREPARATION_V3",
    organization_id: ORGANIZATION_ID,
    mode: "NO_SPEND_CONTEXT_AND_CAPABILITY_PREPARATION",
    fresh_generation_required: true,
    owned_only_required: true,
    external_ai_provider_allowed: false,
    prepared,
  };
}

export async function executeInvestorStudioScenes({
  scenes,
  spendApproved = false,
  maxTasksPerScene = 24,
  maxPassesPerScene = 60,
} = {}) {
  if (spendApproved !== true) {
    throw new Error("INVESTOR_STUDIO_SPEND_APPROVAL_REQUIRED");
  }

  const resolution = assertInvestorStudioGenerationReady(
    await resolveInvestorStudioGenerationJobs({ scenes }),
  );
  const organization = await organizationContext();
  const results = [];

  for (const job of resolution.jobs) {
    const prepared = await directJob(job, organization);
    await enforceInvestorOwnedProjectTasks({
      organization_id: ORGANIZATION_ID,
      creative_project_id: prepared.project_id,
    });

    const dispatch = await ProductionQueueRuntime.dispatchAll(
      {
        organization_id: ORGANIZATION_ID,
        creative_project_id: prepared.project_id,
      },
      {
        maxTasks: maxTasksPerScene,
        maxPasses: maxPassesPerScene,
        runPostProduction: true,
        pollRunning: true,
      },
    );

    const queue = dispatch.queue || {};
    const failed = list(queue.failed);
    const blocked = list(queue.blocked);
    const running = list(queue.running);
    const waiting = list(queue.waiting);

    results.push({
      scene: job.scene,
      mission_id: prepared.mission_id,
      project_id: prepared.project_id,
      resumed: prepared.resumed,
      owned_only_required: true,
      external_ai_provider_allowed: false,
      visual_choreography: prepared.visual_choreography,
      dispatched: dispatch.total || 0,
      polled: dispatch.poll_total || 0,
      passes: dispatch.passes || 0,
      completed: list(queue.completed).length,
      failed: failed.map((task) => ({
        id: task.id,
        kind: task.kind,
        capability: taskCapability(task),
        provider: task.provider_id || task.output?.provider || null,
        error: task.error || task.failure_reason || null,
      })),
      blocked: blocked.length,
      running: running.length,
      waiting: waiting.length,
      settled: failed.length === 0 && blocked.length === 0 && running.length === 0 && waiting.length === 0,
      finalisation: dispatch.finalisation || null,
    });

    if (failed.length || blocked.length) break;
  }

  return {
    success: results.length > 0 && results.every((entry) => entry.settled),
    contract: "AVANTIQO_INVESTOR_STUDIO_EXECUTION_V3",
    organization_id: ORGANIZATION_ID,
    provider_selection_exposed: false,
    fresh_generation_required: true,
    owned_only_required: true,
    external_ai_provider_allowed: false,
    results,
  };
}

export const AvantiqoInvestorStudioExecutionRuntime = Object.freeze({
  prepare: prepareInvestorStudioScenes,
  execute: executeInvestorStudioScenes,
});

export default AvantiqoInvestorStudioExecutionRuntime;
