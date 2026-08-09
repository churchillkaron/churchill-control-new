export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  loadTodayPerformanceOverview,
} from "@/lib/people/performance/loadTodayPerformanceOverview";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedOrganizationId = searchParams.get("organizationId");

    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        { status: access.status }
      );
    }

    const overview = await loadTodayPerformanceOverview({
      organizationId: access.organizationId,
    });

    return NextResponse.json({
      success: true,
      ...overview,
    });
  } catch (error) {
    console.error("PERFORMANCE_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message || "Unable to load performance overview",
        fohScore: null,
        kitchenLevel: "UNKNOWN",
        barLevel: "UNKNOWN",
        alerts: [],
        tasks: [],
        staff: [],
      },
      { status: 500 }
    );
  }
}
