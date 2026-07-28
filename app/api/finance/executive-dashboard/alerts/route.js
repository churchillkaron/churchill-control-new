export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getExecutiveAlerts } from "@/lib/finance/reporting/alerts/getExecutiveAlerts";
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
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const result = await getExecutiveAlerts({
      organizationId: access.organizationId,
      entityId: body.entityId || body.entity_id,
      periodId: body.periodId || body.period_id || null,
      startDate: body.startDate || body.start_date || null,
      endDate: body.endDate || body.end_date || null,
    });

    const intelligence = await BusinessIntelligenceRuntime
      .analyzeOrganization(access.organizationId)
      .catch(() => null);
    const aiAlerts = (intelligence?.recommendations || []).map(item => ({
      severity: "info",
      type: "AI_RECOMMENDATION",
      message: item.message,
      source: item.provider || "BUSINESS_INTELLIGENCE",
    }));

    return NextResponse.json({
      ...result,
      alerts: [...(result.alerts || []), ...aiAlerts],
      intelligence,
    });
  } catch (error) {
    const message = error.message || "Executive alert load failed";
    return NextResponse.json(
      { success: false, error: message, alerts: [] },
      { status: /required|not found|period/i.test(message) ? 400 : 500 }
    );
  }
}
