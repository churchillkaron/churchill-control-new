import { NextResponse } from "next/server";

import realtimeBus from "@/lib/realtime/sync/realtimeEventBus";

export async function POST(req) {

  try {

    const body =
      await req.json();

    realtimeBus.publish({

      type:
        body.type ||
        "SYSTEM_EVENT",

      payload:
        body.payload || {},

      created_at:
        new Date().toISOString(),
    });

    return NextResponse.json({

      success: true,
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

export async function GET() {

  return NextResponse.json({

    success: true,

    message:
      "Realtime sync online.",
  });
}
