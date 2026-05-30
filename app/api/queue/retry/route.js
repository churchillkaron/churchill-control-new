import { NextResponse } from "next/server";

import {
  retryFailedOrchestration,
} from "@/lib/orchestration/retryFailedOrchestration";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await retryFailedOrchestration({

        tenantId:
          body?.tenantId,

      });

    return NextResponse.json({

      success: true,

      retried:
        result,

    });

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
