export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeMissionRuntime,
} from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  CreativeDirectorRuntime,
} from "@/lib/creative/director/runtime/CreativeDirectorRuntime";
import {
  CreativeApprovalRuntime,
} from "@/lib/creative/release/runtime/CreativeApprovalRuntime";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  ProductionRuntime,
} from "@/lib/creative/production/runtime/ProductionRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const SOURCE_ASSET_ID = "fc1997d3-ed07-4478-a5a5-6baa484d0074";
const TEST_CONTRACT = "GEMINI_OMNI_FULL_STUDIO_5S_SMOKE_V1";
const TARGET_SECONDS = 5;
const MAXIMUM_VIDEO_CUSTOMER_PRICE_THB = 22.75;

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function json(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}

function errorStatus(error) {
  const message = text(error?.message).toUpperCase();
  if (message.includes("AUTHENTICATION")) return 401;
  if (message.includes("PERMISSION") || message.includes("MEMBERSHIP")) return 403;
  if (message.includes("REQUIRED") || message.includes("INVALID")) return 400;
  if (message.includes("CEILING") || message.includes("APPROVAL")) return 409;
  return 500;
}

function smokeMetadata(mission = {}) {
  return mission.metadata?.gemini_omni_smoke || {};
}

async function findMission() {
  const missions = await CreativeMissionRuntime.list({
    organization_id: ORGANIZATION_ID,
  });
  return missions.find((mission) =>
    mission.metadata?.test_contract === TEST_CONTRACT &&
    mission.status !== "archived"
  ) || null;
}

async function ensureMission(access) {
  let mission = await findMission();
  if (!mission) {
    mission = await CreativeMissionRuntime.create({
      organization_id: ORGANIZATION_ID,
      title: "Gemini Omni 5s Full Studio Smoke Test",
      business_goal:
        "Validate Avantiqo Creative Studio end to end with one governed five-second cinematic video production.",
      objective:
        "Create one continuous five-second cinematic Churchill venue clip from the approved Studio source image, with the full temporal director, storyboard, production-graph, worker, billing, storage and quality workflow involved. Do not publish.",
      audience: {
        type: "internal product validation",
      },
      channels: ["internal_review"],
      metadata: {
        test_contract: TEST_CONTRACT,
        production_type: "VIDEO",
        workflow_kind: "TEMPORAL",
        creative_medium: "VIDEO",
        target_duration: TARGET_SECONDS,
        target_languages: ["en"],
        currency: "THB",
        selected_asset_ids: [SOURCE_ASSET_ID],
        source_asset_id: SOURCE_ASSET_ID,
        scene_count: 1,
        shot_count: 1,
        single_continuous_shot: true,
        desired_outcome:
          "One premium cinematic five-second internal-review clip with native audio and no publication.",
        communication_goal:
          "Prove the complete Creative Studio production chain executes a visually coherent five-second video from a real approved Studio asset.",
        tone: "premium cinematic restrained",
        emotion: "anticipation",
        budget_profile: {
          currency: "THB",
          maximum_customer_price: MAXIMUM_VIDEO_CUSTOMER_PRICE_THB,
          hard_limit: true,
        },
        provider_strategy: {
          video_provider: "gemini",
          video_model: "gemini-omni-flash-preview",
        },
        publication_authorized: false,
        requested_by_user_id: access.userId,
        gemini_omni_smoke: {
          phase: "CREATED",
          target_seconds: TARGET_SECONDS,
          source_asset_id: SOURCE_ASSET_ID,
          maximum_video_customer_price_thb: MAXIMUM_VIDEO_CUSTOMER_PRICE_THB,
          publication_authorized: false,
        },
      },
    });
  }

  const started = await CreativeMissionRuntime.start(mission.id);
  const projectId = started.runtime_context?.creative_project_id;
  if (!projectId) throw new Error("GEMINI_SMOKE_PROJECT_REQUIRED");

  const project = await CreativeProjectRuntime.get(projectId);
  if (!project) throw new Error("GEMINI_SMOKE_PROJECT_NOT_FOUND");

  const updatedProject = await CreativeProjectRuntime.update(project.id, {
    production_type: "VIDEO",
    target_duration: TARGET_SECONDS,
    target_channels: ["internal_review"],
    target_languages: ["en"],
    objective: mission.objective,
    metadata: {
      ...(project.metadata || {}),
      test_contract: TEST_CONTRACT,
      workflow_kind: "TEMPORAL",
      creative_medium: "VIDEO",
      currency: "THB",
      selected_asset_ids: [SOURCE_ASSET_ID],
      source_asset_id: SOURCE_ASSET_ID,
      scene_count: 1,
      shot_count: 1,
      single_continuous_shot: true,
      provider_strategy: {
        video_provider: "gemini",
        video_model: "gemini-omni-flash-preview",
      },
      publication_authorized: false,
    },
  });

  return {
    mission: started,
    project: updatedProject,
  };
}

