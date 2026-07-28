export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  CreativeExecutionJobRuntime,
} from "@/lib/creative/execution/runtime/CreativeExecutionJobRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

async function requireProject({ organizationId, projectId }) {
  const project = await CreativeProjectRuntime.get(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) {
    throw new Error("CREATIVE_EXECUTION_PROJECT_NOT_FOUND");
  }
  return project;
}

function statusFor(error) {
  const message = text(error?.message).toUpperCase();
  if (message.includes("NOT_FOUND")) return 404;
  if (message.includes("AUTHORIZATION")) return 403;
  if (message.includes("REQUIRED") || message.includes("INVALID")) return 400;
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
    const action = text(body.action || "ENQUEUE_SHORTLIST_VERIFY").toUpperCase();

    if (!organizationId) throw new Error("organization_id required");
    if (!projectId) throw new Error("creative_project_id required");

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

    await requireProject({ organizationId, projectId });

    if (action !== "ENQUEUE_SHORTLIST_VERIFY") {
      throw new Error("CREATIVE_EXECUTION_JOB_ACTION_INVALID");
    }

    const projectShortlistIdentity = text(
      body.project_shortlist_identity || body.projectShortlistIdentity,
    );
    const result = await CreativeExecutionJobRuntime.enqueueShortlistVerification({
      organization_id: organizationId,
      creative_project_id: projectId,
      project_shortlist_identity: projectShortlistIdentity,
      authorization: object(body.authorization),
      policy: object(body.policy),
      country: body.country || null,
      currency: body.currency || null,
    });

    return Response.json({
      success: true,
      accepted: true,
      action,
      creative_project_id: projectId,
      job_id: result.job.id,
      job_status: result.job.status,
      created: result.created,
      production_started: false,
    }, { status: result.created ? 202 : 200 });
  } catch (error) {
    return Response.json({
      success: false,
      error: error?.message || String(error),
      production_started: false,
    }, { status: statusFor(error) });
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(
      url.searchParams.get("organization_id") ||
      url.searchParams.get("organizationId"),
    );
    const projectId = text(
      url.searchParams.get("creative_project_id") ||
      url.searchParams.get("creativeProjectId"),
    );

    if (!organizationId) throw new Error("organization_id required");
    if (!projectId) throw new Error("creative_project_id required");

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

    await requireProject({ organizationId, projectId });
    const result = await CreativeExecutionJobRuntime.status({
      organization_id: organizationId,
      creative_project_id: projectId,
    });

    return Response.json({
      success: true,
      creative_project_id: projectId,
      ...result,
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: error?.message || String(error),
      production_started: false,
    }, { status: statusFor(error) });
  }
}
