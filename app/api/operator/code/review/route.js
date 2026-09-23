import { createCodeAIReviewPullRequestCapability } from "@/lib/platform/capabilities/createCodeAIReviewPullRequestCapability";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export const runtime = "nodejs";
export const maxDuration = 300;
const REQUIRED_PERMISSION = "platform.code.ai.commit";
function text(value, maximum = 1000) { return String(value ?? "").trim().slice(0, maximum); }

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = text(body.organizationId || body.organization_id, 200);
    const executionKey = text(body.execution_key || body.executionKey, 160);
    const title = text(body.title || body.commit_message || body.commitMessage, 200);
    if (!organizationId || !executionKey || !title) return Response.json({ success: false, error: "organizationId, execution_key and title required" }, { status: 400 });
    const access = await requireOrganizationAccess({ organizationId, request, requiredPermission: REQUIRED_PERMISSION });
    if (!access.success) return Response.json({ success: false, error: access.error }, { status: access.status || 403 });
    const context = { organizationId, actor: { id: access.user?.id || access.userId, email: access.user?.email || null }, permissions: access.permissions || [], callerRequest: request, metadata: { source: "CODE_STUDIO", explicit_user_review_pr_request: true } };
    const capability = createCodeAIReviewPullRequestCapability();
    capability.authorize({ context });
    const result = await capability.execute({ context, payload: { execution_key: executionKey, title, body: body.body || "", branch_name: body.branch_name || null } });
    return Response.json({ success: true, result });
  } catch (error) {
    return Response.json({ success: false, error: text(error?.message || error, 1000) }, { status: error?.status || 500 });
  }
}
