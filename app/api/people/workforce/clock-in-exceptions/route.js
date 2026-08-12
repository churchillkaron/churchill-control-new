export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import {
  loadClockInExceptionReviewQueue,
  reviewClockInException,
} from "@/lib/people/workforce/clockInExceptionApproval";

const MANAGE_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
  "HR_ADMIN",
  "PAYROLL_ADMIN",
]);

function roleOf(value) {
  return String(value || "").trim().toUpperCase();
}

function contextError(context) {
  return NextResponse.json(
    {
      success: false,
      error: context.error,
      code: context.code,
      availableOrganizationIds: context.availableOrganizationIds || [],
    },
    { status: context.status || 403 }
  );
}

async function managementContext(request, organizationId = null) {
  const context = await resolveAuthenticatedStaffContext({
    request,
    organizationId,
  });

  if (!context.success) return { response: contextError(context) };

  const role = roleOf(context.role || context.staff?.role);
  if (!MANAGE_ROLES.has(role)) {
    return {
      response: NextResponse.json(
        {
          success: false,
          error: "Clock-in exception review permission required",
          code: "CLOCK_IN_EXCEPTION_REVIEW_DENIED",
        },
        { status: 403 }
      ),
    };
  }

  return {
    organizationId: context.organizationId,
    manager: context.staff,
    role,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const requestedOrganizationId =
      String(url.searchParams.get("organizationId") || "").trim() || null;
    const context = await managementContext(request, requestedOrganizationId);
    if (context.response) return context.response;

    const queue = await loadClockInExceptionReviewQueue({
      organizationId: context.organizationId,
    });

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      role: context.role,
      ...queue,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load clock-in exceptions",
        code: error?.code || null,
      },
      { status: error?.status || 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const requestedOrganizationId =
      String(body?.organizationId || body?.organization_id || "").trim() || null;
    const context = await managementContext(request, requestedOrganizationId);
    if (context.response) return context.response;

    const reviewed = await reviewClockInException({
      organizationId: context.organizationId,
      requestId: body?.requestId,
      manager: context.manager,
      decision: body?.decision,
      notes: body?.notes,
    });

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      request: reviewed,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to review clock-in exception",
        code: error?.code || null,
      },
      { status: error?.status || 500 }
    );
  }
}
