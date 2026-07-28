export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getEntityRanking } from "@/lib/finance/reporting/reports/getEntityRanking";
import { BusinessIntelligenceRuntime } from "@/lib/platform/service-runtime/intelligence/runtime/BusinessIntelligenceRuntime";

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error, rankings: [] },
        { status: access.status }
      );
    }

    const rawIds = body.entityIds || body.entity_ids || [];
    const entityIds = Array.isArray(rawIds)
      ? rawIds
      : String(rawIds || "").split(",").map(value => value.trim()).filter(Boolean);

    const rankings = await getEntityRanking({
      organizationId: access.organizationId,
      entityIds,
      periodId: body.periodId || body.period_id || null,
      startDate: body.startDate || body.start_date || null,
      endDate: body.endDate || body.end_date || null,
    });

    const intelligence = await BusinessIntelligenceRuntime
      .analyzeOrganization(access.organizationId)
      .catch(() => null);

    return NextResponse.json({
      success: true,
      organization_id: access.organizationId,
      rankings,
      rows: rankings,
      intelligence,
    });
  } catch (error) {
    const message = error.message || "Entity ranking failed";
    return NextResponse.json(
      { success: false, error: message, rankings: [] },
      { status: /required|not found|period/i.test(message) ? 400 : 500 }
    );
  }
}
