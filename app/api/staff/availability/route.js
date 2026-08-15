export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import {
  cancelAvailabilityException,
  createAvailabilityException,
  loadStaffAvailability,
  replaceStaffAvailabilityPattern,
} from "@/lib/people/workforce/workforceAvailabilityRuntime";

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

export async function GET(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request });
    if (!context.success) return contextError(context);

    const availability = await loadStaffAvailability({
      organizationId: context.organizationId,
      staffId: context.staff.id,
    });

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      staffId: context.staff.id,
      ...availability,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load availability",
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
    const action = String(body?.action || "").trim().toLowerCase();
    let result;

    if (action === "replace_pattern") {
      result = await replaceStaffAvailabilityPattern({
        organizationId: context.organizationId,
        staff: context.staff,
        effectiveFrom: body?.effectiveFrom,
        rules: body?.rules,
      });
    } else if (action === "create_exception") {
      result = await createAvailabilityException({
        organizationId: context.organizationId,
        staff: context.staff,
        exceptionDate: body?.exceptionDate,
        availabilityType: body?.availabilityType,
        startTime: body?.startTime,
        endTime: body?.endTime,
        notes: body?.notes,
      });
    } else {
      return NextResponse.json(
        { success: false, error: "Unsupported availability action" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to update availability",
        code: error?.code || null,
      },
      { status: error?.status || 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request });
    if (!context.success) return contextError(context);

    const body = await request.json();
    const action = String(body?.action || "").trim().toLowerCase();
    if (action !== "cancel_exception") {
      return NextResponse.json(
        { success: false, error: "Unsupported availability action" },
        { status: 400 }
      );
    }

    const result = await cancelAvailabilityException({
      organizationId: context.organizationId,
      staffId: context.staff.id,
      exceptionId: body?.exceptionId,
    });

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to cancel availability exception",
        code: error?.code || null,
      },
      { status: error?.status || 500 }
    );
  }
}
