import { createCodeAIRollingReleaseCapability } from "@/lib/platform/capabilities/createCodeAIRollingReleaseCapability";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export const runtime = "nodejs";
export const maxDuration = 120;
const REQUIRED_PERMISSION = "platform.deploy.production";
function text(value, maximum = 1000) { return String(value ?? "").trim().slice(0, maximum); }

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = text(body.organizationId || body.organization_id, 200);
    if (!organizationId) return Response.json({ success: false, error: "organizationId required" }, { status: 400 });
    const access = await requireOrganizationAccess({ organizationId, request, requiredPermission: REQUIRED_PERMISSION });
    if (!access.success) return Response.json({ success: false, error: access.error }, { status: access.status || 403 });
    const context = {
      organizationId,
      actor: { id: access.user?.id || access.userId, email: access.user?.email || null },
      permissions: access.permissions || [],
      callerRequest: request,
      metadata: { source: "CODE_STUDIO", explicit_rolling_release_request: true },
    };
    const capability = createCodeAIRollingReleaseCapability();
    capability.authorize({ context });
    const result = await capability.execute({ context, payload: {
      execution_key: body.execution_key,
      operation: body.operation,
      canary_deployment_id: body.canary_deployment_id,
      expected_commit_sha: body.expected_commit_sha,
      next_stage_index: body.next_stage_index,
    }});
    return Response.json({ success: true, result });
  } catch (error) {
    return Response.json({ success: false, error: text(error?.message || error, 1000) }, { status: error?.status || 500 });
  }
}
