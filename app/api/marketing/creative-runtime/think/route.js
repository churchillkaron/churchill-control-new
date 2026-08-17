import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(request) {
  const body = await request.json();

  const access = await requireOrganizationAccess({
    organizationId: body.organizationId || body.organization_id,
    request: request,
  });

  if (!access.success) {
    return NextResponse.json(
      { success: false, error: access.error },
      { status: access.status || 403 },
    );
  }

  const production = {
    organizationId: access.organizationId,
    pageId: body.pageId,
    business: body.business || body.selectedBusiness || {},
    brand: body.brand || {},
    objective: body.objective || body.prompt || "",
    platform: body.platform || "facebook"
  };

  return NextResponse.json({
    success: true,
    production
  });
}
