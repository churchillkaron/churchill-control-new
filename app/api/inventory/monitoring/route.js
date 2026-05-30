import { NextResponse } from "next/server";

import runInventoryMonitoring from "@/lib/inventory/monitoring/runInventoryMonitoring";

export async function POST(req) {

  try {

    const body =
      await req.json();


    if (!body.tenant_id) {

      return NextResponse.json(
        {
          success: false,
          error: "Missing tenant_id",
        },
        {
          status: 400,
        }
      );

    }

    const result =
      await runInventoryMonitoring({

        tenant_id:
          body.tenant_id,
      });

    return NextResponse.json(
      result
    );

  } catch (error) {

    return NextResponse.json(
      {

        success: false,

        error:
          error.message,
      },
      {

        status: 500,
      }
    );
  }
}
