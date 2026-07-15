export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/shared/auth";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

import {
  completeWarehouseTask,
} from "@/lib/operations/tasks/completeWarehouseTask";


export async function POST(req) {

  try {

    await requireAuth();


    const body =
      await req.json();


    const access =
      await requireOrganizationAccess({

        organizationId:
          body.organizationId ||
          body.organization_id,

      });


    if (!access.success) {

      return NextResponse.json(
        {
          success:false,
          error:access.error,
        },
        {
          status:access.status,
        }
      );

    }


    const result =
      await completeWarehouseTask({

        organization_id:
          access.organizationId,

        entity_id:
          body.entity_id ||
          body.entityId,

        task_id:
          body.task_id ||
          body.taskId,

        location_id:
          body.location_id ||
          body.locationId,

        assigned_to:
          body.assigned_to ||
          body.assignedTo,

      });


    return NextResponse.json(result);


  } catch(error) {

    return NextResponse.json(
      {
        success:false,
        error:error.message,
      },
      {
        status:500,
      }
    );

  }

}
