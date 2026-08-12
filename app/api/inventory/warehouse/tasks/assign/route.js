export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { assignWarehouseTask } from "@/lib/operations/tasks/assignWarehouseTask";

function errorResponse(error, status = 500) {
  return NextResponse.json(
    { success: false, error },
    { status },
  );
}

export async function POST(req) {
  try {
    const body = await req.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organization_id || body.organizationId,
      request: req,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status || 403);
    }

    const actorId = access.access?.staffAccountId || null;
    if (!actorId) {
      return errorResponse("Authenticated staff identity is required", 403);
    }

    const result = await assignWarehouseTask({
      organization_id: access.organizationId,
      task_id: body.task_id || body.taskId,
      assigned_to: body.assigned_to || body.assignedTo,
      assigned_by: actorId,
    });

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(
      error?.message || "Unable to assign warehouse task",
      error?.status || 500,
    );
  }
}
