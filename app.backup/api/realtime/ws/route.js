import { NextResponse } from "next/server";

import socketState, {
  initializeSocket,
} from "@/lib/realtime/websocket/socketServer";

export async function GET() {

  return NextResponse.json({

    success: true,

    websocket:
      socketState.initialized,

    path:
      "/api/realtime/ws",
  });
}

export async function POST(req) {

  try {

    if (
      !socketState.initialized
    ) {

      initializeSocket(
        global.server
      );
    }

    return NextResponse.json({

      success: true,

      initialized:
        socketState.initialized,
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
