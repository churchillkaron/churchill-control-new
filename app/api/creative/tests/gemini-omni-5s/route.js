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
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const SOURCE_ASSET_ID = "fc1997d3-ed07-4478-a5a5-6baa484d0074";
const TEST_CONTRACT = "GEMINI_OMNI_FULL_STUDIO_5S_SMOKE_V1";
const TARGET_SECONDS = 5;
const MAXIMUM_VIDEO_CUSTOMER_PRICE_THB = 22.75;
const VIDEO_APPROVAL_PHRASE = "APPROVE VIDEO 22.75 THB";
const RESEARCH_APPROVAL_CONTRACT = "CREATIVE_RESEARCH_BUDGET_APPROVAL_V1";
const RESEARCH_APPROVAL_PHRASE = "APPROVE RESEARCH 5.2416 THB";
const RESEARCH_APPROVED_PROVIDER = "openai";
const RESEARCH_APPROVED_MODEL = "gpt-4.1-mini";
const RESEARCH_APPROVED_PRICING_ID = "156fbd36-5a2d-48b0-b72d-450bab821a11";
const RESEARCH_MAXIMUM_CUSTOMER_PRICE_THB = 5.2416;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
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
  return object(mission.metadata?.gemini_omni_smoke);
}

function researchApproval(project = {}) {
  return object(project.metadata?.paid_research_approval);
}

function researchAuthorizationAlreadyIssued(project = {}) {
  const approval = researchApproval(project);
  return Boolean(
    text(approval.id) &&
    text(approval.contract) === RESEARCH_APPROVAL_CONTRACT &&
    text(approval.test_contract) === TEST_CONTRACT,
  );
}

function forwardAuthHeaders(request, contentType = false) {
  const headers = new Headers({ Accept: "application/json" });
  const cookie = request.headers.get("cookie");
  const authorization = request.headers.get("authorization");
  if (cookie) headers.set("cookie", cookie);
  if (authorization) headers.set("authorization", authorization);
  if (contentType) headers.set("Content-Type", "application/json");
  return headers;
}

async function readJsonResponse(response) {
  const raw = await response.text();
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return { raw };
  }
}

async function ensureResearchAuthorization({ request, project }) {
  if (researchAuthorizationAlreadyIssued(project)) return project;

  const endpoint = new URL(
    "/api/creative/tests/gemini-omni-5s/research-approval",
    request.url,
  );

  const preflightResponse = await fetch(endpoint, {
    method: "GET",
    headers: forwardAuthHeaders(request),
    cache: "no-store",
    redirect: "manual",
  });
  const preflight = await readJsonResponse(preflightResponse);
  const quote = object(preflight.research);
  const quotedPrice = number(quote.maximum_customer_price);

  if (
    text(quote.provider) !== RESEARCH_APPROVED_PROVIDER ||
    text(quote.model) !== RESEARCH_APPROVED_MODEL ||
    text(quote.pricing_id) !== RESEARCH_APPROVED_PRICING_ID ||
    text(quote.currency).toUpperCase() !== "THB" ||
    quotedPrice === null ||
    quotedPrice <= 0 ||
    quotedPrice > RESEARCH_MAXIMUM_CUSTOMER_PRICE_THB ||
    text(quote.approval_phrase) !== RESEARCH_APPROVAL_PHRASE
  ) {
    throw new Error(
      `GEMINI_SMOKE_RESEARCH_QUOTE_CHANGED:${text(quote.provider) || "unknown"}:${text(quote.model) || "unknown"}:${quotedPrice ?? "unknown"}:${text(quote.currency) || "unknown"}`,
    );
  }

  const approvalResponse = await fetch(endpoint, {
    method: "POST",
    headers: forwardAuthHeaders(request, true),
    body: JSON.stringify({ approval_phrase: RESEARCH_APPROVAL_PHRASE }),
    cache: "no-store",
    redirect: "manual",
  });
  const approvalPayload = await readJsonResponse(approvalResponse);
  const approved = object(approvalPayload.research_approval);

  if (
    !approvalResponse.ok ||
    approvalPayload.success !== true ||
    text(approved.provider) !== RESEARCH_APPROVED_PROVIDER ||
    text(approved.model) !== RESEARCH_APPROVED_MODEL ||
    text(approved.pricing_id) !== RESEARCH_APPROVED_PRICING_ID ||
    text(approved.currency).toUpperCase() !== "THB" ||
    number(approved.maximum_customer_price) === null ||
    number(approved.maximum_customer_price) > RESEARCH_MAXIMUM_CUSTOMER_PRICE_THB ||
    Number(approved.maximum_calls) !== 1
  ) {
    throw new Error(
      `GEMINI_SMOKE_RESEARCH_APPROVAL_FAILED:${text(approvalPayload.error) || approvalResponse.status}`,
    );
  }

  const updatedProject = await CreativeProjectRuntime.get(project.id);
  if (!updatedProject || !researchAuthorizationAlreadyIssued(updatedProject)) {
    throw new Error("GEMINI_SMOKE_RESEARCH_APPROVAL_PERSISTENCE_FAILED");
  }

  return updatedProject;
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
        "Create one continuous five-second cinematic Churchill venue clip from the approved Studio source image, with the full temporal director, storyboard and production-graph workflow involved. Stop before paid video generation and do not publish.",
      audience: { type: "internal product validation" },
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
          "Prove the Creative Studio chain reaches a valid governed production dossier for one five-second Gemini task.",
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
        media_generation_authorized: false,
        requested_by_user_id: access.userId,
        gemini_omni_smoke: {
          phase: "CREATED",
          target_seconds: TARGET_SECONDS,
          source_asset_id: SOURCE_ASSET_ID,
          maximum_video_customer_price_thb: MAXIMUM_VIDEO_CUSTOMER_PRICE_THB,
          publication_authorized: false,
          media_generation_authorized: false,
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
      media_generation_authorized: false,
    },
  });

  return { mission: started, project: updatedProject };
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
      media_generation_authorized: false,
    },
  });
}

