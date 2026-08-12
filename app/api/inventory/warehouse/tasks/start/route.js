export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { startWarehouseTask } from "@/lib/operations/tasks/startWarehouseTask";

function errorResponse(error, status = 500) {
  return NextResponse.json(
    { success: false, error },
    { status },
  );
}

function isExplicitStartAction(body) {
  return (
    String(body?.action || "").trim().toLowerCase() === "start" ||
    String(body?.action_id || body?.actionId || "").trim().toLowerCase() === "start"
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

    if (!isExplicitStartAction(body)) {
      return errorResponse(
        "Warehouse task start must be invoked through the explicit Start Task action",
        409,
      );
    }

    const actorId = access.access?.staffAccountId || null;
    if (!actorId) {
      return errorResponse("Authenticated staff identity is required", 403);
    }

    const result = await startWarehouseTask({
      organization_id: access.organizationId,
      task_id: body.task_id || body.taskId,
      started_by: actorId,
    });

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(
      error?.message || "Unable to start warehouse task",
      error?.status || 500,
    );
  }
}
