export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId =
      url.searchParams.get("organizationId") ||
      url.searchParams.get("organization_id");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error || "Organization access denied" },
        { status: access.status || 403 },
      );
    }

    return NextResponse.redirect(
      new URL(
        `/workspace/${encodeURIComponent(access.organizationId)}/administration/integrations/line-connect`,
        url.origin,
      ),
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "LINE connection could not start" },
      { status: 500 },
    );
  }
}
