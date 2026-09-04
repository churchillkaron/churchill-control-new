import {
  CreativeMissionRuntime,
} from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  CreativeBriefRuntime,
} from "@/lib/creative/brief/runtime/CreativeBriefRuntime";
import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import {
  CreativeOwnedInvestorFilmMissionRuntime,
} from "@/lib/creative/director/runtime/CreativeOwnedInvestorFilmMissionRuntime";
import {
  buildCreativePipeline,
} from "@/lib/creative/director/orchestrator/CreativePipelineOrchestrator";
import {
  ProductionRuntime,
} from "@/lib/creative/production/runtime/ProductionRuntime";

export const CREATIVE_OWNED_INVESTOR_FILM_PRODUCTION_CONTRACT =
  "CREATIVE_OWNED_INVESTOR_FILM_PRODUCTION_V1";

export const AVANTIQO_PLATFORM_ORGANIZATION_ID =
  "9a148429-b6a0-4bc6-ac83-a35c64fb7045";

const LEGACY_WRONG_ORGANIZATION_ID =
  "33336a72-acb5-474e-856b-8be0269360e2";
const MINIMUM_DURATION_SECONDS = 240;
const MAXIMUM_DURATION_SECONDS = 300;
const DEFAULT_DURATION_SECONDS = 270;
const MASTER_RESOLUTION = "3840x2160";

export const INVESTOR_FILM_NO_CAPTURE_POLICY = Object.freeze({
  contract: "AVANTIQO_INVESTOR_FILM_NO_CAPTURE_POLICY_V1",
  screenshot_allowed: false,
  print_screen_allowed: false,
  browser_capture_allowed: false,
  desktop_recording_allowed: false,
  screen_inside_screen_allowed: false,
  static_dashboard_demo_allowed: false,
  image_generation_allowed: false,
  generated_interface_choreography_allowed: true,
  product_truth_must_be_grounded: true,
  business_consequence_required: true,
});

