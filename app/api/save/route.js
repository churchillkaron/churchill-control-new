export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import {
  savePerformanceRecord,
} from "@/lib/people/performance/savePerformanceRecord";

const MANAGE_ROLES = new Set([
  "OWNER",
  "SUPER_ADMIN",
  "MANAGER",
  "HR_ADMIN",
  "PEOPLE_ADMIN",
]);

function normalizeRole(value) {
  return String(value || "").trim().toUpperCase();
}

function contextError(context) {
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

export async function POST(request) {
  try {
    const body = await request.json();
    const { searchParams } = new URL(request.url);

    const requestedOrganizationId =
      body?.organizationId ||
      body?.organization_id ||
      searchParams.get("organizationId") ||
      null;

    const context = await resolveAuthenticatedStaffContext({
      request,
      organizationId: requestedOrganizationId,
    });

    if (!context.success) {
      return contextError(context);
    }

    const role = normalizeRole(
      context.role || context.staff?.role
    );

    if (!MANAGE_ROLES.has(role)) {
      return NextResponse.json(
        {
          success: false,
          error: "Performance management permission required",
        },
        { status: 403 }
      );
    }

    const result = await savePerformanceRecord({
      organizationId: context.organizationId,
      payload: body,
    });

    return NextResponse.json({
      success: true,
      deprecated: true,
      replacement: "/api/people/performance",
      organizationId: context.organizationId,
      performance: result.performance,
      staff: result.staff,
      data: result.performance,
    });
  } catch (error) {
    console.error("PERFORMANCE_SAVE_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message || "Unable to save performance record",
      },
      { status: error?.status || 500 }
    );
  }
}
