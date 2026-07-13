export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  createWarehouseTask,
} from "@/lib/warehouse/tasks/createWarehouseTask";


export async function POST(req) {

  try {

    const body =
      await req.json();


    const task =
      await createWarehouseTask({

        organization_id:
          body.organization_id,

        entity_id:
          body.entity_id,

        warehouse_id:
          body.warehouse_id,

        location_id:
          body.location_id,

        task_type:
          "PUTAWAY",

        source_document:
          "test",

        source_document_id:
          null,

        item_id:
          body.item_id,

        quantity:
          10,

        created_by:
          null,

      });


    return NextResponse.json({
      success:true,
      task,
    });


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
