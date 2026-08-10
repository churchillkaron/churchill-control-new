export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { bootstrapOrganizationServices } from "@/lib/platform/service-runtime/services/bootstrap/bootstrapOrganizationServices";

const SERVICE_MANAGEMENT_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
]);

function cleanValue(value) {
  const normalized = String(value ?? "").trim();

  if (
    !normalized ||
    normalized === "undefined" ||
    normalized === "null"
  ) {
    return null;
  }

  return normalized;
}

function errorResponse(error, status = 500) {
  return NextResponse.json(
    {
      success: false,
      error,
    },
    { status },
  );
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = cleanValue(
      body.organization_id ||
      body.organizationId,
    );

    if (!organizationId) {
      return errorResponse("organization_id required", 400);
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status);
    }

    const role = String(access.role || "").trim().toUpperCase();
    if (!SERVICE_MANAGEMENT_ROLES.has(role)) {
      return errorResponse(
        "Owner, administrator, or manager access is required to bootstrap services",
        403,
      );
    }

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
