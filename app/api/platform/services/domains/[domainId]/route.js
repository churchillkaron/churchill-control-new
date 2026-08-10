export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveOrganizationServiceDomainDetails } from "@/lib/platform/service-runtime/services/resolver/ServiceDomainDetailResolver";

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

export async function GET(request, { params }) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = cleanValue(
      searchParams.get("organization_id") ||
      searchParams.get("organizationId"),
    );
    const domainId = cleanValue(params?.domainId);

    if (!organizationId) {
      return errorResponse("organization_id required", 400);
    }

    if (!domainId) {
      return errorResponse("domainId required", 400);
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status);
    }

    const rows = await resolveOrganizationServiceDomainDetails({
      organization_id: access.organizationId,
      domain_id: domainId,
    });

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      rows,
    });
  } catch (error) {
    console.error("SERVICE_DOMAIN_DETAILS_GET_ERROR", error);
    return errorResponse(error?.message || "Service domain detail lookup failed");
  }
}
