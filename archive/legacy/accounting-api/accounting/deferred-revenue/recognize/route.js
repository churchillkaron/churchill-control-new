import { NextResponse } from "next/server";

import { recognizeDeferredRevenue } from "@/lib/finance/core/recognizeDeferredRevenue";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const revenue =
      await recognizeDeferredRevenue({
        tenantId:
          body.tenantId,
        scheduleId:
          body.scheduleId,
        recognitionAmount:
          body.recognitionAmount,
      });

    return NextResponse.json({
      success: true,
      revenue,
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
