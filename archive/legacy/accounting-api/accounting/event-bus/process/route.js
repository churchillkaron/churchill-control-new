import { NextResponse } from "next/server";

import { processAccountingEvents } from "@/lib/finance/core/processAccountingEvents";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const processed =
      await processAccountingEvents({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      processed,
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
