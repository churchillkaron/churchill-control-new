export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getEntityRanking } from "@/lib/finance/reporting/reports/getEntityRanking";
import { BusinessIntelligenceRuntime } from "@/lib/intelligence/runtime/BusinessIntelligenceRuntime";

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const rankings = await getEntityRanking({
      organizationId: access.organizationId,
      entities: Array.isArray(body.entities) ? body.entities : [],
    });
    const intelligence = await BusinessIntelligenceRuntime
      .analyzeOrganization(access.organizationId)
      .catch(() => null);

    return NextResponse.json({ success: true, rankings, intelligence });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Entity ranking failed" },
      { status: 500 },
    );
  }
}
