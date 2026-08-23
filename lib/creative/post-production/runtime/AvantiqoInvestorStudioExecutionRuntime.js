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

const supabase = getServiceSupabase();
const ORGANIZATION_ID = AVANTIQO_INVESTOR_STUDIO_GENERATION_PLAN.organization_id;

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
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

function missionMetadata(job) {
  return {
    contract: "AVANTIQO_INVESTOR_STUDIO_MISSION_V1",
    investor_project_id: AVANTIQO_INVESTOR_STUDIO_GENERATION_PLAN.investor_project_id,
    investor_scene: job.scene,
    fresh_generation_required: true,
    existing_asset_policy: "GROUNDING_REFERENCE_ONLY",
    output_policy: "FRESH_GENERATION_ONLY",
    product_screenshot_allowed: false,
    extracted_screenshot_fragment_allowed: false,
    browser_window_allowed: false,
    provider_selection_exposed: false,
    capability_visual_role: job.capability_visual_role,
    duration_seconds: job.duration_seconds,
    service_requirements: job.service_requirements,
    required_fresh_outputs: job.required_fresh_outputs,
    required_business_objects: job.required_business_objects,
    editorial_only: job.editorial_only,
  };
}

function validateFreshPlan(job, routed) {
  const plan = routed?.pipeline?.master_plan?.plan || {};
  const scenes = list(plan.scenes);
  const serialized = JSON.stringify(plan).toLowerCase();
  const forbidden = [
    "existing_asset",
    "use_existing_or_edit_first",
    "screenshot",
    "browser window",
    "browser_window",
    "dashboard screenshot",
  ];
  const violations = forbidden.filter((token) => serialized.includes(token));
  const generatedSceneCount = scenes.filter((scene) =>
    text(scene.production_method).toLowerCase() === "generated_scene" ||
    text(scene.capability_needed) === "ai.video.generate" ||
    text(scene.capability_needed) === "ai.image.generate",
  ).length;

  if (violations.length) {
    throw new Error(
      `INVESTOR_STUDIO_FRESH_PLAN_VIOLATION:SCENE_${job.scene}:${violations.join(",")}`,
    );
  }
  if (!generatedSceneCount && !list(routed?.pipeline?.tasks).some((task) =>
    ["ai.video.generate", "ai.image.generate"].includes(
      text(task.capability || task.service_code || task.service_id),
    ),
  )) {
    throw new Error(`INVESTOR_STUDIO_GENERATION_TASK_REQUIRED:SCENE_${job.scene}`);
  }

  return {
    scenes: scenes.length,
    generated_scenes: generatedSceneCount,
    tasks: list(routed?.pipeline?.tasks).length,
  };
}

async function prepareJob(job, organization) {
  const title = `Investor Film Scene ${job.scene} - Fresh Studio Generation`;
  const metadata = missionMetadata(job);

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
      constraints: [
        "Fresh generation only",
        "No product screenshots",
        "No extracted screenshot fragments",
        "No browser windows",
        "No reused finished campaign assets",
        "No generic AI orb",
        "No repeated laptop operator",
        "No giant explanatory captions",
        "Use actual Avantiqo capabilities as semantic grounding",
      ],
    },
  });

  if (routed?.success === false) {
    throw new Error(
      `INVESTOR_STUDIO_DIRECTOR_FAILED:SCENE_${job.scene}:${text(routed.status || routed.reason)}`,
    );
  }

  const freshPlan = validateFreshPlan(job, routed);
  return {
    scene: job.scene,
    mission_id: mission.id,
    project_id: project.id,
    objective: job.objective,
    fresh_plan: freshPlan,
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
    prepared.push(await prepareJob(job, organization));
  }

  return {
    success: true,
    contract: "AVANTIQO_INVESTOR_STUDIO_PREPARATION_V1",
    organization_id: ORGANIZATION_ID,
    fresh_generation_required: true,
    prepared: prepared.map((entry) => ({
      scene: entry.scene,
      mission_id: entry.mission_id,
      project_id: entry.project_id,
      task_count: entry.task_count,
      fresh_plan: entry.fresh_plan,
    })),
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
    const prepared = await prepareJob(job, organization);
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
      dispatched: dispatch.total || 0,
      polled: dispatch.poll_total || 0,
      passes: dispatch.passes || 0,
      completed: list(queue.completed).length,
      failed: failed.map((task) => ({ id: task.id, kind: task.kind, error: task.error || task.failure_reason || null })),
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
    contract: "AVANTIQO_INVESTOR_STUDIO_EXECUTION_V1",
    organization_id: ORGANIZATION_ID,
    provider_selection_exposed: false,
    fresh_generation_required: true,
    results,
  };
}

export const AvantiqoInvestorStudioExecutionRuntime = Object.freeze({
  prepare: prepareInvestorStudioScenes,
  execute: executeInvestorStudioScenes,
});

export default AvantiqoInvestorStudioExecutionRuntime;
