import { NextResponse } from "next/server";

import { runWasteAnalysis } from "@/lib/finance/core/runWasteAnalysis";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const waste =
      await runWasteAnalysis({
        tenantId:
          body.tenantId,
        itemId:
          body.itemId,
        wasteQuantity:
          body.wasteQuantity,
        averageCost:
          body.averageCost,
        wasteReason:
          body.wasteReason,
      });

    return NextResponse.json({
      success: true,
      waste,
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
