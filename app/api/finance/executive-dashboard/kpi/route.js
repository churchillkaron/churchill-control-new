export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { getExecutiveKPIs } from "@/lib/finance/reporting/reports/getExecutiveKPIs";
import { BusinessIntelligenceRuntime } from "@/lib/intelligence/runtime/BusinessIntelligenceRuntime";

function statusFor(message) {
  return String(message || "").toLowerCase().includes("permission denied") ? 403 : 500;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.accounting.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const entityId =
      searchParams.get("entityId") ||
      searchParams.get("entity_id") ||
      null;

    const metrics = await getExecutiveKPIs({
      organizationId: access.organizationId,
      entityId,
    });

    const intelligence = await BusinessIntelligenceRuntime
      .analyzeOrganization(access.organizationId)
      .catch(() => null);

    return NextResponse.json({
      success: true,
      kpis: [metrics],
      rows: [metrics],
      summary: metrics,
      intelligence,
    });
  } catch (error) {
    const message = error.message || "Executive KPI load failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
