export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { completeWarehouseTask } from "@/lib/operations/tasks/completeWarehouseTask";
import { resolveWarehouseTaskCompletionConflict } from "@/lib/operations/tasks/resolveWarehouseTaskCompletionConflict";

function errorResponse(error, status = 500) {
  return NextResponse.json(
    { success: false, error },
    { status },
  );
}

export async function POST(req) {
  let completionContext = null;

  try {
    const body = await req.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request: req,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status || 403);
    }

    const actorId = access.access?.staffAccountId || null;
    if (!actorId) {
      return errorResponse("Authenticated staff identity is required", 403);
    }

    completionContext = {
      organization_id: access.organizationId,
      task_id: body.task_id || body.taskId || null,
    };

    const result = await completeWarehouseTask({
      organization_id: access.organizationId,
      entity_id: body.entity_id || body.entityId || null,
      task_id: completionContext.task_id,
      location_id: body.location_id || body.locationId || null,
      completed_by: actorId,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (completionContext) {
      try {
        const recovered = await resolveWarehouseTaskCompletionConflict({
          ...completionContext,
          error,
        });

        if (recovered) {
          return NextResponse.json(recovered.body, {
            status: recovered.status,
          });
        }
      } catch (recoveryError) {
        console.error(
          "WAREHOUSE TASK COMPLETION RECOVERY ERROR",
          recoveryError,
        );
      }
    }

    return errorResponse(
      error?.message || "Unable to complete warehouse task",
      error?.status || 500,
    );
  }
}