function videoDuration(task = {}) {
  return number(
    task.input?.generation?.estimated_seconds ||
    task.input?.generation?.duration_seconds ||
    task.timing?.estimated_seconds,
  );
}

async function constrainVideoTask(task) {
  const duration = videoDuration(task);
  if (duration === null || Math.abs(duration - TARGET_SECONDS) > 0.001) {
    throw new Error(
      `GEMINI_SMOKE_STORYBOARD_DURATION_MISMATCH:${duration ?? "missing"}`,
    );
  }

  return ProductionTaskRuntime.update(task.id, {
    provider_id: "gemini",
    input: {
      ...(task.input || {}),
      quantity: TARGET_SECONDS,
      media_duration_seconds: TARGET_SECONDS,
      source_assets: [SOURCE_ASSET_ID],
      provider_policy: {
        ...(task.input?.provider_policy || {}),
        allowed_providers: ["gemini"],
        preferred_providers: ["gemini"],
      },
      generation: {
        ...(task.input?.generation || {}),
        provider: "gemini",
        model: "gemini-omni-flash-preview",
        estimated_seconds: TARGET_SECONDS,
        primary_source_asset_id: SOURCE_ASSET_ID,
        source_binding_contract: "EXPLICIT_SHOT_PRIMARY_SOURCE_V1",
      },
      provider_parameters: {
        ...(task.input?.provider_parameters || {}),
        primary_source_asset_id: SOURCE_ASSET_ID,
        source_binding_contract: "EXPLICIT_SHOT_PRIMARY_SOURCE_V1",
      },
    },
    timing: {
      ...(task.timing || {}),
      estimated_seconds: TARGET_SECONDS,
    },
    metadata: {
      ...(task.metadata || {}),
      test_contract: TEST_CONTRACT,
      forced_test_provider: "gemini",
      target_seconds: TARGET_SECONDS,
      source_asset_id: SOURCE_ASSET_ID,
      publication_authorized: false,
    },
  });
}

