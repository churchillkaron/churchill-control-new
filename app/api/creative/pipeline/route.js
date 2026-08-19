export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  CreativeCompletedDirectionMaterializationRuntime,
} from "@/lib/creative/director/runtime/CreativeCompletedDirectionMaterializationRuntime";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

function text(value) {
  return String(value ?? "").trim();
}

function statusFor(error) {
  const message = text(error?.message).toUpperCase();
  if (message.includes("NOT_FOUND")) return 404;
  if (message.includes("AUTHORIZATION")) return 403;
  if (
    message.includes("REQUIRED") ||
    message.includes("INVALID") ||
    message.includes("MISMATCH") ||
    message.includes("NOT_COMPLETED")
  ) {
    return 400;
  }
  return 500;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(
      body.organization_id || body.organizationId,
    );
    const projectId = text(
      body.creative_project_id || body.creativeProjectId,
    );
    const directionJobId = text(
      body.direction_job_id || body.directionJobId,
    );
    const action = text(
      body.action || "MATERIALIZE_COMPLETED_DIRECTION",
    ).toUpperCase();

    if (!organizationId) throw new Error("organization_id required");
    if (!projectId) throw new Error("creative_project_id required");
    if (!directionJobId) throw new Error("direction_job_id required");
    if (action !== "MATERIALIZE_COMPLETED_DIRECTION") {
      throw new Error("CREATIVE_PIPELINE_ACTION_INVALID");
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredAnyPermission: [
        "creative.*",
        "creative.execute",
        "creative.production.run",
      ],
    });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const result = await CreativeCompletedDirectionMaterializationRuntime.materialize({
      organization_id: organizationId,
      creative_project_id: projectId,
      direction_job_id: directionJobId,
    });

    return Response.json({
      success: true,
      action,
      ...result,
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: error?.message || String(error),
      direction_rerun_performed: false,
      media_generation_authorized: false,
      provider_execution_started: false,
      publication_authorized: false,
    }, { status: statusFor(error) });
  }
}
