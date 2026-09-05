import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  loadCodeAILiveProgress,
} from "@/lib/code/runtime/CodeAILiveProgressRuntime";
import {
  loadCodeAIOwnerControlState,
  submitCodeAIOwnerControl,
  CODE_AI_OWNER_INTERVENTION_CONTRACT,
} from "@/lib/code/runtime/CodeAIOwnerInterventionRuntime";

export const runtime = "nodejs";

const REQUIRED_PERMISSION = "platform.code.ai.execute";
const ACTIVE_STATES = new Set([
  "active",
  "executing",
  "in_progress",
  "pending",
  "planner_pending",
  "queued",
  "running",
  "verifying",
  "working",
]);

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function activeProgress(progress) {
  const state = text(progress?.state_status, 100).toLowerCase();
  const event = text(progress?.latest_event?.status, 100).toLowerCase();
  return ACTIVE_STATES.has(state) || ACTIVE_STATES.has(event);
}

function contextFor(access, organizationId) {
  return {
    organizationId,
    organization_id: organizationId,
    actor: { id: text(access.user?.id || access.userId, 200) },
  };
}

function response(payload = {}, status = 200) {
  return Response.json({
    contract: CODE_AI_OWNER_INTERVENTION_CONTRACT,
    authorization_effect: "NONE",
    commit_authority: false,
    production_deploy_authority: false,
    ...payload,
  }, { status });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(
      url.searchParams.get("organizationId") ||
      url.searchParams.get("organization_id"),
      200,
    );
    const missionId = text(
      url.searchParams.get("missionId") || url.searchParams.get("mission_id"),
      240,
    );
    if (!organizationId) return response({ success: false, error: "organization_id required" }, 400);
    if (!missionId) return response({ success: false, error: "mission_id required" }, 400);

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission: REQUIRED_PERMISSION,
    });
    if (!access.success) {
      return response({ success: false, error: access.error }, access.status || 403);
    }

    const context = contextFor(access, organizationId);
    const control = await loadCodeAIOwnerControlState({ context, missionId });
    return response({ success: true, control });
  } catch (error) {
    return response({
      success: false,
      error: text(error?.message || error, 700) || "CODE_AI_OWNER_INTERVENTION_LOAD_FAILED",
    }, 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = text(body.organizationId || body.organization_id, 200);
    const missionId = text(body.missionId || body.mission_id, 240);
    const action = text(body.action, 80).toUpperCase();
    const instruction = text(body.instruction, 2000) || null;
    if (!organizationId) return response({ success: false, error: "organization_id required" }, 400);
    if (!missionId) return response({ success: false, error: "mission_id required" }, 400);

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission: REQUIRED_PERMISSION,
    });
    if (!access.success) {
      return response({ success: false, error: access.error }, access.status || 403);
    }

    const context = contextFor(access, organizationId);
    const loaded = await loadCodeAILiveProgress({ context });
    const progress = loaded?.live_progress || null;
    if (!progress || text(progress.mission_id, 240) !== missionId) {
      return response({ success: false, error: "CODE_AI_OWNER_INTERVENTION_LIVE_MISSION_MISMATCH" }, 409);
    }

    const active = activeProgress(progress);
    if (action === "STEER" && !active) {
      return response({ success: false, error: "CODE_AI_OWNER_INTERVENTION_MISSION_NOT_ACTIVE" }, 409);
    }
    if (action === "APPROVE_PATCH") {
      if (progress.latest_verification_passed !== true || active) {
        return response({ success: false, error: "CODE_AI_OWNER_PATCH_NOT_READY_FOR_REVIEW" }, 409);
      }
    }
    if (action === "REQUEST_CHANGES" && !instruction) {
      return response({ success: false, error: "instruction required" }, 400);
    }

    const consumeAtSafeBoundary =
      action === "STEER" || (action === "REQUEST_CHANGES" && active);
    const submitted = await submitCodeAIOwnerControl({
      context,
      missionId,
      action,
      instruction,
      consumeAtSafeBoundary,
    });

    return response({
      success: true,
      mission_active: active,
      queued_for_safe_boundary: consumeAtSafeBoundary,
      review_recorded: !consumeAtSafeBoundary,
      control: submitted.control,
      persistent_source_changed: false,
      commit_performed: false,
      production_deploy_performed: false,
    });
  } catch (error) {
    return response({
      success: false,
      error: text(error?.message || error, 700) || "CODE_AI_OWNER_INTERVENTION_FAILED",
    }, 500);
  }
}