const FORBIDDEN_POSITIVE_VISUAL_PATTERNS = Object.freeze([
  /\bscreen\s*shot(s)?\b/i,
  /\bprint\s*screen\b/i,
  /\bscreen\s*capture\b/i,
  /\bbrowser\s*capture\b/i,
  /\bdesktop\s*(recording|capture)\b/i,
  /\bscreen[-\s]*inside[-\s]*screen\b/i,
  /\bstatic\s+dashboard\s+(demo|shot|view|capture)\b/i,
  /\brecord(?:ed|ing)?\s+(the\s+)?browser\b/i,
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function requestedDuration(value) {
  const duration = finite(value ?? DEFAULT_DURATION_SECONDS);
  if (
    duration === null ||
    duration < MINIMUM_DURATION_SECONDS ||
    duration > MAXIMUM_DURATION_SECONDS
  ) {
    throw new Error(
      `CREATIVE_INVESTOR_FILM_DURATION_OUT_OF_RANGE:${duration ?? "UNRESOLVED"}`,
    );
  }
  return duration;
}

function assertAvantiqoOrganization(value) {
  const organization_id = text(value || AVANTIQO_PLATFORM_ORGANIZATION_ID);
  if (organization_id === LEGACY_WRONG_ORGANIZATION_ID) {
    throw new Error("CREATIVE_INVESTOR_FILM_CHURCHILL_ORGANIZATION_REJECTED");
  }
  if (organization_id !== AVANTIQO_PLATFORM_ORGANIZATION_ID) {
    throw new Error(
      `CREATIVE_INVESTOR_FILM_PLATFORM_ORGANIZATION_REQUIRED:${organization_id || "UNRESOLVED"}`,
    );
  }
  return organization_id;
}

function productionMissionInput({ organization_id, duration }) {
  return {
    organization_id,
    title: "Avantiqo — The Intelligent Business Operating System | Investor Film 2026",
    business_goal:
      "Make a serious investor understand why Avantiqo is a coherent intelligent operating system for business rather than another collection of disconnected software modules.",
    objective:
      "Create a release-grade cinematic investor film that begins with the human cost of fragmented business systems, reveals Avantiqo as one connected context and execution layer, proves real current product breadth through grounded generated interface choreography and business consequences, then closes on the compounding value of an operating system that can understand, decide and execute with governance. Never use screenshots, browser captures, static dashboard recordings or image-generation shots.",
    audience: {
      primary: "serious investors and strategic partners",
      sophistication: "enterprise software, AI and operating-model literate",
      desired_change:
        "From seeing Avantiqo as software to understanding it as an intelligent governed business operating system.",
    },
    channels: ["INVESTOR_FILM", "PRIVATE_SCREENING", "WEB"],
    status: "draft",
    approval_state: "not_required",
    metadata: {
      source: "owned_investor_film_production_runtime",
      production_type: "VIDEO",
      target_duration: duration,
      target_languages: ["en"],
      quality_profile: "WORLD_CLASS",
      aspect_ratio: "16:9",
      master_resolution: "4K",
      master_resolution_pixels: MASTER_RESOLUTION,
      temporal_contract: {
        duration_seconds: duration,
        mode: "MASTER_DURATION",
      },
      investor_story_strategy: {
        opening: "business fragmentation is a human and economic cost, not a software inconvenience",
        reveal: "one shared business context turns scattered tools into coordinated intelligence and action",
        proof: "show governed execution across materially different business domains through consequences, not a feature carousel",
        close: "the value compounds when the operating system learns the business and coordinates work across it",
      },
      no_print_screen_policy: INVESTOR_FILM_NO_CAPTURE_POLICY,
      creative_solution_source: "AVANTIQO_OWNED_INTELLIGENCE_NEW_DIRECTION",
      old_investor_script_authority: false,
      external_intelligence_fallback_allowed: false,
    },
  };
}

async function ensureDedicatedMission({
  organization_id,
  creative_mission_id = null,
  duration,
}) {
  if (creative_mission_id) {
    const existing = await CreativeMissionRuntime.get(creative_mission_id);
    if (!existing || text(existing.organization_id) !== organization_id) {
      throw new Error("CREATIVE_INVESTOR_FILM_MISSION_NOT_FOUND_IN_PLATFORM_ORGANIZATION");
    }
    const existingDuration = finite(existing.metadata?.target_duration);
    if (existingDuration && existingDuration < MINIMUM_DURATION_SECONDS) {
      throw new Error(
        `CREATIVE_INVESTOR_FILM_LEGACY_SHORT_MISSION_REJECTED:${existingDuration}`,
      );
    }
    return CreativeMissionRuntime.update(existing.id, {
      objective: productionMissionInput({ organization_id, duration }).objective,
      business_goal: productionMissionInput({ organization_id, duration }).business_goal,
      audience: productionMissionInput({ organization_id, duration }).audience,
      channels: productionMissionInput({ organization_id, duration }).channels,
      metadata: {
        ...object(existing.metadata),
        ...productionMissionInput({ organization_id, duration }).metadata,
      },
    });
  }

  return CreativeMissionRuntime.create(
    productionMissionInput({ organization_id, duration }),
  );
}

async function hydrateMissionContext({ organization_id, mission, duration }) {
  const started = await CreativeMissionRuntime.start(mission.id);
  const creative_project_id = text(started.runtime_context?.creative_project_id);
  if (!creative_project_id) {
    throw new Error("CREATIVE_INVESTOR_FILM_PROJECT_NOT_MATERIALIZED");
  }

  let project = await CreativeProjectRuntime.get(creative_project_id);
  if (!project || text(project.organization_id) !== organization_id) {
    throw new Error("CREATIVE_INVESTOR_FILM_PROJECT_NOT_FOUND_IN_PLATFORM_ORGANIZATION");
  }
  project = await CreativeProjectRuntime.update(project.id, {
    target_duration: duration,
    quality_profile: "WORLD_CLASS",
    metadata: {
      ...object(project.metadata),
      temporal_contract: {
        ...object(project.metadata?.temporal_contract),
        duration_seconds: duration,
        mode: "MASTER_DURATION",
      },
      full_master_duration: duration,
      master_resolution: "4K",
      master_resolution_pixels: MASTER_RESOLUTION,
      aspect_ratio: "16:9",
      no_print_screen_policy: INVESTOR_FILM_NO_CAPTURE_POLICY,
      old_investor_script_authority: false,
      external_intelligence_fallback_allowed: false,
    },
  });

  const briefs = await CreativeBriefRuntime.list({
    organization_id,
    creative_mission_id: mission.id,
    creative_project_id: project.id,
  });
  let brief = briefs[0] || null;
  if (!brief) {
    throw new Error("CREATIVE_INVESTOR_FILM_BRIEF_NOT_MATERIALIZED");
  }
  brief = await CreativeBriefRuntime.update(brief.id, {
    duration_seconds: duration,
    creative_objective: mission.objective,
    business_goal: mission.business_goal,
    context: {
      ...object(brief.context),
      investor_film: true,
      master_resolution: "4K",
      master_resolution_pixels: MASTER_RESOLUTION,
      no_print_screen_policy: INVESTOR_FILM_NO_CAPTURE_POLICY,
    },
    metadata: {
      ...object(brief.metadata),
      target_duration: duration,
      master_resolution: "4K",
      master_resolution_pixels: MASTER_RESOLUTION,
      no_print_screen_policy: INVESTOR_FILM_NO_CAPTURE_POLICY,
      old_investor_script_authority: false,
      external_intelligence_fallback_allowed: false,
    },
  });

  const assets = await CreativeAssetsRuntime.list({
    organization_id,
    creative_mission_id: mission.id,
    creative_project_id: project.id,
  });

  return {
    mission: { ...mission, ...started },
    project,
    brief,
    assets,
  };
}

function totalPlanDuration(plan = {}) {
  return list(plan.scenes).reduce(
    (sum, scene) => sum + Number(scene.duration_seconds || 0),
    0,
  );
}

function positiveVisualValues(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(positiveVisualValues);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value)
    .filter(([key]) => ![
      "negative_constraints",
      "known_failure_modes",
      "repair_instructions",
      "restrictions",
      "safety",
    ].includes(key))
    .flatMap(([, nested]) => positiveVisualValues(nested));
}

function shotPositiveVisualCorpus(shot = {}) {
  return positiveVisualValues({
    title: shot.title,
    purpose: shot.purpose,
    subject: shot.subject,
    action: shot.action,
    performance: shot.performance,
    device: shot.device,
    opening_frame: shot.opening_frame,
    progression: shot.progression,
    closing_frame: shot.closing_frame,
    camera: shot.camera,
    lighting: shot.lighting,
    production_design: shot.production_design,
    graphics: shot.graphics,
    vfx: shot.vfx,
    frame_plan: shot.frame_plan,
    generation_input: shot.generation?.input,
  }).join(" \n");
}

function assertNoCaptureVisuals(plan = {}) {
  for (const scene of list(plan.scenes)) {
    for (const shot of list(scene.shots)) {
      const corpus = shotPositiveVisualCorpus(shot);
      const forbidden = FORBIDDEN_POSITIVE_VISUAL_PATTERNS.find((pattern) =>
        pattern.test(corpus),
      );
      if (forbidden) {
        throw new Error(
          `CREATIVE_INVESTOR_FILM_CAPTURE_VISUAL_REJECTED:${text(scene.id)}:${text(shot.id)}`,
        );
      }
    }
  }
}

function assertVideoGenerationOnly(plan = {}) {
  for (const scene of list(plan.scenes)) {
    for (const shot of list(scene.shots)) {
      const generation = object(shot.generation);
      const service = text(generation.service).toLowerCase();
      const capability = text(generation.capability).toLowerCase();
      if (!service || !capability) {
        throw new Error(
          `CREATIVE_INVESTOR_FILM_SHOT_GENERATION_UNRESOLVED:${text(scene.id)}:${text(shot.id)}`,
        );
      }
      if (service.includes("image") || capability.includes("image")) {
        throw new Error(
          `CREATIVE_INVESTOR_FILM_IMAGE_GENERATION_REJECTED:${text(scene.id)}:${text(shot.id)}`,
        );
      }
      if (!service.includes("video") && !capability.includes("video")) {
        throw new Error(
          `CREATIVE_INVESTOR_FILM_VIDEO_GENERATION_REQUIRED:${text(scene.id)}:${text(shot.id)}`,
        );
      }
    }
  }
}

function assert4KMaster(plan = {}) {
  const deliverable = list(plan.deliverables)[0] || {};
  const resolution = text(deliverable.output_spec?.resolution).toLowerCase();
  const accepted = [
    "4k",
    "uhd",
    "3840x2160",
    "3840×2160",
    "3840 x 2160",
    "3840 × 2160",
  ];
  if (!accepted.some((value) => resolution.includes(value))) {
    throw new Error(
      `CREATIVE_INVESTOR_FILM_4K_MASTER_REQUIRED:${resolution || "UNRESOLVED"}`,
    );
  }

  for (const scene of list(plan.scenes)) {
    for (const shot of list(scene.shots)) {
      const shotResolution = text(shot.generation?.output_spec?.resolution).toLowerCase();
      if (!accepted.some((value) => shotResolution.includes(value))) {
        throw new Error(
          `CREATIVE_INVESTOR_FILM_4K_SHOT_REQUIRED:${text(scene.id)}:${text(shot.id)}:${shotResolution || "UNRESOLVED"}`,
        );
      }
    }
  }
}

function assertReleasePlan(planning = {}, targetDuration) {
  if (planning.success !== true) {
    throw new Error("CREATIVE_INVESTOR_FILM_OWNED_PLANNING_REQUIRED");
  }
  if (text(planning.organization_id) !== AVANTIQO_PLATFORM_ORGANIZATION_ID) {
    throw new Error("CREATIVE_INVESTOR_FILM_WRONG_ORGANIZATION");
  }
  if (planning.certification?.planning_certified !== true) {
    throw new Error("CREATIVE_INVESTOR_FILM_PLANNING_CERTIFICATION_REQUIRED");
  }
  if (planning.certification?.gpu_generation_performed === true) {
    throw new Error("CREATIVE_INVESTOR_FILM_PLANNER_CANNOT_CLAIM_GPU_GENERATION");
  }

  const plan = object(planning.temporal_direction?.plan);
  if (!Object.keys(plan).length || plan.validation?.passed !== true) {
    throw new Error("CREATIVE_INVESTOR_FILM_TEMPORAL_MASTER_REQUIRED");
  }
  const duration = totalPlanDuration(plan);
  if (
    duration < MINIMUM_DURATION_SECONDS ||
    duration > MAXIMUM_DURATION_SECONDS ||
    Math.abs(duration - targetDuration) > 0.05
  ) {
    throw new Error(
      `CREATIVE_INVESTOR_FILM_MASTER_DURATION_INVALID:${duration}`,
    );
  }

  assertVideoGenerationOnly(plan);
  assertNoCaptureVisuals(plan);
  assert4KMaster(plan);
  return plan;
}

function productionDossier(pipeline = {}) {
  return object(pipeline.execution?.production_dossier);
}

export async function prepareOwnedInvestorFilmProduction(input = {}) {
  const organization_id = assertAvantiqoOrganization(input.organization_id);
  const duration = requestedDuration(input.target_duration_seconds);
  const mission = await ensureDedicatedMission({
    organization_id,
    creative_mission_id: input.creative_mission_id || input.mission_id || null,
    duration,
  });
  const context = await hydrateMissionContext({
    organization_id,
    mission,
    duration,
  });

  const planning = await CreativeOwnedInvestorFilmMissionRuntime.create({
    organization_id,
    mission: context.mission,
    project: context.project,
    brief: context.brief,
    assets: context.assets,
    target_duration_seconds: duration,
  });
  const plan = assertReleasePlan(planning, duration);

  const pipeline = await buildCreativePipeline({
    organization_id,
    creative_mission_id: context.mission.id,
    creative_project_id: context.project.id,
    brief: context.brief,
    master: planning.temporal_direction,
  });
  const dossier = productionDossier(pipeline);
  if (!Object.keys(dossier).length) {
    throw new Error("CREATIVE_INVESTOR_FILM_PRODUCTION_DOSSIER_REQUIRED");
  }

  const awaitingApproval =
    dossier.approval_required === true && dossier.approved !== true;

  return {
    success: true,
    contract: CREATIVE_OWNED_INVESTOR_FILM_PRODUCTION_CONTRACT,
    status: awaitingApproval
      ? "AWAITING_PRODUCTION_DOSSIER_APPROVAL"
      : "READY_FOR_PRODUCTION",
    organization_id,
    creative_mission_id: context.mission.id,
    creative_project_id: context.project.id,
    target_duration_seconds: duration,
    master_resolution: "4K",
    master_resolution_pixels: MASTER_RESOLUTION,
    no_capture_policy: INVESTOR_FILM_NO_CAPTURE_POLICY,
    planning,
    plan,
    pipeline,
    production_dossier: dossier,
    production_started: false,
    gpu_generation_performed: false,
    release_master_certified: false,
  };
}

export async function executeApprovedOwnedInvestorFilmProduction(input = {}) {
  const organization_id = assertAvantiqoOrganization(input.organization_id);
  const creative_project_id = text(input.creative_project_id || input.project_id);
  const creative_mission_id = text(input.creative_mission_id || input.mission_id);
  if (!creative_project_id || !creative_mission_id) {
    throw new Error("CREATIVE_INVESTOR_FILM_EXECUTION_SCOPE_REQUIRED");
  }

  const project = await CreativeProjectRuntime.get(creative_project_id);
  if (!project || text(project.organization_id) !== organization_id) {
    throw new Error("CREATIVE_INVESTOR_FILM_PROJECT_NOT_FOUND_IN_PLATFORM_ORGANIZATION");
  }
  const mission = await CreativeMissionRuntime.get(creative_mission_id);
  if (!mission || text(mission.organization_id) !== organization_id) {
    throw new Error("CREATIVE_INVESTOR_FILM_MISSION_NOT_FOUND_IN_PLATFORM_ORGANIZATION");
  }

  const production = await ProductionRuntime.runProduction({
    organization_id,
    creative_mission_id,
    creative_project_id,
  });

  return {
    success: production?.success !== false,
    contract: CREATIVE_OWNED_INVESTOR_FILM_PRODUCTION_CONTRACT,
    status: production?.status || "PRODUCTION_SUBMITTED",
    organization_id,
    creative_mission_id,
    creative_project_id,
    production,
    production_dossier_gate_bypassed: false,
  };
}

export const CreativeOwnedInvestorFilmProductionRuntime = Object.freeze({
  contract: CREATIVE_OWNED_INVESTOR_FILM_PRODUCTION_CONTRACT,
  platform_organization_id: AVANTIQO_PLATFORM_ORGANIZATION_ID,
  no_capture_policy: INVESTOR_FILM_NO_CAPTURE_POLICY,
  prepare: prepareOwnedInvestorFilmProduction,
  executeApproved: executeApprovedOwnedInvestorFilmProduction,
});
