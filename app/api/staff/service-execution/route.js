export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { loadStaffWorkday } from "@/lib/people/workforce/shiftRuntime";
import {
  completeExecutionForStaff,
  getExecutionForStaff,
  saveExecutionForStaff,
} from "@/lib/service-management/runtime/ServiceExecutionRuntime";

function errorResponse(error) {
  return NextResponse.json(
    {
      success: false,
      error: error?.message || "Unable to update service execution.",
      validationErrors: error?.validationErrors || [],
    },
    { status: error?.status || 500 }
  );
}

async function requireStaff(request) {
  const context = await resolveAuthenticatedStaffContext({ request });
  if (!context.success) {
    const error = new Error(context.error || "Staff access denied.");
    error.status = context.status || 403;
    throw error;
  }
  return context;
}

async function requireActiveShift(context) {
  const workday = await loadStaffWorkday({
    organizationId: context.organizationId,
    staffId: context.staff.id,
  });
  if (!workday.openShift) {
    const error = new Error("Start your shift before working on this job.");
    error.status = 409;
    throw error;
  }
  return workday;
}

function workOrderIdFrom(request, body = null) {
  const url = new URL(request.url);
  return (
    body?.workOrderId ||
    body?.work_order_id ||
    url.searchParams.get("workOrderId") ||
    url.searchParams.get("work_order_id") ||
    null
  );
}

export async function GET(request) {
  try {
    const context = await requireStaff(request);
    const workOrderId = workOrderIdFrom(request);
    if (!workOrderId) {
      return NextResponse.json(
        { success: false, error: "workOrderId is required." },
        { status: 400 }
      );
    }

    const execution = await getExecutionForStaff({
      organizationId: context.organizationId,
      staffId: context.staff.id,
      workOrderId,
    });

    return NextResponse.json({ success: true, ...execution });
  } catch (error) {
    console.error("STAFF_SERVICE_EXECUTION_GET_ERROR", error);
    return errorResponse(error);
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const context = await requireStaff(request);
    await requireActiveShift(context);
    const workOrderId = workOrderIdFrom(request, body);
    if (!workOrderId) {
      return NextResponse.json(
        { success: false, error: "workOrderId is required." },
        { status: 400 }
      );
    }

    const report = await saveExecutionForStaff({
      organizationId: context.organizationId,
      staffId: context.staff.id,
      workOrderId,
      input: body,
    });

    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error("STAFF_SERVICE_EXECUTION_PATCH_ERROR", error);
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const context = await requireStaff(request);
    await requireActiveShift(context);
    const workOrderId = workOrderIdFrom(request, body);
    if (!workOrderId) {
      return NextResponse.json(
        { success: false, error: "workOrderId is required." },
        { status: 400 }
      );
    }

    const result = await completeExecutionForStaff({
      organizationId: context.organizationId,
      staffId: context.staff.id,
      actorId: context.user.id,
      workOrderId,
      completionGps: body.location || body.completionGps || {},
      input: body,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("STAFF_SERVICE_EXECUTION_POST_ERROR", error);
    return errorResponse(error);
  }
}
