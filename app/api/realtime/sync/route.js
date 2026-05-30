import { NextResponse } from "next/server";

import broadcastEvent
from "@/lib/realtime/broadcastEvent";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await broadcastEvent({

        channel:
          body.channel ||
          "system",

        event:
          body.type ||
          "SYSTEM_EVENT",

        payload:
          body.payload || {},

      });

    return NextResponse.json({

      success: true,

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

export async function GET() {

  return NextResponse.json({

    success: true,

    message:
      "Realtime online",

  });

}
