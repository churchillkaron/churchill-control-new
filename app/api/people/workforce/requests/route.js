export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import {
  loadWorkforceRequestReviewQueue,
  reviewShiftSwapRequest,
  reviewTimeOffRequest,
} from "@/lib/people/workforce/workforceRequestRuntime";

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
  const context = await resolveAuthenticatedStaffContext({ request, organizationId });
  if (!context.success) return { response: contextError(context) };

  const role = roleOf(context.role || context.staff?.role);
  if (!MANAGE_ROLES.has(role)) {
    return {
      response: NextResponse.json(
        {
          success: false,
          error: "Workforce request review permission required",
          code: "WORKFORCE_REQUEST_REVIEW_DENIED",
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

    const queue = await loadWorkforceRequestReviewQueue({
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
        error: error?.message || "Unable to load workforce request review queue",
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

    const kind = String(body?.kind || "").trim().toLowerCase();
    let reviewed;

    if (kind === "time_off") {
      reviewed = await reviewTimeOffRequest({
        organizationId: context.organizationId,
        requestId: body?.requestId,
        manager: context.manager,
        decision: body?.decision,
        notes: body?.notes,
      });
    } else if (kind === "shift_swap") {
      reviewed = await reviewShiftSwapRequest({
        organizationId: context.organizationId,
        requestId: body?.requestId,
        manager: context.manager,
        decision: body?.decision,
        notes: body?.notes,
      });
    } else {
      return NextResponse.json(
        { success: false, error: "kind must be time_off or shift_swap" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      request: reviewed,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to review workforce request",
        code: error?.code || null,
      },
      { status: error?.status || 500 }
    );
  }
}
