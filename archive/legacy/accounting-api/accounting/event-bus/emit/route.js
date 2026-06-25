import { NextResponse } from "next/server";

import { emitAccountingEvent } from "@/lib/finance/accounting/emitAccountingEvent";

export async function POST(request) {
  try {
    const body = await request.json();

    const result = await emitAccountingEvent({
      tenantId: body.tenantId,
      eventType: body.eventType,
      sourceModule: body.sourceModule,
      sourceId: body.sourceId,
      payload: body.payload,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      {
        status: 400,
      }
    );
  }
}
