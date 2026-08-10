export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { ROIIntelligenceRuntime } from "@/lib/platform/service-runtime/intelligence/runtime/ROIIntelligenceRuntime";

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

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = cleanValue(
      url.searchParams.get("organization_id") ||
      url.searchParams.get("organizationId"),
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

    const data = await ROIIntelligenceRuntime.organization(
      access.organizationId,
    );

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      data,
    });
  } catch (error) {
    console.error("ROI_INTELLIGENCE_GET_ERROR", error);
    return errorResponse(error?.message || "ROI intelligence lookup failed");
  }
}
