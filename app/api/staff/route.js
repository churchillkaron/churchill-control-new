export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import {
  clockInStaff,
  clockOutStaff,
  loadStaffWorkday,
} from "@/lib/people/workforce/shiftRuntime";

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

async function resolveStaffAccess(request) {
  const context = await resolveAuthenticatedStaffContext({ request });

  if (!context.success) {
    return {
      response: contextError(context),
    };
  }

  return context;
}

export async function GET(request) {
  try {
    const context = await resolveStaffAccess(request);
    if (context.response) return context.response;

    const workday = await loadStaffWorkday({
      organizationId: context.organizationId,
      staffId: context.staff.id,
    });

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      availableOrganizationIds:
        context.availableOrganizationIds || [],
      partyId: context.staff.party_id || null,
      staff: context.staff,
      timezone: workday.timezone,
      businessDate: workday.businessDate,
      schedule: workday.schedule,
      openShift: workday.openShift,
    });
  } catch (error) {
    console.error("STAFF_GET_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load staff",
      },
      { status: error?.status || 500 }
    );
  }
}

export async function POST(request) {
  try {
    const context = await resolveStaffAccess(request);
    if (context.response) return context.response;

    const body = await request.json();
    const action = body?.action;

    if (!action || !["clock_in", "clock_out"].includes(action)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid action",
        },
        { status: 400 }
      );
    }

    const result =
      action === "clock_in"
        ? await clockInStaff({
            organizationId: context.organizationId,
            staff: context.staff,
          })
        : await clockOutStaff({
            organizationId: context.organizationId,
            staff: context.staff,
          });

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      ...result,
    });
  } catch (error) {
    console.error("STAFF_POST_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to update shift",
      },
      { status: error?.status || 500 }
    );
  }
}
