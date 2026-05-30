import { NextResponse } from "next/server";

import { replayAccountingEvent } from "@/lib/finance/core/replayAccountingEvent";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const replay =
      await replayAccountingEvent({
        tenantId:
          body.tenantId,
        eventId:
          body.eventId,
        replayReason:
          body.replayReason,
      });

    return NextResponse.json({
      success: true,
      replay,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error.message,
      },
      {
        status: 400,
      }
    );
  }
}
