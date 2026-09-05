import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  listCodeAIMissionHistory,
  loadCodeAIMissionHistoryDetail,
  CODE_AI_MISSION_HISTORY_CONTRACT,
} from "@/lib/code/runtime/CodeAIMissionHistoryRuntime";

export const runtime = "nodejs";

const REQUIRED_PERMISSION = "platform.code.ai.execute";

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
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
    contract: CODE_AI_MISSION_HISTORY_CONTRACT,
    actor_scoped: true,
    organization_scoped: true,
    raw_reasoning_returned: false,
    raw_resume_state_returned: false,
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
      url.searchParams.get("organizationId") || url.searchParams.get("organization_id"),
      200,
    );
    const missionId = text(
      url.searchParams.get("missionId") || url.searchParams.get("mission_id"),
      240,
    );
    const limit = Number(url.searchParams.get("limit") || 20);
    if (!organizationId) {
      return response({ success: false, error: "organization_id required" }, 400);
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission: REQUIRED_PERMISSION,
    });
    if (!access.success) {
      return response({ success: false, error: access.error }, access.status || 403);
    }

    const context = contextFor(access, organizationId);
    if (missionId) {
      const detail = await loadCodeAIMissionHistoryDetail({ context, missionId });
      return response({ success: true, ...detail });
    }

    const history = await listCodeAIMissionHistory({ context, limit });
    return response({
      success: true,
      sessions: history.sessions,
      count: history.count,
    });
  } catch (error) {
    return response({
      success: false,
      error: text(error?.message || error, 700) || "CODE_AI_MISSION_HISTORY_LOAD_FAILED",
    }, 500);
  }
}
