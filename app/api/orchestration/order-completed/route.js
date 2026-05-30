import { NextResponse } from "next/server";

import { runOrderCompletedFlow } from "@/lib/orchestration/runOrderCompletedFlow";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await runOrderCompletedFlow({
        tenantId:
          body.tenantId,
        orderId:
          body.orderId,
        revenue:
          body.revenue,
        cogs:
          body.cogs,
        laborCost:
          body.laborCost,
        taxName:
          body.taxName,
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
