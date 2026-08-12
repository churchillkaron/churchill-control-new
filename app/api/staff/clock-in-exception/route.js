export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import {
  loadClockInExceptionState,
  requestClockInException,
} from "@/lib/people/workforce/clockInExceptionApproval";
import { loadOrganizationPolicy } from "@/lib/platform/security/organizationAccessPolicy";

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

function requiredExceptionTargets(policy) {
  const required = [];

  if (policy?.workforce?.passkey_clock_in_required === true) {
    required.push("passkey");
  }

  if (policy?.workforce?.gps_clock_in_required === true) {
    required.push("gps");
  }

  return required;
}

export async function GET(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request });
    if (!context.success) return contextError(context);

    const [state, policy] = await Promise.all([
      loadClockInExceptionState({
        organizationId: context.organizationId,
        staffId: context.staff.id,
      }),
      loadOrganizationPolicy({ organizationId: context.organizationId }),
    ]);

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      requiredTargets: requiredExceptionTargets(policy),
      state,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load clock-in exception state",
        code: error?.code || null,
      },
      { status: error?.status || 500 }
    );
  }
}

export async function POST(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request });
    if (!context.success) return contextError(context);

    const body = await request.json();
    const policy = await loadOrganizationPolicy({
      organizationId: context.organizationId,
    });
    const requiredTargets = requiredExceptionTargets(policy);
    const requestedTargets = [...new Set(
      (Array.isArray(body?.targets) ? body.targets : [body?.targets])
        .map((target) => String(target || "").trim().toLowerCase())
        .filter(Boolean)
    )];
    const targets = requestedTargets.filter((target) =>
      requiredTargets.includes(target)
    );

    if (!targets.length) {
      return NextResponse.json(
        {
          success: false,
          error: "No active clock-in verification requirement needs an exception",
          code: "CLOCK_IN_EXCEPTION_NOT_REQUIRED",
          requiredTargets,
        },
        { status: 409 }
      );
    }

    const result = await requestClockInException({
      organizationId: context.organizationId,
      staff: context.staff,
      reason: body?.reason,
      targets,
      failureCode: body?.failureCode || null,
    });

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      requiredTargets,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to request clock-in exception",
        code: error?.code || null,
      },
      { status: error?.status || 500 }
    );
  }
}
