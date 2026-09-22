import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  createCodeAIDesignPreview,
  createCodeAIVisualArtifact,
  reasonAboutCodeConversationTurn,
} from "@/lib/code/runtime/CodeAIConversationRuntime";

export const runtime = "nodejs";
export const maxDuration = 120;
const REQUIRED_PERMISSION = "platform.code.ai.execute";

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = text(body.organizationId || body.organization_id, 200);
    const message = text(body.message, 5000);
    if (!organizationId) return Response.json({ success: false, error: "organization_id required" }, { status: 400 });
    if (!message) return Response.json({ success: false, error: "message required" }, { status: 400 });

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission: REQUIRED_PERMISSION,
    });
    if (!access.success) return Response.json({ success: false, error: access.error }, { status: access.status || 403 });

    const sharedInput = {
      organizationId,
      partyId: access.staff?.party_id || access.staff?.partyId || null,
      message,
      recentConversation: Array.isArray(body.recent_conversation) ? body.recent_conversation : [],
      workspace: {
        repository_url: body.repository_url,
        ref: body.ref,
        device_session_id: body.device_session_id,
        revision: body.revision,
        active_file: body.active_file,
        changed_files: body.changed_files,
      },
    };
    const result = body.design_preview === true
      ? await createCodeAIDesignPreview(sharedInput)
      : body.visualize === true
        ? await createCodeAIVisualArtifact({
            ...sharedInput,
            preferredKind: body.preferred_visual_kind || null,
          })
        : await reasonAboutCodeConversationTurn(sharedInput);

    return Response.json({ ...result, commit_performed: false, production_deploy_performed: false });
  } catch (error) {
    return Response.json({
      success: false,
      error: text(error?.message || error, 1000) || "CODE_AI_CONVERSATION_FAILED",
      commit_performed: false,
      production_deploy_performed: false,
    }, { status: 500 });
  }
}