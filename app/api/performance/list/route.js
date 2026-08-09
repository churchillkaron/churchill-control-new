export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import {
  loadTodayPerformanceOverview,
} from "@/lib/people/performance/loadTodayPerformanceOverview";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedOrganizationId = searchParams.get("organizationId");

    const context = await resolveAuthenticatedStaffContext({
      request,
      organizationId: requestedOrganizationId,
    });

    if (!context.success) {
      return NextResponse.json(
        {
          success: false,
          error: context.error,
          code: context.code,
          availableOrganizationIds:
            context.availableOrganizationIds || [],
        },
        { status: context.status || 403 }
      );
    }

    const overview = await loadTodayPerformanceOverview({
      organizationId: context.organizationId,
    });

    return NextResponse.json({
      success: true,
      deprecated: true,
      replacement: "/api/performance/list/today",
      organizationId: overview.organizationId,
      timezone: overview.timezone,
      period: overview.period,
      data: overview.staff,
    });
  } catch (error) {
    console.error("PERFORMANCE_LIST_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message || "Unable to load performance list",
        data: [],
      },
      { status: 500 }
    );
  }
}
