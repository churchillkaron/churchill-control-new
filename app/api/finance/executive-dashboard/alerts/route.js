export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getExecutiveAlerts } from "@/lib/finance/reporting/alerts/getExecutiveAlerts";
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

    const alerts = await getExecutiveAlerts({
      organizationId: access.organizationId,
      entityId: body.entityId || body.entity_id || null,
    });
    const intelligence = await BusinessIntelligenceRuntime
      .analyzeOrganization(access.organizationId)
      .catch(() => null);
    const aiAlerts = (intelligence?.recommendations || []).map((item) => ({
      severity: "info",
      type: "INTELLIGENCE_RECOMMENDATION",
      message: item.message,
      source: item.provider,
    }));

    return NextResponse.json({
      success: true,
      alerts: [...alerts, ...aiAlerts],
      intelligence,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Executive alerts load failed" },
      { status: 500 },
    );
  }
}
