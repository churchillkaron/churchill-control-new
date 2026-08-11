export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requirePlatformOperatorWorkspaceAccess } from "@/lib/platform/security/requirePlatformOperatorWorkspaceAccess";
import { bootstrapOrganizationServices } from "@/lib/platform/service-runtime/services/bootstrap/bootstrapOrganizationServices";

function cleanValue(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "undefined" || normalized === "null") return null;
  return normalized;
}

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = cleanValue(body.organization_id || body.organizationId);

    if (!organizationId) return errorResponse("organization_id required", 400);

    const access = await requirePlatformOperatorWorkspaceAccess({ organizationId });
    if (!access.success) return errorResponse(access.error, access.status);

    const result = await bootstrapOrganizationServices({
      organization_id: access.organizationId,
      industry_id: cleanValue(body.industry_id || body.industryId) || "default",
      managed_by: "avantiqo",
    });

    return NextResponse.json({
      ...result,
      organizationId: access.organizationId,
    });
  } catch (error) {
    console.error("SERVICE_BOOTSTRAP_POST_ERROR", error);
    return errorResponse(error?.message || "Service bootstrap failed");
  }
}
