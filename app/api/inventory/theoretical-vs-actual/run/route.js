import { NextResponse } from "next/server";

import { runTheoreticalVsActual } from "@/lib/inventory/core/runTheoreticalVsActual";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await runTheoreticalVsActual({
        tenantId:
          body.tenantId,
        sessionId:
          body.sessionId,
        itemId:
          body.itemId,
        actualQuantity:
          body.actualQuantity,
      });

    return NextResponse.json({
      success: true,
      result,
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
