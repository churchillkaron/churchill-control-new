export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const access = await requireOrganizationAccess({
    organizationId: body.organizationId || body.organization_id,
    request,
  });

  if (!access.success) {
    return NextResponse.json(
      { success: false, error: access.error },
      { status: access.status }
    );
  }

  return NextResponse.json(
    {
      success: false,
      error:
        "Intercompany elimination must be executed through a governed Consolidation run with balanced elimination journals.",
    },
    { status: 405 }
  );
}
