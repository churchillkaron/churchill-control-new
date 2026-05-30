import { NextResponse } from "next/server";

import { getAccountingEvents } from "@/lib/finance/core/getAccountingEvents";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const events =
      await getAccountingEvents({
        tenantId:
          body.tenantId,
        status:
          body.status,
      });

    return NextResponse.json({
      success: true,
      events,
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
