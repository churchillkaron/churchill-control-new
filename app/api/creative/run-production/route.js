export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { CreativeDirectorRuntime } from "@/lib/creative/director/runtime/CreativeDirectorRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

function text(value) {
  return String(value ?? "").trim();
}

function statusFor(error) {
  const message = text(error?.message).toUpperCase();
  if (
    message.includes("REQUIRED") ||
    message.includes("INVALID") ||
    message.includes("MISSING") ||
    message.includes("NOT FOUND")
  ) return 400;
  if (message.includes("AUTHENTICATION")) return 401;
  if (message.includes("PERMISSION") || message.includes("MEMBERSHIP")) return 403;
  if (message.includes("ALREADY RUNNING")) return 409;
  return 500;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id || body.organizationId);
    const creativeProjectId = text(
      body.creative_project_id || body.creativeProjectId || body.project_id,
    );
    const creativeMissionId = text(
      body.creative_mission_id || body.creativeMissionId || body.mission_id,
    );

    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: "organization_id required" },
        { status: 400 },
      );
    }
    if (!creativeProjectId) {
      return NextResponse.json(
        { success: false, error: "creative_project_id required" },
        { status: 400 },
      );
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
      return NextResponse.json(access, { status: access.status || 403 });
    }

    const result = await CreativeDirectorRuntime.execute({
      ...body,
      organization_id: organizationId,
      creative_project_id: creativeProjectId,
      creative_mission_id: creativeMissionId || undefined,
      requested_by: access.userId || access.user?.id || null,
      workflow_kind: body.workflow_kind || "TEMPORAL",
    });

    return NextResponse.json({
      success: result?.success !== false,
      organization_id: organizationId,
      creative_project_id: creativeProjectId,
      creative_mission_id: creativeMissionId || null,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || String(error),
        validation: error?.validation || null,
      },
      { status: statusFor(error) },
    );
  }
}
