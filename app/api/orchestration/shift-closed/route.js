import { NextResponse } from "next/server";

import { runShiftClosedFlow } from "@/lib/orchestration/runShiftClosedFlow";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await runShiftClosedFlow({
        tenantId:
          body.tenantId,
        shiftName:
          body.shiftName,
        revenue:
          body.revenue,
        laborCost:
          body.laborCost,
        serviceCharge:
          body.serviceCharge,
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
