import { NextResponse } from "next/server";

import publishEvent from "@/lib/event-bus/core/publishEvent";

import processWorkflow from "@/lib/event-bus/workflows/processWorkflow";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await publishEvent({

        tenant_id:
          body.tenant_id || "demo",

        event_type:
          body.event_type,

        payload:
          body.payload || {},
      });

    return NextResponse.json(
      result
    );

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}

export async function PUT(req) {

  try {

    const body =
      await req.json();

    const result =
      await processWorkflow({

        tenant_id:
          body.tenant_id || "demo",
      });

    return NextResponse.json(
      result
    );

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}