async function prepareAndApprove({ access, mission, project }) {
  const direction = await CreativeDirectorRuntime.execute({
    organization_id: ORGANIZATION_ID,
    creative_mission_id: mission.id,
    creative_project_id: project.id,
    workflow_kind: "TEMPORAL",
    objective: mission.objective,
  });

  if (direction.status !== "AWAITING_PRODUCTION_DOSSIER_APPROVAL") {
    throw new Error(
      `GEMINI_SMOKE_EXPECTED_DOSSIER_APPROVAL:${direction.status || "unknown"}`,
    );
  }

  const dossier = direction.pipeline?.execution?.production_dossier;
  if (!dossier?.asset_node_id) {
    throw new Error("GEMINI_SMOKE_DOSSIER_ASSET_REQUIRED");
  }

  const tasks = await ProductionTaskRuntime.list({
    organization_id: ORGANIZATION_ID,
    creative_project_id: project.id,
  });
  const videoTasks = tasks.filter((task) =>
    text(task.capability || task.service_code).toLowerCase() === "ai.video.generate"
  );

  if (videoTasks.length !== 1) {
    throw new Error(`GEMINI_SMOKE_EXACTLY_ONE_VIDEO_TASK_REQUIRED:${videoTasks.length}`);
  }

  await constrainVideoTask(videoTasks[0]);

  const estimatedCost = number(dossier.estimated_cost) ?? 0;
  if (estimatedCost > MAXIMUM_VIDEO_CUSTOMER_PRICE_THB) {
    throw new Error(
      `GEMINI_SMOKE_DOSSIER_COST_EXCEEDS_CEILING:${estimatedCost}`,
    );
  }

  await CreativeApprovalRuntime.approve({
    organization_id: ORGANIZATION_ID,
    subject_asset_node_id: dossier.asset_node_id,
    scope: "PRODUCTION_DOSSIER",
    approver: {
      user_id: access.userId,
      staff_account_id: access.access?.staffAccountId,
      email: access.userEmail || null,
    },
    notes:
      "User-authorized Gemini Omni full Creative Studio five-second smoke test. Production only; publication is not authorized.",
    approved_cost_ceiling: MAXIMUM_VIDEO_CUSTOMER_PRICE_THB,
  });

  await CreativeMissionRuntime.update(mission.id, {
    metadata: {
      ...(mission.metadata || {}),
      gemini_omni_smoke: {
        ...smokeMetadata(mission),
        phase: "DOSSIER_APPROVED",
        target_seconds: TARGET_SECONDS,
        source_asset_id: SOURCE_ASSET_ID,
        dossier_asset_node_id: dossier.asset_node_id,
        dossier_estimated_cost: estimatedCost,
        approved_cost_ceiling: MAXIMUM_VIDEO_CUSTOMER_PRICE_THB,
        publication_authorized: false,
        approved_by_user_id: access.userId,
        approved_by_staff_account_id: access.access?.staffAccountId || null,
        approved_at: new Date().toISOString(),
      },
    },
  });

  return {
    direction_status: direction.status,
    dossier_asset_node_id: dossier.asset_node_id,
    dossier_estimated_cost: estimatedCost,
    video_task_id: videoTasks[0].id,
  };
}

async function runProduction({ mission, project }) {
  const production = await ProductionRuntime.runProduction({
    organization_id: ORGANIZATION_ID,
    creative_project_id: project.id,
  });

  const tasks = await ProductionTaskRuntime.list({
    organization_id: ORGANIZATION_ID,
    creative_project_id: project.id,
  });
  const videoTask = tasks.find((task) =>
    text(task.capability || task.service_code).toLowerCase() === "ai.video.generate"
  ) || null;

  const phase = production.complete
    ? "COMPLETED"
    : production.status || "PRODUCTION_IN_PROGRESS";

  await CreativeMissionRuntime.update(mission.id, {
    metadata: {
      ...(mission.metadata || {}),
      gemini_omni_smoke: {
        ...smokeMetadata(mission),
        phase,
        target_seconds: TARGET_SECONDS,
        source_asset_id: SOURCE_ASSET_ID,
        video_task_id: videoTask?.id || null,
        provider: videoTask?.provider_id || videoTask?.output?.provider || null,
        provider_status: videoTask?.output?.provider_status || null,
        settlement: videoTask?.output?.settlement || null,
        asset_node_id: videoTask?.output?.asset_node_id || null,
        publication_authorized: false,
        updated_at: new Date().toISOString(),
      },
    },
  });

  return {
    production,
    video_task: videoTask
      ? {
          id: videoTask.id,
          status: videoTask.status,
          provider: videoTask.provider_id || videoTask.output?.provider || null,
          provider_status: videoTask.output?.provider_status || null,
          settlement: videoTask.output?.settlement || null,
          usage_id:
            videoTask.output?.usage?.id ||
            videoTask.output?.provider_submission?.usage?.id ||
            null,
          pricing:
            videoTask.output?.pricing ||
            videoTask.output?.provider_submission?.pricing ||
            null,
          asset_node_id: videoTask.output?.asset_node_id || null,
          output_url:
            videoTask.output?.output?.video_url ||
            videoTask.output?.output?.file_url ||
            videoTask.output?.provider_poll?.output?.output?.video_url ||
            videoTask.output?.provider_poll?.output?.output?.file_url ||
            null,
          error: videoTask.error || null,
        }
      : null,
  };
}

