export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  requireAuth,
} from "@/lib/shared/auth";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  assignWarehouseTask,
} from "@/lib/operations/tasks/assignWarehouseTask";


export async function POST(req) {

  try {

    await requireAuth();


    const body =
      await req.json();


    const access =
      await requireOrganizationAccess({

        organizationId:
          body.organization_id ||
          body.organizationId,

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
      await assignWarehouseTask({

        organization_id:
          access.organizationId,

        task_id:
          body.task_id ||
          body.taskId,

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
