import { NextResponse } from "next/server";

import {
  createOrganization,
} from "@/lib/platform/administration/runtime/AdministrationRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requireAuth } from "@/lib/shared/auth/requireAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
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
    try {
      await requireAuth();
    } catch {
      return errorResponse("Authentication required", 401);
    }

    const body = await request.json();
    const name = cleanValue(body.name);
    const organizationType = cleanValue(
      body.organizationType || body.organization_type,
    );
    const parentOrganizationId = cleanValue(
      body.parentOrganizationId || body.parent_organization_id,
    );

    if (!name) {
      return errorResponse("name required", 400);
    }

    if (!organizationType) {
      return errorResponse("organization_type required", 400);
    }

    if (parentOrganizationId) {
      const parentAccess = await requireOrganizationAccess({
        organizationId: parentOrganizationId,
        request,
      });

      if (!parentAccess.success) {
        return errorResponse(parentAccess.error, parentAccess.status);
      }
    }

    const organization = await createOrganization({
      name,
      organizationType,
      parentOrganizationId,
      legalName: cleanValue(body.legalName || body.legal_name),
      industry: cleanValue(body.industry),
      address: cleanValue(body.address),
      country: cleanValue(body.country),
    });

    return NextResponse.json({
      success: true,
      organization,
    });
  } catch (error) {
    console.error("ORGANIZATION_CREATE_ERROR", error);

    return errorResponse(
      error?.message || "Organization creation failed",
      500,
    );
  }
}
