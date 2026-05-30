import { NextResponse } from "next/server";

import { runFIFOConsumption } from "@/lib/finance/core/runFIFOConsumption";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await runFIFOConsumption({
        tenantId:
          body.tenantId,
        itemId:
          body.itemId,
        quantityNeeded:
          body.quantityNeeded,
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
