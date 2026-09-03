export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { CreativeShotRevisionRuntime } from "@/lib/creative/production/revision/runtime/CreativeShotRevisionRuntime";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const projectId = body.creative_project_id || body.creativeProjectId;
    const shotId = body.shot_id || body.shotId;
    const sourceTaskId = body.source_task_id || body.sourceTaskId;

    if (!organizationId || !projectId || !shotId || !sourceTaskId) {
      return Response.json({
        success: false,
        error: "organization_id, creative_project_id, shot_id and source_task_id required",
      }, { status: 400 });
    }

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return Response.json(access, { status: access.status });

    const result = await CreativeShotRevisionRuntime.queue({
      organization_id: organizationId,
      creative_project_id: projectId,
      shot_id: shotId,
      source_task_id: sourceTaskId,
      scope: body.scope || "AUTO",
      direction: body.direction || body.revision_direction || "",
      requester: {
        user_id: access.userId || null,
        staff_account_id: access.staff?.id || null,
        email: access.userEmail || null,
      },
    });

    return Response.json({ success: true, result });
  } catch (error) {
    const message = error?.message || "Shot revision could not be queued";
    const status = /required|invalid|mismatch|too long/i.test(message) ? 400 :
      /not found/i.test(message) ? 404 :
      /running/i.test(message) ? 409 : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}
