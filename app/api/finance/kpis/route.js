export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getExecutiveKPIs } from "@/lib/finance/reporting/reports/getExecutiveKPIs";

function queryValue(searchParams, camel, snake) {
  return searchParams.get(camel) || searchParams.get(snake) || null;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId: queryValue(searchParams, "organizationId", "organization_id"),
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error, rows: [] },
        { status: access.status }
      );
    }

    const result = await getExecutiveKPIs({
      organizationId: access.organizationId,
      entityId: queryValue(searchParams, "entityId", "entity_id"),
      periodId: queryValue(searchParams, "periodId", "period_id"),
      startDate: queryValue(searchParams, "startDate", "start_date"),
      endDate: queryValue(searchParams, "endDate", "end_date"),
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Finance KPI load failed";
    return NextResponse.json(
      { success: false, error: message, rows: [] },
      { status: /required|not found|period|entity/i.test(message) ? 400 : 500 }
    );
  }
}