async function executeSmokeTest(request) {
  const access = await requireOrganizationAccess({
    organizationId: ORGANIZATION_ID,
    request,
    requiredAnyPermission: [
      "creative.execute",
      "creative.production.run",
      "creative.*",
    ],
  });
  if (!access.success) return json(access, access.status);
  if (!access.access?.staffAccountId) {
    return json({
      success: false,
      error: "Authenticated staff account required",
    }, 403);
  }

  const ensured = await ensureMission(access);
  let mission = await CreativeMissionRuntime.get(ensured.mission.id);
  const project = ensured.project;
  let preparation = null;

  if (smokeMetadata(mission).phase === "COMPLETED") {
    const tasks = await ProductionTaskRuntime.list({
      organization_id: ORGANIZATION_ID,
      creative_project_id: project.id,
    });
    const videoTask = tasks.find((task) =>
      text(task.capability || task.service_code).toLowerCase() === "ai.video.generate"
    ) || null;
    return json({
      success: true,
      contract: TEST_CONTRACT,
      reused: true,
      target_seconds: TARGET_SECONDS,
      publication_authorized: false,
      mission_id: mission.id,
      creative_project_id: project.id,
      phase: "COMPLETED",
      video_task: videoTask
        ? {
            id: videoTask.id,
            status: videoTask.status,
            provider: videoTask.provider_id || videoTask.output?.provider || null,
            settlement: videoTask.output?.settlement || null,
            asset_node_id: videoTask.output?.asset_node_id || null,
          }
        : null,
    });
  }

  if (smokeMetadata(mission).phase !== "DOSSIER_APPROVED" &&
      smokeMetadata(mission).phase !== "PROVIDER_JOBS_RUNNING" &&
      smokeMetadata(mission).phase !== "PRODUCTION_IN_PROGRESS") {
    preparation = await prepareAndApprove({
      access,
      mission,
      project,
    });
    mission = await CreativeMissionRuntime.get(mission.id);
  }

  const result = await runProduction({
    mission,
    project,
  });

  return json({
    success: result.production.success !== false,
    contract: TEST_CONTRACT,
    target_seconds: TARGET_SECONDS,
    exact_provider_duration_control: false,
    source_asset_id: SOURCE_ASSET_ID,
    provider: "gemini",
    model: "gemini-omni-flash-preview",
    maximum_video_customer_price_thb: MAXIMUM_VIDEO_CUSTOMER_PRICE_THB,
    publication_authorized: false,
    mission_id: mission.id,
    creative_project_id: project.id,
    preparation,
    production_status: result.production.status,
    complete: result.production.complete === true,
    video_task: result.video_task,
  });
}

export async function GET(request) {
  try {
    return await executeSmokeTest(request);
  } catch (error) {
    return json({
      success: false,
      contract: TEST_CONTRACT,
      target_seconds: TARGET_SECONDS,
      publication_authorized: false,
      error: error?.message || String(error),
    }, errorStatus(error));
  }
}

export async function POST(request) {
  try {
    return await executeSmokeTest(request);
  } catch (error) {
    return json({
      success: false,
      contract: TEST_CONTRACT,
      target_seconds: TARGET_SECONDS,
      publication_authorized: false,
      error: error?.message || String(error),
    }, errorStatus(error));
  }
}
