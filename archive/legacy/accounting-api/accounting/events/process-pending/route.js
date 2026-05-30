import { NextResponse } from "next/server";

import { processPendingEvents } from "@/lib/finance/core/processPendingEvents";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const results =
      await processPendingEvents({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      results,
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
