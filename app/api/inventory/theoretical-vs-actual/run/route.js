import { NextResponse } from "next/server";

import { runTheoreticalVsActual } from "@/lib/inventory/stock-count/workflows/runTheoreticalVsActual";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await runTheoreticalVsActual({
        organizationId:
          body.organizationId ||
          body.organization_id,
        entityId:
          body.entityId ||
          body.entity_id,
        sessionId:
          body.sessionId ||
          body.session_id,
        itemId:
          body.itemId ||
          body.item_id,
        actualQuantity:
          body.actualQuantity ||
          body.actual_quantity,
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
