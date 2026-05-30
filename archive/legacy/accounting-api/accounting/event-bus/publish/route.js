import { NextResponse } from "next/server";

import { publishAccountingEvent } from "@/lib/finance/core/publishAccountingEvent";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const event =
      await publishAccountingEvent({
        tenantId:
          body.tenantId,
        eventType:
          body.eventType,
        eventPayload:
          body.eventPayload,
      });

    return NextResponse.json({
      success: true,
      event,
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
