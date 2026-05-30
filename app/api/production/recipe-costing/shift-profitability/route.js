import { NextResponse } from "next/server";

import { runShiftProfitability } from "@/lib/production/core/runShiftProfitability";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await runShiftProfitability({
        tenantId:
          body.tenantId,
        shiftName:
          body.shiftName,
        revenue:
          body.revenue,
        foodCost:
          body.foodCost,
        laborCost:
          body.laborCost,
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
