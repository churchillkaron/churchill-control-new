import { NextResponse } from "next/server";

import channelManager from "@/lib/realtime/channels/channelManager";

import presenceManager from "@/lib/realtime/presence/presenceManager";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const {
      action,
      channel,
      clientId,
      metadata,
    } = body;

    if (
      action === "join"
    ) {

      channelManager.join(
        channel,
        clientId
      );

      presenceManager.heartbeat(
        clientId,
        metadata
      );
    }

    if (
      action === "leave"
    ) {

      channelManager.leave(
        channel,
        clientId
      );

      presenceManager.offline(
        clientId
      );
    }

    return NextResponse.json({

      success: true,

      channel,

      members:
        channelManager.list(
          channel
        ),

      presence:
        presenceManager.all(),
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

export async function GET(req) {

  const url =
    new URL(req.url);

  const channel =
    url.searchParams.get(
      "channel"
    );

  return NextResponse.json({

    success: true,

    members:
      channelManager.list(
        channel
      ),

    presence:
      presenceManager.all(),
  });
}
