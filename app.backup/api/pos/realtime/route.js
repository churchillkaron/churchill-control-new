import { NextResponse } from "next/server";

import publishPOSEvent from "@/lib/pos/realtime/publishPOSEvent";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await publishPOSEvent({

        tenant_id:
          body.tenant_id || "demo",

        event_type:
          body.event_type,

        entity_type:
          body.entity_type,

        entity_id:
          body.entity_id || null,

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
        error:
          error.message,
      },
      {
        status: 500,
      }
    );
  }
}
