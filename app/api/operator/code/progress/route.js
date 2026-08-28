import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  loadCodeAILiveProgress,
  CODE_AI_LIVE_PROGRESS_CONTRACT,
} from "@/lib/code/runtime/CodeAILiveProgressRuntime";

const REQUIRED_PERMISSION = "platform.code.ai.execute";

function text(value) {
  return String(value ?? "").trim();
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(
      url.searchParams.get("organizationId") ||
      url.searchParams.get("organization_id"),
    );
    if (!organizationId) {
      return Response.json(
        { success: false, error: "organization_id required" },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission: REQUIRED_PERMISSION,
    });
    if (!access.success) {
      return Response.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }

    const loaded = await loadCodeAILiveProgress({
      context: {
        organizationId,
        actor: { id: access.user?.id || access.userId },
      },
    });

    return Response.json({
      success: true,
      contract: CODE_AI_LIVE_PROGRESS_CONTRACT,
      found: loaded.found === true,
      updated_at: loaded.updated_at || null,
      live_progress: loaded.live_progress || null,
      contains_source_content: false,
      contains_raw_reasoning: false,
      contains_secrets: false,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        contract: CODE_AI_LIVE_PROGRESS_CONTRACT,
        error: text(error?.message || error).slice(0, 700) || "CODE_PROGRESS_FAILED",
        contains_source_content: false,
        contains_raw_reasoning: false,
        contains_secrets: false,
      },
      { status: 500 },
    );
  }
}
