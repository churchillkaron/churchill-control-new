export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveOrganizationServiceDomains } from "@/lib/platform/service-runtime/services/resolver/ServiceDomainResolver";

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
    const { searchParams } = new URL(request.url);
    const organizationId = cleanValue(
      searchParams.get("organization_id") ||
      searchParams.get("organizationId"),
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

    const rows = await resolveOrganizationServiceDomains({
      organization_id: access.organizationId,
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      rows,
    });
  } catch (error) {
    console.error("SERVICE_DOMAINS_GET_ERROR", error);
    return errorResponse(error?.message || "Service domain lookup failed");
  }
}