async function prepareApprovalBoundary({ mission, project }) {
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

  const constrainedTask = await constrainVideoTask(videoTasks[0]);
  const estimatedCost = number(dossier.estimated_cost) ?? 0;
  if (estimatedCost > MAXIMUM_VIDEO_CUSTOMER_PRICE_THB) {
    throw new Error(
      `GEMINI_SMOKE_DOSSIER_COST_EXCEEDS_CEILING:${estimatedCost}`,
    );
  }

  await CreativeMissionRuntime.update(mission.id, {
    metadata: {
      ...(mission.metadata || {}),
      gemini_omni_smoke: {
        ...smokeMetadata(mission),
        phase: "VIDEO_APPROVAL_REQUIRED",
        target_seconds: TARGET_SECONDS,
        source_asset_id: SOURCE_ASSET_ID,
        dossier_asset_node_id: dossier.asset_node_id,
        dossier_estimated_cost: estimatedCost,
        maximum_video_customer_price_thb: MAXIMUM_VIDEO_CUSTOMER_PRICE_THB,
        approval_phrase: VIDEO_APPROVAL_PHRASE,
        publication_authorized: false,
        media_generation_authorized: false,
        updated_at: new Date().toISOString(),
      },
    },
  });

  return {
    direction_status: direction.status,
    dossier_asset_node_id: dossier.asset_node_id,
    dossier_estimated_cost: estimatedCost,
    video_task_id: constrainedTask.id,
    video_task_provider: constrainedTask.provider_id || "gemini",
    video_task_duration_seconds: videoDuration(constrainedTask),
  };
}

async function existingApprovalBoundary({ mission, project }) {
  const smoke = smokeMetadata(mission);
  if (smoke.phase !== "VIDEO_APPROVAL_REQUIRED") return null;

  const tasks = await ProductionTaskRuntime.list({
    organization_id: ORGANIZATION_ID,
    creative_project_id: project.id,
  });
  const videoTasks = tasks.filter((task) =>
    text(task.capability || task.service_code).toLowerCase() === "ai.video.generate"
  );
  if (videoTasks.length !== 1) return null;

  return {
    direction_status: "AWAITING_PRODUCTION_DOSSIER_APPROVAL",
    dossier_asset_node_id: smoke.dossier_asset_node_id || null,
    dossier_estimated_cost: number(smoke.dossier_estimated_cost) ?? 0,
    video_task_id: videoTasks[0].id,
    video_task_provider: videoTasks[0].provider_id || "gemini",
    video_task_duration_seconds: videoDuration(videoTasks[0]),
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
  const project = await ensureResearchAuthorization({
    request,
    project: ensured.project,
  });

  let preparation = await existingApprovalBoundary({ mission, project });
  if (!preparation) {
    preparation = await prepareApprovalBoundary({ mission, project });
    mission = await CreativeMissionRuntime.get(mission.id);
  }

  return json({
    success: false,
    status: "GEMINI_SMOKE_VIDEO_APPROVAL_REQUIRED",
    contract: TEST_CONTRACT,
    target_seconds: TARGET_SECONDS,
    source_asset_id: SOURCE_ASSET_ID,
    provider: "gemini",
    model: "gemini-omni-flash-preview",
    maximum_research_customer_price_thb: RESEARCH_MAXIMUM_CUSTOMER_PRICE_THB,
    maximum_video_customer_price_thb: MAXIMUM_VIDEO_CUSTOMER_PRICE_THB,
    approval_phrase: VIDEO_APPROVAL_PHRASE,
    publication_authorized: false,
    media_generation_authorized: false,
    mission_id: mission.id,
    creative_project_id: project.id,
    preparation,
  }, 409);
}

export async function GET(request) {
  try {
    return await executeSmokeTest(request);
  } catch (error) {
    return json({
      success: false,
      contract: TEST_CONTRACT,
      target_seconds: TARGET_SECONDS,
      maximum_research_customer_price_thb: RESEARCH_MAXIMUM_CUSTOMER_PRICE_THB,
      maximum_video_customer_price_thb: MAXIMUM_VIDEO_CUSTOMER_PRICE_THB,
      publication_authorized: false,
      media_generation_authorized: false,
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
      maximum_research_customer_price_thb: RESEARCH_MAXIMUM_CUSTOMER_PRICE_THB,
      maximum_video_customer_price_thb: MAXIMUM_VIDEO_CUSTOMER_PRICE_THB,
      publication_authorized: false,
      media_generation_authorized: false,
      error: error?.message || String(error),
    }, errorStatus(error));
  }
}
